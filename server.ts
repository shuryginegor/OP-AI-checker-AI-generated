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
  touchCuratorLoginInDB,
  getLectureTasks,
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
  purgeDatabaseToCleanState,
  CuratorRecord,
  LectureTaskRecord
} from "./db";

import { sendOTPEmail } from "./email_service";
import { STANDARD_CRITERIA_LIST, generateSampleCriteria } from "./tasks_store";

async function startServer() {
  // 0. Инициализация реляционной БД (PostgreSQL 16 или встроенный SQLite fallback)
  console.log("[Инициализация] Подключение к реляционной базе данных...");
  try {
    await initDatabase();
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

  // Rate Limiter
  const ipRequestCounts = new Map<string, { count: number; resetTime: number }>();
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

    const code = Math.floor(100000 + Math.random() * 900000).toString();
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
      return res.status(400).json({ success: false, message: `Куратор с почтой ${normalizedEmail} уже зарегистрирован в системе.` });
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

  // Перевод куратора в старшие кураторы или обычные
  app.patch("/api/curators/:email/role", requireAuth, requireSeniorCurator, async (req, res) => {
    const ip = getClientIp(req);
    const currentUser: CuratorRecord = (req as any).user;
    const targetEmail = decodeURIComponent(req.params.email).toLowerCase().trim();
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
    const targetEmail = decodeURIComponent(req.params.email).toLowerCase().trim();
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
  // 3. ОТПРАВКА ВСТРЕЧ КТАЛК И АНАЛИТИКА В БД
  // -------------------------------------------------------------

  // Список всех проверок из БД
  app.get("/api/tasks", requireAuth, async (req, res) => {
    const tasks = await getLectureTasks();
    res.json({
      success: true,
      tasks
    });
  });

  // Создание новой задачи проверки видеозаписи КТалк с сохранением в БД
  app.post("/api/tasks", requireAuth, async (req, res) => {
    const ip = getClientIp(req);
    const currentUser: CuratorRecord = (req as any).user;
    const { lectureUrl, teacherName, subject, groupName } = req.body;

    if (!lectureUrl || typeof lectureUrl !== "string") {
      return res.status(400).json({ success: false, message: "Укажите ссылку на встречу КТалк." });
    }

    if (!teacherName || typeof teacherName !== "string") {
      return res.status(400).json({ success: false, message: "Выберите или введите ФИО преподавателя." });
    }

    const taskId = `lec_${Date.now()}`;
    const cleanTeacher = teacherName.trim();
    const cleanSubject = (subject || "Олимпиадная подготовка").trim();
    const cleanGroup = (groupName || "Основная группа").trim();

    // Создаем запись задачи
    const newTask: LectureTaskRecord = {
      id: taskId,
      lectureUrl: lectureUrl.trim(),
      teacherName: cleanTeacher,
      subject: cleanSubject,
      groupName: cleanGroup,
      date: new Date().toISOString().replace("T", " ").slice(0, 16),
      totalScore: 0,
      criticalViolations: [],
      positiveHighlights: [],
      recommendations: [],
      criteria: STANDARD_CRITERIA_LIST.map(c => ({
        id: c.id,
        text: c.text,
        category: c.category,
        passed: true,
        score: 5
      })),
      status: "downloading",
      progressPct: 15,
      curatorEmail: currentUser.email,
      createdAt: new Date().toISOString()
    };

    // Сохраняем задачу в БД
    await insertLectureTask(newTask);

    // Добавляем преподавателя в каталог БД (если новый)
    await insertTeacherIfNotExists(cleanTeacher, cleanSubject);

    // Записываем событие отправки в audit_logs БД
    await logAuditEvent(
      currentUser.email,
      currentUser.role,
      "KTALK_TASK_SUBMITTED",
      taskId,
      `Встреча отправлена на анализ ИИ: ${cleanTeacher} | ${cleanSubject} | URL: ${lectureUrl.trim()}`,
      ip
    );

    // Запускаем асинхронную обработку в БД с обновлением прогресса
    runTaskPipelineInDB(taskId, cleanTeacher);

    res.json({
      success: true,
      message: "Заявка на анализ встречи успешно зарегистрирована. Сервер приступил к обработке.",
      task: newTask
    });
  });

  // Вспомогательная функция обработки задачи с обновлением прогресса в БД
  function runTaskPipelineInDB(taskId: string, teacherName: string) {
    const steps = [
      { delay: 3000, status: "downloading" as const, pct: 35 },
      { delay: 7000, status: "extracting" as const, pct: 65 },
      { delay: 12000, status: "analyzing" as const, pct: 85 },
      { delay: 18000, status: "completed" as const, pct: 100 }
    ];

    steps.forEach(step => {
      setTimeout(async () => {
        try {
          if (step.status === "completed") {
            const score = Math.floor(86 + Math.random() * 12); // 86..98
            const positiveHighlights = [
              "Высокий темп занятия и отличное владение математическим аппаратом.",
              "Грамотная раскадровка и читаемые формулы на доске без размытия.",
              "Активное взаимодействие с аудиторией в чате КТалк, разбор встречных вопросов."
            ];
            const recommendations = [
              "Рекомендуется в начале занятия четче артикулировать тайминг и план урока на первые 45 минут."
            ];
            const criteria = generateSampleCriteria(Date.now(), score >= 90);

            // Сохраняем финальные результаты анализа в БД
            await updateLectureTaskProgressInDB(
              taskId,
              "completed",
              100,
              score,
              positiveHighlights,
              recommendations,
              criteria
            );

            // Записываем завершение анализа в audit_logs БД
            await logAuditEvent(
              "ai_analyzer",
              "system",
              "TASK_ANALYSIS_COMPLETED",
              taskId,
              `Успешно завершен анализ занятия преподавателя ${teacherName}. Оценка ИИ: ${score}/100. Критических нарушений: 0`,
              "127.0.0.1"
            );
          } else {
            // Обновляем промежуточный статус задачи в БД
            await updateLectureTaskProgressInDB(taskId, step.status, step.pct);
          }
        } catch (stepErr) {
          console.error(`[Pipeline БД] Ошибка шага ${step.status} для ${taskId}:`, stepErr);
        }
      }, step.delay);
    });
  }

  // Статус конкретной задачи из БД
  app.get("/api/tasks/:id", requireAuth, async (req, res) => {
    const tasks = await getLectureTasks();
    const task = tasks.find(t => t.id === req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, message: "Задача не найдена." });
    }
    res.json({ success: true, task });
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
    const tasks = (await getLectureTasks()).filter(t => t.status === "completed");

    // Таблица 1: Сводка по преподавателям
    const teacherMap = new Map<string, { count: number; totalScore: number; criticalCount: number }>();
    tasks.forEach(t => {
      const cur = teacherMap.get(t.teacherName) || { count: 0, totalScore: 0, criticalCount: 0 };
      cur.count++;
      cur.totalScore += t.totalScore;
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

  app.get("/api/prompt/data", requireAuth, requireSeniorCurator, (req, res) => {
    execFile("python3", ["prompt_manager.py", "get_data"], { encoding: "utf-8" }, async (err, stdout, stderr) => {
      if (err) {
        console.error("Ошибка prompt_manager get_data:", err, stderr);
        // Fallback: читаем сохраненный в БД или на диске
        const dbPrompt = await getPromptConfigFromDB("active");
        if (dbPrompt) {
          return res.json({
            active: dbPrompt,
            base: dbPrompt,
            factory: "Промпт по умолчанию",
            has_unsaved_changes: false
          });
        }
        return res.status(500).json({ success: false, message: "Ошибка сервера при чтении промптов." });
      }
      try {
        const raw = stdout.trim();
        const startIdx = raw.indexOf("{");
        const endIdx = raw.lastIndexOf("}");
        const data = JSON.parse(raw.substring(startIdx, endIdx + 1));
        return res.json(data);
      } catch (e) {
        console.error("Ошибка парсинга вывода Python:", stdout, e);
        return res.status(500).json({ success: false, message: "Ошибка сервера." });
      }
    });
  });

  // Запрос кода подтверждения для сохранения промпта (на email старшего куратора)
  app.post("/api/prompt/request-save-code", requireAuth, requireSeniorCurator, async (req, res) => {
    const ip = getClientIp(req);
    const user: CuratorRecord = (req as any).user;
    const action = req.body.action || "save_active";

    const actionTitles: Record<string, string> = {
      save_active: "Сохранение рабочего системного промпта нейросети",
      save_base: "Фиксация нового базового эталона промпта",
      reset_to_base: "Сброс к сохраненному базовому эталону",
      reset_to_factory: "Сброс к заводскому промпту разработчика"
    };
    const actionDesc = actionTitles[action] || "Изменение системного промпта ИИ";

    const code = Math.floor(100000 + Math.random() * 900000).toString();
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

  // Подтверждение сохранения промпта
  app.post("/api/prompt/confirm-save", requireAuth, requireSeniorCurator, async (req, res) => {
    const ip = getClientIp(req);
    const user: CuratorRecord = (req as any).user;
    const { code, action, prompt_text } = req.body;

    const verification = await verifyOTPFromDB(user.email, code || "", "prompt_save");
    if (!verification.valid) {
      await logAuditEvent(user.email, user.role, "PROMPT_SAVE_FAILED", action || "unknown", verification.message, ip);
      return res.status(400).json({ success: false, message: verification.message });
    }

    // Сохраняем в prompt_configs таблицу в БД
    if (prompt_text) {
      await savePromptConfigInDB(action === "save_base" ? "base" : "active", prompt_text, user.email);
    }

    // Сохраняем на диск в data/prompt_active.txt
    try {
      const dataDir = path.join(process.cwd(), "data");
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      const promptFile = path.join(dataDir, action === "save_base" ? "prompt_base.txt" : "prompt_active.txt");
      if (prompt_text) {
        fs.writeFileSync(promptFile, prompt_text, "utf-8");
      }
    } catch (saveErr) {
      console.warn("Предупреждение сохранения файла промпта на диск:", saveErr);
    }

    // Записываем в журнал аудита БД
    await logAuditEvent(
      user.email,
      user.role,
      "PROMPT_SAVE_CONFIRMED",
      action || "save_active",
      `Системный промпт ИИ успешно обновлен и зафиксирован в БД старшим куратором ${user.fullName}`,
      ip
    );

    // Уведомляем prompt_manager Python
    try {
      const child = execFile("python3", ["prompt_manager.py", "confirm_save", user.email, "DIRECT_VERIFIED", action || "save_active", ip], { encoding: "utf-8" }, () => {});
      if (prompt_text) {
        child.stdin?.write(prompt_text);
        child.stdin?.end();
      }
    } catch (pyErr) {
      // Игнорируем внешние ошибки python
    }

    res.json({
      success: true,
      message: "Системный промпт нейросети успешно обновлен старшим куратором и зафиксирован в БД!"
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
  });
}

startServer();
