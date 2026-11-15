import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { execFile, spawn, ChildProcess } from "child_process";
import * as XLSX from "xlsx";

import {
  initDatabase,
  getCurators,
  getCuratorByEmail,
  insertCurator,
  updateCuratorRoleInDB,
  updateCuratorStatusInDB,
  deleteCuratorFromDB,
  touchCuratorLoginInDB,
  getLectureTasks,
  getLectureTaskByUrl,
  getBlockingLectureTaskByUrl,
  getLectureTaskById,
  requeueLectureTaskInDB,
  getPendingLectureTasksFIFO,
  resetInterruptedLectureTasksToPending,
  insertLectureTask,
  updateLectureTaskProgressInDB,
  getTeachersFromDB,
  insertTeacherIfNotExists,
  storeOTPInDB,
  verifyOTPFromDB,
  logAuditEvent,
  getAuditLogs,
  savePromptConfigInDB,
  getPromptConfigFromDB,
  saveCriteriaConfigInDB,
  getCriteriaConfigFromDB,
  getReportSettingsFromDB,
  saveReportSettingsInDB,
  DEFAULT_REPORT_SETTINGS,
  createLectureTasksBackup,
  hydrateLectureTasksFromBackup,
  purgeDatabaseToCleanState,
  getUnreviewedKtalkRecordings,
  getHiddenKtalkRecordings,
  markKtalkRecordingStatus,
  markKtalkRecordingSubmittedByUrl,
  CuratorRecord,
  LectureTaskRecord
} from "./db";

import {
  syncKtalkRecordingsNow,
  getKtalkSyncStatus,
  startKtalkAutoSyncScheduler
} from "./ktalk_sync";

import { sendOTPEmail } from "./email_service";
import { STANDARD_CRITERIA_LIST } from "./tasks_store";

async function startServer() {
  // 0. Инициализация реляционной БД (PostgreSQL 16 или встроенный SQLite fallback)
  console.log("[Инициализация] Подключение к реляционной базе данных...");
  try {
    await initDatabase();
    // Возвращаем в очередь FIFO задачи, прерванные прошлым перезапуском контейнера
    await resetInterruptedLectureTasksToPending();
    // Фоновое регулярное сохранение бэкапа проверок лекций в data/ каждые 60 минут
    await createLectureTasksBackup();
    setInterval(() => {
      createLectureTasksBackup().catch(err => console.error("[Авто-Бэкап] Ошибка создания ежечасной копии:", err));
    }, 60 * 60 * 1000);

    // Гарантируем наличие criteria_active.json и prompt_active.txt на диске для Python-пайплайна
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    const criteriaFile = path.join(dataDir, "criteria_active.json");
    if (!fs.existsSync(criteriaFile)) {
      const dbCriteria = await getCriteriaConfigFromDB("active");
      const critPayload = dbCriteria && Array.isArray(dbCriteria.standardCriteria) ? dbCriteria : {
        standardCriteria: STANDARD_CRITERIA_LIST,
        criticalCriteria: [
          { id: 1, title: "Фактическая или методическая ошибка", desc: "Серьезная ошибка в теории или решении, оставшаяся без исправления." },
          { id: 2, title: "Некорректное общение", desc: "Грубое, унизительное или дискриминирующее общение с учеником." },
          { id: 3, title: "Некомпетентность в задаче", desc: "Преподаватель не владеет решением рассматриваемой задачи и не может закончить разбор." },
          { id: 4, title: "Игнорирование учеников", desc: "Систематическое игнорирование вопросов и явных признаков непонимания группы." },
          { id: 5, title: "Срыв тайминга из-за неподготовленности", desc: "Значительная часть занятия потрачена на организационные или технические действия." },
          { id: 6, title: "Утечка конфиденциальных данных", desc: "Демонстрация персональных данных, личной переписки или приватной информации." },
          { id: 7, title: "Заведомо ложный материал", desc: "Выдача заведомо неверного ответа, правила или алгоритма без исправления." },
          { id: 8, title: "Длительное отсутствие", desc: "Отсутствие преподавателя или учебной работы в течение значительной части занятия." }
        ],
        updatedAt: new Date().toISOString(),
        updatedBy: "system_init"
      };
      fs.writeFileSync(criteriaFile, JSON.stringify(critPayload, null, 2), "utf-8");
      console.log("[Инициализация] criteria_active.json создан на диске для Python-пайплайна.");
    }

    const promptFile = path.join(dataDir, "prompt_active.txt");
    if (!fs.existsSync(promptFile)) {
      const dbPrompt = await getPromptConfigFromDB("active");
      if (dbPrompt) {
        fs.writeFileSync(promptFile, dbPrompt, "utf-8");
        console.log("[Инициализация] prompt_active.txt восстановлен из БД на диск.");
      }
    }
  } catch (dbErr) {
    console.error("[Инициализация] Критическая ошибка БД:", dbErr);
  }

  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const TOKEN_SECRET = process.env.TOKEN_SECRET || "olymp-secret-key-2026-checker-secret-secure-salt-2026";

  app.use(cors());
  app.use(express.json());

  // Helper для извлечения IP клиента
  const getClientIp = (req: express.Request): string => {
    return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "127.0.0.1";
  };

  // Rate Limiter с периодической очисткой просроченных записей
  const ipRequestCounts = new Map<string, { count: number; resetTime: number }>();
  const rateLimitPruneTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, val] of ipRequestCounts.entries()) {
      if (now > val.resetTime) {
        ipRequestCounts.delete(key);
      }
    }
  }, 5 * 60 * 1000);
  if (typeof rateLimitPruneTimer.unref === "function") {
    rateLimitPruneTimer.unref();
  }

  const tokenRateLimiter = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = getClientIp(req);
    const now = Date.now();
    const entry = ipRequestCounts.get(ip);
    const windowMs = 60 * 1000;
    const limit = 60;

    if (!entry || now > entry.resetTime) {
      ipRequestCounts.set(ip, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (entry.count >= limit) {
      return res.status(429).json({
        success: false,
        message: "Слишком много запросов. Доступ временно ограничен. Повторите через минуту."
      });
    }

    entry.count++;
    next();
  };

  // JWT / Session Helper (сессия ровно 10 дней)
  const SESSION_TTL_MS = 10 * 24 * 60 * 60 * 1000;

  const createSessionToken = (curator: CuratorRecord): string => {
    const ts = Date.now();
    const payloadObj = { email: curator.email, role: curator.role, ts };
    const payloadB64 = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
    const sig = crypto.createHmac("sha256", TOKEN_SECRET).update(`curator_session:${payloadB64}`).digest("hex").slice(0, 32);
    return `cs.${payloadB64}.${sig}`;
  };

  const verifySessionToken = async (token: string): Promise<{ valid: boolean; curator?: CuratorRecord }> => {
    if (!token || !token.startsWith("cs.")) return { valid: false };
    const parts = token.split(".");
    if (parts.length !== 3) return { valid: false };

    const [, payloadB64, sig] = parts;
    try {
      const expectedSig = crypto.createHmac("sha256", TOKEN_SECRET).update(`curator_session:${payloadB64}`).digest("hex").slice(0, 32);

      if (sig.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
        return { valid: false };
      }

      const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
      if (!payload.email || !payload.ts || Date.now() - payload.ts > SESSION_TTL_MS) {
        return { valid: false };
      }

      // Всегда верифицируем актуальный статус куратора из БД
      const curator = await getCuratorByEmail(payload.email);
      if (!curator || curator.status === "blocked") {
        return { valid: false };
      }

      return { valid: true, curator };
    } catch {
      return { valid: false };
    }
  };

  // Auth Middlewares
  const requireAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Требуется авторизация в личном кабинете." });
    }
    const token = authHeader.slice(7).trim();
    const { valid, curator } = await verifySessionToken(token);
    if (!valid || !curator) {
      return res.status(401).json({ success: false, message: "Сессия истекла или недействительна. Пожалуйста, выполните вход повторно." });
    }
    (req as any).user = curator;
    next();
  };

  const requireSeniorCurator = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const user: CuratorRecord = (req as any).user;
    if (!user || user.role !== "senior_curator") {
      return res.status(403).json({
        success: false,
        message: "Доступ запрещен. Это действие доступно ТОЛЬКО ДЛЯ СТАРШИХ КУРАТОРОВ."
      });
    }
    next();
  };

  // -------------------------------------------------------------
  // 1. АВТОРИЗАЦИЯ ПО EMAIL OTP (БЕЛЫЙ СПИСОК В БД)
  // -------------------------------------------------------------

  // Запрос одноразового кода на Email
  app.post("/api/auth/request-code", tokenRateLimiter, async (req, res) => {
    const ip = getClientIp(req);
    const email = (req.body.email || "").toString().trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: "Укажите корректный адрес электронной почты." });
    }

    const curator = await getCuratorByEmail(email);
    if (!curator) {
      await logAuditEvent("anonymous", "anonymous", "LOGIN_REJECTED_NOT_WHITELISTED", email, "Попытка запроса кода для адреса вне белого списка", ip);
      return res.status(403).json({
        success: false,
        code: "NOT_IN_WHITELIST",
        message: "Доступ ограничен. Данный email не найден в списке разрешенных кураторов. Обратитесь к старшему куратору для добавления вашей почты в систему."
      });
    }

    if (curator.status === "blocked") {
      await logAuditEvent(email, curator.role, "LOGIN_REJECTED_BLOCKED", email, "Попытка запроса кода заблокированным куратором", ip);
      return res.status(403).json({
        success: false,
        message: "Ваш доступ временно заблокирован старшим куратором."
      });
    }

    const code = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 минут

    // Сохраняем OTP код в БД
    await storeOTPInDB(email, code, "login", expiresAt);

    // Логируем в аудит БД
    await logAuditEvent(email, curator.role, "LOGIN_OTP_REQUESTED", email, "Сгенерирован и отправлен 6-значный одноразовый код входа", ip);

    // Отправляем письмо через SMTP или Dev Transport
    const emailResult = await sendOTPEmail(email, code, "login");

    res.json({
      success: true,
      message: emailResult.message,
      sent_via_smtp: emailResult.sent,
      from_email: emailResult.from
    });
  });

  // Экстренная / повторная очистка базы данных (ТОЛЬКО ДЛЯ СТАРШЕГО КУРАТОРА)
  app.post("/api/admin/purge-database", requireAuth, requireSeniorCurator, async (req, res) => {
    const ip = getClientIp(req);
    const user: CuratorRecord = (req as any).user;
    await purgeDatabaseToCleanState(user.email);
    await logAuditEvent(user.email, user.role, "DATABASE_PURGED", "all_tables", "Выполнена полная очистка БД старшим куратором", ip);
    res.json({ success: true, message: "База данных полностью очищена." });
  });

  // Подтверждение одноразового кода
  app.post("/api/auth/verify-code", tokenRateLimiter, async (req, res) => {
    const ip = getClientIp(req);
    const email = (req.body.email || "").toString().trim().toLowerCase();
    const code = (req.body.code || "").toString().trim();

    if (!email || !code) {
      return res.status(400).json({ success: false, message: "Укажите email и 6-значный код подтверждения." });
    }

    // Проверяем код напрямую в БД
    const verification = await verifyOTPFromDB(email, code, "login");
    if (!verification.valid) {
      await logAuditEvent(email, "unknown", "LOGIN_OTP_FAILED", email, verification.message, ip);
      return res.status(400).json({ success: false, message: verification.message });
    }

    const curator = await getCuratorByEmail(email);
    if (!curator) {
      return res.status(403).json({ success: false, message: "Куратор не найден в БД." });
    }

    if (curator.status === "blocked") {
      return res.status(403).json({ success: false, message: "Учетная запись заблокирована." });
    }

    // Обновляем время последнего входа в БД
    await touchCuratorLoginInDB(email);

    // Записываем аудит в БД
    await logAuditEvent(email, curator.role, "LOGIN_SUCCESS", email, `Успешный вход в личный кабинет. Выдана сессия на 10 дней.`, ip);

    const sessionToken = createSessionToken(curator);

    res.json({
      success: true,
      token: sessionToken,
      curator: {
        id: curator.id,
        email: curator.email,
        fullName: curator.fullName,
        role: curator.role,
        status: curator.status
      }
    });
  });

  // Получение текущего профиля куратора
  app.get("/api/auth/me", requireAuth, (req, res) => {
    const user: CuratorRecord = (req as any).user;
    res.json({
      success: true,
      curator: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        status: user.status
      }
    });
  });

  // -------------------------------------------------------------
  // 2. УПРАВЛЕНИЕ КУРАТОРАМИ (ТОЛЬКО ДЛЯ СТАРШИХ КУРАТОРОВ)
  // -------------------------------------------------------------

  // Список всех кураторов из БД
  app.get("/api/curators", requireAuth, requireSeniorCurator, async (req, res) => {
    const list = await getCurators();
    res.json({
      success: true,
      curators: list
    });
  });

  // Добавление email куратора в систему (приглашение в белый список)
  app.post("/api/curators", requireAuth, requireSeniorCurator, async (req, res) => {
    const ip = getClientIp(req);
    const currentUser: CuratorRecord = (req as any).user;
    const { email, fullName, role } = req.body;

    const normalizedEmail = (email || "").toString().trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ success: false, message: "Укажите корректный адрес электронной почты куратора." });
    }

    const assignedRole = role === "senior_curator" ? "senior_curator" : "curator";
    const displayName = (fullName || "").trim() || normalizedEmail.split("@")[0];

    const existing = await getCuratorByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Куратор с email ${normalizedEmail} уже зарегистрирован в белом списке (роль: ${existing.role === "senior_curator" ? "Старший куратор" : "Куратор"}, статус: ${existing.status === "blocked" ? "Заблокирован" : "Активен"}). Используйте элементы управления в таблице для смены роли или статуса.`
      });
    }

    const newRecord: CuratorRecord = {
      id: `cur_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      email: normalizedEmail,
      fullName: displayName,
      role: assignedRole,
      status: "active",
      addedBy: currentUser.fullName || currentUser.email,
      createdAt: new Date().toISOString(),
      lastLoginAt: null
    };

    const inserted = await insertCurator(newRecord);
    if (!inserted) {
      return res.status(500).json({ success: false, message: "Ошибка сохранения куратора в базу данных." });
    }

    // Сохранение в журнал аудита БД
    await logAuditEvent(
      currentUser.email,
      currentUser.role,
      "CURATOR_ADDED",
      normalizedEmail,
      `Добавлен куратор: ${displayName} (${normalizedEmail}) с ролью ${assignedRole}`,
      ip
    );

    res.json({
      success: true,
      message: `Email ${normalizedEmail} успешно добавлен в белый список системы.`,
      curator: newRecord
    });
  });

  // Удаление куратора из белого списка (ТОЛЬКО ДЛЯ СТАРШИХ КУРАТОРОВ)
  app.delete("/api/curators/:email", requireAuth, requireSeniorCurator, async (req, res) => {
    const ip = getClientIp(req);
    const currentUser: CuratorRecord = (req as any).user;
    const rawEmail = Array.isArray(req.params.email) ? req.params.email[0] : req.params.email;
    const targetEmail = decodeURIComponent(String(rawEmail || "")).toLowerCase().trim();

    if (targetEmail === currentUser.email.toLowerCase() || targetEmail === 'shurygin.egor2009@gmail.com') {
      return res.status(400).json({ success: false, message: "Нельзя удалить собственного пользователя или главного администратора." });
    }

    const deleted = await deleteCuratorFromDB(targetEmail);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Куратор не найден в БД." });
    }

    await logAuditEvent(
      currentUser.email,
      currentUser.role,
      "CURATOR_DELETED",
      targetEmail,
      `Куратор ${targetEmail} удален из белого списка старшим куратором ${currentUser.fullName || currentUser.email}`,
      ip
    );

    res.json({
      success: true,
      message: `Куратор ${targetEmail} успешно удален из белого списка.`
    });
  });

  // Перевод куратора в старшие кураторы или обычные
  app.patch("/api/curators/:email/role", requireAuth, requireSeniorCurator, async (req, res) => {
    const ip = getClientIp(req);
    const currentUser: CuratorRecord = (req as any).user;
    const rawEmail = Array.isArray(req.params.email) ? req.params.email[0] : req.params.email;
    const targetEmail = decodeURIComponent(String(rawEmail || "")).toLowerCase().trim();
    const { role } = req.body;

    if (role !== "curator" && role !== "senior_curator") {
      return res.status(400).json({ success: false, message: "Некорректная роль. Разрешены: curator, senior_curator." });
    }

    if (targetEmail === currentUser.email.toLowerCase() && role !== "senior_curator") {
      return res.status(400).json({ success: false, message: "Вы не можете понизить самого себя." });
    }

    const targetUser = await getCuratorByEmail(targetEmail);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: "Куратор не найден в БД." });
    }

    const updated = await updateCuratorRoleInDB(targetEmail, role);
    if (!updated) {
      return res.status(500).json({ success: false, message: "Ошибка обновления роли в базе данных." });
    }

    // Сохранение в журнал аудита БД
    const roleRu = role === "senior_curator" ? "Старший куратор" : "Куратор";
    await logAuditEvent(
      currentUser.email,
      currentUser.role,
      "CURATOR_ROLE_CHANGED",
      targetEmail,
      `Назначена новая роль: ${roleRu} (${role}) для пользователя ${targetEmail}`,
      ip
    );

    res.json({ success: true, message: `Роль куратора ${targetEmail} успешно изменена на: ${roleRu}.` });
  });

  // Блокировка / разблокировка куратора
  app.patch("/api/curators/:email/status", requireAuth, requireSeniorCurator, async (req, res) => {
    const ip = getClientIp(req);
    const currentUser: CuratorRecord = (req as any).user;
    const rawEmail = Array.isArray(req.params.email) ? req.params.email[0] : req.params.email;
    const targetEmail = decodeURIComponent(String(rawEmail || "")).toLowerCase().trim();
    const { status } = req.body;

    if (status !== "active" && status !== "blocked") {
      return res.status(400).json({ success: false, message: "Некорректный статус." });
    }

    if (targetEmail === currentUser.email.toLowerCase()) {
      return res.status(400).json({ success: false, message: "Вы не можете заблокировать собственный аккаунт." });
    }

    const targetUser = await getCuratorByEmail(targetEmail);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: "Куратор не найден в БД." });
    }

    const updated = await updateCuratorStatusInDB(targetEmail, status);
    if (!updated) {
      return res.status(500).json({ success: false, message: "Ошибка обновления статуса в базе данных." });
    }

    // Сохранение в журнал аудита БД
    await logAuditEvent(
      currentUser.email,
      currentUser.role,
      "CURATOR_STATUS_CHANGED",
      targetEmail,
      `Статус доступа куратора ${targetEmail} изменен на: ${status === "active" ? "Активен" : "Заблокирован"}`,
      ip
    );

    res.json({ success: true, message: `Статус куратора успешно изменен на: ${status}.` });
  });

  // -------------------------------------------------------------
  // 3. ОТПРАВКА ВСТРЕЧ КТАЛК И ОЧЕРЕДЬ FIFO ДЛЯ GIGACHAT
  // -------------------------------------------------------------
  let isQueueProcessing = false;
  let activeQueueTaskId: string | null = null;
  let queueWakeupPending = false;

  async function processLectureQueue(): Promise<void> {
    if (isQueueProcessing) {
      queueWakeupPending = true;
      return;
    }

    isQueueProcessing = true;
    try {
      while (true) {
        queueWakeupPending = false;
        const pendingTasks = await getPendingLectureTasksFIFO();
        if (pendingTasks.length === 0) {
          if (!queueWakeupPending) break;
          continue;
        }

        const nextTask = pendingTasks[0];
        activeQueueTaskId = nextTask.id;
        console.log(
          `[Очередь FIFO] ▶️ Запуск задачи ${nextTask.id} (${nextTask.teacherName}). Ожидают в очереди: ${pendingTasks.length - 1}`
        );

        await runTaskPipelineInDB(
          nextTask.id,
          nextTask.lectureUrl,
          nextTask.teacherName,
          nextTask.subject,
          nextTask.groupName,
          nextTask.curatorEmail
        );

        activeQueueTaskId = null;
      }
    } catch (queueErr) {
      console.error("[Очередь FIFO] Критическая ошибка диспетчера очереди:", queueErr);
    } finally {
      activeQueueTaskId = null;
      isQueueProcessing = false;
      if (queueWakeupPending) {
        setImmediate(() => {
          void processLectureQueue();
        });
      }
    }
  }

  // -------------------------------------------------------------
  // 2.5 СИНХРОНИЗАЦИЯ НЕПРОВЕРЕННЫХ ВСТРЕЧ ИЗ КОНТУР.ТОЛК
  // -------------------------------------------------------------
  app.get("/api/ktalk/recordings", requireAuth, async (req, res) => {
    try {
      const recordings = await getUnreviewedKtalkRecordings();
      res.json({
        success: true,
        recordings,
        syncStatus: getKtalkSyncStatus()
      });
    } catch (err: any) {
      console.error("[KTalk API] Ошибка получения непроверенных встреч:", err);
      res.status(500).json({
        success: false,
        message: "Не удалось загрузить список непроверенных встреч Контур.Толк.",
        syncStatus: getKtalkSyncStatus()
      });
    }
  });

  app.post("/api/ktalk/sync", requireAuth, async (req, res) => {
    const ip = getClientIp(req);
    const currentUser: CuratorRecord = (req as any).user;
    try {
      const syncRes = await syncKtalkRecordingsNow();
      const recordings = await getUnreviewedKtalkRecordings();
      await logAuditEvent(
        currentUser.email,
        currentUser.role,
        "KTALK_MANUAL_SYNC",
        "ktalk_recordings",
        syncRes.success
          ? `Ручное обновление встреч КТалк: получено ${syncRes.fetchedCount}, новых ${syncRes.addedCount}`
          : `Ошибка синхронизации КТалк: ${syncRes.error}`,
        ip
      );
      res.json({
        success: syncRes.success,
        error: syncRes.error,
        addedCount: syncRes.addedCount,
        fetchedCount: syncRes.fetchedCount,
        recordings,
        syncStatus: getKtalkSyncStatus()
      });
    } catch (err: any) {
      console.error("[KTalk API] Ошибка ручной синхронизации:", err);
      res.status(500).json({
        success: false,
        error: err?.message || "Ошибка синхронизации с Контур.Толк.",
        addedCount: 0,
        fetchedCount: 0,
        recordings: await getUnreviewedKtalkRecordings(),
        syncStatus: getKtalkSyncStatus()
      });
    }
  });

  app.post("/api/ktalk/recordings/:key/hide", requireAuth, async (req, res) => {
    const ip = getClientIp(req);
    const currentUser: CuratorRecord = (req as any).user;
    const rawKey = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;
    const key = decodeURIComponent(String(rawKey || "")).trim();

    if (!key) {
      return res.status(400).json({ success: false, message: "Не указан ключ записи Контур.Толк." });
    }

    const updated = await markKtalkRecordingStatus(key, "hidden", currentUser.email);
    if (!updated) {
      return res.status(404).json({ success: false, message: "Запись Контур.Толк не найдена." });
    }

    await logAuditEvent(
      currentUser.email,
      currentUser.role,
      "KTALK_RECORDING_HIDDEN",
      key,
      `Запись встречи КТалк скрыта куратором как нецелевая («Скрыть / Не лекция»)`,
      ip
    );

    res.json({ success: true, message: "Встреча скрыта из списка непроверенных." });
  });

  app.get("/api/ktalk/recordings/hidden", requireAuth, async (req, res) => {
    try {
      const recordings = await getHiddenKtalkRecordings();
      res.json({ success: true, recordings });
    } catch (err: any) {
      console.error("[KTalk API] Ошибка получения скрытых встреч:", err);
      res.status(500).json({
        success: false,
        message: "Не удалось загрузить скрытые записи Контур.Толк."
      });
    }
  });

  app.post("/api/ktalk/recordings/:key/restore", requireAuth, async (req, res) => {
    const ip = getClientIp(req);
    const currentUser: CuratorRecord = (req as any).user;
    const rawKey = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;
    const key = decodeURIComponent(String(rawKey || "")).trim();

    if (!key) {
      return res.status(400).json({ success: false, message: "Не указан ключ записи Контур.Толк." });
    }

    const updated = await markKtalkRecordingStatus(key, "new", currentUser.email);
    if (!updated) {
      return res.status(404).json({ success: false, message: "Запись Контур.Толк не найдена." });
    }

    await logAuditEvent(
      currentUser.email,
      currentUser.role,
      "KTALK_RECORDING_RESTORED",
      key,
      `Запись встречи КТалк возвращена из скрытых в список непроверенных`,
      ip
    );

    res.json({ success: true, message: "Встреча возвращена в список непроверенных." });
  });

  // Список всех проверок из БД с актуальной позицией в FIFO-очереди
  app.get("/api/tasks", requireAuth, async (req, res) => {
    const tasks = await getLectureTasks();
    const pendingSorted = tasks
      .filter(t => t.status === "pending")
      .sort((a, b) => {
        const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        return Number.isNaN(diff) || diff === 0 ? a.id.localeCompare(b.id) : diff;
      });
    const positionMap = new Map<string, number>();
    pendingSorted.forEach((t, idx) => positionMap.set(t.id, idx + 1));

    const enrichedTasks = tasks.map(t =>
      t.status === "pending" ? { ...t, queuePosition: positionMap.get(t.id) || 1 } : t
    );

    res.json({
      success: true,
      tasks: enrichedTasks,
      queueStats: {
        isProcessing: isQueueProcessing,
        activeTaskId: activeQueueTaskId,
        queuedCount: pendingSorted.length
      }
    });
  });

  // Создание новой задачи проверки видеозаписи КТалк с постановкой в FIFO-очередь
  app.post("/api/tasks", requireAuth, async (req, res) => {
    const ip = getClientIp(req);
    const currentUser: CuratorRecord = (req as any).user;
    const { lectureUrl, teacherName, subject, groupName } = req.body;

    if (!lectureUrl || typeof lectureUrl !== "string" || !lectureUrl.trim()) {
      return res.status(400).json({ success: false, message: "Укажите ссылку на встречу КТалк." });
    }

    const cleanTeacher = typeof teacherName === "string" ? teacherName.trim() : "";
    const cleanSubject = typeof subject === "string" ? subject.trim() : "";
    const cleanGroup = typeof groupName === "string" ? groupName.trim() : "";

    if (!cleanTeacher) {
      return res.status(400).json({ success: false, message: "Выберите или введите ФИО преподавателя." });
    }
    if (!cleanSubject) {
      return res.status(400).json({ success: false, message: "Укажите дисциплину / предмет." });
    }
    if (!cleanGroup) {
      return res.status(400).json({ success: false, message: "Укажите группу / параллель." });
    }

    const cleanUrl = lectureUrl.trim();
    const existingTask = await getBlockingLectureTaskByUrl(cleanUrl);
    if (existingTask) {
      await logAuditEvent(
        currentUser.email,
        currentUser.role,
        "DUPLICATE_URL_SUBMIT_BLOCKED",
        existingTask.id,
        `Попытка повторной отправки встречи КТалк: ${cleanUrl} (Преподаватель: ${existingTask.teacherName})`,
        ip
      );
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_URL",
        message: `Эта ссылка на занятие КТалк уже находится в работе или успешно проверена ранее (Преподаватель: ${existingTask.teacherName}, Дата: ${existingTask.date}).`,
        existingTask
      });
    }

    const taskId = `lec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // Кристальная честность: до завершения анализа в GigaChat никаких фейковых оценок и критериев!
    const newTask: LectureTaskRecord = {
      id: taskId,
      lectureUrl: cleanUrl,
      teacherName: cleanTeacher,
      subject: cleanSubject,
      groupName: cleanGroup,
      date: new Date().toISOString().replace("T", " ").slice(0, 16),
      totalScore: null,
      criticalViolations: [],
      positiveHighlights: [],
      recommendations: [],
      criteria: [],
      status: "pending",
      progressPct: 0,
      curatorEmail: currentUser.email,
      createdAt: new Date().toISOString(),
      isCorrupted: false,
      rawBrokenResponse: null,
      errorMessage: null,
      applicableCount: null,
      earnedPoints: null,
      maxPoints: null
    };

    // Сохраняем задачу в БД (переживет рестарт сервера)
    await insertLectureTask(newTask);

    // Помечаем запись КТалк как отправленную, чтобы она сразу исчезла из списка непроверенных
    await markKtalkRecordingSubmittedByUrl(cleanUrl);

    // Добавляем преподавателя в каталог БД (если новый)
    await insertTeacherIfNotExists(cleanTeacher, cleanSubject);

    const pendingQueue = await getPendingLectureTasksFIFO();
    const queueIdx = pendingQueue.findIndex(t => t.id === taskId);
    const queuePosition = queueIdx >= 0 ? queueIdx + 1 : pendingQueue.length;
    const startsImmediately = !isQueueProcessing && queuePosition === 1;

    // Записываем событие постановки в очередь в audit_logs БД
    await logAuditEvent(
      currentUser.email,
      currentUser.role,
      "KTALK_TASK_QUEUED",
      taskId,
      `Встреча поставлена в очередь FIFO (#${queuePosition}): ${cleanTeacher} | ${cleanSubject} | URL: ${cleanUrl}`,
      ip
    );

    // Пробуждаем FIFO-диспетчер очереди (строго 1 задача за раз)
    void processLectureQueue();

    res.json({
      success: true,
      message: startsImmediately
        ? "Заявка зарегистрирована. Сервер немедленно приступил к обработке через GigaChat."
        : `Заявка добавлена в очередь на проверку (позиция #${queuePosition}). Обработка начнется сразу после завершения текущей лекции.`,
      queuePosition,
      task: { ...newTask, queuePosition }
    });
  });

  // Вспомогательная функция обработки одной задачи через Python конвейер (KTalk + GigaChat)
  function runTaskPipelineInDB(
    taskId: string,
    lectureUrl: string,
    teacherName: string,
    subject: string = '',
    groupName: string = '',
    curatorEmail: string = '',
    additionalInfo: string = ''
  ): Promise<void> {
    return new Promise<void>(async (resolve) => {
      let settled = false;
      let watchdogTimer: NodeJS.Timeout | null = null;
      let timedOut = false;

      const clearWatchdog = () => {
        if (watchdogTimer) {
          clearTimeout(watchdogTimer);
          watchdogTimer = null;
        }
      };

      const finish = () => {
        clearWatchdog();
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      // 1. Устанавливаем реальный начальный этап (загрузка видео КТалк)
      await updateLectureTaskProgressInDB(taskId, "downloading", 15);

      // 2. Запускаем Python конвейер ktalk_gigachat_pipeline.py
      const pyScript = path.join(process.cwd(), "ktalk_gigachat_pipeline.py");
      const args = [
        pyScript,
        taskId,
        lectureUrl,
        teacherName,
        subject,
        groupName,
        curatorEmail,
        additionalInfo
      ];

      console.log(`[Python Pipeline] Запуск анализа через Python: ${taskId} (${teacherName})`);

      const venvCandidates = [
        path.join(process.cwd(), ".venv", "bin", "python3"),
        "/opt/venv/bin/python3"
      ];
      const pythonBin = venvCandidates.find(p => fs.existsSync(p)) || "python3";

      const child = spawn(pythonBin, args, {
        cwd: process.cwd(),
        env: { ...process.env, PYTHON_LOG_TO_STDERR: "1" },
        stdio: ["ignore", "pipe", "pipe"]
      });

      // Сторожевой таймер на 30 минут, чтобы зависший процесс не заблокировал FIFO-очередь навсегда
      watchdogTimer = setTimeout(() => {
        if (!settled) {
          timedOut = true;
          console.error(`[Python Pipeline] ⏱ Превышен таймаут 30 минут для задачи ${taskId}. Остановка процесса.`);
          try {
            child.kill("SIGKILL");
          } catch {}
        }
      }, 30 * 60 * 1000);

      let stdout = "";
      let stderr = "";
      let stderrLineBuf = "";

      const stageProgressMap: Record<string, { status: 'downloading' | 'extracting' | 'uploading' | 'analyzing'; pct: number }> = {
        downloading: { status: "downloading", pct: 15 },
        extracting: { status: "extracting", pct: 40 },
        uploading: { status: "uploading", pct: 65 },
        analyzing: { status: "analyzing", pct: 85 }
      };

      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString("utf-8");
      });

      child.stderr?.on("data", (chunk) => {
        const txt = chunk.toString("utf-8");
        stderr += txt;
        process.stderr.write(`[Python Worker] ${txt}`);

        stderrLineBuf += txt;
        const lines = stderrLineBuf.split(/\r?\n/);
        stderrLineBuf = lines.pop() || "";
        for (const line of lines) {
          const match = line.match(/\[STAGE\]\s+(downloading|extracting|uploading|analyzing)\b/i);
          if (match && !settled && !timedOut) {
            const stageInfo = stageProgressMap[match[1].toLowerCase()];
            if (stageInfo) {
              void updateLectureTaskProgressInDB(taskId, stageInfo.status, stageInfo.pct);
            }
          }
        }
      });

      child.on("error", async (spawnErr) => {
        clearWatchdog();
        console.error(`[Python Pipeline] Не удалось запустить python3 для ${taskId}:`, spawnErr);
        try {
          const errMsg = "Не удалось запустить Python-обработчик на сервере.";
          await updateLectureTaskProgressInDB(
            taskId,
            "failed",
            100,
            null,
            [],
            [],
            [],
            [],
            null,
            true,
            String(spawnErr),
            undefined,
            undefined,
            { errorMessage: errMsg, applicableCount: null, earnedPoints: null, maxPoints: null }
          );
          await createLectureTasksBackup();
          await logAuditEvent("ai_analyzer", "system", "TASK_ANALYSIS_FAILED", taskId, `${errMsg} ${String(spawnErr)}`, "127.0.0.1");
        } catch (err) {
          console.error(`[Python Pipeline] Ошибка сохранения статуса failed для ${taskId}:`, err);
        } finally {
          finish();
        }
      });

      child.on("close", async (code) => {
        clearWatchdog();
        console.log(`[Python Pipeline] Завершился с кодом ${code} для ${taskId}`);
        try {
          if (timedOut) {
            const timeoutErr = "Превышен лимит времени ожидания обработки (30 минут). Запись не была проанализирована — запустите повторную проверку.";
            await updateLectureTaskProgressInDB(
              taskId,
              "failed",
              100,
              null,
              [],
              [],
              [],
              [],
              null,
              true,
              stderr || stdout || timeoutErr,
              undefined,
              undefined,
              { errorMessage: timeoutErr, applicableCount: null, earnedPoints: null, maxPoints: null }
            );
            await createLectureTasksBackup();
            await logAuditEvent("ai_analyzer", "system", "TASK_ANALYSIS_TIMEOUT", taskId, timeoutErr, "127.0.0.1");
            return;
          }

          let parsedResult: any = null;
          if (stdout.trim()) {
            const lines = stdout.trim().split("\n");
            for (let i = lines.length - 1; i >= 0; i--) {
              const line = lines[i].trim();
              if (line.startsWith("{") && line.endsWith("}")) {
                try {
                  parsedResult = JSON.parse(line);
                  break;
                } catch {}
              }
            }
          }

          if (parsedResult && parsedResult.success && parsedResult.task) {
            const t = parsedResult.task;
            const actualTeacher = t.teacherName || teacherName;
            const actualSubject = t.subject || subject;
            if (actualTeacher && actualTeacher !== "Преподаватель") {
              await insertTeacherIfNotExists(actualTeacher, actualSubject);
            }

            if (t.status === "failed") {
              const failMsg = t.errorMessage || "Не удалось выполнить анализ лекции. Данные не оценивались.";
              await updateLectureTaskProgressInDB(
                taskId,
                "failed",
                100,
                null,
                [],
                [],
                [],
                [],
                t.talkMetadata || null,
                Boolean(t.isCorrupted),
                t.rawBrokenResponse || null,
                actualTeacher,
                actualSubject,
                {
                  errorMessage: failMsg,
                  applicableCount: null,
                  earnedPoints: null,
                  maxPoints: null
                }
              );
              await createLectureTasksBackup();
              await logAuditEvent(
                "ai_analyzer",
                "system",
                t.isCorrupted ? "TASK_ANALYSIS_CORRUPTED" : "TASK_ANALYSIS_FAILED",
                taskId,
                `Проверка встречи ${actualTeacher} не выполнена: ${failMsg}`,
                "127.0.0.1"
              );
            } else {
              await updateLectureTaskProgressInDB(
                taskId,
                "completed",
                100,
                typeof t.totalScore === "number" ? t.totalScore : null,
                Array.isArray(t.positiveHighlights) ? t.positiveHighlights : [],
                Array.isArray(t.recommendations) ? t.recommendations : [],
                Array.isArray(t.criteria) ? t.criteria : [],
                Array.isArray(t.criticalViolations) ? t.criticalViolations : [],
                t.talkMetadata || null,
                false,
                null,
                actualTeacher,
                actualSubject,
                {
                  errorMessage: null,
                  applicableCount: typeof t.applicableCount === "number" ? t.applicableCount : null,
                  earnedPoints: typeof t.earnedPoints === "number" ? t.earnedPoints : null,
                  maxPoints: typeof t.maxPoints === "number" ? t.maxPoints : null
                }
              );
              await createLectureTasksBackup();
              await logAuditEvent(
                "ai_analyzer",
                "system",
                "TASK_ANALYSIS_COMPLETED",
                taskId,
                `Анализ встречи преподавателя ${actualTeacher} честно завершен через GigaChat. Оценка: ${t.totalScore}% (критериев: ${t.applicableCount ?? "?"})`,
                "127.0.0.1"
              );
            }
          } else {
            console.error(`[Python Pipeline] Ошибка выполнения для ${taskId}:`, stderr);
            const failMsg = "Конвейер анализа завершился со сбоем и не вернул результат от GigaChat.";
            await updateLectureTaskProgressInDB(
              taskId,
              "failed",
              100,
              null,
              [],
              [],
              [],
              [],
              null,
              true,
              stderr || stdout || failMsg,
              undefined,
              undefined,
              { errorMessage: failMsg, applicableCount: null, earnedPoints: null, maxPoints: null }
            );
            await createLectureTasksBackup();
            await logAuditEvent(
              "ai_analyzer",
              "system",
              "TASK_ANALYSIS_FAILED",
              taskId,
              `${failMsg} (код выхода ${code})`,
              "127.0.0.1"
            );
          }
        } catch (err) {
          console.error(`[Python Pipeline] Исключение при обновлении задачи ${taskId}:`, err);
          await updateLectureTaskProgressInDB(
            taskId,
            "failed",
            100,
            null,
            [],
            [],
            [],
            [],
            null,
            true,
            String(err),
            undefined,
            undefined,
            { errorMessage: `Исключение при обработке результата: ${String(err)}` }
          );
          await createLectureTasksBackup();
        } finally {
          finish();
        }
      });
    });
  }

  // Статус конкретной задачи из БД
  app.get("/api/tasks/:id", requireAuth, async (req, res) => {
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const task = await getLectureTaskById(String(rawId || ""));
    if (!task) {
      return res.status(404).json({ success: false, message: "Задача не найдена." });
    }
    let queuePosition: number | undefined = undefined;
    if (task.status === "pending") {
      const pending = await getPendingLectureTasksFIFO();
      const idx = pending.findIndex(t => t.id === task.id);
      queuePosition = idx >= 0 ? idx + 1 : 1;
    }
    res.json({ success: true, task: queuePosition ? { ...task, queuePosition } : task });
  });

  // Повторная постановка сбойной или поврежденной лекции в очередь FIFO
  app.post("/api/tasks/:id/retry", requireAuth, async (req, res) => {
    const ip = getClientIp(req);
    const currentUser: CuratorRecord = (req as any).user;
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const task = await getLectureTaskById(String(rawId || ""));

    if (!task) {
      return res.status(404).json({ success: false, message: "Задача проверки не найдена." });
    }

    if (task.status !== "failed" && !task.isCorrupted) {
      return res.status(400).json({
        success: false,
        message: "Повторная проверка доступна только для сбойных или повреждённых задач."
      });
    }

    const requeued = await requeueLectureTaskInDB(task.id);
    if (!requeued) {
      return res.status(500).json({ success: false, message: "Не удалось вернуть задачу в очередь." });
    }

    const pendingQueue = await getPendingLectureTasksFIFO();
    const idx = pendingQueue.findIndex(t => t.id === task.id);
    const queuePosition = idx >= 0 ? idx + 1 : pendingQueue.length;

    await logAuditEvent(
      currentUser.email,
      currentUser.role,
      "KTALK_TASK_RETRIED",
      task.id,
      `Запущена повторная проверка встречи (${task.teacherName}, позиция в очереди #${queuePosition})`,
      ip
    );

    void processLectureQueue();

    res.json({
      success: true,
      message: `Лекция возвращена в очередь FIFO на повторную проверку (позиция #${queuePosition}).`,
      queuePosition,
      task: { ...requeued, queuePosition }
    });
  });

  // Список доступных преподавателей из БД
  app.get("/api/teachers", requireAuth, async (req, res) => {
    const teachers = await getTeachersFromDB();
    res.json({ success: true, teachers });
  });

  // Экспорт аналитики преподавателей в настоящий Excel (.xlsx) файл с аудитом в БД
  app.get("/api/analytics/export-excel", requireAuth, async (req, res) => {
    const ip = getClientIp(req);
    const currentUser: CuratorRecord = (req as any).user;
    const tasks = (await getLectureTasks()).filter(
      t => t.status === "completed" && !t.isCorrupted && typeof t.totalScore === "number"
    );

    // Таблица 1: Сводка по преподавателям
    const teacherMap = new Map<string, { count: number; totalScore: number; criticalCount: number }>();
    tasks.forEach(t => {
      const score = Number(t.totalScore);
      const cur = teacherMap.get(t.teacherName) || { count: 0, totalScore: 0, criticalCount: 0 };
      cur.count++;
      cur.totalScore += score;
      if (t.criticalViolations && t.criticalViolations.length > 0) cur.criticalCount++;
      teacherMap.set(t.teacherName, cur);
    });

    const summaryRows = Array.from(teacherMap.entries()).map(([name, data]) => ({
      "Преподаватель": name,
      "Проверено уроков": data.count,
      "Средний балл (из 100)": Math.round(data.totalScore / data.count),
      "Критических инцидентов": data.criticalCount,
      "Статус готовности": Math.round(data.totalScore / data.count) >= 90 ? "Эталон" : (Math.round(data.totalScore / data.count) >= 80 ? "Стандарт" : "Требует внимания")
    }));

    // Таблица 2: Детальный реестр уроков
    const detailRows = tasks.map(t => ({
      "ID проверки": t.id,
      "Дата урока": t.date,
      "Преподаватель": t.teacherName,
      "Предмет": t.subject,
      "Группа": t.groupName,
      "Ссылка на КТалк": t.lectureUrl,
      "Итоговый балл": t.totalScore,
      "Применимо критериев": t.applicableCount ?? t.criteria.filter((c: any) => !c?.notApplicable && c?.score !== null).length,
      "Критический статус": t.criticalViolations && t.criticalViolations.length > 0 ? "Критическое нарушение" : "Без критических нарушений",
      "Критические нарушения": t.criticalViolations.join("; ") || "Нет",
      "Сильные стороны": t.positiveHighlights.join("; ") || "Соответствует стандарту",
      "Рекомендации методиста": t.recommendations.join("; ") || "Замечаний нет",
      "Проверил куратор": t.curatorEmail
    }));

    const workbook = XLSX.utils.book_new();

    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(workbook, wsSummary, "Сводка по преподавателям");

    const wsDetails = XLSX.utils.json_to_sheet(detailRows);
    XLSX.utils.book_append_sheet(workbook, wsDetails, "Реестр всех проверок");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    // Фиксируем действие выгрузки в журнале аудита БД
    await logAuditEvent(
      currentUser.email,
      currentUser.role,
      "ANALYTICS_EXPORT_EXCEL",
      "all_teachers",
      `Выгружен сводный Excel-отчет (${summaryRows.length} преподавателей, ${detailRows.length} проверенных занятий)`,
      ip
    );

    res.setHeader("Content-Disposition", 'attachment; filename="Olympiad_Practices_Analytics_2026.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  });

  // -------------------------------------------------------------
  // 4. ЖУРНАЛ АУДИТА ДЕЙСТВИЙ ИЗ БД (ТОЛЬКО ДЛЯ СТАРШИХ КУРАТОРОВ)
  // -------------------------------------------------------------

  app.get("/api/audit-logs", requireAuth, requireSeniorCurator, async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const logs = await getAuditLogs(limit);
    res.json({
      success: true,
      logs
    });
  });

  // -------------------------------------------------------------
  // 5. РЕДАКТОР ПРОМПТА ИИ (ТОЛЬКО ДЛЯ СТАРШИХ КУРАТОРОВ)
  // -------------------------------------------------------------

  const DEFAULT_FACTORY_PROMPT = `Ты — строгий, бескомпромиссный главный методист и старший эксперт по контролю качества онлайн-занятий.
Твоя задача — провести ПРЕДЕЛЬНО ДЕТАЛЬНЫЙ, КРИТИЧЕСКИЙ И ПРИДИРЧИВЫЙ аудит предоставленного занятия.
Не сглаживай углы, не будь излишне вежливым, фиксируй ВСЕ недочёты, нарушения дисциплины, панибратство, технические сбои и методические огрехи.

КРИТИЧЕСКИ ВАЖНО — ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ ОТ ПОЛЬЗОВАТЕЛЯ:
"{additional_info}"
Эта информация определяет реальный формат, целевую аудиторию и контекст занятия.
Если критерий противоречит явно указанному формату (например, запись лекции без учеников, а критерий требует работы с классом), ставь в поле \`score\` значение \`null\`.

СПИСОК НЕКРИТИЧЕСКИХ КРИТЕРИЕВ ДЛЯ ОЦЕНИВАНИЯ:
{standard_formatted}

СТРОГИЕ ПРАВИЛА ВЫСТАВЛЕНИЯ ШТРАФНЫХ БАЛЛОВ ПО КАЖДОМУ КРИТЕРИЮ:
По каждому критерию определи количество СНЯТЫХ баллов (\`score\`):
• 0 — ИДЕАЛЬНО / ПОЛНОЕ ОТСУТСТВИЕ НАРУШЕНИЙ (0 баллов снимается). Ставь 0 ТОЛЬКО если на протяжении ВСЕГО урока по этому критерию нет НИ ЕДИНОГО замечания. В массив \`timecodes\` передавай строго пустой список \`[]\`.
• 1 — НЕБОЛЬШОЕ ИЛИ ЕДИНИЧНОЕ НАРУШЕНИЕ (снимается 1 балл). Если был хотя бы один эпизод отклонения (например: неформальный флуд, посторонний голос на фоне, единичный поиск файла, игнорирование молчащего ученика, отсутствие ДЗ). ОБЯЗАТЕЛЬНО укажи таймкоды нарушения в \`timecodes\`.
• 2 — СИСТЕМАТИЧЕСКОЕ ИЛИ ГРУБОЕ НАРУШЕНИЕ (снимается 2 балла). Если проблема повторялась регулярно, заняла существенную часть урока или существенно снизила пользу занятия. ОБЯЗАТЕЛЬНО укажи таймкоды нарушений в \`timecodes\`.
• null — КРИТЕРИЙ НЕ ПРИМЕНИМ из-за формата/специфики урока или информации от пользователя (в \`timecodes\` передавай \`[]\`).

ОБЯЗАТЕЛЬНОЕ ПРАВИЛО СОГЛАСОВАННОСТИ:
1. Если в \`details\` зафиксировано реальное нарушение и его таймкод — ЗАПРЕЩЕНО оставлять \`score: 0\`. Обязательно снимай \`1\` или \`2\` балла и указывай эти таймкоды в \`timecodes\`.
2. Если \`score\` равен \`0\` (нарушений нет) — передавай \`"timecodes": []\`.
3. Если \`score\` равен \`null\` (критерий исключён/не применим) — ОБЯЗАТЕЛЬНО укажи причину неприменимости в \`details\` и передай \`"timecodes": []\`.

ОСОБЫЕ АКЦЕНТЫ ПРИ АНАЛИЗЕ (НЕ ПРОПУСКАТЬ!):
- Критерий 2 и 17: Любые задержки с демонстрацией, поиск файлов, отправка пустых файлов, отсутствие слайдов/плана -> ОБЯЗАТЕЛЬНО снимать баллы!
- Критерий 7 и 11: Преподаватель работает только с 1-2 активными (а остальные молчат или уходят без внимания) -> ОБЯЗАТЕЛЬНО снимать баллы!
- Критерий 10 и 21: Панибратство, обсуждение посторонних людей, личных тем, флуд в чате/голосом, шутки учеников (например "найду по IP"), посторонние лица на фоне -> ОБЯЗАТЕЛЬНО снимать баллы!
- Критерий 12 и 13: Невыдача домашнего задания, отсутствие закрепления -> ОБЯЗАТЕЛЬНО фиксировать и снижать балл!

СПИСОК КРИТИЧЕСКИХ НАРУШЕНИЙ:
{critical_formatted}

ПРАВИЛО КРИТИЧНОСТИ:
1. Проверь занятие на ВСЕ КРИТИЧЕСКИЕ НАРУШЕНИЯ. Если есть хотя бы одно — \`is_critical: true\` и перечисли их в \`critical_details\` с точными таймкодами.
2. В поле \`point\` укажи сумму всех СНЯТЫХ баллов (суммарный штраф).

ТРЕБОВАНИЯ К КОММЕНТАРИЮ И РЕКОМЕНДАЦИЯМ:
• В поле \`comment\` напиши развернутый экспертный разбор (10-15 предложений) в хронологическом порядке: подробно распиши все замеченные недостатки, срыв тайминга, флуд, технические задержки, работу с учениками ОБЯЗАТЕЛЬНО С ТОЧНЫМИ ТАЙМКОДАМИ вида (ЧЧ:ММ:СС или ММ:СС).
• В поле \`recommendations\` напиши ровно 5 четких, конкретных рекомендаций преподавателю, как устранить эти недостатки.`;

  app.get("/api/prompt/data", requireAuth, requireSeniorCurator, async (req, res) => {
    try {
      let activePrompt = await getPromptConfigFromDB("active");
      let basePrompt = await getPromptConfigFromDB("base");

      if (!activePrompt) {
        const activePath = path.join(process.cwd(), "data", "prompt_active.txt");
        const sysActivePath = path.join(process.cwd(), "data", "system_prompt_active.txt");
        if (fs.existsSync(activePath)) {
          activePrompt = fs.readFileSync(activePath, "utf-8").trim();
        } else if (fs.existsSync(sysActivePath)) {
          activePrompt = fs.readFileSync(sysActivePath, "utf-8").trim();
        }
      }

      if (!basePrompt) {
        const basePath = path.join(process.cwd(), "data", "prompt_base.txt");
        const sysBasePath = path.join(process.cwd(), "data", "system_prompt_base.txt");
        if (fs.existsSync(basePath)) {
          basePrompt = fs.readFileSync(basePath, "utf-8").trim();
        } else if (fs.existsSync(sysBasePath)) {
          basePrompt = fs.readFileSync(sysBasePath, "utf-8").trim();
        }
      }

      const finalActive = activePrompt || DEFAULT_FACTORY_PROMPT;
      const finalBase = basePrompt || DEFAULT_FACTORY_PROMPT;
      const auditLogs = await getAuditLogs(30);
      const reportSettings = await getReportSettingsFromDB();

      res.json({
        success: true,
        active: finalActive,
        base: finalBase,
        factory: DEFAULT_FACTORY_PROMPT,
        audit_logs: auditLogs,
        reportSettings,
        has_unsaved_changes: false
      });
    } catch (err) {
      console.error("[Prompt API] Ошибка получения данных промпта:", err);
      res.json({
        success: true,
        active: DEFAULT_FACTORY_PROMPT,
        base: DEFAULT_FACTORY_PROMPT,
        factory: DEFAULT_FACTORY_PROMPT,
        audit_logs: [],
        reportSettings: { ...DEFAULT_REPORT_SETTINGS },
        has_unsaved_changes: false
      });
    }
  });

  // Запрос кода подтверждения для сохранения промпта и настроек отчета (на email старшего куратора)
  app.post("/api/prompt/request-save-code", tokenRateLimiter, requireAuth, requireSeniorCurator, async (req, res) => {
    const ip = getClientIp(req);
    const user: CuratorRecord = (req as any).user;
    const action = req.body.action || "save_active";

    const actionTitles: Record<string, string> = {
      save_active: "Сохранение рабочего системного промпта нейросети",
      save_base: "Фиксация нового базового эталона промпта",
      reset_to_base: "Сброс рабочего промпта к сохраненному базовому эталону",
      reset_to_factory: "Сброс рабочего промпта к заводскому промпту разработчика",
      save_report_settings: "Обновление настроек отображения оценок и неприменимых критериев (Н/П) в отчетах"
    };
    const actionDesc = actionTitles[action] || "Изменение системного промпта ИИ";

    const code = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000;

    // Сохраняем OTP в БД
    await storeOTPInDB(user.email, code, "prompt_save", expiresAt);

    // Записываем в журнал аудита БД
    await logAuditEvent(
      user.email,
      user.role,
      "PROMPT_SAVE_REQUESTED",
      action,
      `Запрошен одноразовый код для действия: ${actionDesc}`,
      ip
    );

    const emailResult = await sendOTPEmail(user.email, code, "prompt_save", actionDesc);

    res.json({
      success: true,
      message: `Код подтверждения отправлен на почту ${user.email}.`,
      sent_via_smtp: emailResult.sent,
      from_email: emailResult.from
    });
  });

  // Подтверждение сохранения промпта / сброса / настроек отчета
  app.post("/api/prompt/confirm-save", tokenRateLimiter, requireAuth, requireSeniorCurator, async (req, res) => {
    const ip = getClientIp(req);
    const user: CuratorRecord = (req as any).user;
    const { code, action, prompt_text, reportSettings: incomingReportSettings } = req.body;

    const verification = await verifyOTPFromDB(user.email, code || "", "prompt_save");
    if (!verification.valid) {
      await logAuditEvent(user.email, user.role, "PROMPT_SAVE_FAILED", action || "unknown", verification.message, ip);
      return res.status(400).json({ success: false, message: verification.message });
    }

    let finalPromptToSave: string | undefined = typeof prompt_text === "string" && prompt_text.trim() ? prompt_text : undefined;
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    if (action === "reset_to_base") {
      let baseText = await getPromptConfigFromDB("base");
      if (!baseText) {
        const basePath = path.join(dataDir, "prompt_base.txt");
        if (fs.existsSync(basePath)) baseText = fs.readFileSync(basePath, "utf-8").trim();
      }
      finalPromptToSave = baseText || DEFAULT_FACTORY_PROMPT;
    } else if (action === "reset_to_factory") {
      finalPromptToSave = DEFAULT_FACTORY_PROMPT;
    }

    const targetPromptKey = action === "save_base" ? "base" : "active";

    if (finalPromptToSave && action !== "save_report_settings") {
      await savePromptConfigInDB(targetPromptKey, finalPromptToSave, user.email);
      try {
        const promptFile = path.join(dataDir, targetPromptKey === "base" ? "prompt_base.txt" : "prompt_active.txt");
        fs.writeFileSync(promptFile, finalPromptToSave, "utf-8");
      } catch (saveErr) {
        console.warn("Предупреждение сохранения файла промпта на диск:", saveErr);
      }

      try {
        const child = execFile("python3", ["prompt_manager.py", "confirm_save", user.email, "DIRECT_VERIFIED", action || "save_active", ip], { encoding: "utf-8" }, () => {});
        child.stdin?.write(finalPromptToSave);
        child.stdin?.end();
      } catch {}
    }

    let savedReportSettings = await getReportSettingsFromDB();
    if (incomingReportSettings && typeof incomingReportSettings === "object") {
      savedReportSettings = await saveReportSettingsInDB(incomingReportSettings, user.email);
    }

    const successMsg = action === "save_report_settings"
      ? "Настройки отображения критериев и Н/П в отчётах успешно обновлены!"
      : action === "reset_to_base"
      ? "Рабочий промпт успешно сброшен к сохранённому базовому эталону."
      : action === "reset_to_factory"
      ? "Рабочий промпт успешно сброшен к заводской версии."
      : "Системный промпт нейросети успешно обновлен старшим куратором и зафиксирован в БД!";

    await logAuditEvent(
      user.email,
      user.role,
      "PROMPT_SAVE_CONFIRMED",
      action || "save_active",
      `${successMsg} (${user.fullName || user.email})`,
      ip
    );

    res.json({
      success: true,
      message: successMsg,
      promptText: finalPromptToSave || null,
      reportSettings: savedReportSettings
    });
  });

  // -------------------------------------------------------------
  // 6. УПРАВЛЕНИЕ КРИТЕРИЯМИ ОЦЕНКИ (ТОЛЬКО ДЛЯ СТАРШИХ КУРАТОРОВ)
  // -------------------------------------------------------------

  const DEFAULT_CRITICAL_CRITERIA_LIST = [
    { id: 1, title: "Фактическая или методическая ошибка", desc: "Серьезная ошибка в теории или решении, оставшаяся без исправления." },
    { id: 2, title: "Некорректное общение", desc: "Грубое, унизительное или дискриминирующее общение с учеником." },
    { id: 3, title: "Некомпетентность в задаче", desc: "Преподаватель не владеет решением рассматриваемой задачи и не может закончить разбор." },
    { id: 4, title: "Игнорирование учеников", desc: "Систематическое игнорирование вопросов и явных признаков непонимания группы." },
    { id: 5, title: "Срыв тайминга из-за неподготовленности", desc: "Значительная часть занятия потрачена на организационные или технические действия." },
    { id: 6, title: "Утечка конфиденциальных данных", desc: "Демонстрация персональных данных, личной переписки или приватной информации." },
    { id: 7, title: "Заведомо ложный материал", desc: "Выдача заведомо неверного ответа, правила или алгоритма без исправления." },
    { id: 8, title: "Длительное отсутствие", desc: "Отсутствие преподавателя или учебной работы в течение значительной части занятия." }
  ];

  app.get("/api/criteria/config", requireAuth, async (req, res) => {
    const reportSettings = await getReportSettingsFromDB();
    try {
      const savedConfig = await getCriteriaConfigFromDB("active");
      if (savedConfig && Array.isArray(savedConfig.standardCriteria) && Array.isArray(savedConfig.criticalCriteria)) {
        return res.json({
          success: true,
          standardCriteria: savedConfig.standardCriteria,
          criticalCriteria: savedConfig.criticalCriteria,
          reportSettings,
          updatedAt: savedConfig.updatedAt || null,
          updatedBy: savedConfig.updatedBy || null
        });
      }
      return res.json({
        success: true,
        standardCriteria: STANDARD_CRITERIA_LIST,
        criticalCriteria: DEFAULT_CRITICAL_CRITERIA_LIST,
        reportSettings,
        updatedAt: null,
        updatedBy: null
      });
    } catch (err) {
      console.error("[Criteria API] Ошибка загрузки критериев:", err);
      res.json({
        success: true,
        standardCriteria: STANDARD_CRITERIA_LIST,
        criticalCriteria: DEFAULT_CRITICAL_CRITERIA_LIST,
        reportSettings,
        updatedAt: null,
        updatedBy: null
      });
    }
  });

  // Запрос 2FA-кода на почту Senior Curator для сохранения критериев
  app.post("/api/criteria/request-save-code", tokenRateLimiter, requireAuth, requireSeniorCurator, async (req, res) => {
    const ip = getClientIp(req);
    const user: CuratorRecord = (req as any).user;
    const { standardCount, criticalCount } = req.body;

    const actionDesc = `Сохранение изменений критериев оценки (${standardCount || 0} стандартных, ${criticalCount || 0} критических)`;
    const code = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000;

    await storeOTPInDB(user.email, code, "criteria_save", expiresAt);

    await logAuditEvent(
      user.email,
      user.role,
      "CRITERIA_SAVE_REQUESTED",
      "criteria_config",
      `Запрошен одноразовый код для сохранения изменений в критериях оценки`,
      ip
    );

    const emailResult = await sendOTPEmail(user.email, code, "criteria_save", actionDesc);

    res.json({
      success: true,
      message: `Код подтверждения отправлен на вашу почту ${user.email}.`,
      sent_via_smtp: emailResult.sent,
      from_email: emailResult.from
    });
  });

  // Подтверждение и сохранение критериев (с принудительной перенумерацией без дыр 1..N)
  app.post("/api/criteria/confirm-save", tokenRateLimiter, requireAuth, requireSeniorCurator, async (req, res) => {
    const ip = getClientIp(req);
    const user: CuratorRecord = (req as any).user;
    const { code, standardCriteria, criticalCriteria } = req.body;

    if (!Array.isArray(standardCriteria) || !Array.isArray(criticalCriteria)) {
      return res.status(400).json({ success: false, message: "Некорректный формат списков критериев." });
    }

    const verification = await verifyOTPFromDB(user.email, code || "", "criteria_save");
    if (!verification.valid) {
      await logAuditEvent(user.email, user.role, "CRITERIA_SAVE_FAILED", "criteria_config", verification.message, ip);
      return res.status(400).json({ success: false, message: verification.message });
    }

    const normalizedStandard = standardCriteria
      .filter((c: any) => c && typeof c.text === "string" && c.text.trim())
      .map((c: any, idx: number) => ({
        id: idx + 1,
        text: c.text.trim(),
        category: (typeof c.category === "string" && c.category.trim()) ? c.category.trim() : "Общее"
      }));

    if (normalizedStandard.length === 0) {
      return res.status(400).json({ success: false, message: "В списке должен оставаться хотя бы один стандартный критерий." });
    }

    const normalizedCritical = criticalCriteria
      .filter((c: any) => c && typeof c.title === "string" && c.title.trim())
      .map((c: any, idx: number) => ({
        id: idx + 1,
        title: c.title.trim(),
        desc: (typeof c.desc === "string" ? c.desc.trim() : "")
      }));

    const criteriaData = {
      standardCriteria: normalizedStandard,
      criticalCriteria: normalizedCritical,
      updatedAt: new Date().toISOString(),
      updatedBy: user.email
    };

    await saveCriteriaConfigInDB("active", criteriaData, user.email);

    try {
      const dataDir = path.join(process.cwd(), "data");
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(path.join(dataDir, "criteria_active.json"), JSON.stringify(criteriaData, null, 2), "utf-8");
    } catch (saveErr) {
      console.warn("Предупреждение сохранения criteria_active.json:", saveErr);
    }

    await logAuditEvent(
      user.email,
      user.role,
      "CRITERIA_UPDATED_CONFIRMED",
      "criteria_config",
      `Критерии оценки успешно обновлены старшим куратором ${user.fullName} (${normalizedStandard.length} стандартных, ${normalizedCritical.length} критических, нумерация 1..N без пропусков)`,
      ip
    );

    res.json({
      success: true,
      standardCriteria: normalizedStandard,
      criticalCriteria: normalizedCritical,
      message: `Критерии оценки успешно обновлены и зафиксированы в базе данных! (${normalizedStandard.length} стандартных, ${normalizedCritical.length} критических)`
    });
  });

  // Служебные эндпоинты (Схема БД, Config)
  app.get("/api/db-schema.jpg", (req, res) => {
    res.sendFile(path.join(process.cwd(), "db_schema.jpg"));
  });

  app.get("/api/config", (req, res) => {
    res.json({
      testing_mode: process.env.TESTING_MODE === "true",
      platform: "unified_web_portal",
      version: "2.1.0"
    });
  });

  // Фоновые воркеры (опционально)
  let workerProc: ChildProcess | null = null;
  const isRussianWorkerEnabled = process.env.RUN_RUSSIAN_WORKER === "true";

  if (isRussianWorkerEnabled) {
    console.log("[Russian Worker] Фоновый процессор запущен.");
    workerProc = spawn("python3", ["worker_processor.py"], {
      stdio: ["ignore", "inherit", "inherit"],
    });
  }

  // Vite middleware для фронтенда (только в dev режиме)
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n=============================================================`);
    console.log(`🚀 Единый веб-портал «Олимпиадные Практики» запущен:`);
    console.log(`👉 http://localhost:${PORT}`);
    console.log(`🗄️ База данных: PostgreSQL 16 / SQLite Fallback`);
    console.log(`📧 Начальный старший куратор: shurygin.egor2009@gmail.com`);
    console.log(`=============================================================\n`);

    // Запускаем обработку сохраненной в БД очереди FIFO при старте сервера
    void processLectureQueue();

    // Запускаем фоновую авто-синхронизацию записей Контур.Толк (каждые 5 минут)
    startKtalkAutoSyncScheduler();
  });
}

startServer();
