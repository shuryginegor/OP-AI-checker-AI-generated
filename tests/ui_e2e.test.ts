import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { chromium, Browser } from 'playwright-core';
// @ts-ignore
import { DatabaseSync } from 'node:sqlite';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const SENIOR_EMAIL = 'shurygin.egor2009@gmail.com';
const CURATOR_EMAIL = 'ui.curator@olympiadpractices.ru';

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

function resolveBrowserExecutable(): string | undefined {
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH && fs.existsSync(process.env.PLAYWRIGHT_EXECUTABLE_PATH)) {
    return process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  }
  const containerBin = '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell';
  if (fs.existsSync(containerBin)) {
    return containerBin;
  }
  return undefined;
}

async function waitForServerReady(baseUrl: string, timeoutMs = 25_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/config`);
      if (res.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`UI-сервер ${baseUrl} не ответил за ${timeoutMs} мс`);
}

function readLatestOtpFromDb(dataDir: string, email: string): string {
  const db = new DatabaseSync(path.join(dataDir, 'app_database.sqlite'));
  try {
    const row = db.prepare(
      `SELECT code FROM otp_codes WHERE LOWER(email) = LOWER(?) AND purpose = 'login' AND used = 0 ORDER BY id DESC LIMIT 1`
    ).get(email) as { code?: string } | undefined;
    assert.ok(row?.code, `OTP код для ${email} не найден в SQLite`);
    return row.code;
  } finally {
    db.close();
  }
}

function seedCompletedLecture(dataDir: string, taskId: string, teacherName: string): void {
  const db = new DatabaseSync(path.join(dataDir, 'app_database.sqlite'));
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
      taskId,
      `https://olymp.ktalk.ru/recordings/${taskId}`,
      teacherName,
      'Олимпиадная химия',
      '10 класс',
      '2026-11-15 17:30',
      95,
      'completed',
      100,
      SENIOR_EMAIL,
      JSON.stringify([]),
      JSON.stringify(['Глубокий разбор задач']),
      JSON.stringify(['Продолжать в том же темпе']),
      JSON.stringify([
        {
          id: 1,
          text: 'Преподаватель уверенно ведёт разбор',
          category: 'Педагогика',
          passed: true,
          notApplicable: false,
          score: 5,
          penaltyScore: 0,
          timecodes: [],
          comment: 'Выполнено полностью',
          quote: '«Рассмотрим реакцию окисления»'
        }
      ]),
      JSON.stringify({
        title: 'Олимпиадная химия',
        recordingKey: taskId,
        aiModel: 'GigaChat-2-Max',
        framesUploaded: 18,
        framesPlanned: 20
      }),
      0,
      1,
      5,
      5,
      'GigaChat-2-Max',
      JSON.stringify({
        promptTokens: 41200,
        completionTokens: 1300,
        totalTokens: 42500,
        configuredBudgetTokens: 128000,
        transcriptTrimmed: false
      }),
      18,
      20,
      JSON.stringify([
        { model: 'GigaChat-2-Pro', status: 'failed', reason: '429 Too Many Requests' },
        { model: 'GigaChat-2-Max', status: 'completed', totalTokens: 42500 }
      ]),
      new Date().toISOString()
    );

    db.prepare(`INSERT OR IGNORE INTO teachers (name, subject) VALUES (?, ?)`).run(teacherName, 'Олимпиадная химия');
  } finally {
    db.close();
  }
}

describe('E2E UI тесты в Headless Chromium (Playwright)', () => {
  let tempDataDir: string;
  let port: number;
  let baseUrl: string;
  let serverProc: ChildProcess;
  let browser: Browser;

  before(async () => {
    tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'olymp_ui_test_'));
    port = await getFreePort();
    baseUrl = `http://127.0.0.1:${port}`;

    const hasDist = fs.existsSync(path.join(ROOT_DIR, 'dist', 'index.html'));
    const tsxBin = path.join(ROOT_DIR, 'node_modules', '.bin', 'tsx');
    serverProc = spawn(tsxBin, ['server.ts'], {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: hasDist ? 'production' : 'development',
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

    // Добавляем обычного куратора и завершённую лекцию Анны Фокиной в изолированную БД
    const db = new DatabaseSync(path.join(tempDataDir, 'app_database.sqlite'));
    try {
      db.prepare(`
        INSERT OR IGNORE INTO curators (id, email, full_name, role, status, added_by, created_at)
        VALUES (?, ?, ?, 'curator', 'active', 'test', ?)
      `).run('cur_ui_1', CURATOR_EMAIL, 'Куратор Интерфейса', new Date().toISOString());
    } finally {
      db.close();
    }
    seedCompletedLecture(tempDataDir, 'lec_ui_fokina', 'Анна Фокина');

    const executablePath = resolveBrowserExecutable();
    browser = await chromium.launch({
      headless: true,
      executablePath,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader'
      ]
    });
  });

  after(async () => {
    if (browser) {
      await browser.close().catch(() => {});
    }
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

  it('Старший куратор: вход по OTP, вкладки, настройка лимита токенов, модель/телеметрия и перепроверка; обычный куратор: скрытие Senior-данных', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    const pageErrors: string[] = [];
    const server500s: string[] = [];
    page.on('pageerror', err => pageErrors.push(err.message));
    page.on('response', res => {
      if (res.status() >= 500 && !res.url().includes('/api/ai/status')) {
        server500s.push(`${res.status()} ${res.url()}`);
      }
    });

    // 1. Вход старшего куратора по Email OTP
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.getByPlaceholder('curator@olympiadpractices.ru').fill(SENIOR_EMAIL);
    await page.getByRole('button', { name: /Получить код подтверждения/i }).click();
    await page.getByPlaceholder('000000').waitFor({ state: 'visible' });

    const seniorOtp = readLatestOtpFromDb(tempDataDir, SENIOR_EMAIL);
    await page.getByPlaceholder('000000').fill(seniorOtp);
    await page.getByRole('button', { name: /Войти в личный кабинет/i }).click();

    // 2. Проверяем видимость всех вкладок Senior Curator и отсутствие Брендбука
    await page.getByRole('button', { name: /Дашборд преподавателей/i }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: /Проверить встречу КТалк/i }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: /Правила проверки/i }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: /Управление кураторами/i }).waitFor({ state: 'visible' });
    const aiTabBtn = page.getByRole('button', { name: /Лимиты и модели/i });
    await aiTabBtn.waitFor({ state: 'visible' });
    assert.equal(await page.getByRole('button', { name: /Брендбук/i }).count(), 0);

    // Проверяем, что при 1 активной лекции ожидающая отображается как "В очереди #1" без надписи FIFO
    const dbSeed = new DatabaseSync(path.join(tempDataDir, 'app_database.sqlite'));
    try {
      dbSeed.prepare(`
        INSERT INTO lecture_tasks (
          id, lecture_url, teacher_name, subject, group_name, date, status, progress_pct, curator_email, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'lec_ui_running_1',
        'https://olymp.ktalk.ru/recordings/ui_running_1',
        'Идёт Проверка',
        'Математика',
        '10 класс',
        '2026-11-15 18:00',
        'analyzing',
        85,
        'other.curator@olympiadpractices.ru',
        new Date(Date.now() - 2000).toISOString()
      );
      dbSeed.prepare(`
        INSERT INTO lecture_tasks (
          id, lecture_url, teacher_name, subject, group_name, date, status, progress_pct, curator_email, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'lec_ui_queued_2',
        'https://olymp.ktalk.ru/recordings/ui_queued_2',
        'Вторая В Очереди',
        'Физика',
        '11 класс',
        '2026-11-15 18:05',
        'pending',
        0,
        'other.curator@olympiadpractices.ru',
        new Date(Date.now() - 1000).toISOString()
      );
    } finally {
      dbSeed.close();
    }

    await page.reload({ waitUntil: 'networkidle' });
    const queuedRow = page.locator('tbody tr', { hasText: 'Вторая В Очереди' }).first();
    await queuedRow.waitFor({ state: 'visible' });
    await queuedRow.getByText('В очереди #1').waitFor({ state: 'visible' });
    assert.equal(await page.getByText(/\bFIFO\b/i).count(), 0);

    // 3. Проверка телеметрии модели и токенов в таблице дашборда (до нажатия Перепроверить)
    const fokinaRow = page.locator('tbody tr', { hasText: 'Анна Фокина' }).first();
    await fokinaRow.waitFor({ state: 'visible' });
    await assert.doesNotReject(() => fokinaRow.getByText('GigaChat-2-Max').waitFor({ state: 'visible' }));
    await assert.doesNotReject(() => fokinaRow.getByText(/42\s*500\s*ток\./).waitFor({ state: 'visible' }));
    await assert.doesNotReject(() => fokinaRow.getByText(/18\/20 кадр\./).waitFor({ state: 'visible' }));
    await assert.doesNotReject(() => fokinaRow.getByRole('button', { name: /Перепроверить/i }).waitFor({ state: 'visible' }));

    // 4. Открытие карточки отчёта, проверка модели, телеметрии и кнопки «Отправить на перепроверку»
    await fokinaRow.getByRole('button', { name: /Подробнее/i }).click();
    await page.getByText(/Расход ресурсов на проверку/i).waitFor({ state: 'visible' });
    await page.getByText(/Модель:\s*GigaChat-2-Max/i).waitFor({ state: 'visible' });
    const modalRetryBtn = page.getByRole('button', { name: /Отправить на перепроверку/i });
    await modalRetryBtn.waitFor({ state: 'visible' });

    // Закрываем пока карточку, сперва проверим окно «Лимиты и модели»
    await page.getByRole('button', { name: /Закрыть отчет/i }).click();

    // 5. Проверяем текстовую расшифровку кнопок на вкладке «Правила проверки» и переходим в «Лимиты и модели»
    await page.getByRole('button', { name: /Правила проверки/i }).click();
    await page.getByText(/Что означает каждая вкладка и кнопка:/i).waitFor({ state: 'visible' });
    await page.getByText(/ваша собственная резервная версия инструкции/i).waitFor({ state: 'visible' });

    // Открытие «Лимиты и модели», изменение бюджета до 192k, сохранение и проверка после перезагрузки
    await aiTabBtn.click();
    await page.getByText(/Расчётный лимит токенов на одно занятие/i).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '192k', exact: true }).click();
    await page.getByRole('button', { name: /Сохранить лимит/i }).click();
    await page.getByText(/192\s*000 токенов.*сохранены/i).waitFor({ state: 'visible' });

    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Лимиты и модели/i }).click();
    const limitNumberInput = page.locator('input[type="number"]').first();
    await limitNumberInput.waitFor({ state: 'visible' });
    assert.equal(await limitNumberInput.inputValue(), '192000');

    // 6. Возврат на дашборд и запуск перепроверки завершённой лекции из карточки
    await page.getByRole('button', { name: /Дашборд преподавателей/i }).click();
    await page.locator('tbody tr', { hasText: 'Анна Фокина' }).first().getByRole('button', { name: /Подробнее/i }).click();
    await page.getByRole('button', { name: /Отправить на перепроверку/i }).click();
    await page.getByText(/возвращена в очередь на повторную проверку/i).waitFor({ state: 'visible' });

    // Дожидаемся, пока диспетчер очереди завершит выполнение фоновых python-процессов с пустыми ключами
    const queueDrainDeadline = Date.now() + 15_000;
    while (Date.now() < queueDrainDeadline) {
      const dbPoll = new DatabaseSync(path.join(tempDataDir, 'app_database.sqlite'));
      let stillQueuedOrRunning = 0;
      try {
        const row = dbPoll.prepare(
          `SELECT COUNT(*) AS cnt FROM lecture_tasks WHERE id IN ('lec_ui_fokina', 'lec_ui_queued_2') AND status IN ('pending', 'downloading', 'extracting', 'uploading', 'analyzing')`
        ).get() as { cnt: number };
        stillQueuedOrRunning = row.cnt;
      } finally {
        dbPoll.close();
      }
      if (stillQueuedOrRunning === 0) break;
      await page.waitForTimeout(250);
    }
    // Небольшой запас, чтобы processLectureQueue успел выйти из цикла while
    await page.waitForTimeout(300);

    // 7. Добавляем ещё одну завершённую лекцию и свежую ожидающую лекцию от имени другого куратора для проверки общего дашборда и RBAC
    seedCompletedLecture(tempDataDir, 'lec_ui_curator_view', 'Иван Петров');
    const dbCuratorSeed = new DatabaseSync(path.join(tempDataDir, 'app_database.sqlite'));
    try {
      dbCuratorSeed.prepare(`
        INSERT OR REPLACE INTO lecture_tasks (
          id, lecture_url, teacher_name, subject, group_name, date, status, progress_pct, curator_email, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'lec_ui_queued_2',
        'https://olymp.ktalk.ru/recordings/ui_queued_2',
        'Вторая В Очереди',
        'Физика',
        '11 класс',
        '2026-11-15 18:05',
        'pending',
        0,
        'other.curator@olympiadpractices.ru',
        new Date().toISOString()
      );
    } finally {
      dbCuratorSeed.close();
    }

    // Выход и вход под обычным куратором
    await page.getByTitle('Выйти из аккаунта').click();
    await page.getByPlaceholder('curator@olympiadpractices.ru').fill(CURATOR_EMAIL);
    await page.getByRole('button', { name: /Получить код подтверждения/i }).click();
    await page.getByPlaceholder('000000').waitFor({ state: 'visible' });
    const curatorOtp = readLatestOtpFromDb(tempDataDir, CURATOR_EMAIL);
    await page.getByPlaceholder('000000').fill(curatorOtp);
    await page.getByRole('button', { name: /Войти в личный кабинет/i }).click();

    await page.getByRole('button', { name: /Дашборд преподавателей/i }).waitFor({ state: 'visible' });
    assert.equal(await page.getByRole('button', { name: /Лимиты и модели/i }).count(), 0);
    assert.equal(await page.getByRole('button', { name: /Управление кураторами/i }).count(), 0);
    assert.equal(await page.getByRole('button', { name: /Правила проверки/i }).count(), 0);
    assert.equal(await page.getByRole('button', { name: /Брендбук/i }).count(), 0);

    // Обычный куратор видит на общем дашборде и лекции старшего, и лекции других кураторов
    await page.locator('tbody tr', { hasText: 'Идёт Проверка' }).first().waitFor({ state: 'visible' });
    await page.locator('tbody tr', { hasText: 'Вторая В Очереди' }).first().getByText('В очереди #1').waitFor({ state: 'visible' });

    const petrovRow = page.locator('tbody tr', { hasText: 'Иван Петров' }).first();
    await petrovRow.waitFor({ state: 'visible' });
    // Модель видна, но счётчик токенов/кадров скрыт для обычного куратора
    await assert.doesNotReject(() => petrovRow.getByText('GigaChat-2-Max').waitFor({ state: 'visible' }));
    assert.equal(await petrovRow.getByText(/ток\./).count(), 0);

    await petrovRow.getByRole('button', { name: /Подробнее/i }).click();
    await page.getByText(/Модель:\s*GigaChat-2-Max/i).waitFor({ state: 'visible' });
    assert.equal(await page.getByText(/Расход ресурсов на проверку/i).count(), 0);

    assert.deepEqual(pageErrors, [], `Обнаружены JS-ошибки на странице: ${pageErrors.join('; ')}`);
    assert.deepEqual(server500s, [], `Обнаружены 5xx ответы сервера: ${server500s.join('; ')}`);

    await context.close();
  });
});
