import os
import logging
import asyncio
import sqlite3
import re
import uuid
import time
import hashlib
import hmac
from typing import Optional, Any
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

TOKEN_SECRET = os.getenv("TOKEN_SECRET") or "olymp-secret-key-2026-checker-secret-secure-salt-2026"

try:
    import asyncpg
except ImportError:
    asyncpg = None  # type: ignore

from testing_config import is_testing_mode
import logger_config

logger = logging.getLogger(__name__)

DB_TYPE = os.getenv("DB_TYPE", "postgres").lower()
SQLITE_DB_PATH = os.getenv("SQLITE_DB_PATH", "bot_database.db")
_db_dir = os.path.dirname(SQLITE_DB_PATH)
if _db_dir:
    try:
        os.makedirs(_db_dir, exist_ok=True)
    except Exception as e:
        logger.warning(f"Не удалось создать директорию для базы данных {_db_dir}: {e}")


# Список администраторов из окружения (по умолчанию shurygin_egor, aemss72)
raw_admins = os.getenv("ADMIN_USERNAMES", "shurygin_egor, aemss72")
ADMIN_USERNAMES = [
    name.strip().strip("[]'\"").lstrip('@').lower()
    for name in raw_admins.replace("[", "").replace("]", "").split(",")
    if name.strip().strip("[]'\"")
]
if not ADMIN_USERNAMES:
    ADMIN_USERNAMES = ["shurygin_egor", "aemss72"]

# Список администраторов с правом редактирования системного промпта нейросети
raw_prompt_admins = os.getenv("PROMPT_ADMIN_USERNAMES") or os.getenv("ADMIN_USERNAMES", "shurygin_egor, aemss72")
PROMPT_ADMIN_USERNAMES = [
    name.strip().strip("[]'\"").lstrip('@').lower()
    for name in raw_prompt_admins.replace("[", "").replace("]", "").split(",")
    if name.strip().strip("[]'\"")
]
if not PROMPT_ADMIN_USERNAMES:
    PROMPT_ADMIN_USERNAMES = ["shurygin_egor", "aemss72"]

# Формируем словарь конфигурации из файла .env для PostgreSQL
DB_CONFIG = {
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "database": os.getenv("DB_NAME"),
    "host": os.getenv("DB_HOST"),
    "port": int(os.getenv("DB_PORT", 5432))
}

db_pool = None


def extract_record_id(url: str) -> str:
    """Извлекает уникальный ID записи (recordingKey) из ссылки KTalk."""
    if not url:
        return ""
    match = re.search(r"/(?:recordings|records)/([a-zA-Z0-9\-]+)", url)
    if match:
        return match.group(1)
    return url.strip()


# ------------------ Вспомогательные функции для SQLite ------------------ #
import shutil


def _handle_corrupted_sqlite():
    logging.error(f"Обнаружено повреждение базы данных SQLite ({SQLITE_DB_PATH}). Выполняется сброс и создание новой БД...")
    if os.path.exists(SQLITE_DB_PATH):
        try:
            corrupted_backup = f"{SQLITE_DB_PATH}.corrupted.{int(time.time())}"
            shutil.move(SQLITE_DB_PATH, corrupted_backup)
            logging.info(f"Поврежденная база переименована в {corrupted_backup}")
        except Exception as e:
            logging.error(f"Ошибка переименования поврежденного файла БД: {e}")
    for ext in ["-wal", "-shm"]:
        f_path = SQLITE_DB_PATH + ext
        if os.path.exists(f_path):
            try:
                os.remove(f_path)
            except Exception:
                pass


def _sqlite_create_raw_conn():
    try:
        conn = sqlite3.connect(SQLITE_DB_PATH, timeout=20.0)
        conn.row_factory = sqlite3.Row
        conn.create_function("lower", 1, lambda s: s.lower() if s is not None else None)
        conn.create_function("LOWER", 1, lambda s: s.lower() if s is not None else None)
        try:
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA synchronous=NORMAL;")
            conn.execute("PRAGMA busy_timeout=10000;")
        except Exception:
            pass
        return conn
    except sqlite3.DatabaseError as e:
        err_msg = str(e).lower()
        if any(keyword in err_msg for keyword in ["malformed", "disk image", "not a database", "corrupt"]):
            _handle_corrupted_sqlite()
            conn = sqlite3.connect(SQLITE_DB_PATH, timeout=20.0)
            conn.row_factory = sqlite3.Row
            conn.create_function("lower", 1, lambda s: s.lower() if s is not None else None)
            conn.create_function("LOWER", 1, lambda s: s.lower() if s is not None else None)
            try:
                conn.execute("PRAGMA journal_mode=WAL;")
                conn.execute("PRAGMA synchronous=NORMAL;")
                conn.execute("PRAGMA busy_timeout=10000;")
            except Exception:
                pass
            return conn
        raise


class _SQLiteConnectionContext:
    def __enter__(self):
        try:
            self.conn = _sqlite_create_raw_conn()
            return self.conn
        except sqlite3.DatabaseError as e:
            err_msg = str(e).lower()
            if any(keyword in err_msg for keyword in ["malformed", "disk image", "not a database", "corrupt"]):
                _handle_corrupted_sqlite()
                _sqlite_init_db_raw()
                self.conn = _sqlite_create_raw_conn()
                return self.conn
            raise

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type and issubclass(exc_type, sqlite3.DatabaseError):
            err_msg = str(exc_val).lower()
            if any(keyword in err_msg for keyword in ["malformed", "disk image", "not a database", "corrupt"]):
                logging.error(f"Сбой выполнения запроса SQLite ({exc_val}). Выполняем авто-восстановление базы данных...")
                if hasattr(self, 'conn') and self.conn:
                    try:
                        self.conn.close()
                    except Exception:
                        pass
                _handle_corrupted_sqlite()
                _sqlite_init_db_raw()
                return True
        if hasattr(self, 'conn') and self.conn:
            try:
                self.conn.close()
            except Exception:
                pass
        return False


def _get_sqlite_conn():
    return _SQLiteConnectionContext()


def _sqlite_init_db_raw():
    try:
        conn = _sqlite_create_raw_conn()
        try:
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS allowed_users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    role TEXT DEFAULT 'curator'
                )
            ''')
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS authorized_users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    telegram_id INTEGER UNIQUE NOT NULL,
                    username TEXT,
                    role TEXT DEFAULT 'curator'
                )
            ''')
            try:
                cursor.execute("ALTER TABLE authorized_users ADD COLUMN username TEXT")
            except Exception:
                pass
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS teachers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL
                )
            ''')
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS responses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    telegram_id INTEGER NOT NULL,
                    link TEXT,
                    additional_info TEXT,
                    job_name TEXT UNIQUE,
                    teacher_id INTEGER REFERENCES teachers(id),
                    created_at INTEGER
                )
            ''')
            try:
                cursor.execute("ALTER TABLE responses ADD COLUMN created_at INTEGER")
            except Exception:
                pass

            cursor.execute('''
                CREATE TABLE IF NOT EXISTS ai_checks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    response_id INTEGER UNIQUE REFERENCES responses(id) ON DELETE CASCADE,
                    job_name TEXT UNIQUE REFERENCES responses(job_name) ON DELETE CASCADE,
                    point INTEGER DEFAULT -1,
                    critical BOOLEAN,
                    comment TEXT,
                    score_percent REAL
                )
            ''')
            try:
                cursor.execute("ALTER TABLE ai_checks ADD COLUMN response_id INTEGER REFERENCES responses(id)")
            except Exception:
                pass
            try:
                cursor.execute("ALTER TABLE ai_checks ADD COLUMN score_percent REAL")
            except Exception:
                pass
            try:
                cursor.execute("ALTER TABLE stats_tokens ADD COLUMN expires_at INTEGER DEFAULT 0")
            except Exception:
                pass
            try:
                cursor.execute("ALTER TABLE stats_tokens ADD COLUMN used_at INTEGER")
            except Exception:
                pass
            try:
                cursor.execute("ALTER TABLE stats_tokens ADD COLUMN created_by INTEGER DEFAULT 0")
            except Exception:
                pass
            try:
                cursor.execute("ALTER TABLE admin_tokens ADD COLUMN expires_at INTEGER DEFAULT 0")
            except Exception:
                pass
            try:
                cursor.execute("ALTER TABLE admin_tokens ADD COLUMN used_at INTEGER")
            except Exception:
                pass
            try:
                cursor.execute("ALTER TABLE admin_tokens ADD COLUMN created_by INTEGER DEFAULT 0")
            except Exception:
                pass
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS stats_tokens (
                    token TEXT PRIMARY KEY,
                    teacher_id INTEGER NOT NULL REFERENCES teachers(id),
                    created_at INTEGER NOT NULL,
                    expires_at INTEGER NOT NULL,
                    used_at INTEGER,
                    created_by INTEGER
                )
            ''')
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS admin_tokens (
                    token TEXT PRIMARY KEY,
                    created_at INTEGER NOT NULL,
                    expires_at INTEGER NOT NULL,
                    used_at INTEGER,
                    created_by INTEGER
                )
            ''')
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS app_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
            ''')
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS prompt_configs (
                    key TEXT PRIMARY KEY,
                    prompt_text TEXT NOT NULL,
                    updated_at INTEGER NOT NULL,
                    updated_by TEXT NOT NULL
                )
            ''')
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS prompt_audit_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp INTEGER NOT NULL,
                    username TEXT NOT NULL,
                    telegram_id INTEGER,
                    action TEXT NOT NULL,
                    ip_address TEXT,
                    details TEXT
                )
            ''')
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS prompt_codes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    code TEXT NOT NULL,
                    username TEXT NOT NULL,
                    telegram_id INTEGER NOT NULL,
                    purpose TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    expires_at INTEGER NOT NULL,
                    used INTEGER DEFAULT 0
                )
            ''')
            initial_users = sorted(list(set(ADMIN_USERNAMES + ['shurygin_egor', 'aemss72'])))
            for user in initial_users:
                cursor.execute('''
                    INSERT OR IGNORE INTO allowed_users (username, role) VALUES (?, 'admin')
                ''', (user.lower(),))
            conn.commit()
        finally:
            conn.close()
    except sqlite3.DatabaseError as e:
        err_msg = str(e).lower()
        if any(keyword in err_msg for keyword in ["malformed", "disk image", "not a database", "corrupt"]):
            _handle_corrupted_sqlite()
            conn = _sqlite_create_raw_conn()
            try:
                cursor = conn.cursor()
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS allowed_users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT UNIQUE NOT NULL,
                        role TEXT DEFAULT 'curator'
                    )
                ''')
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS authorized_users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        telegram_id INTEGER UNIQUE NOT NULL,
                        username TEXT,
                        role TEXT DEFAULT 'curator'
                    )
                ''')
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS teachers (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT UNIQUE NOT NULL
                    )
                ''')
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS responses (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        telegram_id INTEGER NOT NULL,
                        link TEXT,
                        additional_info TEXT,
                        job_name TEXT UNIQUE,
                        teacher_id INTEGER REFERENCES teachers(id),
                        created_at INTEGER
                    )
                ''')
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS ai_checks (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        response_id INTEGER UNIQUE REFERENCES responses(id) ON DELETE CASCADE,
                        job_name TEXT UNIQUE REFERENCES responses(job_name) ON DELETE CASCADE,
                        point INTEGER DEFAULT -1,
                        critical BOOLEAN,
                        comment TEXT
                    )
                ''')
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS stats_tokens (
                        token TEXT PRIMARY KEY,
                        teacher_id INTEGER NOT NULL REFERENCES teachers(id),
                        created_at INTEGER NOT NULL,
                        expires_at INTEGER NOT NULL,
                        used_at INTEGER,
                        created_by INTEGER
                    )
                ''')
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS admin_tokens (
                        token TEXT PRIMARY KEY,
                        created_at INTEGER NOT NULL,
                        expires_at INTEGER NOT NULL,
                        used_at INTEGER,
                        created_by INTEGER
                    )
                ''')
                initial_users = sorted(list(set(ADMIN_USERNAMES + ['shurygin_egor', 'aemss72'])))
                for user in initial_users:
                    cursor.execute('''
                        INSERT OR IGNORE INTO allowed_users (username, role) VALUES (?, 'admin')
                    ''', (user.lower(),))
                conn.commit()
            finally:
                conn.close()
        else:
            raise


def _sqlite_init_db():
    with _get_sqlite_conn() as conn:
        _sqlite_init_db_raw()


# ------------------ Защищенная работа с PostgreSQL пулом ------------------ #
async def _execute_pg_query(query_func, *args, **kwargs):
    """Выполняет запрос через asyncpg пул с автоматическим восстановлением соединения при таймаутах."""
    global db_pool
    if not db_pool:
        await init_db()
    if not db_pool:
        raise RuntimeError("Пул базы данных PostgreSQL не инициализирован.")
    if asyncpg is None:
        raise RuntimeError("Модуль asyncpg не установлен в окружении.")
    try:
        async with db_pool.acquire() as conn:
            return await query_func(conn, *args, **kwargs)
    except (asyncpg.PostgresConnectionError, asyncpg.InterfaceError, asyncpg.CannotConnectNowError) as e:
        logger.warning(f"Обнаружен сбой/таймаут соединения PostgreSQL ({e}). Выполняется повторное подключение...")
        try:
            if db_pool:
                await db_pool.close()
        except Exception:
            pass
        db_pool = None
        await init_db()
        async with db_pool.acquire() as conn:
            return await query_func(conn, *args, **kwargs)


# ------------------ Публичные асинхронные методы ------------------ #
async def init_db():
    """Инициализация таблиц и создание пула/подключения"""
    global db_pool, DB_TYPE
    if DB_TYPE == "sqlite":
        await asyncio.to_thread(_sqlite_init_db)
        logger.info(f"База данных SQLite ({SQLITE_DB_PATH}) успешно инициализирована.")
    else:
        if asyncpg is None:
            raise RuntimeError("Модуль asyncpg не установлен для работы с PostgreSQL.")
        try:
            # Настройка устойчивого пула с авто-сбросом протухших соединений каждые 300 секунд
            db_pool = await asyncpg.create_pool(
                **DB_CONFIG,
                min_size=1,
                max_size=10,
                command_timeout=60.0,
                max_inactive_connection_lifetime=300.0
            )

            async def _init_tables(conn):
                await conn.execute('''
                    CREATE TABLE IF NOT EXISTS allowed_users (
                        ID INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                        username TEXT UNIQUE NOT NULL,
                        role TEXT DEFAULT 'curator'
                    )
                ''')
                await conn.execute('''
                    CREATE TABLE IF NOT EXISTS authorized_users (
                        ID INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                        telegram_id BIGINT UNIQUE NOT NULL,
                        username TEXT,
                        role TEXT DEFAULT 'curator'
                    )
                ''')
                try:
                    await conn.execute("ALTER TABLE authorized_users ADD COLUMN username TEXT")
                except Exception:
                    pass
                await conn.execute('''
                    CREATE TABLE IF NOT EXISTS teachers (
                        ID INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                        name TEXT UNIQUE NOT NULL
                    )
                ''')
                await conn.execute('''
                    CREATE TABLE IF NOT EXISTS responses (
                        ID BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                        telegram_id BIGINT NOT NULL,
                        link TEXT,
                        additional_info TEXT,
                        job_name TEXT UNIQUE,
                        teacher_id INTEGER REFERENCES teachers(ID),
                        created_at BIGINT
                    )
                ''')
                try:
                    await conn.execute("ALTER TABLE responses ADD COLUMN created_at BIGINT")
                except Exception:
                    pass

                await conn.execute('''
                    CREATE TABLE IF NOT EXISTS ai_checks (
                        ID BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                        response_id BIGINT UNIQUE REFERENCES responses(ID) ON DELETE CASCADE,
                        job_name TEXT UNIQUE REFERENCES responses(job_name) ON DELETE CASCADE,
                        point INTEGER DEFAULT -1,
                        critical BOOLEAN,
                        comment TEXT
                    )
                ''')
                try:
                    await conn.execute("ALTER TABLE ai_checks ADD COLUMN response_id BIGINT REFERENCES responses(ID)")
                except Exception:
                    pass
                await conn.execute('''
                    CREATE TABLE IF NOT EXISTS stats_tokens (
                        token TEXT PRIMARY KEY,
                        teacher_id INTEGER NOT NULL REFERENCES teachers(ID),
                        created_at BIGINT NOT NULL,
                        expires_at BIGINT NOT NULL,
                        used_at BIGINT,
                        created_by BIGINT
                    )
                ''')
                await conn.execute('''
                    CREATE TABLE IF NOT EXISTS admin_tokens (
                        token TEXT PRIMARY KEY,
                        created_at BIGINT NOT NULL,
                        expires_at BIGINT NOT NULL,
                        used_at BIGINT,
                        created_by BIGINT
                    )
                ''')
                await conn.execute('''
                    CREATE TABLE IF NOT EXISTS prompt_configs (
                        key TEXT PRIMARY KEY,
                        prompt_text TEXT NOT NULL,
                        updated_at BIGINT NOT NULL,
                        updated_by TEXT NOT NULL
                    )
                ''')
                await conn.execute('''
                    CREATE TABLE IF NOT EXISTS prompt_audit_log (
                        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                        timestamp BIGINT NOT NULL,
                        username TEXT NOT NULL,
                        telegram_id BIGINT,
                        action TEXT NOT NULL,
                        ip_address TEXT,
                        details TEXT
                    )
                ''')
                await conn.execute('''
                    CREATE TABLE IF NOT EXISTS prompt_codes (
                        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                        code TEXT NOT NULL,
                        username TEXT NOT NULL,
                        telegram_id BIGINT NOT NULL,
                        purpose TEXT NOT NULL,
                        created_at BIGINT NOT NULL,
                        expires_at BIGINT NOT NULL,
                        used INTEGER DEFAULT 0
                    )
                ''')
                initial_users = sorted(list(set(ADMIN_USERNAMES + ['shurygin_egor', 'aemss72'])))
                for user in initial_users:
                    await conn.execute('''
                        INSERT INTO allowed_users (username, role) 
                        VALUES ($1, 'admin') 
                        ON CONFLICT (username) DO UPDATE SET role = 'admin'
                    ''', user.lower())

            await _execute_pg_query(_init_tables)
            logging.info("База данных PostgreSQL успешно инициализирована.")
        except Exception as e:
            logging.warning(f"Ошибка подключения к PostgreSQL: {e}. Переключаемся на локальную SQLite для тестирования.")
            DB_TYPE = "sqlite"
            await asyncio.to_thread(_sqlite_init_db)
            logging.info(f"База данных SQLite ({SQLITE_DB_PATH}) успешно инициализирована (fallback).")


async def close_db():
    """Закрытие БД"""
    global db_pool
    if DB_TYPE != "sqlite" and db_pool:
        await db_pool.close()
        logging.info("Пул соединений с PostgreSQL закрыт.")


# --- Управление Пользователями и Ролями --- #

# is_admin
def _sqlite_is_admin(telegram_id: int = None, clean_username: str = None) -> bool:
    with _get_sqlite_conn() as conn:
        if telegram_id:
            row = conn.execute("SELECT role, username FROM authorized_users WHERE telegram_id = ?", (telegram_id,)).fetchone()
            if row:
                if row["role"] == 'admin':
                    return True
                if row["username"] and row["username"].lower() in ADMIN_USERNAMES:
                    return True
        if clean_username:
            if clean_username in ADMIN_USERNAMES:
                return True
            row = conn.execute("SELECT role FROM authorized_users WHERE LOWER(username) = ?", (clean_username,)).fetchone()
            if row and row["role"] == 'admin':
                return True
            row = conn.execute("SELECT role FROM allowed_users WHERE LOWER(username) = ?", (clean_username,)).fetchone()
            if row and row["role"] == 'admin':
                return True
    return False


async def is_admin(telegram_id: int = None, username: str = None) -> bool:
    """Проверяет, является ли пользователь администратором"""
    clean_username = username.strip().lstrip('@').lower() if username else None

    if DB_TYPE == "sqlite":
        return await asyncio.to_thread(_sqlite_is_admin, telegram_id, clean_username)

    async def _query(conn):
        if telegram_id:
            row = await conn.fetchrow("SELECT role, username FROM authorized_users WHERE telegram_id = $1", telegram_id)
            if row:
                if row["role"] == 'admin':
                    return True
                if row["username"] and row["username"].lower() in ADMIN_USERNAMES:
                    return True
        if clean_username:
            if clean_username in ADMIN_USERNAMES:
                return True
            role_auth = await conn.fetchval("SELECT role FROM authorized_users WHERE LOWER(username) = $1", clean_username)
            if role_auth == 'admin':
                return True
            role_allow = await conn.fetchval("SELECT role FROM allowed_users WHERE LOWER(username) = $1", clean_username)
            if role_allow == 'admin':
                return True
        return False

    return await _execute_pg_query(_query)


# get_admins
def _sqlite_get_admins() -> list:
    with _get_sqlite_conn() as conn:
        allow_rows = conn.execute("SELECT username FROM allowed_users WHERE role = 'admin'").fetchall()
        auth_rows = conn.execute("SELECT telegram_id FROM authorized_users WHERE role = 'admin'").fetchall()
        
        usernames = set([r["username"].lower() for r in allow_rows if r["username"]] +
                        [u.lower() for u in ADMIN_USERNAMES])
        
        res = []
        for u in sorted(list(usernames)):
            res.append({"type": "username", "value": u})
            
        for r in auth_rows:
            if r["telegram_id"]:
                res.append({"type": "telegram_id", "value": r["telegram_id"]})
        return res


async def get_admins() -> list:
    """Возвращает список администраторов"""
    if DB_TYPE == "sqlite":
        return await asyncio.to_thread(_sqlite_get_admins)

    async def _query(conn):
        allow_rows = await conn.fetch("SELECT username FROM allowed_users WHERE role = 'admin'")
        auth_rows = await conn.fetch("SELECT telegram_id FROM authorized_users WHERE role = 'admin'")
        
        usernames = set([r["username"].lower() for r in allow_rows if r["username"]] +
                        [u.lower() for u in ADMIN_USERNAMES])
        
        res = []
        for u in sorted(list(usernames)):
            res.append({"type": "username", "value": u})
            
        for r in auth_rows:
            if r["telegram_id"]:
                res.append({"type": "telegram_id", "value": r["telegram_id"]})
        return res

    return await _execute_pg_query(_query)


# get_curators
def _sqlite_get_curators() -> dict:
    with _get_sqlite_conn() as conn:
        allow_rows = conn.execute("SELECT username FROM allowed_users WHERE role != 'admin' OR role IS NULL").fetchall()
        auth_rows = conn.execute("SELECT telegram_id FROM authorized_users WHERE role != 'admin' OR role IS NULL").fetchall()
        
        allowed_curators = [r["username"] for r in allow_rows if r["username"] and r["username"].lower() not in ADMIN_USERNAMES]
        authorized_curators = [r["telegram_id"] for r in auth_rows if r["telegram_id"]]
        
        return {"allowed": allowed_curators, "authorized": authorized_curators}


async def get_curators() -> dict:
    """Возвращает кураторов: {'allowed': [username, ...], 'authorized': [telegram_id, ...]}"""
    if DB_TYPE == "sqlite":
        return await asyncio.to_thread(_sqlite_get_curators)

    async def _query(conn):
        allow_rows = await conn.fetch("SELECT username FROM allowed_users WHERE role != 'admin' OR role IS NULL")
        auth_rows = await conn.fetch("SELECT telegram_id FROM authorized_users WHERE role != 'admin' OR role IS NULL")
        
        allowed_curators = [r["username"] for r in allow_rows if r["username"] and r["username"].lower() not in ADMIN_USERNAMES]
        authorized_curators = [r["telegram_id"] for r in auth_rows if r["telegram_id"]]
        
        return {"allowed": allowed_curators, "authorized": authorized_curators}

    return await _execute_pg_query(_query)


# promote_to_admin
def _sqlite_promote_to_admin(username: str = None, telegram_id: int = None) -> bool:
    with _get_sqlite_conn() as conn:
        if username:
            clean = username.strip().lstrip('@').lower()
            conn.execute("UPDATE allowed_users SET role = 'admin' WHERE LOWER(username) = ?", (clean,))
            conn.execute("UPDATE authorized_users SET role = 'admin' WHERE LOWER(username) = ?", (clean,))
            conn.execute("INSERT OR IGNORE INTO allowed_users (username, role) VALUES (?, 'admin')", (clean,))
            conn.execute("UPDATE allowed_users SET role = 'admin' WHERE LOWER(username) = ?", (clean,))
        if telegram_id:
            conn.execute("UPDATE authorized_users SET role = 'admin' WHERE telegram_id = ?", (telegram_id,))
        conn.commit()
        return True


async def promote_to_admin(username: str = None, telegram_id: int = None) -> bool:
    """Повышает существующего куратора до администратора"""
    if DB_TYPE == "sqlite":
        return await asyncio.to_thread(_sqlite_promote_to_admin, username, telegram_id)

    async def _query(conn):
        if username:
            clean = username.strip().lstrip('@').lower()
            await conn.execute("UPDATE allowed_users SET role = 'admin' WHERE LOWER(username) = $1", clean)
            await conn.execute("UPDATE authorized_users SET role = 'admin' WHERE LOWER(username) = $1", clean)
            await conn.execute("INSERT INTO allowed_users (username, role) VALUES ($1, 'admin') ON CONFLICT (username) DO UPDATE SET role = 'admin'", clean)
        if telegram_id:
            await conn.execute("UPDATE authorized_users SET role = 'admin' WHERE telegram_id = $1", telegram_id)
        return True

    return await _execute_pg_query(_query)


# add_admin
async def add_admin(username: str) -> bool:
    """Добавляет или повышает пользователя до администратора"""
    clean_username = username.strip().lstrip('@').lower() if username else ""
    if not clean_username:
        return False
    await promote_to_admin(username=clean_username)
    return await add_allowed_user(clean_username, role='admin')


# add_allowed_user
def _sqlite_add_allowed_user(username: str, role: str = 'curator') -> bool:
    clean_username = username.strip().lstrip('@').lower()
    if not clean_username:
        return False
    with _get_sqlite_conn() as conn:
        conn.execute('''
            INSERT INTO allowed_users (username, role) VALUES (?, ?)
            ON CONFLICT(username) DO UPDATE SET role = excluded.role
        ''', (clean_username, role))
        conn.commit()
        return True


async def add_allowed_user(username: str, role: str = 'curator') -> bool:
    clean_username = username.strip().lstrip('@').lower()
    if not clean_username:
        return False
    if DB_TYPE == "sqlite":
        return await asyncio.to_thread(_sqlite_add_allowed_user, clean_username, role)

    async def _query(conn):
        await conn.execute('''
            INSERT INTO allowed_users (username, role) VALUES ($1, $2)
            ON CONFLICT (username) DO UPDATE SET role = EXCLUDED.role
        ''', clean_username, role)
        return True

    return await _execute_pg_query(_query)


# check_user_allowed
def _sqlite_check_user_allowed(username: str) -> bool:
    with _get_sqlite_conn() as conn:
        row = conn.execute("SELECT username FROM allowed_users WHERE LOWER(username) = ?", (username.lower(),)).fetchone()
        return row is not None


async def check_user_allowed(username: str) -> bool:
    """Проверяет, разрешен ли вход пользователю по username"""
    if not username:
        return False
    clean_username = username.strip().lstrip('@').lower()
    if clean_username in ADMIN_USERNAMES:
        return True

    if DB_TYPE == "sqlite":
        return await asyncio.to_thread(_sqlite_check_user_allowed, clean_username)

    async def _query(conn):
        allowed = await conn.fetchval("SELECT username FROM allowed_users WHERE LOWER(username) = $1", clean_username)
        return allowed is not None

    return await _execute_pg_query(_query)


# register_authorized_user
def _sqlite_register_authorized_user(telegram_id: int, username: str):
    clean_username = username.strip().lstrip('@').lower() if username else ""
    role = 'curator'
    with _get_sqlite_conn() as conn:
        # Check if already admin in authorized_users or ADMIN_USERNAMES or allowed_users
        if clean_username and clean_username in ADMIN_USERNAMES:
            role = 'admin'
        else:
            existing = conn.execute("SELECT role FROM authorized_users WHERE telegram_id = ? OR (username IS NOT NULL AND LOWER(username) = ?)", (telegram_id, clean_username)).fetchone()
            if existing and existing["role"] == 'admin':
                role = 'admin'
            elif clean_username:
                row = conn.execute("SELECT role FROM allowed_users WHERE LOWER(username) = ?", (clean_username,)).fetchone()
                if row and row["role"]:
                    role = row["role"]
        
        conn.execute('''
            INSERT INTO authorized_users (telegram_id, username, role) 
            VALUES (?, ?, ?)
            ON CONFLICT (telegram_id) 
            DO UPDATE SET username = excluded.username, role = excluded.role
        ''', (telegram_id, clean_username, role))
        
        if clean_username:
            conn.execute("DELETE FROM allowed_users WHERE LOWER(username) = ?", (clean_username,))
        conn.commit()


async def register_authorized_user(telegram_id: int, username: str):
    """Связывает telegram_id с ролью в базе авторизованных и удаляет из allowed_users"""
    clean_username = username.strip().lstrip('@').lower() if username else ""
    if DB_TYPE == "sqlite":
        return await asyncio.to_thread(_sqlite_register_authorized_user, telegram_id, clean_username)

    async def _query(conn):
        role = 'curator'
        if clean_username and clean_username in ADMIN_USERNAMES:
            role = 'admin'
        else:
            existing_role = await conn.fetchval("SELECT role FROM authorized_users WHERE telegram_id = $1 OR (username IS NOT NULL AND LOWER(username) = $2)", telegram_id, clean_username)
            if existing_role == 'admin':
                role = 'admin'
            elif clean_username:
                r = await conn.fetchval("SELECT role FROM allowed_users WHERE LOWER(username) = $1", clean_username)
                if r:
                    role = r

        await conn.execute('''
            INSERT INTO authorized_users (telegram_id, username, role) 
            VALUES ($1, $2, $3)
            ON CONFLICT (telegram_id) 
            DO UPDATE SET username = EXCLUDED.username, role = EXCLUDED.role
        ''', telegram_id, clean_username, role)

        if clean_username:
            await conn.execute("DELETE FROM allowed_users WHERE LOWER(username) = $1", clean_username)

    return await _execute_pg_query(_query)


# is_user_registered
def _sqlite_is_user_registered(telegram_id: int) -> bool:
    with _get_sqlite_conn() as conn:
        row = conn.execute("SELECT telegram_id FROM authorized_users WHERE telegram_id = ?", (telegram_id,)).fetchone()
        return row is not None


async def is_user_registered(telegram_id: int) -> bool:
    """Проверяет, авторизован ли пользователь по telegram_id"""
    if DB_TYPE == "sqlite":
        return await asyncio.to_thread(_sqlite_is_user_registered, telegram_id)

    async def _query(conn):
        result = await conn.fetchval("SELECT telegram_id FROM authorized_users WHERE telegram_id = $1", telegram_id)
        return result is not None

    return await _execute_pg_query(_query)


async def ensure_user_authorized(telegram_id: int, username: str = None) -> bool:
    if await is_user_registered(telegram_id):
        return True
    if username and await check_user_allowed(username):
        await register_authorized_user(telegram_id, username)
        return True
    return False


# delete_user
def _sqlite_delete_user(username: str) -> bool:
    clean_username = username.strip().lstrip('@').lower()
    if not clean_username:
        return False
    with _get_sqlite_conn() as conn:
        conn.execute("DELETE FROM allowed_users WHERE LOWER(username) = ?", (clean_username,))
        conn.commit()
        return True


async def delete_user(username: str) -> bool:
    clean_username = username.strip().lstrip('@').lower()
    if not clean_username:
        return False
    if DB_TYPE == "sqlite":
        return await asyncio.to_thread(_sqlite_delete_user, clean_username)

    async def _query(conn):
        await conn.execute("DELETE FROM allowed_users WHERE LOWER(username) = $1", clean_username)
        return True

    return await _execute_pg_query(_query)


# delete_authorized_user
def _sqlite_delete_authorized_user(telegram_id: int) -> bool:
    with _get_sqlite_conn() as conn:
        conn.execute("DELETE FROM authorized_users WHERE telegram_id = ?", (telegram_id,))
        conn.commit()
        return True


async def delete_authorized_user(telegram_id: int) -> bool:
    """Удаляет пользователя из авторизованных по telegram_id"""
    if DB_TYPE == "sqlite":
        return await asyncio.to_thread(_sqlite_delete_authorized_user, telegram_id)

    async def _query(conn):
        await conn.execute("DELETE FROM authorized_users WHERE telegram_id = $1", telegram_id)
        return True

    return await _execute_pg_query(_query)


# get_allowed_users
def _sqlite_get_allowed_users() -> list:
    with _get_sqlite_conn() as conn:
        rows = conn.execute("SELECT username FROM allowed_users WHERE role != 'admin' OR role IS NULL ORDER BY username").fetchall()
        return [row["username"] for row in rows]


async def get_allowed_users() -> list:
    """Возвращает список белого списка кураторов (ожидают авторизации)"""
    if DB_TYPE == "sqlite":
        return await asyncio.to_thread(_sqlite_get_allowed_users)

    async def _query(conn):
        rows = await conn.fetch("SELECT username FROM allowed_users WHERE role != 'admin' OR role IS NULL ORDER BY username")
        return [row["username"] for row in rows]

    return await _execute_pg_query(_query)


# get_authorized_users
def _sqlite_get_authorized_users() -> list:
    with _get_sqlite_conn() as conn:
        rows = conn.execute("SELECT telegram_id FROM authorized_users WHERE role != 'admin' OR role IS NULL ORDER BY id DESC").fetchall()
        return [row["telegram_id"] for row in rows if row["telegram_id"]]


async def get_authorized_users() -> list:
    """Возвращает список авторизованных кураторов"""
    if DB_TYPE == "sqlite":
        return await asyncio.to_thread(_sqlite_get_authorized_users)

    async def _query(conn):
        rows = await conn.fetch("SELECT telegram_id FROM authorized_users WHERE role != 'admin' OR role IS NULL ORDER BY ID DESC")
        return [row["telegram_id"] for row in rows if row["telegram_id"]]

    return await _execute_pg_query(_query)


# get_teachers / add_teacher
def _sqlite_get_teachers() -> list:
    with _get_sqlite_conn() as conn:
        rows = conn.execute("SELECT name FROM teachers ORDER BY name").fetchall()
        return [row["name"] for row in rows]


async def get_teachers() -> list:
    """Возвращает отсортированный список всех преподавателей"""
    if DB_TYPE == "sqlite":
        return await asyncio.to_thread(_sqlite_get_teachers)

    async def _query(conn):
        rows = await conn.fetch("SELECT name FROM teachers ORDER BY name")
        return [row["name"] for row in rows]

    return await _execute_pg_query(_query)


def _sqlite_add_teacher(name: str) -> bool:
    clean_name = name.strip()
    if not clean_name:
        return False
    with _get_sqlite_conn() as conn:
        conn.execute("INSERT OR IGNORE INTO teachers (name) VALUES (?)", (clean_name,))
        conn.commit()
        return True


async def add_teacher(name: str) -> bool:
    """Добавляет имя и фамилию преподавателя в базу данных"""
    clean_name = name.strip()
    if not clean_name:
        return False
    if DB_TYPE == "sqlite":
        return await asyncio.to_thread(_sqlite_add_teacher, clean_name)

    async def _query(conn):
        await conn.execute("INSERT INTO teachers (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", clean_name)
        return True

    return await _execute_pg_query(_query)


# get_existing_response
def _sqlite_get_existing_response(link: str) -> dict | None:
    if not link:
        return None
    clean_link = link.strip()
    record_id = extract_record_id(clean_link)
    with _get_sqlite_conn() as conn:
        row = conn.execute(
            "SELECT r.id, c.point, c.critical, c.comment, c.score_percent, r.link, t.name AS teacher "
            "FROM responses r "
            "JOIN ai_checks c ON (r.id = c.response_id OR (c.response_id IS NULL AND r.job_name = c.job_name)) "
            "LEFT JOIN teachers t ON r.teacher_id = t.id "
            "WHERE c.point >= 0 AND r.link = ? ORDER BY r.id DESC LIMIT 1",
            (clean_link,)
        ).fetchone()
        if not row and record_id:
            row = conn.execute(
                "SELECT r.id, c.point, c.critical, c.comment, c.score_percent, r.link, t.name AS teacher "
                "FROM responses r "
                "JOIN ai_checks c ON (r.id = c.response_id OR (c.response_id IS NULL AND r.job_name = c.job_name)) "
                "LEFT JOIN teachers t ON r.teacher_id = t.id "
                "WHERE c.point >= 0 AND r.link LIKE ? ORDER BY r.id DESC LIMIT 1",
                (f"%{record_id}%",)
            ).fetchone()

        if row:
            return dict(row)
        return None


async def get_existing_response(link: str) -> dict | None:
    """
    Проверяет, выполнялся ли ранее разбор лекции с таким кодом или ссылкой.
    Если найдется завершенная запись (point >= 0), возвращает словарь {point, critical, comment, score_percent, teacher}.
    """
    if not link:
        return None
    clean_link = link.strip()
    record_id = extract_record_id(clean_link)

    if DB_TYPE == "sqlite":
        return await asyncio.to_thread(_sqlite_get_existing_response, clean_link)

    async def _query(conn):
        row = await conn.fetchrow(
            "SELECT r.id, c.point, c.critical, c.comment, c.score_percent, r.link, t.name AS teacher "
            "FROM responses r "
            "JOIN ai_checks c ON (r.id = c.response_id OR (c.response_id IS NULL AND r.job_name = c.job_name)) "
            "LEFT JOIN teachers t ON r.teacher_id = t.id "
            "WHERE c.point >= 0 AND r.link = $1 ORDER BY r.id DESC LIMIT 1",
            clean_link
        )
        if not row and record_id:
            row = await conn.fetchrow(
                "SELECT r.id, c.point, c.critical, c.comment, c.score_percent, r.link, t.name AS teacher "
                "FROM responses r "
                "JOIN ai_checks c ON (r.id = c.response_id OR (c.response_id IS NULL AND r.job_name = c.job_name)) "
                "LEFT JOIN teachers t ON r.teacher_id = t.id "
                "WHERE c.point >= 0 AND r.link LIKE $1 ORDER BY r.id DESC LIMIT 1",
                f"%{record_id}%"
            )
        if row:
            return dict(row)
        return None

    return await _execute_pg_query(_query)


# write_result
def _sqlite_write_result(id: int, point: int, is_critical: bool, ai_comment: str, score_percent: float = None):
    with _get_sqlite_conn() as conn:
        row = conn.execute("SELECT job_name FROM responses WHERE id = ?", (id,)).fetchone()
        job_name = row["job_name"] if row else None
        if not job_name:
            job_name = f"no_job_{id}"
            conn.execute("UPDATE responses SET job_name = ? WHERE id = ?", (job_name, id))
        
        check_row = conn.execute("SELECT id FROM ai_checks WHERE response_id = ? OR job_name = ?", (id, job_name)).fetchone()
        if check_row:
            conn.execute(
                "UPDATE ai_checks SET response_id = ?, job_name = ?, point = ?, critical = ?, comment = ?, score_percent = ? WHERE id = ?",
                (id, job_name, point, 1 if is_critical else 0, ai_comment, score_percent, check_row["id"])
            )
        else:
            conn.execute(
                "INSERT INTO ai_checks (response_id, job_name, point, critical, comment, score_percent) VALUES (?, ?, ?, ?, ?, ?)",
                (id, job_name, point, 1 if is_critical else 0, ai_comment, score_percent)
            )
        conn.commit()


async def write_result(id: int, point: int, is_critical: bool, ai_comment: str, score_percent: float = None) -> None:
    if DB_TYPE == "sqlite":
        return await asyncio.to_thread(_sqlite_write_result, id, point, is_critical, ai_comment, score_percent)

    async def _query(conn):
        row = await conn.fetchrow("SELECT job_name FROM responses WHERE id = $1", id)
        job_name = row["job_name"] if row else None
        if not job_name:
            job_name = f"no_job_{id}"
            await conn.execute("UPDATE responses SET job_name = $1 WHERE id = $2", job_name, id)

        check_row = await conn.fetchrow("SELECT id FROM ai_checks WHERE response_id = $1 OR job_name = $2", id, job_name)
        if check_row:
            await conn.execute(
                "UPDATE ai_checks SET response_id = $1, job_name = $2, point = $3, critical = $4, comment = $5, score_percent = $6 WHERE id = $7",
                id, job_name, point, is_critical, ai_comment, score_percent, check_row["id"]
            )
        else:
            await conn.execute(
                "INSERT INTO ai_checks (response_id, job_name, point, critical, comment, score_percent) VALUES ($1, $2, $3, $4, $5, $6)",
                id, job_name, point, is_critical, ai_comment, score_percent
            )

    return await _execute_pg_query(_query)


# clear_all_responses
def _sqlite_clear_all_responses() -> int:
    with _get_sqlite_conn() as conn:
        conn.execute("DELETE FROM ai_checks")
        res = conn.execute("DELETE FROM responses")
        conn.commit()
        return res.rowcount


async def clear_all_responses() -> int:
    """Удаляет всю историю проверок лекций и результатов из базы данных."""
    if DB_TYPE == "sqlite":
        return await asyncio.to_thread(_sqlite_clear_all_responses)

    async def _query(conn):
        await conn.execute("DELETE FROM ai_checks")
        res = await conn.execute("DELETE FROM responses")
        return res

    return await _execute_pg_query(_query)


# write_response
def _sqlite_write_response(tg_id: int, link: str, additional_info: str, teacher: str = "") -> int:
    now = int(time.time())
    with _get_sqlite_conn() as conn:
        cursor = conn.cursor()
        teacher_id = None
        if teacher:
            t_row = conn.execute("SELECT id FROM teachers WHERE LOWER(name) = LOWER(?)", (teacher.strip(),)).fetchone()
            if t_row:
                teacher_id = t_row["id"]
        cursor.execute(
            "INSERT INTO responses (telegram_id, link, additional_info, teacher_id, created_at) VALUES (?, ?, ?, ?, ?)",
            (tg_id, link, additional_info, teacher_id, now)
        )
        conn.commit()
        return cursor.lastrowid


async def write_response(tg_id: int, link: str, additional_info: str, teacher: str = "") -> int:
    if DB_TYPE == "sqlite":
        return await asyncio.to_thread(_sqlite_write_response, tg_id, link, additional_info, teacher)

    async def _query(conn):
        now = int(time.time())
        teacher_id = None
        if teacher:
            t_row = await conn.fetchrow("SELECT id FROM teachers WHERE LOWER(name) = LOWER($1)", teacher.strip())
            if t_row:
                teacher_id = t_row["id"]
        response_id = await conn.fetchval(
            "INSERT INTO responses (telegram_id, link, additional_info, teacher_id, created_at) "
            "VALUES ($1, $2, $3, $4, $5) RETURNING ID",
            tg_id, link, additional_info, teacher_id, now
        )
        return response_id

    return await _execute_pg_query(_query)


# write_job_name
def _sqlite_write_job_name(id: int, job_name: str):
    with _get_sqlite_conn() as conn:
        conn.execute("UPDATE responses SET job_name = ? WHERE id = ?", (job_name, id))
        check_row = conn.execute("SELECT id FROM ai_checks WHERE response_id = ?", (id,)).fetchone()
        if check_row:
            conn.execute("UPDATE ai_checks SET job_name = ? WHERE id = ?", (job_name, check_row["id"]))
        else:
            conn.execute(
                "INSERT INTO ai_checks (response_id, job_name, point) VALUES (?, ?, -1)",
                (id, job_name)
            )
        conn.commit()


async def write_job_name(id: int, job_name: str) -> None:
    if DB_TYPE == "sqlite":
        return await asyncio.to_thread(_sqlite_write_job_name, id, job_name)

    async def _query(conn):
        await conn.execute("UPDATE responses SET job_name = $1 WHERE id = $2", job_name, id)
        check_row = await conn.fetchrow("SELECT id FROM ai_checks WHERE response_id = $1", id)
        if check_row:
            await conn.execute("UPDATE ai_checks SET job_name = $1 WHERE id = $2", job_name, check_row["id"])
        else:
            await conn.execute(
                "INSERT INTO ai_checks (response_id, job_name, point) VALUES ($1, $2, -1)",
                id, job_name
            )

    return await _execute_pg_query(_query)


# get_jobs
def _sqlite_get_jobs() -> list:
    with _get_sqlite_conn() as conn:
        rows = conn.execute(
            "SELECT r.id, r.telegram_id, r.job_name, r.link, r.additional_info, t.name AS teacher "
            "FROM responses r "
            "JOIN ai_checks c ON (r.id = c.response_id OR (c.response_id IS NULL AND r.job_name = c.job_name)) "
            "LEFT JOIN teachers t ON r.teacher_id = t.id "
            "WHERE c.point = -1 ORDER BY r.id ASC"
        ).fetchall()
        return [dict(row) for row in rows]


async def get_jobs() -> list:
    if DB_TYPE == "sqlite":
        return await asyncio.to_thread(_sqlite_get_jobs)

    async def _query(conn):
        rows = await conn.fetch(
            "SELECT r.id, r.telegram_id, r.job_name, r.link, r.additional_info, t.name AS teacher "
            "FROM responses r "
            "JOIN ai_checks c ON (r.id = c.response_id OR (c.response_id IS NULL AND r.job_name = c.job_name)) "
            "LEFT JOIN teachers t ON r.teacher_id = t.id "
            "WHERE c.point = -1 ORDER BY r.id ASC"
        )
        return [dict(row) for row in rows]

    return await _execute_pg_query(_query)


# get_responses_by_teacher
def _sqlite_get_responses_by_teacher(teacher_name: str) -> list:
    with _get_sqlite_conn() as conn:
        clean = teacher_name.strip()
        rows = conn.execute(
            "SELECT r.id, r.telegram_id, r.link, r.additional_info, c.point, c.critical, c.comment, t.name AS teacher "
            "FROM responses r "
            "JOIN ai_checks c ON (r.id = c.response_id OR (c.response_id IS NULL AND r.job_name = c.job_name)) "
            "JOIN teachers t ON r.teacher_id = t.id "
            "WHERE (t.name = ? OR LOWER(t.name) = LOWER(?)) AND c.point >= 0 ORDER BY r.id DESC",
            (clean, clean)
        ).fetchall()
        return [dict(row) for row in rows]


async def get_responses_by_teacher(teacher_name: str) -> list:
    if DB_TYPE == "sqlite":
        return await asyncio.to_thread(_sqlite_get_responses_by_teacher, teacher_name)

    async def _query(conn):
        rows = await conn.fetch(
            "SELECT r.id, r.telegram_id, r.link, r.additional_info, c.point, c.critical, c.comment, t.name AS teacher "
            "FROM responses r "
            "JOIN ai_checks c ON (r.id = c.response_id OR (c.response_id IS NULL AND r.job_name = c.job_name)) "
            "JOIN teachers t ON r.teacher_id = t.id "
            "WHERE LOWER(t.name) = LOWER($1) AND c.point >= 0 ORDER BY r.id DESC",
            teacher_name.strip().lower()
        )
        return [dict(row) for row in rows]

    return await _execute_pg_query(_query)


def _generate_signed_stats_token(teacher_name: str, now: int) -> str:
    prefix = hashlib.sha256(teacher_name.strip().lower().encode("utf-8")).hexdigest()[:8]
    ts_hex = hex(now)[2:]
    rnd_hex = uuid.uuid4().hex[:8]
    msg = f"st:{prefix}:{ts_hex}:{rnd_hex}"
    sig = hmac.new(TOKEN_SECRET.encode(), msg.encode(), hashlib.sha256).hexdigest()[:16]
    return f"st_{prefix}_{ts_hex}_{rnd_hex}_{sig}"


def _generate_signed_admin_token(now: int) -> str:
    ts_hex = hex(now)[2:]
    rnd_hex = uuid.uuid4().hex[:8]
    msg = f"adm:{ts_hex}:{rnd_hex}"
    sig = hmac.new(TOKEN_SECRET.encode(), msg.encode(), hashlib.sha256).hexdigest()[:16]
    return f"adm_{ts_hex}_{rnd_hex}_{sig}"


# create_stats_token
def _sqlite_create_stats_token(teacher_name: str, telegram_id: int) -> str:
    now = int(time.time())
    expires_at = now + 10800  # Срок действия ссылки — 3 часа
    purge_threshold = now - 172800  # Удаляем записи старше 2 суток
    with _get_sqlite_conn() as conn:
        conn.execute("DELETE FROM stats_tokens WHERE created_at < ?", (purge_threshold,))

        # Находим ID преподавателя
        row = conn.execute("SELECT id FROM teachers WHERE LOWER(name) = LOWER(?)", (teacher_name.strip(),)).fetchone()
        if not row:
            cursor = conn.execute("INSERT OR IGNORE INTO teachers (name) VALUES (?)", (teacher_name.strip(),))
            teacher_id = cursor.lastrowid
            if not teacher_id:
                row_new = conn.execute("SELECT id FROM teachers WHERE LOWER(name) = LOWER(?)", (teacher_name.strip(),)).fetchone()
                teacher_id = row_new["id"] if row_new else None
        else:
            teacher_id = row["id"]

        if not teacher_id:
            raise ValueError(f"Teacher {teacher_name} not found and could not be created")

        token_str = _generate_signed_stats_token(teacher_name, now)

        conn.execute(
            "INSERT INTO stats_tokens (token, teacher_id, created_at, expires_at, created_by) VALUES (?, ?, ?, ?, ?)",
            (token_str, teacher_id, now, expires_at, telegram_id)
        )
        conn.commit()
    return token_str


async def create_stats_token(teacher_name: str, telegram_id: int = 0) -> str:
    if DB_TYPE == "sqlite":
        return await asyncio.to_thread(_sqlite_create_stats_token, teacher_name, telegram_id)

    async def _query(conn):
        now = int(time.time())
        expires_at = now + 10800  # Срок действия ссылки — 3 часа
        purge_threshold = now - 172800
        await conn.execute("DELETE FROM stats_tokens WHERE created_at < $1", purge_threshold)

        # Находим ID преподавателя
        row = await conn.fetchrow("SELECT id FROM teachers WHERE LOWER(name) = LOWER($1)", teacher_name.strip())
        if not row:
            teacher_id = await conn.fetchval(
                "INSERT INTO teachers (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id",
                teacher_name.strip()
            )
        else:
            teacher_id = row["id"]

        token_str = _generate_signed_stats_token(teacher_name, now)

        await conn.execute(
            "INSERT INTO stats_tokens (token, teacher_id, created_at, expires_at, created_by) VALUES ($1, $2, $3, $4, $5)",
            token_str, teacher_id, now, expires_at, telegram_id
        )
        return token_str

    return await _execute_pg_query(_query)


# get_and_consume_stats_token
def _sqlite_get_and_consume_stats_token(token: str) -> dict:
    now = int(time.time())
    purge_threshold = now - 172800
    with _get_sqlite_conn() as conn:
        conn.execute("DELETE FROM stats_tokens WHERE created_at < ?", (purge_threshold,))
        conn.commit()

        row = conn.execute(
            "SELECT s.*, t.name AS teacher_name "
            "FROM stats_tokens s "
            "JOIN teachers t ON s.teacher_id = t.id "
            "WHERE s.token = ?",
            (token,)
        ).fetchone()

        if row:
            row = dict(row)
            if row.get("expires_at") and row["expires_at"] < now:
                return {"status": "expired", "message": "Срок действия ссылки истек (ссылка действительна 3 часа). Запросите новую ссылку в боте."}

            if row.get("used_at") is None:
                conn.execute("UPDATE stats_tokens SET used_at = ? WHERE token = ?", (now, token))
                conn.commit()

            teacher_name = row["teacher_name"]
            teacher_id = row["teacher_id"]
        else:
            # Если токен не найден в локальной таблице (например, сформирован другим инстансом)
            # Проверяем криптографическую подпись
            if not token.startswith("st_"):
                return {"status": "not_found", "message": "Ссылка не найдена или недействительна."}
            parts = token.split("_")
            if len(parts) != 5:
                return {"status": "not_found", "message": "Некорректный формат токена ссылки."}
            prefix, ts_hex, rnd_hex, sig = parts[1], parts[2], parts[3], parts[4]
            msg = f"st:{prefix}:{ts_hex}:{rnd_hex}"
            expected_sig = hmac.new(TOKEN_SECRET.encode(), msg.encode(), hashlib.sha256).hexdigest()[:16]
            if not hmac.compare_digest(sig, expected_sig):
                return {"status": "not_found", "message": "Недействительная криптографическая подпись токена."}
            try:
                token_time = int(ts_hex, 16)
            except ValueError:
                return {"status": "not_found", "message": "Некорректная временная метка токена."}
            if now - token_time > 10800:
                return {"status": "expired", "message": "Срок действия ссылки истек (ссылка действительна 3 часа). Запросите новую ссылку в боте."}

            # Ищем преподавателя по хэш-префиксу
            teachers = conn.execute("SELECT id, name FROM teachers").fetchall()
            matched_teacher = None
            for t in teachers:
                if hashlib.sha256(t["name"].strip().lower().encode("utf-8")).hexdigest()[:8] == prefix:
                    matched_teacher = dict(t)
                    break
            if not matched_teacher:
                return {"status": "not_found", "message": "Преподаватель не найден в базе данных."}

            teacher_id = matched_teacher["id"]
            teacher_name = matched_teacher["name"]
            # Фиксируем использование токена
            conn.execute(
                "INSERT OR REPLACE INTO stats_tokens (token, teacher_id, created_at, expires_at, used_at, created_by) VALUES (?, ?, ?, ?, ?, ?)",
                (token, teacher_id, token_time, token_time + 10800, now, 0)
            )
            conn.commit()

        rows = conn.execute(
            "SELECT r.id, r.telegram_id, r.link, r.additional_info, c.point, c.critical, c.comment, c.score_percent, t.name AS teacher "
            "FROM responses r "
            "JOIN ai_checks c ON (r.id = c.response_id OR (c.response_id IS NULL AND r.job_name = c.job_name)) "
            "JOIN teachers t ON r.teacher_id = t.id "
            "WHERE r.teacher_id = ? AND c.point >= 0 ORDER BY r.id DESC",
            (teacher_id,)
        ).fetchall()
        responses = [dict(r) for r in rows]

        return {
            "status": "ok",
            "teacher_name": teacher_name,
            "responses": responses,
            "consumed_at": now
        }


async def get_and_consume_stats_token(token: str) -> dict:
    if DB_TYPE == "sqlite":
        return await asyncio.to_thread(_sqlite_get_and_consume_stats_token, token)

    async def _query(conn):
        now = int(time.time())
        purge_threshold = now - 172800  # 2 суток
        await conn.execute("DELETE FROM stats_tokens WHERE created_at < $1", purge_threshold)

        row = await conn.fetchrow(
            "SELECT s.*, t.name AS teacher_name "
            "FROM stats_tokens s "
            "JOIN teachers t ON s.teacher_id = t.ID "
            "WHERE s.token = $1",
            token
        )
        if row:
            row = dict(row)
            if row.get("expires_at") and row["expires_at"] < now:
                return {"status": "expired", "message": "Срок действия ссылки истек (ссылка действительна 3 часа). Запросите новую ссылку в боте."}

            if row.get("used_at") is None:
                await conn.execute("UPDATE stats_tokens SET used_at = $1 WHERE token = $2", now, token)

            teacher_name = row["teacher_name"]
            teacher_id = row["teacher_id"]
        else:
            if not token.startswith("st_"):
                return {"status": "not_found", "message": "Ссылка не найдена или недействительна."}
            parts = token.split("_")
            if len(parts) != 5:
                return {"status": "not_found", "message": "Некорректный формат токена ссылки."}
            prefix, ts_hex, rnd_hex, sig = parts[1], parts[2], parts[3], parts[4]
            msg = f"st:{prefix}:{ts_hex}:{rnd_hex}"
            expected_sig = hmac.new(TOKEN_SECRET.encode(), msg.encode(), hashlib.sha256).hexdigest()[:16]
            if not hmac.compare_digest(sig, expected_sig):
                return {"status": "not_found", "message": "Недействительная подпись токена."}
            try:
                token_time = int(ts_hex, 16)
            except ValueError:
                return {"status": "not_found", "message": "Некорректная временная метка токена."}
            if now - token_time > 10800:
                return {"status": "expired", "message": "Срок действия ссылки истек (ссылка действительна 3 часа). Запросите новую ссылку в боте."}

            teachers = await conn.fetch("SELECT id, name FROM teachers")
            matched_teacher = None
            for t in teachers:
                if hashlib.sha256(t["name"].strip().lower().encode("utf-8")).hexdigest()[:8] == prefix:
                    matched_teacher = dict(t)
                    break
            if not matched_teacher:
                return {"status": "not_found", "message": "Преподаватель не найден в базе данных."}

            teacher_id = matched_teacher["id"]
            teacher_name = matched_teacher["name"]
            await conn.execute(
                "INSERT INTO stats_tokens (token, teacher_id, created_at, expires_at, used_at, created_by) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (token) DO UPDATE SET used_at = EXCLUDED.used_at",
                token, teacher_id, token_time, token_time + 10800, now, 0
            )

        rows = await conn.fetch(
            "SELECT r.id, r.telegram_id, r.link, r.additional_info, c.point, c.critical, c.comment, c.score_percent, t.name AS teacher "
            "FROM responses r "
            "JOIN ai_checks c ON (r.id = c.response_id OR (c.response_id IS NULL AND r.job_name = c.job_name)) "
            "JOIN teachers t ON r.teacher_id = t.id "
            "WHERE r.teacher_id = $1 AND c.point >= 0 ORDER BY r.id DESC",
            teacher_id
        )
        responses = [dict(r) for r in rows]

        return {
            "status": "ok",
            "teacher_name": teacher_name,
            "responses": responses,
            "consumed_at": now
        }

    return await _execute_pg_query(_query)


# create_admin_responses_token
def _sqlite_create_admin_responses_token(telegram_id: int) -> str:
    now = int(time.time())
    expires_at = now + 10800  # 3 часа
    purge_threshold = now - 172800
    with _get_sqlite_conn() as conn:
        conn.execute("DELETE FROM admin_tokens WHERE created_at < ?", (purge_threshold,))
        token_str = _generate_signed_admin_token(now)
        conn.execute(
            "INSERT INTO admin_tokens (token, created_at, expires_at, created_by) VALUES (?, ?, ?, ?)",
            (token_str, now, expires_at, telegram_id)
        )
        conn.commit()
    return token_str


async def create_admin_responses_token(telegram_id: int = 0) -> str:
    if DB_TYPE == "sqlite":
        return await asyncio.to_thread(_sqlite_create_admin_responses_token, telegram_id)

    async def _query(conn):
        now = int(time.time())
        expires_at = now + 10800  # 3 часа
        purge_threshold = now - 172800
        await conn.execute("DELETE FROM admin_tokens WHERE created_at < $1", purge_threshold)
        token_str = _generate_signed_admin_token(now)
        await conn.execute(
            "INSERT INTO admin_tokens (token, created_at, expires_at, created_by) VALUES ($1, $2, $3, $4)",
            token_str, now, expires_at, telegram_id
        )
        return token_str

    return await _execute_pg_query(_query)


# get_and_consume_admin_responses_token
def _sqlite_get_and_consume_admin_responses_token(token: str) -> dict:
    now = int(time.time())
    purge_threshold = now - 172800
    with _get_sqlite_conn() as conn:
        conn.execute("DELETE FROM admin_tokens WHERE created_at < ?", (purge_threshold,))
        conn.commit()

        row = conn.execute("SELECT * FROM admin_tokens WHERE token = ?", (token,)).fetchone()
        if row:
            row = dict(row)
            if row.get("expires_at") and row["expires_at"] < now:
                return {"status": "expired", "message": "Срок действия ссылки истек (ссылка действительна 3 часа). Запросите новую ссылку в боте."}

            if row.get("used_at") is None:
                conn.execute("UPDATE admin_tokens SET used_at = ? WHERE token = ?", (now, token))
                conn.commit()
        else:
            # Проверяем криптографическую подпись токена
            if not token.startswith("adm_"):
                return {"status": "not_found", "message": "Администраторская ссылка не найдена или недействительна."}
            parts = token.split("_")
            if len(parts) != 4:
                return {"status": "not_found", "message": "Некорректный формат токена администратора."}
            ts_hex, rnd_hex, sig = parts[1], parts[2], parts[3]
            msg = f"adm:{ts_hex}:{rnd_hex}"
            expected_sig = hmac.new(TOKEN_SECRET.encode(), msg.encode(), hashlib.sha256).hexdigest()[:16]
            if not hmac.compare_digest(sig, expected_sig):
                return {"status": "not_found", "message": "Недействительная подпись токена администратора."}
            try:
                token_time = int(ts_hex, 16)
            except ValueError:
                return {"status": "not_found", "message": "Некорректное время токена."}
            if now - token_time > 10800:
                return {"status": "expired", "message": "Срок действия ссылки истек (ссылка действительна 3 часа). Запросите новую ссылку в боте."}

            conn.execute(
                "INSERT OR REPLACE INTO admin_tokens (token, created_at, expires_at, used_at, created_by) VALUES (?, ?, ?, ?, ?)",
                (token, token_time, token_time + 10800, now, 0)
            )
            conn.commit()

        rows = conn.execute(
            "SELECT r.id, r.telegram_id, r.link, r.additional_info, r.job_name, r.created_at, "
            "t.name AS teacher, c.point, c.critical, c.comment, c.score_percent "
            "FROM responses r "
            "LEFT JOIN teachers t ON r.teacher_id = t.id "
            "LEFT JOIN ai_checks c ON (r.id = c.response_id OR (c.response_id IS NULL AND r.job_name = c.job_name)) "
            "ORDER BY r.id DESC"
        ).fetchall()
        responses = [dict(r) for r in rows]

        return {
            "status": "ok",
            "responses": responses,
            "consumed_at": now
        }


async def get_and_consume_admin_responses_token(token: str) -> dict:
    if DB_TYPE == "sqlite":
        return await asyncio.to_thread(_sqlite_get_and_consume_admin_responses_token, token)

    async def _query(conn):
        now = int(time.time())
        purge_threshold = now - 172800
        await conn.execute("DELETE FROM admin_tokens WHERE created_at < $1", purge_threshold)

        row = await conn.fetchrow("SELECT * FROM admin_tokens WHERE token = $1", token)
        if row:
            row = dict(row)
            if row.get("expires_at") and row["expires_at"] < now:
                return {"status": "expired", "message": "Срок действия ссылки истек (ссылка действительна 3 часа). Запросите новую ссылку в боте."}

            if row.get("used_at") is None:
                await conn.execute("UPDATE admin_tokens SET used_at = $1 WHERE token = $2", now, token)
        else:
            if not token.startswith("adm_"):
                return {"status": "not_found", "message": "Администраторская ссылка не найдена или недействительна."}
            parts = token.split("_")
            if len(parts) != 4:
                return {"status": "not_found", "message": "Некорректный формат токена администратора."}
            ts_hex, rnd_hex, sig = parts[1], parts[2], parts[3]
            msg = f"adm:{ts_hex}:{rnd_hex}"
            expected_sig = hmac.new(TOKEN_SECRET.encode(), msg.encode(), hashlib.sha256).hexdigest()[:16]
            if not hmac.compare_digest(sig, expected_sig):
                return {"status": "not_found", "message": "Недействительная подпись токена администратора."}
            try:
                token_time = int(ts_hex, 16)
            except ValueError:
                return {"status": "not_found", "message": "Некорректное время токена."}
            if now - token_time > 10800:
                return {"status": "expired", "message": "Срок действия ссылки истек (ссылка действительна 3 часа). Запросите новую ссылку в боте."}

            await conn.execute(
                "INSERT INTO admin_tokens (token, created_at, expires_at, used_at, created_by) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (token) DO UPDATE SET used_at = EXCLUDED.used_at",
                token, token_time, token_time + 10800, now, 0
            )

        rows = await conn.fetch(
            "SELECT r.id, r.telegram_id, r.link, r.additional_info, r.job_name, r.created_at, "
            "t.name AS teacher, c.point, c.critical, c.comment, c.score_percent "
            "FROM responses r "
            "LEFT JOIN teachers t ON r.teacher_id = t.ID "
            "LEFT JOIN ai_checks c ON (r.id = c.response_id OR (c.response_id IS NULL AND r.job_name = c.job_name)) "
            "ORDER BY r.id DESC"
        )
        responses = [dict(r) for r in rows]

        return {
            "status": "ok",
            "responses": responses,
            "consumed_at": now
        }

    return await _execute_pg_query(_query)


async def get_setting(key: str, default: Optional[str] = None) -> Optional[str]:
    """Получает сохраненную настройку из БД."""
    if DB_TYPE == "sqlite":
        def _get():
            with _get_sqlite_conn() as conn:
                cursor = conn.cursor()
                cursor.execute("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
                cursor.execute("SELECT value FROM app_settings WHERE key = ?", (key,))
                row = cursor.fetchone()
                return row[0] if row else default
        return await asyncio.to_thread(_get)
    else:
        async def _query(conn):
            await conn.execute("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            row = await conn.fetchrow("SELECT value FROM app_settings WHERE key = $1", key)
            return row["value"] if row else default
        return await _execute_pg_query(_query)


async def set_setting(key: str, value: str) -> None:
    """Сохраняет настройку в БД."""
    if DB_TYPE == "sqlite":
        def _set():
            with _get_sqlite_conn() as conn:
                cursor = conn.cursor()
                cursor.execute("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
                cursor.execute(
                    "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    (key, value)
                )
                conn.commit()
        await asyncio.to_thread(_set)
    else:
        async def _query(conn):
            await conn.execute("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            await conn.execute(
                "INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value",
                key, value
            )
        await _execute_pg_query(_query)


# --- Управление Системным Промптом ИИ и Аудит --- #

def is_prompt_admin(username: str) -> bool:
    """Проверяет, разрешен ли доступ к редактированию промпта по переменной PROMPT_ADMIN_USERNAMES."""
    if not username:
        return False
    clean = username.strip().strip("[]'\"").lstrip('@').lower()
    return clean in PROMPT_ADMIN_USERNAMES


def _sqlite_get_telegram_id_by_username(username: str) -> Optional[int]:
    clean = username.strip().lstrip('@').lower()
    with _get_sqlite_conn() as conn:
        row = conn.execute("SELECT telegram_id FROM authorized_users WHERE LOWER(username) = ?", (clean,)).fetchone()
        if row and row["telegram_id"]:
            return int(row["telegram_id"])
        row2 = conn.execute(
            "SELECT telegram_id FROM responses WHERE LOWER(username) = ? AND telegram_id IS NOT NULL ORDER BY id DESC LIMIT 1",
            (clean,)
        ).fetchone()
        if row2 and row2["telegram_id"]:
            return int(row2["telegram_id"])
    return None


async def get_telegram_id_by_username(username: str) -> Optional[int]:
    clean = username.strip().lstrip('@').lower()
    if DB_TYPE == "sqlite":
        return await asyncio.to_thread(_sqlite_get_telegram_id_by_username, clean)
    async def _query(conn):
        row = await conn.fetchrow("SELECT telegram_id FROM authorized_users WHERE LOWER(username) = $1", clean)
        if row and row["telegram_id"]:
            return int(row["telegram_id"])
        row2 = await conn.fetchrow(
            "SELECT telegram_id FROM responses WHERE LOWER(username) = $1 AND telegram_id IS NOT NULL ORDER BY ID DESC LIMIT 1",
            clean
        )
        if row2 and row2["telegram_id"]:
            return int(row2["telegram_id"])
        return None
    return await _execute_pg_query(_query)


def _sqlite_create_prompt_code(username: str, telegram_id: int, purpose: str = "login") -> str:
    clean = username.strip().lstrip('@').lower()
    import secrets
    code = f"{secrets.randbelow(900000) + 100000:06d}"
    now = int(time.time())
    expires_at = now + 300  # 5 минут
    with _get_sqlite_conn() as conn:
        conn.execute("UPDATE prompt_codes SET used = 1 WHERE LOWER(username) = ? AND purpose = ?", (clean, purpose))
        conn.execute(
            "INSERT INTO prompt_codes (code, username, telegram_id, purpose, created_at, expires_at, used) VALUES (?, ?, ?, ?, ?, ?, 0)",
            (code, clean, telegram_id, purpose, now, expires_at)
        )
        conn.commit()
    return code


async def create_prompt_code(username: str, telegram_id: int, purpose: str = "login") -> str:
    clean = username.strip().lstrip('@').lower()
    if DB_TYPE == "sqlite":
        return await asyncio.to_thread(_sqlite_create_prompt_code, clean, telegram_id, purpose)
    async def _query(conn):
        import secrets
        code = f"{secrets.randbelow(900000) + 100000:06d}"
        now = int(time.time())
        expires_at = now + 300
        await conn.execute("UPDATE prompt_codes SET used = 1 WHERE LOWER(username) = $1 AND purpose = $2", clean, purpose)
        await conn.execute(
            "INSERT INTO prompt_codes (code, username, telegram_id, purpose, created_at, expires_at, used) VALUES ($1, $2, $3, $4, $5, $6, 0)",
            code, clean, telegram_id, purpose, now, expires_at
        )
        return code
    return await _execute_pg_query(_query)


def _sqlite_verify_prompt_code(username: str, code: str, purpose: str = "login") -> bool:
    clean = username.strip().lstrip('@').lower()
    clean_code = code.strip()
    now = int(time.time())
    with _get_sqlite_conn() as conn:
        row = conn.execute(
            "SELECT id, expires_at FROM prompt_codes WHERE LOWER(username) = ? AND code = ? AND purpose = ? AND used = 0 ORDER BY id DESC LIMIT 1",
            (clean, clean_code, purpose)
        ).fetchone()
        if not row:
            return False
        if row["expires_at"] < now:
            conn.execute("UPDATE prompt_codes SET used = 1 WHERE id = ?", (row["id"],))
            conn.commit()
            return False
        conn.execute("UPDATE prompt_codes SET used = 1 WHERE id = ?", (row["id"],))
        conn.commit()
        return True


async def verify_prompt_code(username: str, code: str, purpose: str = "login") -> bool:
    clean = username.strip().lstrip('@').lower()
    clean_code = code.strip()
    if DB_TYPE == "sqlite":
        return await asyncio.to_thread(_sqlite_verify_prompt_code, clean, clean_code, purpose)
    async def _query(conn):
        now = int(time.time())
        row = await conn.fetchrow(
            "SELECT id, expires_at FROM prompt_codes WHERE LOWER(username) = $1 AND code = $2 AND purpose = $3 AND used = 0 ORDER BY id DESC LIMIT 1",
            clean, clean_code, purpose
        )
        if not row:
            return False
        if row["expires_at"] < now:
            await conn.execute("UPDATE prompt_codes SET used = 1 WHERE id = $1", row["id"])
            return False
        await conn.execute("UPDATE prompt_codes SET used = 1 WHERE id = $1", row["id"])
        return True
    return await _execute_pg_query(_query)


def _sqlite_set_prompt_config(key: str, prompt_text: str, updated_by: str) -> bool:
    now = int(time.time())
    with _get_sqlite_conn() as conn:
        conn.execute(
            "INSERT INTO prompt_configs (key, prompt_text, updated_at, updated_by) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(key) DO UPDATE SET prompt_text = excluded.prompt_text, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
            (key, prompt_text, now, updated_by)
        )
        conn.commit()
        try:
            os.makedirs(os.path.join(os.getcwd(), "data"), exist_ok=True)
            fname = os.path.join(os.getcwd(), "data", f"system_prompt_{key}.txt")
            with open(fname, "w", encoding="utf-8") as f:
                f.write(prompt_text)
        except Exception as e:
            logger.warning(f"Не удалось синхронизировать файл data/system_prompt_{key}.txt: {e}")
        return True


async def set_prompt_config(key: str, prompt_text: str, updated_by: str) -> bool:
    if DB_TYPE == "sqlite":
        return await asyncio.to_thread(_sqlite_set_prompt_config, key, prompt_text, updated_by)
    async def _query(conn):
        now = int(time.time())
        await conn.execute(
            "INSERT INTO prompt_configs (key, prompt_text, updated_at, updated_by) VALUES ($1, $2, $3, $4) "
            "ON CONFLICT(key) DO UPDATE SET prompt_text = EXCLUDED.prompt_text, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by",
            key, prompt_text, now, updated_by
        )
        try:
            os.makedirs(os.path.join(os.getcwd(), "data"), exist_ok=True)
            fname = os.path.join(os.getcwd(), "data", f"system_prompt_{key}.txt")
            with open(fname, "w", encoding="utf-8") as f:
                f.write(prompt_text)
        except Exception as e:
            logger.warning(f"Не удалось синхронизировать файл data/system_prompt_{key}.txt: {e}")
        return True
    return await _execute_pg_query(_query)


def _sqlite_get_prompt_config(key: str) -> Optional[dict]:
    with _get_sqlite_conn() as conn:
        row = conn.execute("SELECT key, prompt_text, updated_at, updated_by FROM prompt_configs WHERE key = ?", (key,)).fetchone()
        return dict(row) if row else None


async def get_prompt_config(key: str) -> Optional[dict]:
    if DB_TYPE == "sqlite":
        return await asyncio.to_thread(_sqlite_get_prompt_config, key)
    async def _query(conn):
        row = await conn.fetchrow("SELECT key, prompt_text, updated_at, updated_by FROM prompt_configs WHERE key = $1", key)
        return dict(row) if row else None
    return await _execute_pg_query(_query)


def _sqlite_log_prompt_audit(username: str, action: str, telegram_id: Optional[int] = None, ip_address: Optional[str] = None, details: Optional[str] = None):
    now = int(time.time())
    with _get_sqlite_conn() as conn:
        conn.execute(
            "INSERT INTO prompt_audit_log (timestamp, username, telegram_id, action, ip_address, details) VALUES (?, ?, ?, ?, ?, ?)",
            (now, username, telegram_id, action, ip_address, details)
        )
        conn.commit()


async def log_prompt_audit(username: str, action: str, telegram_id: Optional[int] = None, ip_address: Optional[str] = None, details: Optional[str] = None):
    if DB_TYPE == "sqlite":
        return await asyncio.to_thread(_sqlite_log_prompt_audit, username, action, telegram_id, ip_address, details)
    async def _query(conn):
        now = int(time.time())
        await conn.execute(
            "INSERT INTO prompt_audit_log (timestamp, username, telegram_id, action, ip_address, details) VALUES ($1, $2, $3, $4, $5, $6)",
            now, username, telegram_id, action, ip_address, details
        )
    return await _execute_pg_query(_query)


def _sqlite_get_prompt_audit_history(limit: int = 50) -> list[dict]:
    with _get_sqlite_conn() as conn:
        rows = conn.execute("SELECT * FROM prompt_audit_log ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        return [dict(r) for r in rows]


async def get_prompt_audit_history(limit: int = 50) -> list[dict]:
    if DB_TYPE == "sqlite":
        return await asyncio.to_thread(_sqlite_get_prompt_audit_history, limit)
    async def _query(conn):
        rows = await conn.fetch("SELECT * FROM prompt_audit_log ORDER BY id DESC LIMIT $1", limit)
        return [dict(r) for r in rows]
    return await _execute_pg_query(_query)





