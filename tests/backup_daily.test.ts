import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'zlib';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');

describe('Ежесуточные бэкапы Docker, БД и конфигурация CI', () => {
  let tempDir: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'olymp_backup_test_'));
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('1. createDailyFullBackup создаёт и верифицирует сжатый снимок БД + копию SQLite и чистит старые архивы (>14 дней)', async () => {
    const appDataDir = path.join(tempDir, 'app_data');
    const customBackupDir = path.join(appDataDir, 'backups');
    fs.mkdirSync(customBackupDir, { recursive: true });

    // Создаём устаревший архив (30 дней назад), который должен удалиться ротацией
    const staleSnapshot = path.join(customBackupDir, 'daily_snapshot_2020-01-01.json.gz');
    fs.writeFileSync(staleSnapshot, zlib.gzipSync(Buffer.from('{}')));
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    fs.utimesSync(staleSnapshot, thirtyDaysAgo, thirtyDaysAgo);

    process.env.APP_DATA_DIR = appDataDir;
    process.env.DB_TYPE = 'sqlite';

    const dbMod = await import('../db');
    await dbMod.initDatabase();

    await dbMod.insertLectureTask({
      id: 'lec_backup_test_1',
      lectureUrl: 'https://olymp.ktalk.ru/recordings/backup_1',
      teacherName: 'Мария Соколова',
      subject: 'Олимпиадная физика',
      groupName: '10 класс',
      date: '2026-11-18 19:00',
      totalScore: 94,
      criticalViolations: [],
      positiveHighlights: ['Чёткое объяснение'],
      recommendations: [],
      criteria: [{ id: 1, text: 'К1', passed: true, score: 5, penaltyScore: 0 }],
      status: 'completed',
      progressPct: 100,
      curatorEmail: 'shurygin.egor2009@gmail.com',
      createdAt: new Date().toISOString(),
      applicableCount: 1,
      earnedPoints: 5,
      maxPoints: 5
    });

    await dbMod.saveAISettingsInDB({ maxRequestTokens: 100000, reservedOutputTokens: 8192, enableModelRotation: true }, 'test');

    const res = await dbMod.createDailyFullBackup(customBackupDir, 14);
    assert.equal(res.verified, true);
    assert.ok(res.snapshotPath && fs.existsSync(res.snapshotPath), 'Должен существовать файл daily_snapshot_*.json.gz');
    assert.ok(res.sqliteBackupPath && fs.existsSync(res.sqliteBackupPath), 'Должен существовать файл app_database_*.sqlite.gz');

    // Проверяем содержимое распакованного снимка
    const unpackedJson = JSON.parse(zlib.gunzipSync(fs.readFileSync(res.snapshotPath)).toString('utf-8'));
    assert.equal(unpackedJson.version, 1);
    assert.ok(unpackedJson.curators.length >= 1);
    assert.equal(unpackedJson.lectureTasks.length, 1);
    assert.equal(unpackedJson.lectureTasks[0].teacherName, 'Мария Соколова');
    assert.equal(unpackedJson.criteriaConfigs?.ai_settings?.maxRequestTokens, 100000);

    // Проверяем, что gzip-копия SQLite не пустая и содержит заголовок SQLite format 3
    const unpackedSqlite = zlib.gunzipSync(fs.readFileSync(res.sqliteBackupPath));
    assert.ok(unpackedSqlite.subarray(0, 15).toString('utf-8').startsWith('SQLite format 3'));

    // Проверяем ротацию: старый архив удалён, сегодняшний сохранён
    assert.equal(fs.existsSync(staleSnapshot), false, 'Устаревший бэкап должен быть удалён');
    assert.equal(fs.existsSync(res.snapshotPath), true);
  });

  it('2. scripts/docker_daily_backup.sh создаёт валидный дамп PostgreSQL, проверяет gzip -t, чистит старые файлы и не затирает рабочий бэкап при сбое', () => {
    const scriptPath = path.join(ROOT_DIR, 'scripts', 'docker_daily_backup.sh');
    assert.ok(fs.existsSync(scriptPath), 'Скрипт scripts/docker_daily_backup.sh должен существовать');

    // Проверка синтаксиса POSIX sh
    execFileSync('sh', ['-n', scriptPath]);

    const mockBinDir = path.join(tempDir, 'mock_bin');
    const dockerBackupDir = path.join(tempDir, 'docker_backups');
    fs.mkdirSync(mockBinDir, { recursive: true });
    fs.mkdirSync(dockerBackupDir, { recursive: true });

    const stalePgFile = path.join(dockerBackupDir, 'postgres_2020-01-01_00-00-00.sql.gz');
    fs.writeFileSync(stalePgFile, zlib.gzipSync(Buffer.from('-- stale dump\n')));
    const oldTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    fs.utimesSync(stalePgFile, oldTime, oldTime);

    const pgIsReadyMock = path.join(mockBinDir, 'pg_isready');
    fs.writeFileSync(pgIsReadyMock, '#!/bin/sh\nexit 0\n', { mode: 0o755 });

    const pgDumpMock = path.join(mockBinDir, 'pg_dump');
    fs.writeFileSync(
      pgDumpMock,
      '#!/bin/sh\necho "-- PostgreSQL test dump"\necho "CREATE TABLE lecture_tasks (id TEXT PRIMARY KEY);"\n',
      { mode: 0o755 }
    );

    const envOk = {
      ...process.env,
      PATH: `${mockBinDir}:${process.env.PATH || '/usr/bin:/bin'}`,
      BACKUP_DIR: dockerBackupDir,
      BACKUP_RETENTION_DAYS: '14',
      BACKUP_RUN_ONCE: 'true',
      PGHOST: 'postgres',
      PGUSER: 'postgres',
      PGPASSWORD: 'postgres_password',
      PGDATABASE: 'lecture_db'
    };

    execFileSync('sh', [scriptPath], { env: envOk, encoding: 'utf-8' });

    const files = fs.readdirSync(dockerBackupDir);
    const createdDump = files.find(f => f.startsWith('postgres_') && f.endsWith('.sql.gz') && !f.includes('2020-01-01'));
    assert.ok(createdDump, 'Должен создаться файл postgres_YYYY-MM-DD_HH-MM-SS.sql.gz');
    assert.ok(files.includes('latest_postgres.sql.gz'), 'Должна обновиться ссылка/копия latest_postgres.sql.gz');
    assert.equal(fs.existsSync(stalePgFile), false, 'Устаревший дамп PostgreSQL должен быть удалён');

    const sqlText = zlib.gunzipSync(fs.readFileSync(path.join(dockerBackupDir, createdDump))).toString('utf-8');
    assert.ok(sqlText.includes('CREATE TABLE lecture_tasks'), 'Распакованный SQL-дамп должен содержать таблицы БД');

    // Имитируем ошибку pg_dump: скрипт не должен оставлять битый файл или затирать latest_postgres.sql.gz
    fs.writeFileSync(pgDumpMock, '#!/bin/sh\necho "connection error" >&2\nexit 1\n', { mode: 0o755 });
    execFileSync('sh', [scriptPath], { env: envOk, encoding: 'utf-8' });

    const latestAfterFail = zlib.gunzipSync(fs.readFileSync(path.join(dockerBackupDir, 'latest_postgres.sql.gz'))).toString('utf-8');
    assert.ok(latestAfterFail.includes('CREATE TABLE lecture_tasks'), 'При сбое pg_dump последний рабочий бэкап должен сохраняться');
    const leftoverTmp = fs.readdirSync(dockerBackupDir).filter(f => f.endsWith('.tmp'));
    assert.deepEqual(leftoverTmp, [], 'Не должно оставаться временных .tmp файлов');
  });

  it('3. Docker Compose и GitHub CI настроены корректно (postgres_backup раз в сутки + package-lock.json)', () => {
    const composeMain = fs.readFileSync(path.join(ROOT_DIR, 'docker-compose.yml'), 'utf-8');
    const composeServer = fs.readFileSync(path.join(ROOT_DIR, 'docker-compose.server.yml'), 'utf-8');

    for (const [name, content] of [
      ['docker-compose.yml', composeMain],
      ['docker-compose.server.yml', composeServer]
    ]) {
      assert.ok(content.includes('postgres_backup:'), `${name} должен содержать сервис postgres_backup`);
      assert.ok(content.includes('./backups:/backups'), `${name} должен монтировать ./backups:/backups`);
      assert.ok(content.includes('docker_daily_backup.sh'), `${name} должен запускать docker_daily_backup.sh`);
      assert.ok(content.includes('86400'), `${name} должен задавать интервал 86400 секунд (раз в сутки)`);
    }

    assert.ok(fs.existsSync(path.join(ROOT_DIR, 'package-lock.json')), 'В репозитории должен присутствовать package-lock.json для npm ci и кэша GitHub Actions');
    const ciYml = fs.readFileSync(path.join(ROOT_DIR, '.github', 'workflows', 'ci.yml'), 'utf-8');
    assert.ok(ciYml.includes('FORCE_JAVASCRIPT_ACTIONS_TO_NODE24'), 'CI должен включать Node 24 без предупреждений об устаревшем Node 20');
  });
});
