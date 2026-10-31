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
  totalScore: number;
  criticalViolations: string[];
  positiveHighlights: string[];
  recommendations: string[];
  criteria: any[];
  status: 'pending' | 'downloading' | 'extracting' | 'analyzing' | 'completed' | 'failed';
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
      total_score INTEGER DEFAULT 0,
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
  `);

  try {
    await pgPool.query(`
      ALTER TABLE lecture_tasks ADD COLUMN IF NOT EXISTS talk_metadata TEXT;
      ALTER TABLE lecture_tasks ADD COLUMN IF NOT EXISTS is_corrupted BOOLEAN DEFAULT FALSE;
      ALTER TABLE lecture_tasks ADD COLUMN IF NOT EXISTS raw_broken_response TEXT;
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
      total_score INTEGER DEFAULT 0,
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
  `);

  try { sqliteDb.exec("ALTER TABLE lecture_tasks ADD COLUMN talk_metadata TEXT;"); } catch {}
  try { sqliteDb.exec("ALTER TABLE lecture_tasks ADD COLUMN is_corrupted INTEGER DEFAULT 0;"); } catch {}
  try { sqliteDb.exec("ALTER TABLE lecture_tasks ADD COLUMN raw_broken_response TEXT;"); } catch {}
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
    await pgPool.query('DELETE FROM teachers;');
    await pgPool.query('DELETE FROM otp_codes;');
    await pgPool.query('DELETE FROM curators WHERE LOWER(email) != LOWER($1);', [targetEmail]);
  } else if (sqliteDb) {
    sqliteDb.exec('DELETE FROM lecture_tasks;');
    sqliteDb.exec('DELETE FROM teachers;');
    sqliteDb.exec('DELETE FROM otp_codes;');
    const stmt = sqliteDb.prepare('DELETE FROM curators WHERE LOWER(email) != LOWER(?);');
    stmt.run(targetEmail);
  }

  // Очистка локальных json файлов fallback
  try {
    const tasksFile = path.join(DATA_DIR, 'lecture_tasks.json');
    fs.writeFileSync(tasksFile, JSON.stringify([], null, 2), 'utf-8');

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

export async function hydrateCuratorsFromBackup(): Promise<void> {
  const backupPath = path.join(DATA_DIR, 'curators.json');
  if (!fs.existsSync(backupPath)) return;
  try {
    const raw = fs.readFileSync(backupPath, 'utf-8');
    const listFromFile: CuratorRecord[] = JSON.parse(raw);
    if (Array.isArray(listFromFile)) {
      for (const item of listFromFile) {
        if (item && item.email) {
          inMemoryCuratorsMap.set(item.email.toLowerCase().trim(), item);
        }
      }
    }
  } catch (err) {
    console.error('[БД] Ошибка гидрации кураторов из бэкапа:', err);
  }
}

export async function saveCuratorsBackup(): Promise<void> {
  try {
    const backupPath = path.join(DATA_DIR, 'curators.json');
    const list = Array.from(inMemoryCuratorsMap.values());
    fs.writeFileSync(backupPath, JSON.stringify(list, null, 2), 'utf-8');
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
      await pgPool.query(
        `INSERT INTO curators (id, email, full_name, role, status, added_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (email) DO UPDATE SET full_name = $3, role = $4, status = $5, added_by = $6`,
        [safeRecord.id, safeRecord.email, safeRecord.fullName, safeRecord.role, safeRecord.status, safeRecord.addedBy]
      );
      return true;
    } else if (sqliteDb) {
      const stmt = sqliteDb.prepare(
        `INSERT INTO curators (id, email, full_name, role, status, added_by)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (email) DO UPDATE SET full_name = excluded.full_name, role = excluded.role, status = excluded.status, added_by = excluded.added_by`
      );
      stmt.run(safeRecord.id, safeRecord.email, safeRecord.fullName, safeRecord.role, safeRecord.status, safeRecord.addedBy);
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
  saveCuratorsBackup().catch(() => {});
  try {
    if (isPostgres && pgPool) {
      await pgPool.query(`DELETE FROM curators WHERE LOWER(email) = $1`, [normalized]);
      return true;
    } else if (sqliteDb) {
      const stmt = sqliteDb.prepare(`DELETE FROM curators WHERE LOWER(email) = ?`);
      stmt.run(normalized);
      return true;
    }
  } catch (err) {
    console.error('[БД] Ошибка удаления куратора:', err);
  }
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
        let totalScore = r.total_score || 0;
        if (totalScore === 0 && criteria.length > 0) {
          const maxPts = criteria.length * 5;
          const earned = criteria.reduce((sum: number, c: any) => sum + (c.score || 0), 0);
          totalScore = Math.min(100, Math.max(0, Math.round((earned / maxPts) * 100)));
        }
        dbTasksMap.set(r.id, {
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
          rawBrokenResponse: r.raw_broken_response || null
        });
      }
    } else if (sqliteDb) {
      const stmt = sqliteDb.prepare(`SELECT * FROM lecture_tasks ORDER BY created_at DESC`);
      const rows = stmt.all() as any[];
      for (const r of rows) {
        const criteria = safeJsonParse(r.criteria_data, []);
        let totalScore = r.total_score || 0;
        if (totalScore === 0 && criteria.length > 0) {
          const maxPts = criteria.length * 5;
          const earned = criteria.reduce((sum: number, c: any) => sum + (c.score || 0), 0);
          totalScore = Math.min(100, Math.max(0, Math.round((earned / maxPts) * 100)));
        }
        dbTasksMap.set(r.id, {
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
          createdAt: r.created_at || new Date().toISOString(),
          talkMetadata: safeJsonParse(r.talk_metadata, null),
          isCorrupted: Boolean(r.is_corrupted),
          rawBrokenResponse: r.raw_broken_response || null
        });
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

  return Array.from(dbTasksMap.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getLectureTaskByUrl(rawUrl: string): Promise<LectureTaskRecord | null> {
  if (!rawUrl || !rawUrl.trim()) return null;
  const normTarget = rawUrl.trim().toLowerCase().replace(/\/+$/, '');
  const allTasks = await getLectureTasks();
  return allTasks.find(t => t.lectureUrl && t.lectureUrl.trim().toLowerCase().replace(/\/+$/, '') === normTarget) || null;
}

export async function insertLectureTask(task: LectureTaskRecord): Promise<boolean> {
  const safeTask: LectureTaskRecord = {
    id: task.id || `lec_${Date.now()}`,
    lectureUrl: (task.lectureUrl || '').trim(),
    teacherName: (task.teacherName || '').trim() || 'Преподаватель',
    subject: (task.subject || '').trim() || 'Олимпиадная подготовка',
    groupName: (task.groupName || '').trim() || 'Основная группа',
    date: task.date || new Date().toISOString().replace('T', ' ').slice(0, 16),
    totalScore: typeof task.totalScore === 'number' ? task.totalScore : 0,
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
    rawBrokenResponse: task.rawBrokenResponse || null
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

    if (isPostgres && pgPool) {
      await pgPool.query(
        `INSERT INTO lecture_tasks (
           id, lecture_url, teacher_name, subject, group_name, date,
           total_score, status, progress_pct, curator_email,
           critical_violations, positive_highlights, recommendations, criteria_data,
           talk_metadata, is_corrupted, raw_broken_response
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         ON CONFLICT (id) DO UPDATE SET
           status = $8, progress_pct = $9, total_score = $7,
           critical_violations = $11, positive_highlights = $12, recommendations = $13, criteria_data = $14,
           talk_metadata = COALESCE($15, lecture_tasks.talk_metadata),
           is_corrupted = $16,
           raw_broken_response = COALESCE($17, lecture_tasks.raw_broken_response)`,
        [
          safeTask.id, safeTask.lectureUrl, safeTask.teacherName, safeTask.subject, safeTask.groupName, safeTask.date,
          safeTask.totalScore, safeTask.status, safeTask.progressPct, safeTask.curatorEmail,
          critJson, posJson, recJson, criteriaJson,
          talkMetaJson, Boolean(safeTask.isCorrupted), rawBroken
        ]
      );
      return true;
    } else if (sqliteDb) {
      const stmt = sqliteDb.prepare(
        `INSERT INTO lecture_tasks (
           id, lecture_url, teacher_name, subject, group_name, date,
           total_score, status, progress_pct, curator_email,
           critical_violations, positive_highlights, recommendations, criteria_data,
           talk_metadata, is_corrupted, raw_broken_response
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           status = excluded.status, progress_pct = excluded.progress_pct, total_score = excluded.total_score,
           critical_violations = excluded.critical_violations, positive_highlights = excluded.positive_highlights,
           recommendations = excluded.recommendations, criteria_data = excluded.criteria_data,
           talk_metadata = COALESCE(excluded.talk_metadata, lecture_tasks.talk_metadata),
           is_corrupted = excluded.is_corrupted,
           raw_broken_response = COALESCE(excluded.raw_broken_response, lecture_tasks.raw_broken_response)`
      );
      stmt.run(
        safeTask.id, safeTask.lectureUrl, safeTask.teacherName, safeTask.subject, safeTask.groupName, safeTask.date,
        safeTask.totalScore, safeTask.status, safeTask.progressPct, safeTask.curatorEmail,
        critJson, posJson, recJson, criteriaJson,
        talkMetaJson, isCorruptedVal, rawBroken
      );
      return true;
    }
  } catch (err) {
    console.error('[БД] Ошибка вставки задачи лекции:', err);
  }
  return true;
}

export async function updateLectureTaskProgressInDB(
  taskId: string,
  status: 'pending' | 'downloading' | 'extracting' | 'analyzing' | 'completed' | 'failed',
  progressPct: number,
  totalScore?: number,
  positiveHighlights?: string[],
  recommendations?: string[],
  criteria?: any[],
  criticalViolations?: string[],
  talkMetadata?: any,
  isCorrupted?: boolean,
  rawBrokenResponse?: string | null,
  teacherName?: string,
  subject?: string
): Promise<void> {
  // Обновляем в памяти
  const mem = inMemoryTasksMap.get(taskId);
  if (mem) {
    mem.status = status;
    mem.progressPct = progressPct;
    if (totalScore !== undefined) mem.totalScore = totalScore;
    if (positiveHighlights) mem.positiveHighlights = positiveHighlights;
    if (recommendations) mem.recommendations = recommendations;
    if (criteria) mem.criteria = criteria;
    if (criticalViolations) mem.criticalViolations = criticalViolations;
    if (talkMetadata !== undefined) mem.talkMetadata = talkMetadata;
    if (isCorrupted !== undefined) mem.isCorrupted = isCorrupted;
    if (rawBrokenResponse !== undefined) mem.rawBrokenResponse = rawBrokenResponse;
    if (teacherName) mem.teacherName = teacherName;
    if (subject) mem.subject = subject;
  }

  // Мгновенное сохранение снимка памяти в файл бэкапа
  createLectureTasksBackup().catch(() => {});

  try {
    const posJson = positiveHighlights ? JSON.stringify(positiveHighlights) : null;
    const recJson = recommendations ? JSON.stringify(recommendations) : null;
    const critJson = criteria ? JSON.stringify(criteria) : null;
    const critViolJson = criticalViolations ? JSON.stringify(criticalViolations) : null;
    const talkMetaJson = talkMetadata ? JSON.stringify(talkMetadata) : null;
    const isCorruptedNum = isCorrupted ? 1 : 0;

    if (isPostgres && pgPool) {
      if (status === 'completed' && totalScore !== undefined) {
        await pgPool.query(
          `UPDATE lecture_tasks SET status = $1, progress_pct = $2, total_score = $3,
             positive_highlights = COALESCE($4, positive_highlights),
             recommendations = COALESCE($5, recommendations),
             criteria_data = COALESCE($6, criteria_data),
             critical_violations = COALESCE($7, critical_violations),
             talk_metadata = COALESCE($8, talk_metadata),
             is_corrupted = COALESCE($9, is_corrupted),
             raw_broken_response = COALESCE($10, raw_broken_response),
             teacher_name = COALESCE($11, teacher_name),
             subject = COALESCE($12, subject)
           WHERE id = $13`,
          [status, progressPct, totalScore, posJson, recJson, critJson, critViolJson, talkMetaJson, isCorrupted, rawBrokenResponse || null, teacherName || null, subject || null, taskId]
        );
      } else {
        await pgPool.query(
          `UPDATE lecture_tasks SET status = $1, progress_pct = $2 WHERE id = $3`,
          [status, progressPct, taskId]
        );
      }
    } else if (sqliteDb) {
      if (status === 'completed' && totalScore !== undefined) {
        const stmt = sqliteDb.prepare(
          `UPDATE lecture_tasks SET status = ?, progress_pct = ?, total_score = ?,
             positive_highlights = COALESCE(?, positive_highlights),
             recommendations = COALESCE(?, recommendations),
             criteria_data = COALESCE(?, criteria_data),
             critical_violations = COALESCE(?, critical_violations),
             talk_metadata = COALESCE(?, talk_metadata),
             is_corrupted = COALESCE(?, is_corrupted),
             raw_broken_response = COALESCE(?, raw_broken_response),
             teacher_name = COALESCE(?, teacher_name),
             subject = COALESCE(?, subject)
           WHERE id = ?`
        );
        stmt.run(status, progressPct, totalScore, posJson, recJson, critJson, critViolJson, talkMetaJson, isCorruptedNum, rawBrokenResponse || null, teacherName || null, subject || null, taskId);
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
  try {
    if (isPostgres && pgPool) {
      const res = await pgPool.query(`SELECT name FROM teachers ORDER BY name ASC`);
      return res.rows.map(r => r.name).filter(Boolean);
    } else if (sqliteDb) {
      const stmt = sqliteDb.prepare(`SELECT name FROM teachers ORDER BY name ASC`);
      const rows = stmt.all() as any[];
      return rows.map(r => r.name).filter(Boolean);
    }
  } catch (err) {
    console.error('[БД] Ошибка чтения teachers:', err);
  }
  return [];
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
        `INSERT INTO otp_codes (email, code, purpose, expires_at) VALUES ($1, $2, $3, $4)`,
        [normalized, code, purpose, expiresAt]
      );
    } else if (sqliteDb) {
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

// -------------------------------------------------------------
// 12. АВТОМАТИЧЕСКИЙ БЭКАП И ГИДРАЦИЯ ПРОВЕРОК ЛЕКЦИЙ
// -------------------------------------------------------------
const BACKUP_FILE = path.join(DATA_DIR, 'lecture_tasks_backup.json');

export async function createLectureTasksBackup(): Promise<number> {
  try {
    const tasks = await getLectureTasks();
    // Ограничиваем бэкап ровно до 100 самых последних проверок (старые вытесняются новым)
    const recentTasks = tasks.slice(0, 100);
    const tempFile = path.join(DATA_DIR, 'lecture_tasks_backup.tmp.json');
    fs.writeFileSync(tempFile, JSON.stringify(recentTasks, null, 2), 'utf-8');
    fs.renameSync(tempFile, BACKUP_FILE);
    console.log(`[БД Бэкап] ✅ Автоматически сохранен бэкап проверок лекций (${recentTasks.length} записей, ротация ровно до 100) в ${BACKUP_FILE}`);
    return recentTasks.length;
  } catch (err) {
    console.error('[БД Бэкап] Ошибка создания бэкапа проверок лекций:', err);
    return 0;
  }
}

export async function hydrateLectureTasksFromBackup(): Promise<number> {
  if (!fs.existsSync(BACKUP_FILE)) {
    console.log('[БД Гидрация] Файл бэкапа не найден, гидрация пропущена.');
    return 0;
  }

  try {
    const raw = fs.readFileSync(BACKUP_FILE, 'utf-8');
    const backupTasks: LectureTaskRecord[] = JSON.parse(raw);
    if (!Array.isArray(backupTasks) || backupTasks.length === 0) {
      return 0;
    }

    // 1. Мгновенно загружаем все задачи из файла бэкапа в память
    for (const task of backupTasks) {
      if (task && task.id) {
        inMemoryTasksMap.set(task.id, task);
      }
    }

    // 2. Восстанавливаем записи в реляционную таблицу PostgreSQL / SQLite
    const currentTasks = await getLectureTasks();
    const currentIds = new Set(currentTasks.map(t => t.id));

    let restoredCount = 0;
    for (const task of backupTasks) {
      if (task && task.id) {
        await insertLectureTask(task);
        if (task.teacherName) {
          await insertTeacherIfNotExists(task.teacherName, task.subject);
        }
        restoredCount++;
      }
    }

    console.log(`[БД Гидрация] ✅ Восстановлено ${restoredCount} проверок лекций и загружено в дашборд из резервной копии ${BACKUP_FILE}`);
    return restoredCount;
  } catch (err) {
    console.error('[БД Гидрация] Ошибка гидрации проверок из бэкапа:', err);
    return 0;
  }
}


