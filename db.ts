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
  `);
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
  `);
}

// 4. Начальное наполнение БД (Seed)
async function seedInitialData() {
  // Старший куратор (суперпользователь с полными правами) - ТОЛЬКО shurygin.egor2009@gmail.com
  const superAdminEmail = 'shurygin.egor2009@gmail.com';
  const existing = await getCuratorByEmail(superAdminEmail);
  if (!existing) {
    await insertCurator({
      id: `cur_superadmin_${Date.now()}`,
      email: superAdminEmail,
      fullName: 'Егор Шурыгин (Главный администратор)',
      role: 'senior_curator',
      status: 'active',
      addedBy: 'Система (Владелец портала)',
      createdAt: new Date().toISOString(),
      lastLoginAt: null
    });
  } else {
    await updateCuratorRoleInDB(superAdminEmail, 'senior_curator');
    await updateCuratorStatusInDB(superAdminEmail, 'active');
  }

  // Выполняем гарантированную полную очистку тестовых данных
  await purgeDatabaseToCleanState(superAdminEmail);
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
  const superUser = await getCuratorByEmail(targetEmail);
  if (!superUser) {
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
  } else {
    await updateCuratorRoleInDB(targetEmail, 'senior_curator');
    await updateCuratorStatusInDB(targetEmail, 'active');
  }

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
    if (isPostgres && pgPool) {
      const res = await pgPool.query(
        `SELECT id, timestamp, actor_email, actor_role, action, target, details, ip_address
         FROM audit_logs ORDER BY id DESC LIMIT $1`,
        [limit]
      );
      return res.rows.map(r => ({
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
      return rows.map(r => ({
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
  } catch (err) {
    console.error('[БД] Ошибка чтения audit_logs:', err);
  }
  return [];
}

// -------------------------------------------------------------
// 6. ОПЕРАЦИИ С КУРАТОРАМИ В БД
// -------------------------------------------------------------
export async function getCurators(): Promise<CuratorRecord[]> {
  try {
    if (isPostgres && pgPool) {
      const res = await pgPool.query(`SELECT * FROM curators ORDER BY created_at ASC`);
      return res.rows.map(r => ({
        id: r.id,
        email: r.email,
        fullName: r.full_name,
        role: r.role,
        status: r.status,
        addedBy: r.added_by,
        createdAt: new Date(r.created_at).toISOString(),
        lastLoginAt: r.last_login_at ? new Date(r.last_login_at).toISOString() : null
      }));
    } else if (sqliteDb) {
      const stmt = sqliteDb.prepare(`SELECT * FROM curators ORDER BY created_at ASC`);
      const rows = stmt.all() as any[];
      return rows.map(r => ({
        id: r.id,
        email: r.email,
        fullName: r.full_name,
        role: r.role,
        status: r.status,
        addedBy: r.added_by,
        createdAt: r.created_at,
        lastLoginAt: r.last_login_at
      }));
    }
  } catch (err) {
    console.error('[БД] Ошибка чтения curators:', err);
  }
  return [];
}

export async function getCuratorByEmail(email: string): Promise<CuratorRecord | null> {
  const normalized = email.toLowerCase().trim();
  try {
    if (isPostgres && pgPool) {
      const res = await pgPool.query(`SELECT * FROM curators WHERE LOWER(email) = $1 LIMIT 1`, [normalized]);
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        email: r.email,
        fullName: r.full_name,
        role: r.role,
        status: r.status,
        addedBy: r.added_by,
        createdAt: new Date(r.created_at).toISOString(),
        lastLoginAt: r.last_login_at ? new Date(r.last_login_at).toISOString() : null
      };
    } else if (sqliteDb) {
      const stmt = sqliteDb.prepare(`SELECT * FROM curators WHERE LOWER(email) = ? LIMIT 1`);
      const r = stmt.get(normalized) as any;
      if (!r) return null;
      return {
        id: r.id,
        email: r.email,
        fullName: r.full_name,
        role: r.role,
        status: r.status,
        addedBy: r.added_by,
        createdAt: r.created_at,
        lastLoginAt: r.last_login_at
      };
    }
  } catch (err) {
    console.error('[БД] Ошибка поиска куратора:', err);
  }
  return null;
}

export async function insertCurator(curator: CuratorRecord): Promise<boolean> {
  try {
    if (isPostgres && pgPool) {
      await pgPool.query(
        `INSERT INTO curators (id, email, full_name, role, status, added_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (email) DO UPDATE SET full_name = $3, role = $4, status = $5`,
        [curator.id, curator.email.toLowerCase().trim(), curator.fullName, curator.role, curator.status, curator.addedBy]
      );
      return true;
    } else if (sqliteDb) {
      const stmt = sqliteDb.prepare(
        `INSERT INTO curators (id, email, full_name, role, status, added_by)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (email) DO UPDATE SET full_name = excluded.full_name, role = excluded.role, status = excluded.status`
      );
      stmt.run(curator.id, curator.email.toLowerCase().trim(), curator.fullName, curator.role, curator.status, curator.addedBy);
      return true;
    }
  } catch (err) {
    console.error('[БД] Ошибка добавления куратора:', err);
  }
  return false;
}

export async function updateCuratorRoleInDB(email: string, role: 'curator' | 'senior_curator'): Promise<boolean> {
  const normalized = email.toLowerCase().trim();
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
  return false;
}

export async function updateCuratorStatusInDB(email: string, status: 'active' | 'blocked'): Promise<boolean> {
  const normalized = email.toLowerCase().trim();
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
  return false;
}

export async function touchCuratorLoginInDB(email: string): Promise<void> {
  const normalized = email.toLowerCase().trim();
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

// -------------------------------------------------------------
// 7. ОПЕРАЦИИ С ЗАДАЧАМИ АНАЛИЗА ЛЕКЦИЙ В БД
// -------------------------------------------------------------
export async function getLectureTasks(): Promise<LectureTaskRecord[]> {
  try {
    if (isPostgres && pgPool) {
      const res = await pgPool.query(`SELECT * FROM lecture_tasks ORDER BY created_at DESC`);
      return res.rows.map(r => ({
        id: r.id,
        lectureUrl: r.lecture_url,
        teacherName: r.teacher_name,
        subject: r.subject || '',
        groupName: r.group_name || '',
        date: r.date || '',
        totalScore: r.total_score || 0,
        status: r.status,
        progressPct: r.progress_pct || 0,
        curatorEmail: r.curator_email,
        criticalViolations: r.critical_violations ? JSON.parse(r.critical_violations) : [],
        positiveHighlights: r.positive_highlights ? JSON.parse(r.positive_highlights) : [],
        recommendations: r.recommendations ? JSON.parse(r.recommendations) : [],
        criteria: r.criteria_data ? JSON.parse(r.criteria_data) : [],
        createdAt: new Date(r.created_at).toISOString()
      }));
    } else if (sqliteDb) {
      const stmt = sqliteDb.prepare(`SELECT * FROM lecture_tasks ORDER BY created_at DESC`);
      const rows = stmt.all() as any[];
      return rows.map(r => ({
        id: r.id,
        lectureUrl: r.lecture_url,
        teacherName: r.teacher_name,
        subject: r.subject || '',
        groupName: r.group_name || '',
        date: r.date || '',
        totalScore: r.total_score || 0,
        status: r.status,
        progressPct: r.progress_pct || 0,
        curatorEmail: r.curator_email,
        criticalViolations: r.critical_violations ? JSON.parse(r.critical_violations) : [],
        positiveHighlights: r.positive_highlights ? JSON.parse(r.positive_highlights) : [],
        recommendations: r.recommendations ? JSON.parse(r.recommendations) : [],
        criteria: r.criteria_data ? JSON.parse(r.criteria_data) : [],
        createdAt: r.created_at
      }));
    }
  } catch (err) {
    console.error('[БД] Ошибка чтения lecture_tasks:', err);
  }
  return [];
}

export async function insertLectureTask(task: LectureTaskRecord): Promise<boolean> {
  try {
    const critJson = JSON.stringify(task.criticalViolations || []);
    const posJson = JSON.stringify(task.positiveHighlights || []);
    const recJson = JSON.stringify(task.recommendations || []);
    const criteriaJson = JSON.stringify(task.criteria || []);

    if (isPostgres && pgPool) {
      await pgPool.query(
        `INSERT INTO lecture_tasks (
           id, lecture_url, teacher_name, subject, group_name, date,
           total_score, status, progress_pct, curator_email,
           critical_violations, positive_highlights, recommendations, criteria_data
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          task.id, task.lectureUrl, task.teacherName, task.subject, task.groupName, task.date,
          task.totalScore, task.status, task.progressPct, task.curatorEmail,
          critJson, posJson, recJson, criteriaJson
        ]
      );
      return true;
    } else if (sqliteDb) {
      const stmt = sqliteDb.prepare(
        `INSERT INTO lecture_tasks (
           id, lecture_url, teacher_name, subject, group_name, date,
           total_score, status, progress_pct, curator_email,
           critical_violations, positive_highlights, recommendations, criteria_data
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      stmt.run(
        task.id, task.lectureUrl, task.teacherName, task.subject, task.groupName, task.date,
        task.totalScore, task.status, task.progressPct, task.curatorEmail,
        critJson, posJson, recJson, criteriaJson
      );
      return true;
    }
  } catch (err) {
    console.error('[БД] Ошибка вставки задачи лекции:', err);
  }
  return false;
}

export async function updateLectureTaskProgressInDB(
  taskId: string,
  status: 'pending' | 'downloading' | 'extracting' | 'analyzing' | 'completed' | 'failed',
  progressPct: number,
  totalScore?: number,
  positiveHighlights?: string[],
  recommendations?: string[],
  criteria?: any[]
): Promise<void> {
  try {
    const posJson = positiveHighlights ? JSON.stringify(positiveHighlights) : null;
    const recJson = recommendations ? JSON.stringify(recommendations) : null;
    const critJson = criteria ? JSON.stringify(criteria) : null;

    if (isPostgres && pgPool) {
      if (status === 'completed' && totalScore !== undefined) {
        await pgPool.query(
          `UPDATE lecture_tasks SET status = $1, progress_pct = $2, total_score = $3,
             positive_highlights = COALESCE($4, positive_highlights),
             recommendations = COALESCE($5, recommendations),
             criteria_data = COALESCE($6, criteria_data)
           WHERE id = $7`,
          [status, progressPct, totalScore, posJson, recJson, critJson, taskId]
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
             criteria_data = COALESCE(?, criteria_data)
           WHERE id = ?`
        );
        stmt.run(status, progressPct, totalScore, posJson, recJson, critJson, taskId);
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
      return res.rows.map(r => r.name);
    } else if (sqliteDb) {
      const stmt = sqliteDb.prepare(`SELECT name FROM teachers ORDER BY name ASC`);
      const rows = stmt.all() as any[];
      return rows.map(r => r.name);
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
export async function storeOTPInDB(email: string, code: string, purpose: string, expiresAt: number): Promise<void> {
  const normalized = email.toLowerCase().trim();
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

  try {
    if (isPostgres && pgPool) {
      const res = await pgPool.query(
        `SELECT id, code, expires_at, attempts, used FROM otp_codes
         WHERE LOWER(email) = $1 AND purpose = $2 AND used = 0
         ORDER BY id DESC LIMIT 1`,
        [normalized, purpose]
      );

      if (res.rows.length === 0) {
        return { valid: false, message: 'Код подтверждения не найден или уже был использован.' };
      }

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
      return { valid: true, message: 'Код успешно подтвержден.' };
    } else if (sqliteDb) {
      const stmt = sqliteDb.prepare(
        `SELECT id, code, expires_at, attempts, used FROM otp_codes
         WHERE LOWER(email) = ? AND purpose = ? AND used = 0
         ORDER BY id DESC LIMIT 1`
      );
      const row = stmt.get(normalized, purpose) as any;

      if (!row) {
        return { valid: false, message: 'Код подтверждения не найден или уже был использован.' };
      }

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
      return { valid: true, message: 'Код успешно подтвержден.' };
    }
  } catch (err) {
    console.error('[БД] Ошибка проверки OTP в БД:', err);
  }

  return { valid: false, message: 'Ошибка базы данных при проверке кода.' };
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

