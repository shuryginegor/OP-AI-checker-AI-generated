import {
  getAllKtalkRecordings,
  upsertKtalkRecordings,
  KtalkRecordingRecord
} from './db';

export interface KtalkSyncStatus {
  configured: boolean;
  domain: string;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  lastAddedCount: number;
  lastFetchedCount: number;
}

let inFlightSync: Promise<{
  success: boolean;
  addedCount: number;
  fetchedCount: number;
  error: string | null;
}> | null = null;

let lastSyncedAt: string | null = null;
let lastError: string | null = null;
let lastAddedCount = 0;
let lastFetchedCount = 0;

function getRawDomainEnv(): string {
  return (
    process.env.TALK_DOMAIN ||
    process.env.KTALK_DOMAIN ||
    process.env.KTALK_BASE_URL ||
    ''
  ).trim();
}

export function getKtalkDomainHost(): string {
  const raw = getRawDomainEnv();
  if (!raw) return '';

  let cleaned = raw.replace(/\/+$/, '').replace(/\/api$/i, '');
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = `https://${cleaned}`;
  }
  return cleaned;
}

export function isKtalkSyncConfigured(): boolean {
  const apiKey = (process.env.TALK_API_KEY || '').trim();
  const domain = getKtalkDomainHost();
  return Boolean(apiKey && domain);
}

export function getKtalkSyncStatus(): KtalkSyncStatus {
  return {
    configured: isKtalkSyncConfigured(),
    domain: getKtalkDomainHost(),
    isSyncing: Boolean(inFlightSync),
    lastSyncedAt,
    lastError,
    lastAddedCount,
    lastFetchedCount
  };
}

function formatDuration(rawDuration: any): string {
  if (rawDuration === null || rawDuration === undefined || rawDuration === '') {
    return '';
  }

  if (typeof rawDuration === 'number' && Number.isFinite(rawDuration)) {
    // Определяем секунды (или миллисекунды, если значение подозрительно большое > 86400)
    const totalSec = rawDuration > 86400 ? Math.round(rawDuration / 1000) : Math.round(rawDuration);
    if (totalSec <= 0) return '';
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (hrs > 0) {
      return `${hrs} ч ${mins.toString().padStart(2, '0')} мин`;
    }
    if (mins > 0) {
      return `${mins} мин ${secs > 0 ? `${secs} сек` : ''}`.trim();
    }
    return `${secs} сек`;
  }

  const str = String(rawDuration).trim();
  // Поддержка формата ISO 8601 duration: PT1H23M45S
  const isoMatch = str.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
  if (isoMatch) {
    const hrs = Number(isoMatch[1] || 0);
    const mins = Number(isoMatch[2] || 0);
    const secs = Math.round(Number(isoMatch[3] || 0));
    if (hrs > 0) return `${hrs} ч ${mins.toString().padStart(2, '0')} мин`;
    if (mins > 0) return `${mins} мин ${secs > 0 ? `${secs} сек` : ''}`.trim();
    return `${secs} сек`;
  }

  return str;
}

async function fetchJsonWithTimeout(url: string, apiKey: string, timeoutMs = 15000): Promise<{ ok: boolean; status: number; data: any; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Auth-Token': apiKey,
        Accept: 'application/json'
      },
      signal: controller.signal
    });
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data, text };
  } finally {
    clearTimeout(timer);
  }
}

function extractRecordingsArray(payload: any): any[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.recordings)) return payload.recordings;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.result)) return payload.result;
  return [];
}

function normalizeRecordingItem(
  baseHost: string,
  item: any,
  detail: any,
  syncedAt: string
): Omit<KtalkRecordingRecord, 'status' | 'hiddenBy' | 'hiddenAt'> | null {
  const merged = { ...(item || {}), ...(detail || {}) };
  const recordingKey = String(
    merged.key ||
      merged.recordingKey ||
      merged.id ||
      merged.recordingId ||
      ''
  ).trim();

  if (!recordingKey) return null;

  const createdBy = merged.createdBy || merged.author || merged.owner || {};
  const firstName = String(createdBy.firstname || createdBy.firstName || '').trim();
  const surname = String(createdBy.surname || createdBy.lastName || '').trim();
  const fullNameFromParts = `${firstName} ${surname}`.trim();

  const authorName =
    fullNameFromParts ||
    String(createdBy.name || createdBy.fullName || createdBy.displayName || merged.authorName || '').trim() ||
    'Не указан';

  const authorLogin = String(createdBy.login || createdBy.username || '').trim();
  const authorEmail = String(createdBy.email || '').trim();

  const roomObj = merged.room || merged.conference || merged.space || {};
  const roomName = String(
    merged.roomName ||
      roomObj.name ||
      roomObj.title ||
      merged.spaceName ||
      merged.conferenceName ||
      ''
  ).trim();

  const title = String(
    merged.title ||
      merged.topic ||
      merged.name ||
      roomName ||
      `Встреча ${recordingKey.slice(0, 8)}`
  ).trim();

  const rawDate =
    merged.createdDate ||
    merged.createdAt ||
    merged.startTime ||
    merged.startedAt ||
    merged.date ||
    '';
  let createdDate = '';
  if (rawDate) {
    const dt = new Date(rawDate);
    createdDate = Number.isNaN(dt.getTime()) ? String(rawDate) : dt.toISOString();
  }

  // Пытаемся вычислить длительность из duration, durationInSeconds или start/end
  let durationSource =
    merged.duration ??
    merged.durationSeconds ??
    merged.durationInSeconds ??
    merged.durationMs ??
    merged.length;
  if (!durationSource && merged.startTime && merged.endTime) {
    const s = new Date(merged.startTime).getTime();
    const e = new Date(merged.endTime).getTime();
    if (!Number.isNaN(s) && !Number.isNaN(e) && e > s) {
      durationSource = Math.round((e - s) / 1000);
    }
  }
  const duration = formatDuration(durationSource);

  let resolutions: string[] = [];
  if (Array.isArray(merged.resolutions)) {
    resolutions = merged.resolutions.map((r: any) => (typeof r === 'string' ? r : r?.name || r?.qualityName || '')).filter(Boolean);
  } else if (Array.isArray(merged.files)) {
    resolutions = merged.files.map((f: any) => String(f?.qualityName || f?.resolution || '')).filter(Boolean);
  }

  const rawUrl = String(merged.url || merged.recordingUrl || merged.link || '').trim();
  const lectureUrl = rawUrl.startsWith('http')
    ? rawUrl
    : `${baseHost}/recordings/${recordingKey}`;

  const hasTranscript = Boolean(merged.hasTranscript || merged.transcriptionStatus === 'ready' || merged.transcription);
  const hasSummary = Boolean(merged.hasSummary || merged.summaryStatus === 'ready' || merged.summary);

  return {
    recordingKey,
    lectureUrl,
    title,
    createdDate,
    duration,
    authorName,
    authorLogin,
    authorEmail,
    roomName,
    resolutions,
    hasTranscript,
    hasSummary,
    syncedAt,
    rawMetadata: merged
  };
}

export async function syncKtalkRecordingsNow(): Promise<{
  success: boolean;
  addedCount: number;
  fetchedCount: number;
  error: string | null;
}> {
  if (inFlightSync) {
    return inFlightSync;
  }

  inFlightSync = (async () => {
    const apiKey = (process.env.TALK_API_KEY || '').trim();
    const baseHost = getKtalkDomainHost();

    if (!apiKey || !baseHost) {
      const msg = !baseHost
        ? 'Не задан TALK_DOMAIN в .env для подключения к Контур.Толку.'
        : 'Не задан TALK_API_KEY в .env для подключения к Контур.Толку.';
      lastError = msg;
      return { success: false, addedCount: 0, fetchedCount: 0, error: msg };
    }

    const apiBase = `${baseHost}/api`;
    const baseEndpoints = [
      `${apiBase}/Domain/recordings`,
      `${apiBase}/recordings`
    ];

    let rawList: any[] | null = null;
    let lastHttpErr = '';

    for (const baseEndpoint of baseEndpoints) {
      const seenKeys = new Set<string>();
      const collected: any[] = [];
      let baseSucceeded = false;

      for (let page = 0; page < 3; page++) {
        const skip = page * 100;
        const pageUrl = page === 0 ? `${baseEndpoint}?top=100` : `${baseEndpoint}?top=100&skip=${skip}`;
        try {
          const res = await fetchJsonWithTimeout(pageUrl, apiKey, 15000);
          if (!res.ok || res.data === null) {
            if (page === 0) {
              // Повтор без query-параметров если сервер не поддерживает ?top=
              const fallbackRes = await fetchJsonWithTimeout(baseEndpoint, apiKey, 15000);
              if (fallbackRes.ok && fallbackRes.data !== null) {
                collected.push(...extractRecordingsArray(fallbackRes.data));
                baseSucceeded = true;
              } else {
                lastHttpErr = `HTTP ${fallbackRes.status} (${baseEndpoint}): ${fallbackRes.text.slice(0, 180)}`;
              }
            }
            break;
          }

          baseSucceeded = true;
          const arr = extractRecordingsArray(res.data);
          let newOnPage = 0;
          for (const item of arr) {
            const k = String(item?.key || item?.recordingKey || item?.id || item?.recordingId || '').trim();
            if (!k || seenKeys.has(k)) continue;
            seenKeys.add(k);
            collected.push(item);
            newOnPage++;
          }

          if (arr.length < 100 || newOnPage === 0) {
            break;
          }
        } catch (err: any) {
          if (page === 0) {
            lastHttpErr = `${pageUrl}: ${err?.message || String(err)}`;
          }
          break;
        }
      }

      if (baseSucceeded) {
        rawList = collected;
        break;
      }
    }

    if (rawList === null) {
      lastError = `Не удалось получить список записей из Контур.Толк. ${lastHttpErr}`;
      console.warn(`[KTalk Sync] ⚠️ ${lastError}`);
      return { success: false, addedCount: 0, fetchedCount: 0, error: lastError };
    }

    // Сортируем по дате по убыванию ДО отбора самых свежих записей
    rawList.sort((a, b) => {
      const dA = new Date(a?.createdDate || a?.createdAt || a?.startTime || a?.startedAt || 0).getTime() || 0;
      const dB = new Date(b?.createdDate || b?.createdAt || b?.startTime || b?.startedAt || 0).getTime() || 0;
      return dB - dA;
    });

    const syncedAt = new Date().toISOString();
    const existingList = await getAllKtalkRecordings();
    const existingMap = new Map(existingList.map(r => [r.recordingKey, r]));

    // Берем до 60 последних записей и добираем полные метаданные по ключу только при необходимости
    const slice = rawList.slice(0, 60);
    const normalizedRecords: Omit<KtalkRecordingRecord, 'status' | 'hiddenBy' | 'hiddenAt'>[] = [];

    const batchSize = 5;
    for (let i = 0; i < slice.length; i += batchSize) {
      const batch = slice.slice(i, i + batchSize);
      const enriched = await Promise.all(
        batch.map(async (item) => {
          const key = String(item?.key || item?.recordingKey || item?.id || item?.recordingId || '').trim();
          if (!key) return null;

          const cached = existingMap.get(key);
          // Для уже отправленных или скрытых записей не дергаем detail API повторно
          const isAlreadyTriaged = cached && cached.status !== 'new';
          const needsDetail =
            !isAlreadyTriaged &&
            (!cached || !cached.authorName || cached.authorName === 'Не указан' || !cached.duration);

          let detail: any = null;
          if (needsDetail) {
            try {
              const detRes = await fetchJsonWithTimeout(`${apiBase}/Domain/recordings/${key}`, apiKey, 8000);
              if (detRes.ok && detRes.data) {
                detail = detRes.data;
              }
            } catch {
              // Игнорируем ошибку добора деталей для отдельной записи
            }
          }

          return normalizeRecordingItem(baseHost, item, detail, syncedAt);
        })
      );

      for (const rec of enriched) {
        if (rec) normalizedRecords.push(rec);
      }
    }

    const { addedCount } = await upsertKtalkRecordings(normalizedRecords);

    lastSyncedAt = syncedAt;
    lastError = null;
    lastAddedCount = addedCount;
    lastFetchedCount = normalizedRecords.length;

    console.log(
      `[KTalk Sync] ✅ Синхронизация с ${baseHost} завершена: получено ${normalizedRecords.length} записей, новых: ${addedCount}.`
    );

    return {
      success: true,
      addedCount,
      fetchedCount: normalizedRecords.length,
      error: null
    };
  })().finally(() => {
    inFlightSync = null;
  });

  return inFlightSync;
}

let autoSyncTimer: NodeJS.Timeout | null = null;

export function startKtalkAutoSyncScheduler(): void {
  if (!isKtalkSyncConfigured()) {
    console.log('[KTalk Sync] Авто-синхронизация отключена: укажите TALK_DOMAIN и TALK_API_KEY в .env для загрузки записей из Контур.Толк.');
    return;
  }

  console.log(`[KTalk Sync] 🔄 Включена авто-синхронизация с ${getKtalkDomainHost()} каждые 5 минут.`);

  // Первичная синхронизация через 2 секунды после старта сервера
  setTimeout(() => {
    void syncKtalkRecordingsNow();
  }, 2000);

  if (autoSyncTimer) {
    clearInterval(autoSyncTimer);
  }
  autoSyncTimer = setInterval(() => {
    void syncKtalkRecordingsNow();
  }, 5 * 60 * 1000);
}
