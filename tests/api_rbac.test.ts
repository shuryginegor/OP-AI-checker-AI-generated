import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
// @ts-ignore
import { DatabaseSync } from 'node:sqlite';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const SENIOR_EMAIL = 'shurygin.egor2009@gmail.com';
const CURATOR_EMAIL = 'curator.test@olympiadpractices.ru';

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (!addr || typeof addr === 'string') {
        srv.close();
        reject(new Error('Не удалось получить свободный порт'));
        return;
      }
      const p = addr.port;
      srv.close(() => resolve(p));
    });
    srv.on('error', reject);
  });
}

async function waitForServerReady(baseUrl: string, timeoutMs = 20_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/config`);
      if (res.ok) return;
    } catch {
      // Сервер ещё запускается
    }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error(`Тестовый сервер ${baseUrl} не ответил за ${timeoutMs} мс`);
}

function readLatestOtpFromDb(dataDir: string, email: string, purpose = 'login'): string {
  const dbPath = path.join(dataDir, 'app_database.sqlite');
  const db = new DatabaseSync(dbPath);
  try {
    const row = db.prepare(
      `SELECT code FROM otp_codes WHERE LOWER(email) = LOWER(?) AND purpose = ? AND used = 0 ORDER BY id DESC LIMIT 1`
    ).get(email, purpose) as { code?: string } | undefined;
    assert.ok(row?.code, `OTP код для ${email} (${purpose}) не найден в БД`);
    return row.code;
  } finally {
    db.close();
  }
}

async function loginViaOtp(baseUrl: string, dataDir: string, email: string): Promise<{ token: string; curator: any }> {
  const reqRes = await fetch(`${baseUrl}/api/auth/request-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  const reqData: any = await reqRes.json();
  assert.equal(reqRes.status, 200, `request-code failed: ${JSON.stringify(reqData)}`);
  assert.equal(reqData.success, true);

  const code = readLatestOtpFromDb(dataDir, email, 'login');
  const verRes = await fetch(`${baseUrl}/api/auth/verify-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code })
  });
  const verData: any = await verRes.json();
  assert.equal(verRes.status, 200, `verify-code failed: ${JSON.stringify(verData)}`);
  assert.equal(verData.success, true);
  assert.ok(verData.token);
  return { token: verData.token, curator: verData.curator };
}

describe('API, SQLite БД, RBAC, ротация/лимиты ИИ и экспорт Excel', () => {
  let tempDataDir: string;
  let port: number;
  let baseUrl: string;
  let serverProc: ChildProcess;
  let seniorToken: string;
  let curatorToken: string;

  before(async () => {
    tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'olymp_api_test_'));
    port = await getFreePort();
    baseUrl = `http://127.0.0.1:${port}`;

    const tsxBin = path.join(ROOT_DIR, 'node_modules', '.bin', 'tsx');
    serverProc = spawn(tsxBin, ['server.ts'], {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: 'production',
        DB_TYPE: 'sqlite',
        APP_DATA_DIR: tempDataDir,
        TESTING_MODE: 'false',
        TALK_API_KEY: '',
        TALK_DOMAIN: '',
        KTALK_DOMAIN: '',
        GIGACHAT_CREDENTIALS: '',
        SMTP_HOST: '',
        SMTP_USER: '',
        SMTP_PASS: '',
        BOT_TOKEN: ''
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    await waitForServerReady(baseUrl);
  });

  after(async () => {
    if (serverProc && !serverProc.killed) {
      serverProc.kill('SIGTERM');
      await new Promise<void>(resolve => {
        const t = setTimeout(() => {
          try { serverProc.kill('SIGKILL'); } catch {}
          resolve();
        }, 3000);
        serverProc.once('exit', () => {
          clearTimeout(t);
          resolve();
        });
      });
    }
    fs.rmSync(tempDataDir, { recursive: true, force: true });
  });

  it('1. Блокирует чужой email (403) и пускает старшего куратора по Email OTP', async () => {
    const unknownRes = await fetch(`${baseUrl}/api/auth/request-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'stranger@example.com' })
    });
    assert.equal(unknownRes.status, 403);

    const login = await loginViaOtp(baseUrl, tempDataDir, SENIOR_EMAIL);
    seniorToken = login.token;
    assert.equal(login.curator.role, 'senior_curator');

    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${seniorToken}` }
    });
    assert.equal(meRes.status, 200);
    const meJson: any = await meRes.json();
    assert.equal(meJson.curator.email, SENIOR_EMAIL);
  });

  it('2. Добавление обычного куратора и строгий RBAC (403 на senior-эндпоинты)', async () => {
    const addRes = await fetch(`${baseUrl}/api/curators`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${seniorToken}`
      },
      body: JSON.stringify({
        email: CURATOR_EMAIL,
        fullName: 'Обычный Куратор Тест',
        role: 'curator'
      })
    });
    assert.equal(addRes.status, 200);

    const login = await loginViaOtp(baseUrl, tempDataDir, CURATOR_EMAIL);
    curatorToken = login.token;
    assert.equal(login.curator.role, 'curator');

    const restrictedEndpoints = [
      { method: 'GET', path: '/api/ai/settings' },
      { method: 'PUT', path: '/api/ai/settings', body: { maxRequestTokens: 96000 } },
      { method: 'GET', path: '/api/ai/status' },
      { method: 'GET', path: '/api/curators' },
      { method: 'GET', path: '/api/prompt/data' },
      { method: 'GET', path: '/api/audit-logs' }
    ];

    for (const ep of restrictedEndpoints) {
      const r = await fetch(`${baseUrl}${ep.path}`, {
        method: ep.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${curatorToken}`
        },
        body: ep.body ? JSON.stringify(ep.body) : undefined
      });
      assert.equal(r.status, 403, `Ожидался HTTP 403 для curator на ${ep.method} ${ep.path}`);
    }
  });

  it('3. Фильтрует телеметрию токенов/кадров по роли, но оставляет aiModel обеим ролям', async () => {
    const db = new DatabaseSync(path.join(tempDataDir, 'app_database.sqlite'));
    try {
      db.prepare(`
        INSERT INTO lecture_tasks (
          id, lecture_url, teacher_name, subject, group_name, date, total_score,
          status, progress_pct, curator_email, critical_violations, positive_highlights,
          recommendations, criteria_data, talk_metadata, is_corrupted, applicable_count,
          earned_points, max_points, ai_model, token_usage_json, frames_uploaded,
          frames_planned, model_attempts_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'lec_api_completed_1',
        'https://olymp.ktalk.ru/recordings/api_test_rec_1',
        'Анна Фокина',
        'Олимпиадная физика',
        '9 класс',
        '2026-11-15 18:00',
        92,
        'completed',
        100,
        SENIOR_EMAIL,
        JSON.stringify([]),
        JSON.stringify(['Чёткое объяснение теории']),
        JSON.stringify(['Добавить больше задач']),
        JSON.stringify([{ id: 1, text: 'Владение материалом', category: 'Методика', passed: true, notApplicable: false, score: 5, penaltyScore: 0, timecodes: [], comment: 'Отлично', quote: '«Разберём задачу»' }]),
        JSON.stringify({ title: 'Физика 9 кл', recordingKey: 'api_test_rec_1', aiModel: 'GigaChat-2-Max', framesUploaded: 22, framesPlanned: 24 }),
        0,
        1,
        5,
        5,
        'GigaChat-2-Max',
        JSON.stringify({ promptTokens: 41000, completionTokens: 1500, totalTokens: 42500, configuredBudgetTokens: 128000, transcriptTrimmed: false }),
        22,
        24,
        JSON.stringify([{ model: 'GigaChat-2-Pro', status: 'failed' }, { model: 'GigaChat-2-Max', status: 'completed', totalTokens: 42500 }]),
        new Date().toISOString()
      );
    } finally {
      db.close();
    }

    const seniorTasksRes = await fetch(`${baseUrl}/api/tasks`, {
      headers: { Authorization: `Bearer ${seniorToken}` }
    });
    const seniorTasksJson: any = await seniorTasksRes.json();
    const seniorTask = seniorTasksJson.tasks.find((t: any) => t.id === 'lec_api_completed_1');
    assert.ok(seniorTask);
    assert.equal(seniorTask.aiModel, 'GigaChat-2-Max');
    assert.equal(seniorTask.tokenUsage?.totalTokens, 42500);
    assert.equal(seniorTask.framesUploaded, 22);
    assert.equal(seniorTask.modelAttempts?.length, 2);

    const curatorTasksRes = await fetch(`${baseUrl}/api/tasks`, {
      headers: { Authorization: `Bearer ${curatorToken}` }
    });
    const curatorTasksJson: any = await curatorTasksRes.json();
    const curatorTask = curatorTasksJson.tasks.find((t: any) => t.id === 'lec_api_completed_1');
    assert.ok(curatorTask);
    assert.equal(curatorTask.aiModel, 'GigaChat-2-Max');
    assert.equal(curatorTask.totalScore, 92);
    assert.equal(curatorTask.tokenUsage, undefined);
    assert.equal(curatorTask.framesUploaded, undefined);
    assert.equal(curatorTask.framesPlanned, undefined);
    assert.equal(curatorTask.modelAttempts, undefined);
    assert.equal(curatorTask.talkMetadata?.framesUploaded, undefined);
  });

  it('4. Валидация PUT /api/ai/settings, сохранение на диск и статистика моделей', async () => {
    const badRes = await fetch(`${baseUrl}/api/ai/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${seniorToken}`
      },
      body: JSON.stringify({ maxRequestTokens: 10000 })
    });
    assert.equal(badRes.status, 400);

    const goodRes = await fetch(`${baseUrl}/api/ai/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${seniorToken}`
      },
      body: JSON.stringify({
        maxRequestTokens: 192000,
        reservedOutputTokens: 99999,
        enableModelRotation: true
      })
    });
    assert.equal(goodRes.status, 200);
    const goodJson: any = await goodRes.json();
    assert.equal(goodJson.settings.maxRequestTokens, 192000);
    assert.equal(goodJson.settings.reservedOutputTokens, 8192);

    const diskSettings = JSON.parse(fs.readFileSync(path.join(tempDataDir, 'ai_settings.json'), 'utf-8'));
    assert.equal(diskSettings.maxRequestTokens, 192000);

    const statsRes = await fetch(`${baseUrl}/api/ai/settings`, {
      headers: { Authorization: `Bearer ${seniorToken}` }
    });
    const statsJson: any = await statsRes.json();
    assert.equal(statsJson.summary.totalTrackedTokens, 42500);
    const maxStat = statsJson.modelStats.find((s: any) => s.model === 'GigaChat-2-Max');
    assert.equal(maxStat.checksCount, 1);
    assert.equal(maxStat.totalTokens, 42500);
  });

  it('5. Выгружает валидный Excel (.xlsx) и переотправляет завершённую лекцию в очередь (retry)', async () => {
    const xlsxRes = await fetch(`${baseUrl}/api/analytics/export-excel`, {
      headers: { Authorization: `Bearer ${seniorToken}` }
    });
    assert.equal(xlsxRes.status, 200);
    const contentType = xlsxRes.headers.get('content-type') || '';
    assert.ok(contentType.includes('spreadsheetml.sheet'));
    const buf = Buffer.from(await xlsxRes.arrayBuffer());
    assert.ok(buf.length > 500);
    assert.equal(buf[0], 0x50); // 'P'
    assert.equal(buf[1], 0x4b); // 'K' (XLSX = ZIP контейнер)

    // Блокируем retry активной задачи (400)
    const db = new DatabaseSync(path.join(tempDataDir, 'app_database.sqlite'));
    try {
      db.prepare(`
        INSERT INTO lecture_tasks (
          id, lecture_url, teacher_name, subject, group_name, date, status, progress_pct, curator_email, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'lec_active_lock',
        'https://olymp.ktalk.ru/recordings/active_lock',
        'Активный Преподаватель',
        'Информатика',
        '11 класс',
        '2026-11-15 19:00',
        'analyzing',
        85,
        SENIOR_EMAIL,
        new Date().toISOString()
      );
    } finally {
      db.close();
    }

    const activeRetryRes = await fetch(`${baseUrl}/api/tasks/lec_active_lock/retry`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${seniorToken}` }
    });
    assert.equal(activeRetryRes.status, 400);

    // Завершённая лекция Фокиной успешно переотправляется в очередь (200)
    const retryRes = await fetch(`${baseUrl}/api/tasks/lec_api_completed_1/retry`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${seniorToken}` }
    });
    assert.equal(retryRes.status, 200);
    const retryJson: any = await retryRes.json();
    assert.equal(retryJson.success, true);
    assert.equal(retryJson.task.status, 'pending');
    assert.equal(retryJson.task.tokenUsage, null);

    // Дожидаемся завершения запущенного Python-воркера (он быстро завершится, т.к. ключи пустые),
    // чтобы при teardown не осталось висящих дочерних процессов.
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const checkRes = await fetch(`${baseUrl}/api/tasks/lec_api_completed_1`, {
        headers: { Authorization: `Bearer ${seniorToken}` }
      });
      const checkJson: any = await checkRes.json();
      if (checkJson.task?.status === 'failed' || checkJson.task?.status === 'completed') {
        break;
      }
      await new Promise(r => setTimeout(r, 150));
    }
  });
});
