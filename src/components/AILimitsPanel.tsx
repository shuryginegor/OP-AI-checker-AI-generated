import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Sliders,
  Cpu,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Save,
  Info,
  BarChart3,
  Layers
} from 'lucide-react';

export interface AISettingsData {
  maxRequestTokens: number;
  reservedOutputTokens: number;
  enableModelRotation: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

interface ModelStatRow {
  model: string;
  checksCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  lastUsedAt: string | null;
}

interface AISettingsResponse {
  success: boolean;
  settings: AISettingsData;
  modelChain: string[];
  modelStats: ModelStatRow[];
  summary?: {
    totalCompleted: number;
    totalChecksWithModel: number;
    totalTrackedPromptTokens: number;
    totalTrackedCompletionTokens: number;
    totalTrackedTokens: number;
  };
}

interface LiveGigaChatStatus {
  success: boolean;
  scope: string;
  availableModels: string[];
  balances: Array<{ usage: string; value: number }>;
  balanceSupported: boolean;
  balanceHttpStatus: number | null;
  balanceNote: string;
  error?: string;
  checkedAt: string;
}

interface AILimitsPanelProps {
  token: string;
  isSeniorCurator: boolean;
  tasks: any[];
  onSettingsSaved?: () => void;
}

const PRESET_LIMITS = [48000, 64000, 96000, 100000, 128000, 160000, 192000, 256000];

const MODEL_META: Record<
  string,
  { priority: string; title: string; note: string; isLastResort?: boolean }
> = {
  'GigaChat-2-Pro': {
    priority: 'Приоритет 1',
    title: 'Основная модель аудита',
    note: 'Оптимальное качество анализа речи, аудио и таймкодов'
  },
  'GigaChat-2-Max': {
    priority: 'Приоритет 2',
    title: 'Резервная флагманская модель',
    note: 'Запускается при исчерпании квоты или ошибке Pro'
  },
  'GigaChat-3-Ultra': {
    priority: 'Приоритет 3',
    title: 'Расширенный мультимодальный резерв',
    note: 'Следующий эшелон при отказе или сбое Pro и Max'
  },
  'GigaChat-2': {
    priority: 'Крайний резерв',
    title: 'Базовая модель (аварийный fallback)',
    note: 'Только если Pro, Max и Ultra недоступны: слабо работает с аудио',
    isLastResort: true
  }
};

function formatNum(val: number | null | undefined): string {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return '—';
  return Number(val).toLocaleString('ru-RU');
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function findModelBalance(
  modelName: string,
  balances: Array<{ usage: string; value: number }> | undefined
): number | null {
  if (!balances || balances.length === 0) return null;
  const normalized = modelName.toLowerCase();
  const candidates: string[] = [];
  if (normalized.includes('pro')) candidates.push('gigachat-pro', normalized);
  else if (normalized.includes('max')) candidates.push('gigachat-max', normalized);
  else if (normalized.includes('ultra')) candidates.push('gigachat-ultra', normalized);
  else candidates.push('gigachat', normalized);

  for (const cand of candidates) {
    const match = balances.find(b => b.usage.toLowerCase() === cand);
    if (match) return match.value;
  }
  return null;
}

export const AILimitsPanel: React.FC<AILimitsPanelProps> = ({
  token,
  isSeniorCurator,
  tasks,
  onSettingsSaved
}) => {
  const [settings, setSettings] = useState<AISettingsData>({
    maxRequestTokens: 100000,
    reservedOutputTokens: 8192,
    enableModelRotation: true
  });
  const [draftMaxTokens, setDraftMaxTokens] = useState<number>(100000);
  const [draftRotation, setDraftRotation] = useState<boolean>(true);
  const [modelChain, setModelChain] = useState<string[]>([
    'GigaChat-2-Pro',
    'GigaChat-2-Max',
    'GigaChat-3-Ultra',
    'GigaChat-2'
  ]);
  const [modelStats, setModelStats] = useState<ModelStatRow[]>([]);
  const [summary, setSummary] = useState<AISettingsResponse['summary']>();

  const [liveStatus, setLiveStatus] = useState<LiveGigaChatStatus | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState<boolean>(false);
  const [isLoadingLive, setIsLoadingLive] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [saveNotice, setSaveNotice] = useState<string>('');

  const loadSettings = useCallback(async () => {
    if (!token || !isSeniorCurator) return;
    setIsLoadingSettings(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/ai/settings', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data: AISettingsResponse & { message?: string } = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.message || 'Не удалось загрузить настройки токенов и моделей.');
        return;
      }
      setSettings(data.settings);
      setDraftMaxTokens(data.settings.maxRequestTokens);
      setDraftRotation(data.settings.enableModelRotation);
      if (Array.isArray(data.modelChain) && data.modelChain.length > 0) {
        setModelChain(data.modelChain);
      }
      setModelStats(Array.isArray(data.modelStats) ? data.modelStats : []);
      setSummary(data.summary);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Ошибка соединения при загрузке настроек ИИ.');
    } finally {
      setIsLoadingSettings(false);
    }
  }, [token, isSeniorCurator]);

  const loadLiveStatus = useCallback(async () => {
    if (!token || !isSeniorCurator) return;
    setIsLoadingLive(true);
    try {
      const res = await fetch('/api/ai/status', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data: LiveGigaChatStatus = await res.json();
      setLiveStatus(data);
    } catch (err: any) {
      setLiveStatus({
        success: false,
        scope: 'GIGACHAT_API_PERS',
        availableModels: [],
        balances: [],
        balanceSupported: false,
        balanceHttpStatus: null,
        balanceNote: 'Не удалось выполнить запрос диагностики к Sber GigaChat API.',
        error: err?.message || 'Network error',
        checkedAt: new Date().toISOString()
      });
    } finally {
      setIsLoadingLive(false);
    }
  }, [token, isSeniorCurator]);

  useEffect(() => {
    if (token && isSeniorCurator) {
      void loadSettings();
      void loadLiveStatus();
    }
  }, [token, isSeniorCurator, loadSettings, loadLiveStatus]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !isSeniorCurator || isSaving) return;
    setIsSaving(true);
    setErrorMsg('');
    setSaveNotice('');

    const clamped = Math.max(32000, Math.min(256000, Math.round(Number(draftMaxTokens) || 100000)));
    setDraftMaxTokens(clamped);

    try {
      const res = await fetch('/api/ai/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          maxRequestTokens: clamped,
          reservedOutputTokens: settings.reservedOutputTokens || 8192,
          enableModelRotation: draftRotation
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.message || 'Не удалось сохранить настройки.');
        return;
      }
      setSettings(data.settings);
      setSaveNotice(data.message || 'Параметры лимита токенов и ротации сохранены.');
      void loadSettings();
      if (onSettingsSaved) onSettingsSaved();
      setTimeout(() => setSaveNotice(''), 5000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Ошибка сохранения настроек.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isSeniorCurator) {
    return (
      <div className="bg-[#1B153B] border border-amber-500/30 rounded-3xl p-8 text-center space-y-4 max-w-2xl mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
          <Shield className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-white">Доступ ограничен: только для старших кураторов</h2>
        <p className="text-xs text-indigo-200/80 leading-relaxed">
          Управление расчётным лимитом токенов на запрос, просмотр статистики расхода по моделям и диагностика Sber GigaChat API открыты исключительно старшим кураторам.
        </p>
      </div>
    );
  }

  // Расчёт динамической пропорции компонентов на примере стандартной 75–85 мин лекции
  const reservedOut = settings.reservedOutputTokens || 8192;
  const availableIn = Math.max(12000, draftMaxTokens - reservedOut);
  const sampleAudioTokens = 27500; // ~19 MB MP3 (аудио всегда передаётся целиком)
  const scaledFramesCap = Math.max(10, Math.min(60, Math.round((draftMaxTokens / 128000) * 30)));
  const estFramesTokens = Math.min(
    scaledFramesCap * 1100,
    Math.max(3300, Math.round(availableIn * 0.36))
  );
  const estFramesActual = Math.max(3, Math.min(scaledFramesCap, Math.floor(estFramesTokens / 1100)));
  const estTranscriptBudget = Math.max(2500, availableIn - sampleAudioTokens - (estFramesActual * 1100));

  const pctAudio = Math.min(100, Math.round((sampleAudioTokens / draftMaxTokens) * 100));
  const pctTranscript = Math.min(100 - pctAudio, Math.round((estTranscriptBudget / draftMaxTokens) * 100));
  const pctFrames = Math.min(
    100 - pctAudio - pctTranscript,
    Math.round(((estFramesActual * 1100) / draftMaxTokens) * 100)
  );
  const pctOutput = Math.max(4, 100 - pctAudio - pctTranscript - pctFrames);

  const auditedTasks = tasks.filter(
    t => t && (t.status === 'completed' || t.aiModel || t.tokenUsage || typeof t.framesUploaded === 'number')
  );

  const hasUnsavedChanges =
    draftMaxTokens !== settings.maxRequestTokens || draftRotation !== settings.enableModelRotation;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Заголовок раздела и сводные показатели */}
      <div className="bg-[#1B153B] border border-indigo-800/50 rounded-3xl p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-amber-300 font-semibold">
              <span>Только для старших кураторов</span>
              <span aria-hidden="true" className="text-indigo-500">·</span>
              <span className="text-[#38BDF8]">Тариф Freemium (без предоплаты)</span>
            </div>
            <h2 className="text-xl font-black text-white">
              Лимиты токенов, модели и расход по занятиям
            </h2>
            <p className="text-xs text-indigo-200/80 max-w-3xl leading-relaxed">
              Настройка расчётного бюджета токенов на одну проверку, порядок резервных моделей (Pro → Max → Ultra → Base) и учёт фактического расхода по каждому занятию.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              void loadSettings();
              void loadLiveStatus();
            }}
            disabled={isLoadingSettings || isLoadingLive}
            className="px-4 py-2 bg-[#14102C] hover:bg-[#241E4F] border border-indigo-700/60 text-indigo-100 rounded-xl text-xs font-semibold transition-colors inline-flex items-center gap-2 shrink-0 whitespace-nowrap cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#38BDF8] ${(isLoadingSettings || isLoadingLive) ? 'animate-spin' : ''}`} />
            <span>Обновить диагностику</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-indigo-900/50">
          <div>
            <div className="text-[11px] text-indigo-300">Активный лимит на запрос</div>
            <div className="text-xl font-black font-mono tabular-nums text-white mt-0.5">
              {formatNum(settings.maxRequestTokens)} <span className="text-xs font-normal text-indigo-300">ток.</span>
            </div>
            <div className="text-[11px] text-indigo-300/80 mt-0.5">
              до {Math.max(10, Math.min(60, Math.round((settings.maxRequestTokens / 128000) * 30)))} кадров при норме
            </div>
          </div>

          <div>
            <div className="text-[11px] text-indigo-300">Суммарно учтено токенов</div>
            <div className="text-xl font-black font-mono tabular-nums text-[#38BDF8] mt-0.5">
              {formatNum(summary?.totalTrackedTokens || 0)}
            </div>
            <div className="text-[11px] text-indigo-300/80 font-mono tabular-nums mt-0.5">
              вход {formatNum(summary?.totalTrackedPromptTokens || 0)} · ответ {formatNum(summary?.totalTrackedCompletionTokens || 0)}
            </div>
          </div>

          <div>
            <div className="text-[11px] text-indigo-300">Порядок ротации моделей</div>
            <div className="text-sm font-bold text-emerald-400 mt-1">
              {settings.enableModelRotation ? 'Pro → Max → Ultra → Base' : 'Только GigaChat-2-Pro'}
            </div>
            <div className="text-[11px] text-indigo-300/80 mt-0.5">
              Base (GigaChat-2) — только крайний резерв
            </div>
          </div>

          <div>
            <div className="text-[11px] text-indigo-300">Проверка баланса Сбер API</div>
            <div className="text-sm font-bold text-white mt-1">
              {liveStatus
                ? liveStatus.balanceSupported
                  ? 'Остаток отдан API Сбера'
                  : `HTTP ${liveStatus.balanceHttpStatus || 403} (Freemium)`
                : 'Выполняется проверка...'}
            </div>
            <div className="text-[11px] text-indigo-300/80 mt-0.5">
              {liveStatus?.balanceSupported ? 'Живой счётчик GET /v1/balance' : 'Учёт ведётся по фактическому usage'}
            </div>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-xs text-rose-300 flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {saveNotice && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-xs text-emerald-300 flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{saveNotice}</span>
        </div>
      )}

      {/* БЛОК 1: ДИНАМИЧЕСКИЙ ЛИМИТ ТОКЕНОВ И ОБЪЯСНЕНИЕ ВЫХОДНОГО ОКНА */}
      <form onSubmit={handleSaveSettings} className="bg-[#1B153B] border border-indigo-800/50 rounded-3xl p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-indigo-900/50 pb-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#FF5252]" />
              <span>1. Расчётный лимит токенов на одно занятие</span>
            </h3>
            <p className="text-xs text-indigo-200/80 mt-1">
              Лимит можно как снижать (экономия квоты), так и повышать до 256 000 токенов (больше кадров и полный текст речи).
            </p>
          </div>

          <button
            type="submit"
            disabled={isSaving || !hasUnsavedChanges}
            className="px-4 py-2.5 bg-[#FF5252] hover:bg-[#ff3b3b] disabled:opacity-45 text-white rounded-xl text-xs font-bold transition-colors inline-flex items-center gap-2 shrink-0 whitespace-nowrap cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Сохранение...' : hasUnsavedChanges ? 'Сохранить лимит' : 'Изменения сохранены'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Левая часть: ползунок, пресеты и ручной ввод */}
          <div className="lg:col-span-7 space-y-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <label htmlFor="max-request-tokens-range" className="text-xs font-semibold text-white">
                  Целевой бюджет токенов на лекцию:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={32000}
                    max={256000}
                    step={1000}
                    value={draftMaxTokens}
                    onChange={(e) => setDraftMaxTokens(Number(e.target.value) || 32000)}
                    className="w-28 bg-[#14102C] border border-indigo-700/70 rounded-xl px-3 py-1.5 text-right text-xs font-mono tabular-nums text-white focus:outline-none focus:border-[#38BDF8]"
                  />
                  <span className="text-xs text-indigo-300">ток.</span>
                </div>
              </div>

              <input
                id="max-request-tokens-range"
                type="range"
                min={32000}
                max={256000}
                step={4000}
                value={Math.max(32000, Math.min(256000, draftMaxTokens))}
                onChange={(e) => setDraftMaxTokens(Number(e.target.value))}
                className="w-full accent-[#FF5252] cursor-pointer"
              />

              <div className="flex flex-wrap items-center gap-2">
                {PRESET_LIMITS.map((preset) => {
                  const active = draftMaxTokens === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDraftMaxTokens(preset)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono tabular-nums transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-[#38BDF8] text-[#14102C] font-bold'
                          : 'bg-[#14102C] border border-indigo-800/60 text-indigo-200 hover:text-white hover:border-indigo-500'
                      }`}
                    >
                      {Math.round(preset / 1000)}k
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Переключатель ротации моделей */}
            <div className="pt-4 border-t border-indigo-900/50 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-bold text-white">
                  Автоматическая ротация моделей при исчерпании токенов или сбое
                </div>
                <div className="text-[11px] text-indigo-300/80 mt-0.5">
                  Строгая цепочка: GigaChat-2-Pro → GigaChat-2-Max → GigaChat-3-Ultra → GigaChat-2 (крайний случай).
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={draftRotation}
                onClick={() => setDraftRotation(prev => !prev)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                  draftRotation
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                    : 'bg-[#14102C] border-indigo-800/60 text-indigo-300'
                }`}
              >
                {draftRotation ? 'Ротация включена' : 'Только Pro'}
              </button>
            </div>
          </div>

          {/* Правая часть: схема приоритета распределения бюджета */}
          <div className="lg:col-span-5 space-y-4 lg:border-l lg:border-indigo-900/50 lg:pl-6">
            <div className="text-xs font-bold text-white">
              Как распределяются {formatNum(draftMaxTokens)} токенов на занятие
            </div>

            {/* Полоса пропорций */}
            <div className="w-full h-3 rounded-full bg-[#14102C] overflow-hidden flex">
              <div
                style={{ width: `${pctAudio}%` }}
                className="bg-emerald-500 h-full"
                title={`Аудио целиком (~${formatNum(sampleAudioTokens)} ток.)`}
              />
              <div
                style={{ width: `${pctTranscript}%` }}
                className="bg-[#38BDF8] h-full"
                title={`Текст речи (ориентир до ~${formatNum(estTranscriptBudget)} ток.)`}
              />
              <div
                style={{ width: `${pctFrames}%` }}
                className="bg-amber-400 h-full"
                title={`Кадры: до ${estFramesActual} шт. (~${formatNum(estFramesActual * 1100)} ток.)`}
              />
              <div
                style={{ width: `${pctOutput}%` }}
                className="bg-[#FF5252] h-full"
                title={`Запас на ответ: ${formatNum(reservedOut)} ток.`}
              />
            </div>

            <ol className="space-y-2 text-[11px] text-indigo-200/90 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="font-mono font-bold text-emerald-400 shrink-0">01.</span>
                <span>
                  <strong className="text-white">Аудиозапись (передаётся всегда целиком)</strong> — не обрезается ни при каком лимите (~25–30 тыс. токенов за 80 мин).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-mono font-bold text-[#38BDF8] shrink-0">02.</span>
                <span>
                  <strong className="text-white">Текст речи (сокращается первым)</strong> — если материалы не умещаются в лимит, сначала сжимается текст с сохранением начала, середины и конца.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-mono font-bold text-amber-300 shrink-0">03.</span>
                <span>
                  <strong className="text-white">Кадры с экрана (подстраиваются вторыми)</strong> — целевое число сейчас до <span className="font-mono tabular-nums text-white">{scaledFramesCap} кадров</span>; при нехватке места снижается до 3.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-mono font-bold text-[#FF5252] shrink-0">04.</span>
                <span>
                  <strong className="text-white">Запас на текст отчёта ({formatNum(reservedOut)} токенов)</strong> — выделяется, чтобы отчёт сформировался полностью без обрыва.
                </span>
              </li>
            </ol>
          </div>
        </div>

        {/* Пояснение про обрезание ответного окна GigaChat */}
        <div className="pt-4 border-t border-indigo-900/50 flex items-start gap-3 text-xs text-indigo-200/90 leading-relaxed">
          <Info className="w-4 h-4 text-[#38BDF8] shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-white">Почему GigaChat может обрезать ответное окно: </span>
            API Sber GigaChat ограничивает длину одного ответа параметром <code className="font-mono text-[#38BDF8]">max_tokens</code> (технический предел выходного буфера ~<span className="font-mono tabular-nums text-white">8 192</span> токена). Когда модель пишет слишком длинные комментарии и дословные цитаты по всем 21 критерию или запрос перегружен входным контекстом, ответ обрывается со статусом <code className="font-mono text-amber-300">finish_reason = &quot;length&quot;</code>, оставляя незакрытый JSON. При обрыве система автоматически отбраковывает неполный ответ и передаёт проверку следующей модели по каскаду.
          </div>
        </div>
      </form>

      {/* БЛОК 2: ЖИВОЙ СТАТУС SBER API И ТАБЛИЦА КАСКАДА МОДЕЛЕЙ */}
      <div className="bg-[#1B153B] border border-indigo-800/50 rounded-3xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-indigo-900/50 pb-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[#38BDF8]" />
              <span>2. Состояние моделей Sber GigaChat API и статистика расхода по моделям</span>
            </h3>
            <p className="text-xs text-indigo-200/80 mt-1">
              Живая проверка доступных моделей через <code className="font-mono text-[#38BDF8]">GET /v1/models</code>, честная диагностика <code className="font-mono text-[#38BDF8]">GET /v1/balance</code> и локальный учёт токенов.
            </p>
          </div>
          {liveStatus?.checkedAt && (
            <div className="text-[11px] font-mono tabular-nums text-indigo-300 shrink-0">
              Проверено: {formatShortDate(liveStatus.checkedAt)} · {liveStatus.scope}
            </div>
          )}
        </div>

        {/* Блок диагностики /balance и доступных моделей */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pb-2">
          <div className="bg-[#14102C] border border-indigo-900/60 rounded-2xl p-4 space-y-2">
            <div className="text-xs font-bold text-white">
              Статус метода остатка токенов (GET /v1/balance)
            </div>
            {liveStatus?.balanceSupported && liveStatus.balances.length > 0 ? (
              <div className="space-y-1.5 pt-1">
                {liveStatus.balances.map((b, i) => (
                  <div key={i} className="flex items-center justify-between text-xs border-b border-indigo-900/40 pb-1 last:border-0">
                    <span className="font-mono text-indigo-200">{b.usage}</span>
                    <span className="font-mono tabular-nums font-bold text-emerald-400">
                      {formatNum(b.value)} ток.
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-indigo-200/85 leading-relaxed">
                {liveStatus?.balanceNote ||
                  'API Сбера отдаёт живой остаток токенов только для корпоративных предоплатных пакетов. В режиме Freemium без предоплаты остаток контролируется через локальную историю фактического расхода ниже.'}
              </p>
            )}
          </div>

          <div className="bg-[#14102C] border border-indigo-900/60 rounded-2xl p-4 space-y-2">
            <div className="text-xs font-bold text-white">
              Модели, отданные учётной записью Sber API сейчас
            </div>
            {isLoadingLive && !liveStatus ? (
              <div className="text-xs text-indigo-300">Запрос списка моделей...</div>
            ) : liveStatus?.availableModels && liveStatus.availableModels.length > 0 ? (
              <div className="text-xs font-mono text-[#38BDF8] leading-relaxed">
                {liveStatus.availableModels.join(' · ')}
              </div>
            ) : (
              <div className="text-xs text-amber-300/90 leading-relaxed">
                {liveStatus?.error || 'Список моделей от API пока не получен — проверьте GIGACHAT_CREDENTIALS на сервере.'}
              </div>
            )}
          </div>
        </div>

        {/* Таблица ротации 4 моделей и потраченных по ним токенов */}
        <div className="overflow-x-auto border border-indigo-900/50 rounded-2xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#14102C] text-indigo-300 uppercase text-[10px] tracking-wider border-b border-indigo-900/40">
              <tr>
                <th className="px-4 py-3">Порядок</th>
                <th className="px-4 py-3">Модель</th>
                <th className="px-4 py-3">Доступ в API</th>
                <th className="px-4 py-3 text-right">Остаток (Сбер API)</th>
                <th className="px-4 py-3 text-right">Проверок</th>
                <th className="px-4 py-3 text-right">Токены входа</th>
                <th className="px-4 py-3 text-right">Токены ответа</th>
                <th className="px-4 py-3 text-right">Всего потрачено</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-indigo-900/40">
              {modelChain.map((modelName, idx) => {
                const stat = modelStats.find(s => s.model === modelName) || {
                  model: modelName,
                  checksCount: 0,
                  promptTokens: 0,
                  completionTokens: 0,
                  totalTokens: 0,
                  lastUsedAt: null
                };
                const meta = MODEL_META[modelName] || {
                  priority: `Шаг ${idx + 1}`,
                  title: 'Модель ротации',
                  note: ''
                };
                const inApiList =
                  liveStatus?.availableModels && liveStatus.availableModels.length > 0
                    ? liveStatus.availableModels.includes(modelName)
                    : null;
                const remainingTokens = findModelBalance(modelName, liveStatus?.balances);

                return (
                  <tr key={modelName} className="hover:bg-[#14102C]/60 transition-colors">
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span
                        className={`font-mono text-[11px] font-bold ${
                          meta.isLastResort ? 'text-amber-300' : 'text-[#38BDF8]'
                        }`}
                      >
                        {idx + 1}. {meta.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-mono font-bold text-white">{modelName}</div>
                      <div className={`text-[11px] mt-0.5 ${meta.isLastResort ? 'text-amber-300/90' : 'text-indigo-300/80'}`}>
                        {meta.note}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-[11px]">
                      {inApiList === true ? (
                        <span className="text-emerald-400 font-semibold">Доступна</span>
                      ) : inApiList === false ? (
                        <span className="text-amber-300 font-semibold">Нет в GET /models</span>
                      ) : (
                        <span className="text-indigo-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono tabular-nums whitespace-nowrap">
                      {remainingTokens !== null ? (
                        <span className="text-emerald-400 font-bold">{formatNum(remainingTokens)} ток.</span>
                      ) : liveStatus && !liveStatus.balanceSupported ? (
                        <span className="text-[11px] text-indigo-400">Не отдаёт (403)</span>
                      ) : (
                        <span className="text-indigo-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono tabular-nums text-white font-semibold">
                      {formatNum(stat.checksCount)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono tabular-nums text-indigo-200">
                      {formatNum(stat.promptTokens)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono tabular-nums text-indigo-200">
                      {formatNum(stat.completionTokens)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono tabular-nums font-bold text-[#38BDF8]">
                      {formatNum(stat.totalTokens)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* БЛОК 3: ЖУРНАЛ ТОКЕНОВ И КАДРОВ ПО КАЖДОЙ ПРОВЕРЕННОЙ ЛЕКЦИИ */}
      <div className="bg-[#1B153B] border border-indigo-800/50 rounded-3xl overflow-hidden">
        <div className="px-6 py-4 border-b border-indigo-900/50 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#FF5252]" />
            <h3 className="text-sm font-bold text-white">
              3. Детализация токенов и кадров по каждой проверенной лекции ({auditedTasks.length})
            </h3>
          </div>
          <span className="text-[11px] text-indigo-300">
            Видна только старшим кураторам
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#14102C] text-indigo-300 uppercase text-[10px] tracking-wider border-b border-indigo-900/40">
              <tr>
                <th className="px-5 py-3">Дата</th>
                <th className="px-5 py-3">Преподаватель и предмет</th>
                <th className="px-5 py-3">Модель проверки</th>
                <th className="px-5 py-3 text-right">Токены (вход / ответ / всего)</th>
                <th className="px-5 py-3 text-right">Кадры</th>
                <th className="px-5 py-3">Текст речи</th>
                <th className="px-5 py-3 text-right">Балл</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-indigo-900/30">
              {auditedTasks.map((t) => {
                const modelLabel = t.aiModel || t.talkMetadata?.aiModel || null;
                const usage = t.tokenUsage;
                const framesUp = t.framesUploaded ?? t.talkMetadata?.framesUploaded ?? null;
                const framesPlan = t.framesPlanned ?? t.talkMetadata?.framesPlanned ?? null;
                const isBaseFallback = modelLabel === 'GigaChat-2' || modelLabel === 'GigaChat';

                return (
                  <tr key={t.id} className="hover:bg-[#241E4F]/40 transition-colors">
                    <td className="px-5 py-3.5 font-mono tabular-nums text-indigo-200/80 whitespace-nowrap">
                      {t.date || '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-bold text-white">{t.teacherName}</div>
                      <div className="text-[11px] text-indigo-300">{t.subject || '—'}</div>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-[11px] whitespace-nowrap">
                      {modelLabel ? (
                        <span className={isBaseFallback ? 'text-amber-300 font-bold' : 'text-emerald-300 font-semibold'}>
                          {modelLabel}
                          {isBaseFallback ? ' (крайний резерв)' : ''}
                        </span>
                      ) : (
                        <span className="text-indigo-400">Не зафиксирована (до обновления)</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono tabular-nums whitespace-nowrap">
                      {usage && usage.totalTokens ? (
                        <div>
                          <div className="font-bold text-[#38BDF8]">
                            {formatNum(usage.totalTokens)} ток.
                          </div>
                          <div className="text-[10px] text-indigo-300/80">
                            {formatNum(usage.promptTokens)} + {formatNum(usage.completionTokens)}
                            {usage.configuredBudgetTokens ? ` (лимит ${Math.round(usage.configuredBudgetTokens / 1000)}k)` : ''}
                          </div>
                        </div>
                      ) : (
                        <span className="text-indigo-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono tabular-nums whitespace-nowrap text-white">
                      {typeof framesUp === 'number' ? (
                        <span>
                          {framesUp}
                          {typeof framesPlan === 'number' ? ` / ${framesPlan}` : ''} кадр.
                        </span>
                      ) : (
                        <span className="text-indigo-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-[11px] whitespace-nowrap">
                      {usage ? (
                        usage.transcriptTrimmed ? (
                          <span className="text-amber-300 font-mono tabular-nums">
                            Сжат ({formatNum(usage.transcriptSentChars)}/{formatNum(usage.transcriptOriginalChars)} симв.)
                          </span>
                        ) : (
                          <span className="text-emerald-300">Полный</span>
                        )
                      ) : (
                        <span className="text-indigo-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono tabular-nums font-bold text-white whitespace-nowrap">
                      {typeof t.totalScore === 'number' ? `${t.totalScore} / 100` : '—'}
                    </td>
                  </tr>
                );
              })}
              {auditedTasks.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-xs text-indigo-300">
                    <BarChart3 className="w-6 h-6 text-indigo-400/50 mx-auto mb-2" />
                    <div>Завершённых проверок пока нет — статистика по токенам и кадрам появится после первого анализа.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
