import { Pool } from 'pg';
import path from 'path';
import fs from 'fs';

export interface CuratorRecord {
  id: string;
  email: string;
  fullName: string;
  role: 'curator' | 'senior_curator';
  status: 'active' | 'blocked';
  addedBy: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AuditLogRecord {
  id: number;
  timestamp: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  target: string;
  details: string;
  ipAddress: string;
}

export interface LectureTaskRecord {
  id: string;
  lectureUrl: string;
  teacherName: string;
  subject: string;
  groupName: string;
  date: string;
  totalScore: number | null;
  criticalViolations: string[];
  positiveHighlights: string[];
  recommendations: string[];
  criteria: any[];
  status: 'pending' | 'downloading' | 'extracting' | 'uploading' | 'analyzing' | 'completed' | 'failed';
  progressPct: number;
  curatorEmail: string;
  createdAt: string;
  talkMetadata?: {
    title?: string;
    login?: string;
    name?: string;
    surname?: string;
    author?: string;
    date?: string;
    duration?: string;
    recordingKey?: string;
    resolution?: string;
    url?: string;
    domain?: string;
    [key: string]: any;
  } | null;
  isCorrupted?: boolean;
  rawBrokenResponse?: string | null;
  errorMessage?: string | null;
  applicableCount?: number | null;
  earnedPoints?: number | null;
  maxPoints?: number | null;
}

export interface ReportDisplaySettings {
  displayMode: 'five_point' | 'penalty' | 'status_only';
  naBadgeText: string;
  naDescription: string;
}

export const DEFAULT_REPORT_SETTINGS: ReportDisplaySettings = {
  displayMode: 'five_point',
  naBadgeText: 'Н/П',
  naDescription: 'Критерий не применим к формату данного занятия — исключён из максимального и набранного балла.'
};

export interface KtalkRecordingRecord {
  recordingKey: string;
  lectureUrl: string;
  title: string;
  createdDate: string;
  duration: string;
  authorName: string;
  authorLogin: string;
  authorEmail: string;
  roomName: string;
  resolutions: string[];
  hasTranscript?: boolean;
  hasSummary?: boolean;
  status: 'new' | 'submitted' | 'hidden';
  hiddenBy?: string | null;
  hiddenAt?: string | null;
  syncedAt: string;
  rawMetadata?: any;
}

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const SQLITE_FILE = path.join(DATA_DIR, 'app_database.sqlite');

let pgPool: Pool | null = null;
let sqliteDb: any = null;
let isPostgres = false;

// 1. Инициализация подключения
export async function initDatabase(): Promise<{ isPostgres: boolean }> {
  const dbType = (process.env.DB_TYPE || 'postgres').toLowerCase();
  const host = process.env.DB_HOST || 'localhost';
  const port = Number(process.env.DB_PORT) || 5432;
  const user = process.env.DB_USER || 'postgres';
  const password = process.env.DB_PASSWORD || 'postgres_password';
  const database = process.env.DB_NAME || 'lecture_db';

  if (dbType === 'postgres') {
    try {
      const pool = new Pool({
        host,
        port,
        user,
        password,
        database,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
        max: 10
      });

      // Проверка соединения
      const client = await pool.connect();
      client.release();

      pgPool = pool;
      isPostgres = true;
      console.log(`[БД] ✅ Успешное подключение к PostgreSQL 16 (${host}:${port}/${database}).`);
      await initTablesPG();
      await seedInitialData();
      return { isPostgres: true };
    } catch (err: any) {
      console.warn(`[БД] ⚠️ Не удалось подключиться к PostgreSQL (${err.message}). Выполняется проверка резервной базы.`);
    }
  }

  // Fallback на SQLite (если модуль доступен в рантайме)
  try {
    let DatabaseSyncClass: any = null;
    try {
      // @ts-ignore
      const sqliteMod = await import('node:sqlite');
      DatabaseSyncClass = sqliteMod.DatabaseSync;
    } catch {
      // Модуль node:sqlite отсутствует в Node 20
    }

    if (DatabaseSyncClass) {
      sqliteDb = new DatabaseSyncClass(SQLITE_FILE);
      sqliteDb.exec('PRAGMA journal_mode = WAL;');
      sqliteDb.exec('PRAGMA synchronous = NORMAL;');
      isPostgres = false;
      console.log(`[БД] ✅ База данных SQLite (${SQLITE_FILE}) успешно инициализирована.`);
      await initTablesSQLite();
      await seedInitialData();
      return { isPostgres: false };
    } else {
      console.log(`[БД] 🔄 Повторная попытка соединения с PostgreSQL 16 (${host}:${port}/${database})...`);
      const retryPool = new Pool({
        host,
        port,
        user,
        password,
        database,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
        max: 10
      });
      const client = await retryPool.connect();
      client.release();
      pgPool = retryPool;
      isPostgres = true;
      console.log(`[БД] ✅ Успешное подключение к PostgreSQL 16 со второй попытки.`);
      await initTablesPG();
      await seedInitialData();
      return { isPostgres: true };
    }
  } catch (err: any) {
    console.error(`[БД] ❌ Критическая ошибка инициализации БД:`, err);
    throw err;
  }
}

// 2. Создание таблиц в PostgreSQL
async function initTablesPG() {
  if (!pgPool) return;

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS curators (
      id VARCHAR(64) PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      role VARCHAR(32) NOT NULL DEFAULT 'curator',
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      added_by VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      last_login_at TIMESTAMP WITH TIME ZONE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      actor_email VARCHAR(255) NOT NULL,
      actor_role VARCHAR(32),
      action VARCHAR(64) NOT NULL,
      target VARCHAR(255),
      details TEXT,
      ip_address VARCHAR(64)
    );

    CREATE TABLE IF NOT EXISTS lecture_tasks (
      id VARCHAR(64) PRIMARY KEY,
      lecture_url TEXT NOT NULL,
      teacher_name VARCHAR(255) NOT NULL,
      subject VARCHAR(255),
      group_name VARCHAR(255),
      date VARCHAR(64),
      total_score INTEGER DEFAULT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      progress_pct INTEGER DEFAULT 0,
      curator_email VARCHAR(255) NOT NULL,
      critical_violations TEXT,
      positive_highlights TEXT,
      recommendations TEXT,
      criteria_data TEXT,
      talk_metadata TEXT,
      is_corrupted BOOLEAN DEFAULT FALSE,
      raw_broken_response TEXT,
      error_message TEXT,
      applicable_count INTEGER,
      earned_points INTEGER,
      max_points INTEGER,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS teachers (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      subject VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS otp_codes (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      code VARCHAR(16) NOT NULL,
      purpose VARCHAR(32) NOT NULL,
      attempts INTEGER DEFAULT 0,
      expires_at BIGINT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      used INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS prompt_configs (
      key VARCHAR(64) PRIMARY KEY,
      prompt_text TEXT NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_by VARCHAR(255) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS criteria_configs (
      key VARCHAR(64) PRIMARY KEY,
      criteria_json TEXT NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_by VARCHAR(255) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ktalk_recordings (
      recording_key VARCHAR(128) PRIMARY KEY,
      lecture_url TEXT NOT NULL,
      title TEXT,
      created_date VARCHAR(64),
      duration VARCHAR(64),
      author_name VARCHAR(255),
      author_login VARCHAR(255),
      author_email VARCHAR(255),
      room_name VARCHAR(255),
      resolutions_json TEXT,
      has_transcript BOOLEAN DEFAULT FALSE,
      has_summary BOOLEAN DEFAULT FALSE,
      status VARCHAR(32) NOT NULL DEFAULT 'new',
      hidden_by VARCHAR(255),
      hidden_at VARCHAR(64),
      synced_at VARCHAR(64),
      raw_metadata_json TEXT
    );
  `);

  try {
    await pgPool.query(`
      ALTER TABLE lecture_tasks ADD COLUMN IF NOT EXISTS talk_metadata TEXT;
      ALTER TABLE lecture_tasks ADD COLUMN IF NOT EXISTS is_corrupted BOOLEAN DEFAULT FALSE;
      ALTER TABLE lecture_tasks ADD COLUMN IF NOT EXISTS raw_broken_response TEXT;
      ALTER TABLE lecture_tasks ADD COLUMN IF NOT EXISTS error_message TEXT;
      ALTER TABLE lecture_tasks ADD COLUMN IF NOT EXISTS applicable_count INTEGER;
      ALTER TABLE lecture_tasks ADD COLUMN IF NOT EXISTS earned_points INTEGER;
      ALTER TABLE lecture_tasks ADD COLUMN IF NOT EXISTS max_points INTEGER;
    `);
  } catch (migErr) {
    // Игнорируем если уже добавлены
  }
}

// 3. Создание таблиц в SQLite
async function initTablesSQLite() {
  if (!sqliteDb) return;

  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS curators (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'curator',
      status TEXT NOT NULL DEFAULT 'active',
      added_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      actor_email TEXT NOT NULL,
      actor_role TEXT,
      action TEXT NOT NULL,
      target TEXT,
      details TEXT,
      ip_address TEXT
    );

    CREATE TABLE IF NOT EXISTS lecture_tasks (
      id TEXT PRIMARY KEY,
      lecture_url TEXT NOT NULL,
      teacher_name TEXT NOT NULL,
      subject TEXT,
      group_name TEXT,
      date TEXT,
      total_score INTEGER DEFAULT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      progress_pct INTEGER DEFAULT 0,
      curator_email TEXT NOT NULL,
      critical_violations TEXT,
      positive_highlights TEXT,
      recommendations TEXT,
      criteria_data TEXT,
      talk_metadata TEXT,
      is_corrupted INTEGER DEFAULT 0,
      raw_broken_response TEXT,
      error_message TEXT,
      applicable_count INTEGER,
      earned_points INTEGER,
      max_points INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      subject TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS otp_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      purpose TEXT NOT NULL,
      attempts INTEGER DEFAULT 0,
      expires_at INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      used INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS prompt_configs (
      key TEXT PRIMARY KEY,
      prompt_text TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_by TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS criteria_configs (
      key TEXT PRIMARY KEY,
      criteria_json TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_by TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ktalk_recordings (
      recording_key TEXT PRIMARY KEY,
      lecture_url TEXT NOT NULL,
      title TEXT,
      created_date TEXT,
      duration TEXT,
      author_name TEXT,
      author_login TEXT,
      author_email TEXT,
      room_name TEXT,
      resolutions_json TEXT,
      has_transcript INTEGER DEFAULT 0,
      has_summary INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'new',
      hidden_by TEXT,
      hidden_at TEXT,
      synced_at TEXT,
      raw_metadata_json TEXT
    );
  `);

  try { sqliteDb.exec("ALTER TABLE lecture_tasks ADD COLUMN talk_metadata TEXT;"); } catch {}
  try { sqliteDb.exec("ALTER TABLE lecture_tasks ADD COLUMN is_corrupted INTEGER DEFAULT 0;"); } catch {}
  try { sqliteDb.exec("ALTER TABLE lecture_tasks ADD COLUMN raw_broken_response TEXT;"); } catch {}
  try { sqliteDb.exec("ALTER TABLE lecture_tasks ADD COLUMN error_message TEXT;"); } catch {}
  try { sqliteDb.exec("ALTER TABLE lecture_tasks ADD COLUMN applicable_count INTEGER;"); } catch {}
  try { sqliteDb.exec("ALTER TABLE lecture_tasks ADD COLUMN earned_points INTEGER;"); } catch {}
  try { sqliteDb.exec("ALTER TABLE lecture_tasks ADD COLUMN max_points INTEGER;"); } catch {}
}

let inMemoryAuditLogs: AuditLogRecord[] = [];

// 4. Начальное наполнение БД (Seed)
async function seedInitialData() {
  // Старший куратор (суперпользователь с полными правами) - ТОЛЬКО shurygin.egor2009@gmail.com
  const superAdminEmail = 'shurygin.egor2009@gmail.com';
  const superAdminRecord: CuratorRecord = {
    id: 'cur_superadmin_root',
    email: superAdminEmail,
    fullName: 'Егор Шурыгин (Главный администратор)',
    role: 'senior_curator',
    status: 'active',
    addedBy: 'Система (Владелец портала)',
    createdAt: new Date().toISOString(),
    lastLoginAt: null
  };

  await insertCurator(superAdminRecord);

  // Очистка любых ошибочно авто-созданных кураторов из прежнего бага
  try {
    if (isPostgres && pgPool) {
      await pgPool.query(`DELETE FROM curators WHERE added_by LIKE '%Автобелый список%' AND LOWER(email) != $1`, [superAdminEmail]);
    } else if (sqliteDb) {
      const stmt = sqliteDb.prepare(`DELETE FROM curators WHERE added_by LIKE '%Автобелый список%' AND LOWER(email) != ?`);
      stmt.run(superAdminEmail);
    }
  } catch (e) {
    console.warn('[БД] Предупреждение при очистке автобелого списка:', e);
  }

  // Восстановление проверок лекций и списка кураторов из бэкапа при старте
  try {
    await hydrateCuratorsFromBackup();
  } catch (e) {
    console.warn('[БД] Ошибка восстановления кураторов из бэкапа:', e);
  }

  try {
    await hydrateLectureTasksFromBackup();
  } catch (e) {
    console.warn('[БД] Ошибка восстановления проверок из бэкапа:', e);
  }

  try {
    await syncTeachersTableFromTasks();
  } catch (e) {
    console.warn('[БД] Ошибка синхронизации таблицы преподавателей:', e);
  }

  try {
    await hydrateKtalkRecordingsFromBackup();
  } catch (e) {
    console.warn('[БД] Ошибка восстановления записей КТалк из бэкапа:', e);
  }
}

/**
 * Полностью очищает базу данных:
 * - Удаляет все уроки/задачи
 * - Удаляет всех тестовых преподавателей
 * - Удаляет все старые OTP-коды
 * - Удаляет всех остальных пользователей/кураторов, оставляя ТОЛЬКО указанный email с правами senior_curator
 */
export async function purgeDatabaseToCleanState(keepEmail: string = 'shurygin.egor2009@gmail.com') {
  const targetEmail = keepEmail.toLowerCase().trim();
  console.log(`[БД] 🧹 Полная очистка БД. Сохраняем ТОЛЬКО аккаунт суперпользователя: ${targetEmail}`);

  if (isPostgres && pgPool) {
    await pgPool.query('DELETE FROM lecture_tasks;');
    await pgPool.query('DELETE FROM ktalk_recordings;');
    await pgPool.query('DELETE FROM teachers;');
    await pgPool.query('DELETE FROM otp_codes;');
    await pgPool.query('DELETE FROM curators WHERE LOWER(email) != LOWER($1);', [targetEmail]);
  } else if (sqliteDb) {
    sqliteDb.exec('DELETE FROM lecture_tasks;');
    sqliteDb.exec('DELETE FROM ktalk_recordings;');
    sqliteDb.exec('DELETE FROM teachers;');
    sqliteDb.exec('DELETE FROM otp_codes;');
    const stmt = sqliteDb.prepare('DELETE FROM curators WHERE LOWER(email) != LOWER(?);');
    stmt.run(targetEmail);
  }

  inMemoryKtalkRecordingsMap.clear();

  // Очистка локальных json файлов fallback
  try {
    const tasksFile = path.join(DATA_DIR, 'lecture_tasks.json');
    fs.writeFileSync(tasksFile, JSON.stringify([], null, 2), 'utf-8');

    fs.writeFileSync(KTALK_RECORDINGS_BACKUP_FILE, JSON.stringify([], null, 2), 'utf-8');

    const curatorsFile = path.join(DATA_DIR, 'curators.json');
    const singleCurator = [
      {
        id: 'cur_superadmin',
        email: targetEmail,
        fullName: 'Егор Шурыгин (Главный администратор)',
        role: 'senior_curator',
        status: 'active',
        addedBy: 'Система (Владелец портала)',
        createdAt: new Date().toISOString(),
        lastLoginAt: null
      }
    ];
    fs.writeFileSync(curatorsFile, JSON.stringify(singleCurator, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[БД] Ошибка синхронизации json fallback:', e);
  }

  // Гарантируем, что суперпользователь существует в БД
  await insertCurator({
    id: `cur_superadmin_${Date.now()}`,
    email: targetEmail,
    fullName: 'Егор Шурыгин (Главный администратор)',
    role: 'senior_curator',
    status: 'active',
    addedBy: 'Система (Владелец портала)',
    createdAt: new Date().toISOString(),
    lastLoginAt: null
  });

  console.log(`[БД] ✅ База данных полностью очищена. В системе остался ТОЛЬКО ${targetEmail} (Senior Curator).`);
}

// -------------------------------------------------------------
// 5. ОПЕРАЦИИ С АУДИТОМ (ЖУРНАЛ ДЕЙСТВИЙ В БД)
// -------------------------------------------------------------
export async function logAuditEvent(
  actorEmail: string,
  actorRole: string,
  action: string,
  target: string,
  details: string,
  ipAddress: string = '127.0.0.1'
) {
  const newLog: AuditLogRecord = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    timestamp: new Date().toISOString(),
    actorEmail,
    actorRole,
    action,
    target,
    details,
    ipAddress
  };

  inMemoryAuditLogs.unshift(newLog);
  if (inMemoryAuditLogs.length > 500) {
    inMemoryAuditLogs = inMemoryAuditLogs.slice(0, 500);
  }

  try {
    if (isPostgres && pgPool) {
      await pgPool.query(
        `INSERT INTO audit_logs (actor_email, actor_role, action, target, details, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [actorEmail, actorRole, action, target, details, ipAddress]
      );
    } else if (sqliteDb) {
      const stmt = sqliteDb.prepare(
        `INSERT INTO audit_logs (actor_email, actor_role, action, target, details, ip_address)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      stmt.run(actorEmail, actorRole, action, target, details, ipAddress);
    }
  } catch (err) {
    console.error('[БД] Ошибка записи в audit_logs:', err);
  }
}

export async function getAuditLogs(limit = 100): Promise<AuditLogRecord[]> {
  try {
    let dbLogs: AuditLogRecord[] = [];
    if (isPostgres && pgPool) {
      const res = await pgPool.query(
        `SELECT id, timestamp, actor_email, actor_role, action, target, details, ip_address
         FROM audit_logs ORDER BY id DESC LIMIT $1`,
        [limit]
      );
      dbLogs = res.rows.map(r => ({
        id: r.id,
        timestamp: new Date(r.timestamp).toISOString(),
        actorEmail: r.actor_email,
        actorRole: r.actor_role,
        action: r.action,
        target: r.target,
        details: r.details,
        ipAddress: r.ip_address
      }));
    } else if (sqliteDb) {
      const stmt = sqliteDb.prepare(
        `SELECT id, timestamp, actor_email, actor_role, action, target, details, ip_address
         FROM audit_logs ORDER BY id DESC LIMIT ?`
      );
      const rows = stmt.all(limit) as any[];
      dbLogs = rows.map(r => ({
        id: r.id,
        timestamp: r.timestamp,
        actorEmail: r.actor_email,
        actorRole: r.actor_role,
        action: r.action,
        target: r.target,
        details: r.details,
        ipAddress: r.ip_address
      }));
    }

    if (dbLogs.length > 0) {
      return dbLogs;
    }
  } catch (err) {
    console.error('[БД] Ошибка чтения audit_logs из БД:', err);
  }

  // Fallback на память / локальный бэкап если БД пока пуста или в процессе инициализации
  return inMemoryAuditLogs.slice(0, limit);
}

// -------------------------------------------------------------
// 6. ОПЕРАЦИИ С КУРАТОРАМИ В БД
// -------------------------------------------------------------
let inMemoryCuratorsMap = new Map<string, CuratorRecord>();

export async function hydrateCuratorsFromBackup(): Promise<number> {
  const primaryPath = path.join(DATA_DIR, 'curators.json');
  const altPath = path.join(DATA_DIR, 'curators_backup.json');

  let curatorsToHydrate: CuratorRecord[] = [];
  let loadedFile = '';

  for (const file of [primaryPath, altPath]) {
    if (fs.existsSync(file)) {
      try {
        const raw = fs.readFileSync(file, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          curatorsToHydrate = parsed;
          loadedFile = file;
          break;
        }
      } catch (e) {
        console.warn(`[БД Гидрация] Ошибка чтения кураторов из ${file}:`, e);
      }
    }
  }

  if (curatorsToHydrate.length === 0) {
    console.log('[БД Гидрация] Файл бэкапа кураторов не найден или пуст.');
    return 0;
  }

  let restoredCount = 0;
  for (const item of curatorsToHydrate) {
    if (item && item.email) {
      const normEmail = item.email.toLowerCase().trim();
      inMemoryCuratorsMap.set(normEmail, item);
      await insertCurator(item);
      restoredCount++;
    }
  }
  console.log(`[БД Гидрация] ✅ Восстановлено ${restoredCount} кураторов из бэкапа ${loadedFile}`);
  return restoredCount;
}

export async function saveCuratorsBackup(): Promise<void> {
  try {
    const list = Array.from(inMemoryCuratorsMap.values());
    if (list.length === 0) return;

    const backupPath1 = path.join(DATA_DIR, 'curators.json');
    const backupPath2 = path.join(DATA_DIR, 'curators_backup.json');
    const tempPath = path.join(DATA_DIR, 'curators.tmp.json');

    fs.writeFileSync(tempPath, JSON.stringify(list, null, 2), 'utf-8');
    fs.copyFileSync(tempPath, backupPath1);
    fs.copyFileSync(tempPath, backupPath2);
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    console.log(`[БД Бэкап] ✅ Автоматически сохранен бэкап кураторов (${list.length} аккаунтов) в ${backupPath1}`);
  } catch (err) {
    console.error('[БД] Ошибка сохранения бэкапа кураторов:', err);
  }
}
export async function getCurators(): Promise<CuratorRecord[]> {
  const SUPERADMIN_EMAIL = 'shurygin.egor2009@gmail.com';
  const curatorsMap = new Map<string, CuratorRecord>();

  for (const [em, c] of inMemoryCuratorsMap.entries()) {
    curatorsMap.set(em, c);
  }

  try {
    if (isPostgres && pgPool) {
      const res = await pgPool.query(`SELECT * FROM curators ORDER BY created_at ASC`);
      for (const r of res.rows) {
        const item: CuratorRecord = {
          id: r.id,
          email: r.email,
          fullName: r.full_name || r.email,
          role: r.role || 'curator',
          status: r.status || 'active',
          addedBy: r.added_by || 'Система',
          createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
          lastLoginAt: r.last_login_at ? new Date(r.last_login_at).toISOString() : null
        };
        const normEmail = item.email.toLowerCase().trim();
        curatorsMap.set(normEmail, item);
        inMemoryCuratorsMap.set(normEmail, item);
      }
    } else if (sqliteDb) {
      const stmt = sqliteDb.prepare(`SELECT * FROM curators ORDER BY created_at ASC`);
      const rows = stmt.all() as any[];
      for (const r of rows) {
        const item: CuratorRecord = {
          id: r.id,
          email: r.email,
          fullName: r.full_name || r.email,
          role: r.role || 'curator',
          status: r.status || 'active',
          addedBy: r.added_by || 'Система',
          createdAt: r.created_at || new Date().toISOString(),
          lastLoginAt: r.last_login_at || null
        };
        const normEmail = item.email.toLowerCase().trim();
        curatorsMap.set(normEmail, item);
        inMemoryCuratorsMap.set(normEmail, item);
      }
    }
  } catch (err) {
    console.error('[БД] Ошибка чтения curators:', err);
  }

  // Гарантия: суперпользователь shurygin.egor2009@gmail.com всегда присутствует
  if (!curatorsMap.has(SUPERADMIN_EMAIL)) {
    const superAdminRecord: CuratorRecord = {
      id: 'cur_superadmin_root',
      email: SUPERADMIN_EMAIL,
      fullName: 'Егор Шурыгин (Главный администратор)',
      role: 'senior_curator',
      status: 'active',
      addedBy: 'Система (Владелец портала)',
      createdAt: new Date().toISOString(),
      lastLoginAt: null
    };
    await insertCurator(superAdminRecord);
    curatorsMap.set(SUPERADMIN_EMAIL, superAdminRecord);
    inMemoryCuratorsMap.set(SUPERADMIN_EMAIL, superAdminRecord);
  }

  return Array.from(curatorsMap.values());
}

export async function getCuratorByEmail(email: string): Promise<CuratorRecord | null> {
  const normalized = email.toLowerCase().trim();
  const SUPERADMIN_EMAIL = 'shurygin.egor2009@gmail.com';

  const inMem = inMemoryCuratorsMap.get(normalized);
  if (inMem) return inMem;

  try {
    if (isPostgres && pgPool) {
      const res = await pgPool.query(`SELECT * FROM curators WHERE LOWER(email) = $1 LIMIT 1`, [normalized]);
      if (res.rows.length > 0) {
        const r = res.rows[0];
        const record: CuratorRecord = {
          id: r.id,
          email: r.email,
          fullName: r.full_name || r.email,
          role: r.role || 'curator',
          status: r.status || 'active',
          addedBy: r.added_by || 'Система',
          createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
          lastLoginAt: r.last_login_at ? new Date(r.last_login_at).toISOString() : null
        };
        inMemoryCuratorsMap.set(normalized, record);
        return record;
      }
    } else if (sqliteDb) {
      const stmt = sqliteDb.prepare(`SELECT * FROM curators WHERE LOWER(email) = ? LIMIT 1`);
      const r = stmt.get(normalized) as any;
      if (r) {
        const record: CuratorRecord = {
          id: r.id,
          email: r.email,
          fullName: r.full_name || r.email,
          role: r.role || 'curator',
          status: r.status || 'active',
          addedBy: r.added_by || 'Система',
          createdAt: r.created_at || new Date().toISOString(),
          lastLoginAt: r.last_login_at || null
        };
        inMemoryCuratorsMap.set(normalized, record);
        return record;
      }
    }
  } catch (err) {
    console.error('[БД] Ошибка поиска куратора:', err);
  }

  // 100% гарантия доступа ТОЛЬКО для главного администратора shurygin.egor2009@gmail.com:
  if (normalized === SUPERADMIN_EMAIL) {
    const superAdminRecord: CuratorRecord = {
      id: 'cur_superadmin_root',
      email: SUPERADMIN_EMAIL,
      fullName: 'Егор Шурыгин (Главный администратор)',
      role: 'senior_curator',
      status: 'active',
      addedBy: 'Система (Владелец портала)',
      createdAt: new Date().toISOString(),
      lastLoginAt: null
    };

    await insertCurator(superAdminRecord);
    return superAdminRecord;
  }

  return null;
}

export async function insertCurator(curator: CuratorRecord): Promise<boolean> {
  const emailNorm = curator.email.toLowerCase().trim();
  const safeRecord: CuratorRecord = {
    id: curator.id || `cur_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    email: emailNorm,
    fullName: (curator.fullName || '').trim() || emailNorm,
    role: curator.role === 'senior_curator' ? 'senior_curator' : 'curator',
    status: curator.status === 'blocked' ? 'blocked' : 'active',
    addedBy: (curator.addedBy || '').trim() || 'Система',
    createdAt: curator.createdAt || new Date().toISOString(),
    lastLoginAt: curator.lastLoginAt || null
  };

  inMemoryCuratorsMap.set(emailNorm, safeRecord);
  saveCuratorsBackup().catch(() => {});

  try {
    if (isPostgres && pgPool) {
      try {
        await pgPool.query(
          `INSERT INTO curators (id, email, full_name, role, status, added_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (email) DO UPDATE SET full_name = $3, role = $4, status = $5, added_by = $6`,
          [safeRecord.id, safeRecord.email, safeRecord.fullName, safeRecord.role, safeRecord.status, safeRecord.addedBy]
        );
      } catch (pgErr) {
        const updated = await pgPool.query(
          `UPDATE curators SET full_name = $1, role = $2, status = $3, added_by = $4 WHERE LOWER(email) = $5`,
          [safeRecord.fullName, safeRecord.role, safeRecord.status, safeRecord.addedBy, emailNorm]
        );
        if ((updated as any).rowCount === 0) {
          await pgPool.query(
            `INSERT INTO curators (id, email, full_name, role, status, added_by) VALUES ($1, $2, $3, $4, $5, $6)`,
            [safeRecord.id, safeRecord.email, safeRecord.fullName, safeRecord.role, safeRecord.status, safeRecord.addedBy]
          );
        }
      }
      return true;
    } else if (sqliteDb) {
      try {
        const stmt = sqliteDb.prepare(
          `INSERT INTO curators (id, email, full_name, role, status, added_by)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (email) DO UPDATE SET full_name = excluded.full_name, role = excluded.role, status = excluded.status, added_by = excluded.added_by`
        );
        stmt.run(safeRecord.id, safeRecord.email, safeRecord.fullName, safeRecord.role, safeRecord.status, safeRecord.addedBy);
      } catch (sqErr) {
        const updateStmt = sqliteDb.prepare(
          `UPDATE curators SET full_name = ?, role = ?, status = ?, added_by = ? WHERE LOWER(email) = ?`
        );
        const res = updateStmt.run(safeRecord.fullName, safeRecord.role, safeRecord.status, safeRecord.addedBy, emailNorm);
        if (res.changes === 0) {
          const insertStmt = sqliteDb.prepare(
            `INSERT INTO curators (id, email, full_name, role, status, added_by) VALUES (?, ?, ?, ?, ?, ?)`
          );
          insertStmt.run(safeRecord.id, safeRecord.email, safeRecord.fullName, safeRecord.role, safeRecord.status, safeRecord.addedBy);
        }
      }
      return true;
    }
  } catch (err) {
    console.error('[БД] Ошибка добавления куратора в БД:', err);
  }

  return true;
}

export async function updateCuratorRoleInDB(email: string, role: 'curator' | 'senior_curator'): Promise<boolean> {
  const normalized = email.toLowerCase().trim();
  const item = inMemoryCuratorsMap.get(normalized);
  if (item) {
    item.role = role;
    saveCuratorsBackup().catch(() => {});
  }
  try {
    if (isPostgres && pgPool) {
      await pgPool.query(`UPDATE curators SET role = $1 WHERE LOWER(email) = $2`, [role, normalized]);
      return true;
    } else if (sqliteDb) {
      const stmt = sqliteDb.prepare(`UPDATE curators SET role = ? WHERE LOWER(email) = ?`);
      stmt.run(role, normalized);
      return true;
    }
  } catch (err) {
    console.error('[БД] Ошибка смены роли:', err);
  }
  return true;
}

export async function updateCuratorStatusInDB(email: string, status: 'active' | 'blocked'): Promise<boolean> {
  const normalized = email.toLowerCase().trim();
  const item = inMemoryCuratorsMap.get(normalized);
  if (item) {
    item.status = status;
    saveCuratorsBackup().catch(() => {});
  }
  try {
    if (isPostgres && pgPool) {
      await pgPool.query(`UPDATE curators SET status = $1 WHERE LOWER(email) = $2`, [status, normalized]);
      return true;
    } else if (sqliteDb) {
      const stmt = sqliteDb.prepare(`UPDATE curators SET status = ? WHERE LOWER(email) = ?`);
      stmt.run(status, normalized);
      return true;
    }
  } catch (err) {
    console.error('[БД] Ошибка смены статуса:', err);
  }
  return true;
}

export async function touchCuratorLoginInDB(email: string): Promise<void> {
  const normalized = email.toLowerCase().trim();
  const item = inMemoryCuratorsMap.get(normalized);
  if (item) {
    item.lastLoginAt = new Date().toISOString();
    saveCuratorsBackup().catch(() => {});
  }
  try {
    if (isPostgres && pgPool) {
      await pgPool.query(`UPDATE curators SET last_login_at = CURRENT_TIMESTAMP WHERE LOWER(email) = $1`, [normalized]);
    } else if (sqliteDb) {
      const stmt = sqliteDb.prepare(`UPDATE curators SET last_login_at = CURRENT_TIMESTAMP WHERE LOWER(email) = ?`);
      stmt.run(normalized);
    }
  } catch (err) {
    console.error('[БД] Ошибка touch login:', err);
  }
}

export async function deleteCuratorFromDB(email: string): Promise<boolean> {
  const normalized = email.toLowerCase().trim();
  inMemoryCuratorsMap.delete(normalized);
  try {
    if (isPostgres && pgPool) {
      await pgPool.query(`DELETE FROM curators WHERE LOWER(email) = $1`, [normalized]);
    } else if (sqliteDb) {
      const stmt = sqliteDb.prepare(`DELETE FROM curators WHERE LOWER(email) = ?`);
      stmt.run(normalized);
    }
  } catch (err) {
    console.error('[БД] Ошибка удаления куратора:', err);
  }
  await saveCuratorsBackup();
  return true;
}


// -------------------------------------------------------------
// 7. ОПЕРАЦИИ С ЗАДАЧАМИ АНАЛИЗА ЛЕКЦИЙ В БД
// -------------------------------------------------------------
const inMemoryTasksMap = new Map<string, LectureTaskRecord>();

function safeJsonParse<T>(val: any, fallback: T): T {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

export async function getLectureTasks(): Promise<LectureTaskRecord[]> {
  const dbTasksMap = new Map<string, LectureTaskRecord>();

  try {
    if (isPostgres && pgPool) {
      const res = await pgPool.query(`SELECT * FROM lecture_tasks ORDER BY created_at DESC`);
      for (const r of res.rows) {
        const criteria = safeJsonParse(r.criteria_data, []);
        const totalScore = (r.total_score === null || r.total_score === undefined)
          ? null
          : Number(r.total_score);
        const taskObj: LectureTaskRecord = {
          id: r.id,
          lectureUrl: r.lecture_url,
          teacherName: r.teacher_name,
          subject: r.subject || '',
          groupName: r.group_name || '',
          date: r.date || '',
          totalScore,
          status: r.status,
          progressPct: r.progress_pct || 0,
          curatorEmail: r.curator_email,
          criticalViolations: safeJsonParse(r.critical_violations, []),
          positiveHighlights: safeJsonParse(r.positive_highlights, []),
          recommendations: safeJsonParse(r.recommendations, []),
          criteria,
          createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
          talkMetadata: safeJsonParse(r.talk_metadata, null),
          isCorrupted: Boolean(r.is_corrupted),
          rawBrokenResponse: r.raw_broken_response || null,
          errorMessage: r.error_message || null,
          applicableCount: r.applicable_count ?? null,
          earnedPoints: r.earned_points ?? null,
          maxPoints: r.max_points ?? null
        };
        dbTasksMap.set(r.id, taskObj);
        inMemoryTasksMap.set(r.id, taskObj);
      }
    } else if (sqliteDb) {
      const stmt = sqliteDb.prepare(`SELECT * FROM lecture_tasks ORDER BY created_at DESC`);
      const rows = stmt.all() as any[];
      for (const r of rows) {
        const criteria = safeJsonParse(r.criteria_data, []);
        const totalScore = (r.total_score === null || r.total_score === undefined)
          ? null
          : Number(r.total_score);
        const taskObj: LectureTaskRecord = {
          id: r.id,
          lectureUrl: r.lecture_url,
          teacherName: r.teacher_name,
          subject: r.subject || '',
          groupName: r.group_name || '',
          date: r.date || '',
          totalScore,
          status: r.status,
          progressPct: r.progress_pct || 0,
          curatorEmail: r.curator_email,
          criticalViolations: safeJsonParse(r.critical_violations, []),
          positiveHighlights: safeJsonParse(r.positive_highlights, []),
          recommendations: safeJsonParse(r.recommendations, []),
          criteria,
          createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
          talkMetadata: safeJsonParse(r.talk_metadata, null),
          isCorrupted: Boolean(r.is_corrupted),
          rawBrokenResponse: r.raw_broken_response || null,
          errorMessage: r.error_message || null,
          applicableCount: r.applicable_count ?? null,
          earnedPoints: r.earned_points ?? null,
          maxPoints: r.max_points ?? null
        };
        dbTasksMap.set(r.id, taskObj);
        inMemoryTasksMap.set(r.id, taskObj);
      }
    }
  } catch (err) {
    console.error('[БД] Ошибка чтения lecture_tasks:', err);
  }

  // Объединяем с in-memory задачами (на случай если БД еще сохраняет транзакцию)
  for (const [id, task] of inMemoryTasksMap.entries()) {
    if (!dbTasksMap.has(id)) {
      dbTasksMap.set(id, task);
    }
  }

  return Array.from(dbTasksMap.values()).sort((a, b) => {
    const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return Number.isNaN(timeDiff) || timeDiff === 0 ? b.id.localeCompare(a.id) : timeDiff;
  });
}

function isSameKtalkLecture(task: LectureTaskRecord, normTarget: string, targetKey: string | null): boolean {
  if (!task.lectureUrl) return false;
  const taskNorm = task.lectureUrl.trim().toLowerCase().replace(/\/+$/, '');
  if (taskNorm === normTarget) return true;
  if (targetKey) {
    const taskKey = extractKtalkRecordingKeyFromUrl(task.lectureUrl)?.toLowerCase();
    if (taskKey && taskKey === targetKey) return true;
  }
  return false;
}

export async function getLectureTaskByUrl(rawUrl: string): Promise<LectureTaskRecord | null> {
  if (!rawUrl || !rawUrl.trim()) return null;
  const normTarget = rawUrl.trim().toLowerCase().replace(/\/+$/, '');
  const targetKey = extractKtalkRecordingKeyFromUrl(rawUrl)?.toLowerCase() || null;
  const allTasks = await getLectureTasks();
  return allTasks.find(t => isSameKtalkLecture(t, normTarget, targetKey)) || null;
}

export async function getBlockingLectureTaskByUrl(rawUrl: string): Promise<LectureTaskRecord | null> {
  if (!rawUrl || !rawUrl.trim()) return null;
  const normTarget = rawUrl.trim().toLowerCase().replace(/\/+$/, '');
  const targetKey = extractKtalkRecordingKeyFromUrl(rawUrl)?.toLowerCase() || null;
  const allTasks = await getLectureTasks();
  return (
    allTasks.find(
      t =>
        t.status !== 'failed' &&
        !t.isCorrupted &&
        isSameKtalkLecture(t, normTarget, targetKey)
    ) || null
  );
}

export async function getLectureTaskById(id: string): Promise<LectureTaskRecord | null> {
  const allTasks = await getLectureTasks();
  return allTasks.find(t => t.id === id) || null;
}

export async function requeueLectureTaskInDB(taskId: string): Promise<LectureTaskRecord | null> {
  const existing = await getLectureTaskById(taskId);
  if (!existing) return null;

  const nowIso = new Date().toISOString();
  const updated: LectureTaskRecord = {
    ...existing,
    status: 'pending',
    progressPct: 0,
    totalScore: null,
    isCorrupted: false,
    rawBrokenResponse: null,
    errorMessage: null,
    criticalViolations: [],
    positiveHighlights: [],
    recommendations: [],
    criteria: [],
    applicableCount: null,
    earnedPoints: null,
    maxPoints: null,
    createdAt: nowIso
  };

  inMemoryTasksMap.set(taskId, updated);
  createLectureTasksBackup().catch(() => {});

  try {
    if (isPostgres && pgPool) {
      await pgPool.query(
        `UPDATE lecture_tasks
         SET status = 'pending', progress_pct = 0, total_score = NULL,
             is_corrupted = FALSE, raw_broken_response = NULL, error_message = NULL,
             critical_violations = '[]', positive_highlights = '[]', recommendations = '[]', criteria_data = '[]',
             applicable_count = NULL, earned_points = NULL, max_points = NULL, created_at = $1
         WHERE id = $2`,
        [nowIso, taskId]
      );
    } else if (sqliteDb) {
      const stmt = sqliteDb.prepare(
        `UPDATE lecture_tasks
         SET status = 'pending', progress_pct = 0, total_score = NULL,
             is_corrupted = 0, raw_broken_response = NULL, error_message = NULL,
             critical_violations = '[]', positive_highlights = '[]', recommendations = '[]', criteria_data = '[]',
             applicable_count = NULL, earned_points = NULL, max_points = NULL, created_at = ?
         WHERE id = ?`
      );
      stmt.run(nowIso, taskId);
    }
  } catch (err) {
    console.error('[БД] Ошибка повторной постановки задачи в очередь:', err);
  }

  return updated;
}

export async function insertLectureTask(task: LectureTaskRecord): Promise<boolean> {
  const safeTask: LectureTaskRecord = {
    id: task.id || `lec_${Date.now()}`,
    lectureUrl: (task.lectureUrl || '').trim(),
    teacherName: (task.teacherName || '').trim() || 'Преподаватель',
    subject: (task.subject || '').trim(),
    groupName: (task.groupName || '').trim(),
    date: task.date || new Date().toISOString().replace('T', ' ').slice(0, 16),
    totalScore: typeof task.totalScore === 'number' ? task.totalScore : null,
    status: task.status || 'pending',
    progressPct: typeof task.progressPct === 'number' ? task.progressPct : 0,
    curatorEmail: (task.curatorEmail || '').trim() || 'system',
    criticalViolations: Array.isArray(task.criticalViolations) ? task.criticalViolations : [],
    positiveHighlights: Array.isArray(task.positiveHighlights) ? task.positiveHighlights : [],
    recommendations: Array.isArray(task.recommendations) ? task.recommendations : [],
    criteria: Array.isArray(task.criteria) ? task.criteria : [],
    createdAt: task.createdAt || new Date().toISOString(),
    talkMetadata: task.talkMetadata || null,
    isCorrupted: Boolean(task.isCorrupted),
    rawBrokenResponse: task.rawBrokenResponse || null,
    errorMessage: task.errorMessage || null,
    applicableCount: task.applicableCount ?? null,
    earnedPoints: task.earnedPoints ?? null,
    maxPoints: task.maxPoints ?? null
  };

  // Сразу кэшируем в память и мгновенно сохраняем в файл бэкапа
  inMemoryTasksMap.set(safeTask.id, safeTask);
  createLectureTasksBackup().catch(() => {});

  try {
    const critJson = JSON.stringify(safeTask.criticalViolations);
    const posJson = JSON.stringify(safeTask.positiveHighlights);
    const recJson = JSON.stringify(safeTask.recommendations);
    const criteriaJson = JSON.stringify(safeTask.criteria);
    const talkMetaJson = safeTask.talkMetadata ? JSON.stringify(safeTask.talkMetadata) : null;
    const isCorruptedVal = safeTask.isCorrupted ? 1 : 0;
    const rawBroken = safeTask.rawBrokenResponse || null;
    const errMsg = safeTask.errorMessage || null;

    if (isPostgres && pgPool) {
      await pgPool.query(
        `INSERT INTO lecture_tasks (
           id, lecture_url, teacher_name, subject, group_name, date,
           total_score, status, progress_pct, curator_email,
           critical_violations, positive_highlights, recommendations, criteria_data,
           talk_metadata, is_corrupted, raw_broken_response,
           error_message, applicable_count, earned_points, max_points, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
         ON CONFLICT (id) DO UPDATE SET
           status = $8, progress_pct = $9, total_score = $7,
           critical_violations = $11, positive_highlights = $12, recommendations = $13, criteria_data = $14,
           talk_metadata = COALESCE($15, lecture_tasks.talk_metadata),
           is_corrupted = $16,
           raw_broken_response = COALESCE($17, lecture_tasks.raw_broken_response),
           error_message = $18,
           applicable_count = $19,
           earned_points = $20,
           max_points = $21`,
        [
          safeTask.id, safeTask.lectureUrl, safeTask.teacherName, safeTask.subject, safeTask.groupName, safeTask.date,
          safeTask.totalScore, safeTask.status, safeTask.progressPct, safeTask.curatorEmail,
          critJson, posJson, recJson, criteriaJson,
          talkMetaJson, Boolean(safeTask.isCorrupted), rawBroken,
          errMsg, safeTask.applicableCount ?? null, safeTask.earnedPoints ?? null, safeTask.maxPoints ?? null, safeTask.createdAt
        ]
      );
      return true;
    } else if (sqliteDb) {
      const stmt = sqliteDb.prepare(
        `INSERT INTO lecture_tasks (
           id, lecture_url, teacher_name, subject, group_name, date,
           total_score, status, progress_pct, curator_email,
           critical_violations, positive_highlights, recommendations, criteria_data,
           talk_metadata, is_corrupted, raw_broken_response,
           error_message, applicable_count, earned_points, max_points, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           status = excluded.status, progress_pct = excluded.progress_pct, total_score = excluded.total_score,
           critical_violations = excluded.critical_violations, positive_highlights = excluded.positive_highlights,
           recommendations = excluded.recommendations, criteria_data = excluded.criteria_data,
           talk_metadata = COALESCE(excluded.talk_metadata, lecture_tasks.talk_metadata),
           is_corrupted = excluded.is_corrupted,
           raw_broken_response = COALESCE(excluded.raw_broken_response, lecture_tasks.raw_broken_response),
           error_message = excluded.error_message,
           applicable_count = excluded.applicable_count,
           earned_points = excluded.earned_points,
           max_points = excluded.max_points`
      );
      stmt.run(
        safeTask.id, safeTask.lectureUrl, safeTask.teacherName, safeTask.subject, safeTask.groupName, safeTask.date,
        safeTask.totalScore, safeTask.status, safeTask.progressPct, safeTask.curatorEmail,
        critJson, posJson, recJson, criteriaJson,
        talkMetaJson, isCorruptedVal, rawBroken,
        errMsg, safeTask.applicableCount ?? null, safeTask.earnedPoints ?? null, safeTask.maxPoints ?? null, safeTask.createdAt
      );
      return true;
    }
  } catch (err) {
    console.error('[БД] Ошибка вставки задачи лекции:', err);
  }
  return true;
}

export async function getPendingLectureTasksFIFO(): Promise<LectureTaskRecord[]> {
  const allTasks = await getLectureTasks();
  return allTasks
    .filter(t => t.status === 'pending')
    .sort((a, b) => {
      const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return Number.isNaN(timeDiff) || timeDiff === 0 ? a.id.localeCompare(b.id) : timeDiff;
    });
}

export async function resetInterruptedLectureTasksToPending(): Promise<number> {
  let resetCount = 0;
  const interruptedStatuses = new Set(['downloading', 'extracting', 'uploading', 'analyzing']);

  try {
    const allTasks = await getLectureTasks();
    const interrupted = allTasks.filter(t => interruptedStatuses.has(t.status));

    for (const task of interrupted) {
      task.status = 'pending';
      task.progressPct = 0;
      inMemoryTasksMap.set(task.id, task);
      resetCount++;
    }

    if (resetCount > 0) {
      if (isPostgres && pgPool) {
        await pgPool.query(
          `UPDATE lecture_tasks SET status = 'pending', progress_pct = 0 WHERE status IN ('downloading', 'extracting', 'uploading', 'analyzing')`
        );
      } else if (sqliteDb) {
        sqliteDb.exec(
          `UPDATE lecture_tasks SET status = 'pending', progress_pct = 0 WHERE status IN ('downloading', 'extracting', 'uploading', 'analyzing')`
        );
      }
      await createLectureTasksBackup();
      console.log(`[Очередь FIFO] 🔄 Возвращено в очередь ${resetCount} незавершенных задач после перезапуска сервера.`);
    }
  } catch (err) {
    console.error('[Очередь FIFO] Ошибка восстановления прерванных задач:', err);
  }

  return resetCount;
}

export async function updateLectureTaskProgressInDB(
  taskId: string,
  status: 'pending' | 'downloading' | 'extracting' | 'uploading' | 'analyzing' | 'completed' | 'failed',
  progressPct: number,
  totalScore?: number | null,
  positiveHighlights?: string[],
  recommendations?: string[],
  criteria?: any[],
  criticalViolations?: string[],
  talkMetadata?: any,
  isCorrupted?: boolean,
  rawBrokenResponse?: string | null,
  teacherName?: string,
  subject?: string,
  extra?: {
    errorMessage?: string | null;
    applicableCount?: number | null;
    earnedPoints?: number | null;
    maxPoints?: number | null;
    groupName?: string;
    date?: string;
  }
): Promise<void> {
  // Обновляем в памяти
  const mem = inMemoryTasksMap.get(taskId);
  if (mem) {
    mem.status = status;
    mem.progressPct = progressPct;
    if (totalScore !== undefined) mem.totalScore = totalScore;
    if (positiveHighlights !== undefined) mem.positiveHighlights = positiveHighlights;
    if (recommendations !== undefined) mem.recommendations = recommendations;
    if (criteria !== undefined) mem.criteria = criteria;
    if (criticalViolations !== undefined) mem.criticalViolations = criticalViolations;
    if (talkMetadata !== undefined) mem.talkMetadata = talkMetadata;
    if (isCorrupted !== undefined) mem.isCorrupted = isCorrupted;
    if (rawBrokenResponse !== undefined) mem.rawBrokenResponse = rawBrokenResponse;
    if (teacherName) mem.teacherName = teacherName;
    if (subject) mem.subject = subject;
    if (extra?.errorMessage !== undefined) mem.errorMessage = extra.errorMessage;
    if (extra?.applicableCount !== undefined) mem.applicableCount = extra.applicableCount;
    if (extra?.earnedPoints !== undefined) mem.earnedPoints = extra.earnedPoints;
    if (extra?.maxPoints !== undefined) mem.maxPoints = extra.maxPoints;
    if (extra?.groupName) mem.groupName = extra.groupName;
    if (extra?.date) mem.date = extra.date;
  }

  // Мгновенное сохранение снимка памяти в файл бэкапа
  createLectureTasksBackup().catch(() => {});

  try {
    const posJson = positiveHighlights !== undefined ? JSON.stringify(positiveHighlights) : null;
    const recJson = recommendations !== undefined ? JSON.stringify(recommendations) : null;
    const critJson = criteria !== undefined ? JSON.stringify(criteria) : null;
    const critViolJson = criticalViolations !== undefined ? JSON.stringify(criticalViolations) : null;
    const talkMetaJson = talkMetadata ? JSON.stringify(talkMetadata) : null;
    const isCorruptedNum = isCorrupted !== undefined ? (isCorrupted ? 1 : 0) : null;
    const isFinalState = status === 'completed' || status === 'failed';

    if (isPostgres && pgPool) {
      if (isFinalState) {
        const finalScore = totalScore === undefined ? null : totalScore;
        const errMsg = extra?.errorMessage !== undefined ? extra.errorMessage : null;
        await pgPool.query(
          `UPDATE lecture_tasks SET status = $1, progress_pct = $2, total_score = $3,
             positive_highlights = COALESCE($4, positive_highlights),
             recommendations = COALESCE($5, recommendations),
             criteria_data = COALESCE($6, criteria_data),
             critical_violations = COALESCE($7, critical_violations),
             talk_metadata = COALESCE($8, talk_metadata),
             is_corrupted = COALESCE($9, is_corrupted),
             raw_broken_response = $10,
             teacher_name = COALESCE($11, teacher_name),
             subject = COALESCE($12, subject),
             error_message = $13,
             applicable_count = $14,
             earned_points = $15,
             max_points = $16,
             group_name = COALESCE($17, group_name),
             date = COALESCE($18, date)
           WHERE id = $19`,
          [
            status,
            progressPct,
            finalScore,
            posJson,
            recJson,
            critJson,
            critViolJson,
            talkMetaJson,
            isCorrupted ?? null,
            rawBrokenResponse ?? null,
            teacherName || null,
            subject || null,
            errMsg,
            extra?.applicableCount ?? null,
            extra?.earnedPoints ?? null,
            extra?.maxPoints ?? null,
            extra?.groupName || null,
            extra?.date || null,
            taskId
          ]
        );
      } else {
        await pgPool.query(
          `UPDATE lecture_tasks SET status = $1, progress_pct = $2 WHERE id = $3`,
          [status, progressPct, taskId]
        );
      }
    } else if (sqliteDb) {
      if (isFinalState) {
        const finalScore = totalScore === undefined ? null : totalScore;
        const errMsg = extra?.errorMessage !== undefined ? extra.errorMessage : null;
        const stmt = sqliteDb.prepare(
          `UPDATE lecture_tasks SET status = ?, progress_pct = ?, total_score = ?,
             positive_highlights = COALESCE(?, positive_highlights),
             recommendations = COALESCE(?, recommendations),
             criteria_data = COALESCE(?, criteria_data),
             critical_violations = COALESCE(?, critical_violations),
             talk_metadata = COALESCE(?, talk_metadata),
             is_corrupted = COALESCE(?, is_corrupted),
             raw_broken_response = ?,
             teacher_name = COALESCE(?, teacher_name),
             subject = COALESCE(?, subject),
             error_message = ?,
             applicable_count = ?,
             earned_points = ?,
             max_points = ?,
             group_name = COALESCE(?, group_name),
             date = COALESCE(?, date)
           WHERE id = ?`
        );
        stmt.run(
          status,
          progressPct,
          finalScore,
          posJson,
          recJson,
          critJson,
          critViolJson,
          talkMetaJson,
          isCorruptedNum,
          rawBrokenResponse ?? null,
          teacherName || null,
          subject || null,
          errMsg,
          extra?.applicableCount ?? null,
          extra?.earnedPoints ?? null,
          extra?.maxPoints ?? null,
          extra?.groupName || null,
          extra?.date || null,
          taskId
        );
      } else {
        const stmt = sqliteDb.prepare(
          `UPDATE lecture_tasks SET status = ?, progress_pct = ? WHERE id = ?`
        );
        stmt.run(status, progressPct, taskId);
      }
    }
  } catch (err) {
    console.error('[БД] Ошибка обновления прогресса задачи:', err);
  }
}

// -------------------------------------------------------------
// 8. ПРЕПОДАВАТЕЛИ В БД
// -------------------------------------------------------------
export async function getTeachersFromDB(): Promise<string[]> {
  const teacherSet = new Set<string>();

  // 1. Читаем из реляционной таблицы teachers (PostgreSQL / SQLite)
  try {
    if (isPostgres && pgPool) {
      const res = await pgPool.query(`SELECT name FROM teachers ORDER BY name ASC`);
      res.rows.forEach(r => {
        if (r.name && typeof r.name === 'string' && r.name.trim()) {
          teacherSet.add(r.name.trim());
        }
      });
    } else if (sqliteDb) {
      const stmt = sqliteDb.prepare(`SELECT name FROM teachers ORDER BY name ASC`);
      const rows = stmt.all() as any[];
      rows.forEach(r => {
        if (r.name && typeof r.name === 'string' && r.name.trim()) {
          teacherSet.add(r.name.trim());
        }
      });
    }
  } catch (err) {
    console.error('[БД] Ошибка чтения teachers:', err);
  }

  // 2. Дополняем список преподавателями из всех проверенных и активных задач
  try {
    const tasks = await getLectureTasks();
    tasks.forEach(t => {
      if (t.teacherName && typeof t.teacherName === 'string' && t.teacherName.trim() && t.teacherName.trim() !== 'Преподаватель') {
        teacherSet.add(t.teacherName.trim());
      }
    });
  } catch (err) {
    console.error('[БД] Ошибка агрегации преподавателей из задач:', err);
  }

  return Array.from(teacherSet).sort((a, b) => a.localeCompare(b, 'ru'));
}

export async function insertTeacherIfNotExists(name: string, subject?: string): Promise<void> {
  const cleanName = name.trim();
  if (!cleanName) return;

  try {
    if (isPostgres && pgPool) {
      await pgPool.query(
        `INSERT INTO teachers (name, subject) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING`,
        [cleanName, subject || '']
      );
    } else if (sqliteDb) {
      const stmt = sqliteDb.prepare(
        `INSERT INTO teachers (name, subject) VALUES (?, ?) ON CONFLICT (name) DO NOTHING`
      );
      stmt.run(cleanName, subject || '');
    }
  } catch (err) {
    console.error('[БД] Ошибка добавления преподавателя:', err);
  }
}

export async function syncTeachersTableFromTasks(): Promise<void> {
  try {
    const tasks = await getLectureTasks();
    for (const t of tasks) {
      if (t.teacherName && typeof t.teacherName === 'string' && t.teacherName.trim() && t.teacherName.trim() !== 'Преподаватель') {
        await insertTeacherIfNotExists(t.teacherName.trim(), t.subject);
      }
    }
  } catch (err) {
    console.error('[БД] Ошибка авто-синхронизации преподавателей:', err);
  }
}

// -------------------------------------------------------------
// 9. ОДНОРАЗОВЫЕ КОДЫ (OTP) В БД
// -------------------------------------------------------------
const inMemoryOtpStore = new Map<string, { code: string; expiresAt: number; attempts: number }>();

export async function storeOTPInDB(email: string, code: string, purpose: string, expiresAt: number): Promise<void> {
  const normalized = email.toLowerCase().trim();
  inMemoryOtpStore.set(`${normalized}:${purpose}`, { code, expiresAt, attempts: 0 });

  try {
    if (isPostgres && pgPool) {
      await pgPool.query(
        `UPDATE otp_codes SET used = 1 WHERE LOWER(email) = $1 AND purpose = $2 AND used = 0`,
        [normalized, purpose]
      );
      await pgPool.query(
        `INSERT INTO otp_codes (email, code, purpose, expires_at) VALUES ($1, $2, $3, $4)`,
        [normalized, code, purpose, expiresAt]
      );
    } else if (sqliteDb) {
      sqliteDb.prepare(
        `UPDATE otp_codes SET used = 1 WHERE LOWER(email) = ? AND purpose = ? AND used = 0`
      ).run(normalized, purpose);
      const stmt = sqliteDb.prepare(
        `INSERT INTO otp_codes (email, code, purpose, expires_at) VALUES (?, ?, ?, ?)`
      );
      stmt.run(normalized, code, purpose, expiresAt);
    }
  } catch (err) {
    console.error('[БД] Ошибка записи OTP в БД:', err);
  }
}

export async function verifyOTPFromDB(email: string, inputCode: string, purpose: string): Promise<{ valid: boolean; message: string }> {
  const normalized = email.toLowerCase().trim();
  const cleanCode = inputCode.trim();
  const now = Date.now();
  const key = `${normalized}:${purpose}`;

  try {
    if (isPostgres && pgPool) {
      const res = await pgPool.query(
        `SELECT id, code, expires_at, attempts, used FROM otp_codes
         WHERE LOWER(email) = $1 AND purpose = $2 AND used = 0
         ORDER BY id DESC LIMIT 1`,
        [normalized, purpose]
      );

      if (res.rows.length > 0) {
        const row = res.rows[0];
        if (now > Number(row.expires_at)) {
          return { valid: false, message: 'Срок действия кода истек (5 минут). Запросите новый код.' };
        }

        if (row.attempts >= 5) {
          return { valid: false, message: 'Превышено число попыток ввода кода.' };
        }

        if (row.code !== cleanCode) {
          await pgPool.query(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1`, [row.id]);
          return { valid: false, message: 'Неверный код подтверждения.' };
        }

        // Успешно - помечаем код использованным
        await pgPool.query(`UPDATE otp_codes SET used = 1 WHERE id = $1`, [row.id]);
        inMemoryOtpStore.delete(key);
        return { valid: true, message: 'Код успешно подтвержден.' };
      }
    } else if (sqliteDb) {
      const stmt = sqliteDb.prepare(
        `SELECT id, code, expires_at, attempts, used FROM otp_codes
         WHERE LOWER(email) = ? AND purpose = ? AND used = 0
         ORDER BY id DESC LIMIT 1`
      );
      const row = stmt.get(normalized, purpose) as any;

      if (row) {
        if (now > Number(row.expires_at)) {
          return { valid: false, message: 'Срок действия кода истек (5 минут). Запросите новый код.' };
        }

        if (row.attempts >= 5) {
          return { valid: false, message: 'Превышено число попыток ввода кода.' };
        }

        if (row.code !== cleanCode) {
          sqliteDb.prepare(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?`).run(row.id);
          return { valid: false, message: 'Неверный код подтверждения.' };
        }

        sqliteDb.prepare(`UPDATE otp_codes SET used = 1 WHERE id = ?`).run(row.id);
        inMemoryOtpStore.delete(key);
        return { valid: true, message: 'Код успешно подтвержден.' };
      }
    }
  } catch (err) {
    console.error('[БД] Ошибка проверки OTP в БД:', err);
  }

  // Fallback к in-memory хранилищу
  const memOtp = inMemoryOtpStore.get(key);
  if (!memOtp) {
    return { valid: false, message: 'Код подтверждения не найден или уже был использован.' };
  }

  if (now > memOtp.expiresAt) {
    inMemoryOtpStore.delete(key);
    return { valid: false, message: 'Срок действия кода истек (5 минут). Запросите новый код.' };
  }

  if (memOtp.attempts >= 5) {
    inMemoryOtpStore.delete(key);
    return { valid: false, message: 'Превышено число попыток ввода кода.' };
  }

  if (memOtp.code !== cleanCode) {
    memOtp.attempts += 1;
    return { valid: false, message: 'Неверный код подтверждения.' };
  }

  inMemoryOtpStore.delete(key);
  return { valid: true, message: 'Код успешно подтвержден.' };
}

// -------------------------------------------------------------
// 10. СОХРАНЕНИЕ СИСТЕМНОГО ПРОМПТА В БД
// -------------------------------------------------------------
export async function savePromptConfigInDB(key: string, promptText: string, updatedBy: string): Promise<void> {
  try {
    if (isPostgres && pgPool) {
      await pgPool.query(
        `INSERT INTO prompt_configs (key, prompt_text, updated_at, updated_by)
         VALUES ($1, $2, CURRENT_TIMESTAMP, $3)
         ON CONFLICT (key) DO UPDATE SET prompt_text = $2, updated_at = CURRENT_TIMESTAMP, updated_by = $3`,
        [key, promptText, updatedBy]
      );
    } else if (sqliteDb) {
      const stmt = sqliteDb.prepare(
        `INSERT INTO prompt_configs (key, prompt_text, updated_at, updated_by)
         VALUES (?, ?, datetime('now'), ?)
         ON CONFLICT (key) DO UPDATE SET prompt_text = excluded.prompt_text, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
      );
      stmt.run(key, promptText, updatedBy);
    }
  } catch (err) {
    console.error('[БД] Ошибка сохранения промпта в БД:', err);
  }
}

export async function getPromptConfigFromDB(key: string): Promise<string | null> {
  try {
    if (isPostgres && pgPool) {
      const res = await pgPool.query(`SELECT prompt_text FROM prompt_configs WHERE key = $1 LIMIT 1`, [key]);
      if (res.rows.length > 0) return res.rows[0].prompt_text;
    } else if (sqliteDb) {
      const stmt = sqliteDb.prepare(`SELECT prompt_text FROM prompt_configs WHERE key = ? LIMIT 1`);
      const row = stmt.get(key) as any;
      if (row) return row.prompt_text;
    }
  } catch (err) {
    console.error('[БД] Ошибка чтения промпта из БД:', err);
  }
  return null;
}

// -------------------------------------------------------------
// 11. СОХРАНЕНИЕ КРИТЕРИЕВ ОЦЕНКИ В БД
// -------------------------------------------------------------
export async function saveCriteriaConfigInDB(key: string, criteriaData: any, updatedBy: string): Promise<void> {
  try {
    const criteriaJson = JSON.stringify(criteriaData);
    if (isPostgres && pgPool) {
      await pgPool.query(
        `INSERT INTO criteria_configs (key, criteria_json, updated_at, updated_by)
         VALUES ($1, $2, CURRENT_TIMESTAMP, $3)
         ON CONFLICT (key) DO UPDATE SET criteria_json = $2, updated_at = CURRENT_TIMESTAMP, updated_by = $3`,
        [key, criteriaJson, updatedBy]
      );
    } else if (sqliteDb) {
      const stmt = sqliteDb.prepare(
        `INSERT INTO criteria_configs (key, criteria_json, updated_at, updated_by)
         VALUES (?, ?, datetime('now'), ?)
         ON CONFLICT (key) DO UPDATE SET criteria_json = excluded.criteria_json, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
      );
      stmt.run(key, criteriaJson, updatedBy);
    }
  } catch (err) {
    console.error('[БД] Ошибка сохранения критериев в БД:', err);
  }
}

export async function getCriteriaConfigFromDB(key: string = 'active'): Promise<any | null> {
  try {
    if (isPostgres && pgPool) {
      const res = await pgPool.query(`SELECT criteria_json FROM criteria_configs WHERE key = $1 LIMIT 1`, [key]);
      if (res.rows.length > 0) return JSON.parse(res.rows[0].criteria_json);
    } else if (sqliteDb) {
      const stmt = sqliteDb.prepare(`SELECT criteria_json FROM criteria_configs WHERE key = ? LIMIT 1`);
      const row = stmt.get(key) as any;
      if (row) return JSON.parse(row.criteria_json);
    }
  } catch (err) {
    console.error('[БД] Ошибка чтения критериев из БД:', err);
  }
  return null;
}

export async function getReportSettingsFromDB(): Promise<ReportDisplaySettings> {
  try {
    const raw = await getCriteriaConfigFromDB('report_settings');
    if (raw && typeof raw === 'object') {
      const mode = raw.displayMode === 'penalty' || raw.displayMode === 'status_only' ? raw.displayMode : 'five_point';
      return {
        displayMode: mode,
        naBadgeText: (typeof raw.naBadgeText === 'string' && raw.naBadgeText.trim()) ? raw.naBadgeText.trim() : DEFAULT_REPORT_SETTINGS.naBadgeText,
        naDescription: (typeof raw.naDescription === 'string' && raw.naDescription.trim()) ? raw.naDescription.trim() : DEFAULT_REPORT_SETTINGS.naDescription
      };
    }
  } catch (err) {
    console.error('[БД] Ошибка чтения настроек отчета:', err);
  }
  return { ...DEFAULT_REPORT_SETTINGS };
}

export async function saveReportSettingsInDB(settings: ReportDisplaySettings, updatedBy: string): Promise<ReportDisplaySettings> {
  const normalized: ReportDisplaySettings = {
    displayMode: settings.displayMode === 'penalty' || settings.displayMode === 'status_only' ? settings.displayMode : 'five_point',
    naBadgeText: (settings.naBadgeText || '').trim() || DEFAULT_REPORT_SETTINGS.naBadgeText,
    naDescription: (settings.naDescription || '').trim() || DEFAULT_REPORT_SETTINGS.naDescription
  };
  await saveCriteriaConfigInDB('report_settings', normalized, updatedBy);
  return normalized;
}

// -------------------------------------------------------------
// 12. АВТОМАТИЧЕСКИЙ БЭКАП И ГИДРАЦИЯ ПРОВЕРОК ЛЕКЦИЙ
// -------------------------------------------------------------
const BACKUP_FILE_PRIMARY = path.join(DATA_DIR, 'lecture_tasks_backup.json');
const BACKUP_FILE_SECONDARY = path.join(DATA_DIR, 'lecture_tasks.json');

export async function createLectureTasksBackup(): Promise<number> {
  try {
    const tasks = await getLectureTasks();

    // Защита: Если при получении из БД временно вернулся пустой массив, но в памяти есть задачи — берем их
    let tasksToSave = tasks;
    if (tasksToSave.length === 0 && inMemoryTasksMap.size > 0) {
      tasksToSave = Array.from(inMemoryTasksMap.values());
    }

    if (tasksToSave.length === 0) {
      return 0;
    }

    const recentTasks = tasksToSave.slice(0, 2000);
    const tempFile = path.join(DATA_DIR, 'lecture_tasks_backup.tmp.json');

    fs.writeFileSync(tempFile, JSON.stringify(recentTasks, null, 2), 'utf-8');
    fs.copyFileSync(tempFile, BACKUP_FILE_PRIMARY);
    fs.copyFileSync(tempFile, BACKUP_FILE_SECONDARY);
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);

    console.log(`[БД Бэкап] ✅ Автоматически сохранен бэкап проверок лекций (${recentTasks.length} записей) в ${BACKUP_FILE_PRIMARY}`);
    return recentTasks.length;
  } catch (err) {
    console.error('[БД Бэкап] Ошибка создания бэкапа проверок лекций:', err);
    return 0;
  }
}

export async function hydrateLectureTasksFromBackup(): Promise<number> {
  let tasksToHydrate: LectureTaskRecord[] = [];
  let loadedFile = '';

  const candidates = [BACKUP_FILE_PRIMARY, BACKUP_FILE_SECONDARY];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      try {
        const raw = fs.readFileSync(file, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          tasksToHydrate = parsed;
          loadedFile = file;
          break;
        }
      } catch (e) {
        console.warn(`[БД Гидрация] Предупреждение при чтении ${file}:`, e);
      }
    }
  }

  if (tasksToHydrate.length === 0) {
    console.log('[БД Гидрация] Файлы бэкапа проверок лекций не содержат записей.');
    return 0;
  }

  // Читаем текущие задачи из БД, чтобы старый бэкап не перезаписал уже завершенные проверки
  const existingTasks = await getLectureTasks();
  const existingMap = new Map<string, LectureTaskRecord>();
  for (const et of existingTasks) {
    existingMap.set(et.id, et);
  }

  // 1. Загружаем отсутствующие или незавершенные задачи из бэкапа в память и БД
  let restoredCount = 0;
  for (const task of tasksToHydrate) {
    if (task && task.id) {
      const existing = existingMap.get(task.id);
      if (existing && (existing.status === 'completed' || existing.status === 'failed')) {
        inMemoryTasksMap.set(existing.id, existing);
        continue;
      }
      inMemoryTasksMap.set(task.id, task);
      await insertLectureTask(task);
      if (task.teacherName) {
        await insertTeacherIfNotExists(task.teacherName, task.subject);
      }
      restoredCount++;
    }
  }

  console.log(`[БД Гидрация] ✅ Восстановлено ${restoredCount} проверок лекций в дашборд из резервной копии ${loadedFile}`);
  return restoredCount;
}

// -------------------------------------------------------------
// 13. СИНХРОНИЗИРОВАННЫЕ ЗАПИСИ ВСТРЕЧ КОНТУР.ТОЛК
// -------------------------------------------------------------
const KTALK_RECORDINGS_BACKUP_FILE = path.join(DATA_DIR, 'ktalk_recordings.json');
const inMemoryKtalkRecordingsMap = new Map<string, KtalkRecordingRecord>();

export function extractKtalkRecordingKeyFromUrl(rawUrl: string): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const match = rawUrl.match(/\/(?:recordings|records)\/([a-zA-Z0-9\-_]+)/i);
  return match ? match[1].trim() : null;
}

async function saveKtalkRecordingsBackup(): Promise<void> {
  try {
    const list = Array.from(inMemoryKtalkRecordingsMap.values());
    const tempFile = path.join(DATA_DIR, 'ktalk_recordings.tmp.json');
    fs.writeFileSync(tempFile, JSON.stringify(list, null, 2), 'utf-8');
    fs.copyFileSync(tempFile, KTALK_RECORDINGS_BACKUP_FILE);
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  } catch (err) {
    console.warn('[БД КТалк] Ошибка сохранения бэкапа записей КТалк:', err);
  }
}

export async function hydrateKtalkRecordingsFromBackup(): Promise<number> {
  if (!fs.existsSync(KTALK_RECORDINGS_BACKUP_FILE)) return 0;
  try {
    const raw = fs.readFileSync(KTALK_RECORDINGS_BACKUP_FILE, 'utf-8');
    const items: KtalkRecordingRecord[] = JSON.parse(raw);
    if (!Array.isArray(items) || items.length === 0) return 0;

    const existingAll = await getAllKtalkRecordings();
    const existingMap = new Map(existingAll.map(r => [r.recordingKey, r]));

    let count = 0;
    for (const item of items) {
      if (!item || !item.recordingKey) continue;
      if (!existingMap.has(item.recordingKey)) {
        inMemoryKtalkRecordingsMap.set(item.recordingKey, item);
        await persistSingleKtalkRecording(item);
        count++;
      } else {
        inMemoryKtalkRecordingsMap.set(item.recordingKey, existingMap.get(item.recordingKey)!);
      }
    }
    return count;
  } catch (err) {
    console.warn('[БД КТалк] Ошибка гидрации записей КТалк:', err);
    return 0;
  }
}

async function persistSingleKtalkRecording(rec: KtalkRecordingRecord): Promise<void> {
  const resJson = JSON.stringify(Array.isArray(rec.resolutions) ? rec.resolutions : []);
  const rawMetaJson = rec.rawMetadata ? JSON.stringify(rec.rawMetadata) : null;

  try {
    if (isPostgres && pgPool) {
      await pgPool.query(
        `INSERT INTO ktalk_recordings (
           recording_key, lecture_url, title, created_date, duration,
           author_name, author_login, author_email, room_name, resolutions_json,
           has_transcript, has_summary, status, hidden_by, hidden_at, synced_at, raw_metadata_json
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         ON CONFLICT (recording_key) DO UPDATE SET
           lecture_url = $2,
           title = $3,
           created_date = $4,
           duration = $5,
           author_name = $6,
           author_login = $7,
           author_email = $8,
           room_name = $9,
           resolutions_json = $10,
           has_transcript = $11,
           has_summary = $12,
           status = $13,
           hidden_by = $14,
           hidden_at = $15,
           synced_at = $16,
           raw_metadata_json = COALESCE($17, ktalk_recordings.raw_metadata_json)`,
        [
          rec.recordingKey,
          rec.lectureUrl,
          rec.title,
          rec.createdDate,
          rec.duration,
          rec.authorName,
          rec.authorLogin,
          rec.authorEmail,
          rec.roomName,
          resJson,
          Boolean(rec.hasTranscript),
          Boolean(rec.hasSummary),
          rec.status,
          rec.hiddenBy || null,
          rec.hiddenAt || null,
          rec.syncedAt,
          rawMetaJson
        ]
      );
    } else if (sqliteDb) {
      const stmt = sqliteDb.prepare(
        `INSERT INTO ktalk_recordings (
           recording_key, lecture_url, title, created_date, duration,
           author_name, author_login, author_email, room_name, resolutions_json,
           has_transcript, has_summary, status, hidden_by, hidden_at, synced_at, raw_metadata_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (recording_key) DO UPDATE SET
           lecture_url = excluded.lecture_url,
           title = excluded.title,
           created_date = excluded.created_date,
           duration = excluded.duration,
           author_name = excluded.author_name,
           author_login = excluded.author_login,
           author_email = excluded.author_email,
           room_name = excluded.room_name,
           resolutions_json = excluded.resolutions_json,
           has_transcript = excluded.has_transcript,
           has_summary = excluded.has_summary,
           status = excluded.status,
           hidden_by = excluded.hidden_by,
           hidden_at = excluded.hidden_at,
           synced_at = excluded.synced_at,
           raw_metadata_json = COALESCE(excluded.raw_metadata_json, ktalk_recordings.raw_metadata_json)`
      );
      stmt.run(
        rec.recordingKey,
        rec.lectureUrl,
        rec.title,
        rec.createdDate,
        rec.duration,
        rec.authorName,
        rec.authorLogin,
        rec.authorEmail,
        rec.roomName,
        resJson,
        rec.hasTranscript ? 1 : 0,
        rec.hasSummary ? 1 : 0,
        rec.status,
        rec.hiddenBy || null,
        rec.hiddenAt || null,
        rec.syncedAt,
        rawMetaJson
      );
    }
  } catch (err) {
    console.error('[БД КТалк] Ошибка записи записи КТалк в БД:', err);
  }
}

export async function getAllKtalkRecordings(): Promise<KtalkRecordingRecord[]> {
  const map = new Map<string, KtalkRecordingRecord>();
  for (const [k, v] of inMemoryKtalkRecordingsMap.entries()) {
    map.set(k, v);
  }

  try {
    if (isPostgres && pgPool) {
      const res = await pgPool.query(`SELECT * FROM ktalk_recordings ORDER BY created_date DESC`);
      for (const r of res.rows) {
        const rec: KtalkRecordingRecord = {
          recordingKey: r.recording_key,
          lectureUrl: r.lecture_url,
          title: r.title || 'Онлайн-встреча КТалк',
          createdDate: r.created_date || '',
          duration: r.duration || '',
          authorName: r.author_name || '',
          authorLogin: r.author_login || '',
          authorEmail: r.author_email || '',
          roomName: r.room_name || '',
          resolutions: safeJsonParse(r.resolutions_json, []),
          hasTranscript: Boolean(r.has_transcript),
          hasSummary: Boolean(r.has_summary),
          status: (r.status as any) || 'new',
          hiddenBy: r.hidden_by || null,
          hiddenAt: r.hidden_at || null,
          syncedAt: r.synced_at || '',
          rawMetadata: safeJsonParse(r.raw_metadata_json, null)
        };
        map.set(rec.recordingKey, rec);
        inMemoryKtalkRecordingsMap.set(rec.recordingKey, rec);
      }
    } else if (sqliteDb) {
      const rows = sqliteDb.prepare(`SELECT * FROM ktalk_recordings ORDER BY created_date DESC`).all() as any[];
      for (const r of rows) {
        const rec: KtalkRecordingRecord = {
          recordingKey: r.recording_key,
          lectureUrl: r.lecture_url,
          title: r.title || 'Онлайн-встреча КТалк',
          createdDate: r.created_date || '',
          duration: r.duration || '',
          authorName: r.author_name || '',
          authorLogin: r.author_login || '',
          authorEmail: r.author_email || '',
          roomName: r.room_name || '',
          resolutions: safeJsonParse(r.resolutions_json, []),
          hasTranscript: Boolean(r.has_transcript),
          hasSummary: Boolean(r.has_summary),
          status: (r.status as any) || 'new',
          hiddenBy: r.hidden_by || null,
          hiddenAt: r.hidden_at || null,
          syncedAt: r.synced_at || '',
          rawMetadata: safeJsonParse(r.raw_metadata_json, null)
        };
        map.set(rec.recordingKey, rec);
        inMemoryKtalkRecordingsMap.set(rec.recordingKey, rec);
      }
    }
  } catch (err) {
    console.error('[БД КТалк] Ошибка чтения ktalk_recordings:', err);
  }

  return Array.from(map.values()).sort((a, b) => {
    const tA = new Date(a.createdDate).getTime() || 0;
    const tB = new Date(b.createdDate).getTime() || 0;
    return tB - tA;
  });
}

export async function upsertKtalkRecordings(
  incoming: Omit<KtalkRecordingRecord, 'status' | 'hiddenBy' | 'hiddenAt'>[]
): Promise<{ addedCount: number; updatedCount: number }> {
  const existingList = await getAllKtalkRecordings();
  const existingMap = new Map(existingList.map(r => [r.recordingKey, r]));

  let addedCount = 0;
  let updatedCount = 0;

  for (const item of incoming) {
    if (!item.recordingKey) continue;
    const existing = existingMap.get(item.recordingKey);

    if (existing) {
      // Никогда не сбрасываем статусы submitted или hidden обратно в new!
      const preservedRecord: KtalkRecordingRecord = {
        ...existing,
        lectureUrl: item.lectureUrl || existing.lectureUrl,
        title: item.title || existing.title,
        createdDate: item.createdDate || existing.createdDate,
        duration: item.duration || existing.duration,
        authorName: item.authorName || existing.authorName,
        authorLogin: item.authorLogin || existing.authorLogin,
        authorEmail: item.authorEmail || existing.authorEmail,
        roomName: item.roomName || existing.roomName,
        resolutions: item.resolutions && item.resolutions.length > 0 ? item.resolutions : existing.resolutions,
        hasTranscript: item.hasTranscript ?? existing.hasTranscript,
        hasSummary: item.hasSummary ?? existing.hasSummary,
        syncedAt: item.syncedAt,
        rawMetadata: item.rawMetadata || existing.rawMetadata,
        status: existing.status,
        hiddenBy: existing.hiddenBy,
        hiddenAt: existing.hiddenAt
      };
      inMemoryKtalkRecordingsMap.set(item.recordingKey, preservedRecord);
      await persistSingleKtalkRecording(preservedRecord);
      updatedCount++;
    } else {
      const newRecord: KtalkRecordingRecord = {
        ...item,
        status: 'new',
        hiddenBy: null,
        hiddenAt: null
      };
      inMemoryKtalkRecordingsMap.set(item.recordingKey, newRecord);
      await persistSingleKtalkRecording(newRecord);
      addedCount++;
    }
  }

  await saveKtalkRecordingsBackup();
  return { addedCount, updatedCount };
}

export async function getUnreviewedKtalkRecordings(): Promise<KtalkRecordingRecord[]> {
  const [allRecordings, allTasks] = await Promise.all([
    getAllKtalkRecordings(),
    getLectureTasks()
  ]);

  const submittedUrls = new Set<string>();
  const submittedKeys = new Set<string>();

  for (const task of allTasks) {
    if (task.lectureUrl) {
      submittedUrls.add(task.lectureUrl.trim().toLowerCase().replace(/\/+$/, ''));
      const k = extractKtalkRecordingKeyFromUrl(task.lectureUrl);
      if (k) submittedKeys.add(k.toLowerCase());
    }
    if (task.talkMetadata?.recordingKey) {
      submittedKeys.add(String(task.talkMetadata.recordingKey).trim().toLowerCase());
    }
  }

  const unreviewed: KtalkRecordingRecord[] = [];
  let autoMarkedAny = false;

  for (const rec of allRecordings) {
    if (rec.status !== 'new') continue;

    const normUrl = (rec.lectureUrl || '').trim().toLowerCase().replace(/\/+$/, '');
    const keyLower = rec.recordingKey.toLowerCase();

    if (submittedKeys.has(keyLower) || (normUrl && submittedUrls.has(normUrl))) {
      // Автоматически синхронизируем статус в submitted, если запись уже есть в задачах
      rec.status = 'submitted';
      inMemoryKtalkRecordingsMap.set(rec.recordingKey, rec);
      await persistSingleKtalkRecording(rec);
      autoMarkedAny = true;
      continue;
    }

    unreviewed.push(rec);
  }

  if (autoMarkedAny) {
    await saveKtalkRecordingsBackup();
  }

  return unreviewed;
}

export async function markKtalkRecordingStatus(
  recordingKey: string,
  status: 'new' | 'submitted' | 'hidden',
  actorEmail?: string
): Promise<boolean> {
  const all = await getAllKtalkRecordings();
  const target = all.find(r => r.recordingKey.toLowerCase() === recordingKey.toLowerCase());
  if (!target) return false;

  target.status = status;
  if (status === 'hidden') {
    target.hiddenBy = actorEmail || null;
    target.hiddenAt = new Date().toISOString();
  } else if (status === 'new') {
    target.hiddenBy = null;
    target.hiddenAt = null;
  }

  inMemoryKtalkRecordingsMap.set(target.recordingKey, target);
  await persistSingleKtalkRecording(target);
  await saveKtalkRecordingsBackup();
  return true;
}

export async function getHiddenKtalkRecordings(): Promise<KtalkRecordingRecord[]> {
  const all = await getAllKtalkRecordings();
  return all.filter(rec => rec.status === 'hidden');
}

export async function markKtalkRecordingSubmittedByUrl(lectureUrl: string): Promise<void> {
  if (!lectureUrl) return;
  const normUrl = lectureUrl.trim().toLowerCase().replace(/\/+$/, '');
  const extractedKey = extractKtalkRecordingKeyFromUrl(lectureUrl)?.toLowerCase();

  const all = await getAllKtalkRecordings();
  let changed = false;
  for (const rec of all) {
    const recUrlNorm = (rec.lectureUrl || '').trim().toLowerCase().replace(/\/+$/, '');
    const matchByKey = extractedKey && rec.recordingKey.toLowerCase() === extractedKey;
    const matchByUrl = recUrlNorm && recUrlNorm === normUrl;

    if ((matchByKey || matchByUrl) && rec.status === 'new') {
      rec.status = 'submitted';
      inMemoryKtalkRecordingsMap.set(rec.recordingKey, rec);
      await persistSingleKtalkRecording(rec);
      changed = true;
    }
  }

  if (changed) {
    await saveKtalkRecordingsBackup();
  }
}


