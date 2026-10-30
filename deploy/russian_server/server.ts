import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import path from "path";
import crypto from "crypto";
import { execFile, spawn, ChildProcess } from "child_process";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(cors());
  app.use(express.json());

  // Защита от брутфорса и флуда: rate-limiter по IP-адресу для токен-эндпоинтов
  const ipRequestCounts = new Map<string, { count: number; resetTime: number }>();
  const tokenRateLimiter = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const entry = ipRequestCounts.get(ip);
    const windowMs = 60 * 1000; // Окно 1 минута
    const limit = 45; // Максимум 45 запросов в минуту с одного IP

    if (!entry || now > entry.resetTime) {
      ipRequestCounts.set(ip, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (entry.count >= limit) {
      return res.status(429).json({
        success: false,
        message: "Слишком много запросов. Доступ временно ограничен для защиты от брутфорса. Попробуйте через минуту."
      });
    }

    entry.count++;
    next();
  };

  // Очистка устаревших записей rate-limiter каждые 5 минут
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of ipRequestCounts.entries()) {
      if (now > entry.resetTime) {
        ipRequestCounts.delete(ip);
      }
    }
  }, 5 * 60 * 1000);

  // API endpoint для получения схемы базы данных
  app.get("/api/db-schema.jpg", (req, res) => {
    res.sendFile(path.join(process.cwd(), "db_schema.jpg"));
  });

  // API endpoint для получения флагов конфигурации (например, режима тестирования)
  app.get("/api/config", (req, res) => {
    const isTesting = process.env.TESTING_MODE === "true" || process.env.VITE_TESTING_MODE === "true";
    res.json({
      testing_mode: isTesting
    });
  });

  // API endpoint для сгорающей одноразовой ссылки на статистику преподавателя
  app.get("/api/stats-token/:token", tokenRateLimiter, (req, res) => {
    const token = req.params.token;
    if (!token || typeof token !== "string" || !/^[a-zA-Z0-9_.-]{1,128}$/.test(token)) {
      return res.status(400).json({ success: false, message: "Некорректный формат токена ссылки." });
    }

    const pyCode = `
import database, asyncio, json, sys
res = asyncio.run(database.get_and_consume_stats_token(sys.argv[1]))
print(json.dumps(res, ensure_ascii=False))
`;

    execFile("python3", ["-c", pyCode, token], { encoding: "utf-8" }, (error, stdout, stderr) => {
      if (error) {
        console.error("Ошибка при выполнении токена в Python:", error, stderr);
        return res.status(500).json({ success: false, message: "Ошибка сервера при обработке токена." });
      }
      try {
        const raw = stdout.trim();
        const startIdx = raw.indexOf("{");
        const endIdx = raw.lastIndexOf("}");
        if (startIdx === -1 || endIdx === -1) {
          throw new Error("Не найден JSON в выводе Python: " + raw);
        }
        const result = JSON.parse(raw.substring(startIdx, endIdx + 1));
        if (result.status === "ok") {
          return res.json({
            success: true,
            teacher_name: result.teacher_name,
            responses: result.responses
          });
        } else {
          return res.status(403).json({
            success: false,
            error: result.status,
            message: result.message
          });
        }
      } catch (e) {
        console.error("Ошибка парсинга вывода Python:", stdout, e);
        return res.status(500).json({ success: false, message: "Неверный ответ сервера." });
      }
    });
  });

  // API endpoint для сгорающей одноразовой ссылки на реестр запросов кураторов (админка)
  app.get("/api/admin-token/:token", tokenRateLimiter, (req, res) => {
    const token = req.params.token;
    if (!token || typeof token !== "string" || !/^[a-zA-Z0-9_.-]{1,128}$/.test(token)) {
      return res.status(400).json({ success: false, message: "Некорректный формат токена админ-ссылки." });
    }

    const pyCode = `
import database, asyncio, json, sys
res = asyncio.run(database.get_and_consume_admin_responses_token(sys.argv[1]))
print(json.dumps(res, ensure_ascii=False))
`;

    execFile("python3", ["-c", pyCode, token], { encoding: "utf-8" }, (error, stdout, stderr) => {
      if (error) {
        console.error("Ошибка при выполнении админ-токена в Python:", error, stderr);
        return res.status(500).json({ success: false, message: "Ошибка сервера при обработке токена." });
      }
      try {
        const raw = stdout.trim();
        const startIdx = raw.indexOf("{");
        const endIdx = raw.lastIndexOf("}");
        if (startIdx === -1 || endIdx === -1) {
          throw new Error("Не найден JSON в выводе Python: " + raw);
        }
        const result = JSON.parse(raw.substring(startIdx, endIdx + 1));
        if (result.status === "ok") {
          return res.json({
            success: true,
            responses: result.responses
          });
        } else {
          return res.status(403).json({
            success: false,
            error: result.status,
            message: result.message
          });
        }
      } catch (e) {
        console.error("Ошибка парсинга вывода Python:", stdout, e);
        return res.status(500).json({ success: false, message: "Неверный ответ сервера." });
      }
    });
  });

  // --- API для защищенного редактирования системного промпта нейросети (2FA через Telegram) --- //
  const TOKEN_SECRET = process.env.TOKEN_SECRET || "olymp-secret-key-2026-checker-secret-secure-salt-2026";

  const createPromptSessionToken = (username: string): string => {
    const ts = Date.now();
    const payload = `${username}:${ts}`;
    const sig = crypto.createHmac("sha256", TOKEN_SECRET).update(`prompt_session:${payload}`).digest("hex").slice(0, 32);
    return `ps_${username}_${ts}_${sig}`;
  };

  const verifyPromptSessionToken = (token: string): { valid: boolean; username?: string } => {
    if (!token || !token.startsWith("ps_")) return { valid: false };
    const parts = token.split("_");
    if (parts.length !== 4) return { valid: false };
    const [, username, tsStr, sig] = parts;
    const ts = parseInt(tsStr, 10);
    if (isNaN(ts) || Date.now() - ts > 4 * 60 * 60 * 1000) {
      return { valid: false };
    }
    const payload = `${username}:${ts}`;
    const expectedSig = crypto.createHmac("sha256", TOKEN_SECRET).update(`prompt_session:${payload}`).digest("hex").slice(0, 32);
    if (sig.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return { valid: false };
    }
    return { valid: true, username };
  };

  const promptAuthMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Требуется авторизация." });
    }
    const token = authHeader.slice(7).trim();
    const { valid, username } = verifyPromptSessionToken(token);
    if (!valid || !username) {
      return res.status(401).json({ success: false, message: "Сессия истекла или недействительна. Пожалуйста, войдите снова." });
    }
    (req as any).promptUser = username;
    next();
  };

  // 1. Запрос 6-значного кода в Telegram для входа в панель промпта
  app.post("/api/prompt/request-login-code", tokenRateLimiter, async (req, res) => {
    const rawUsername = req.body.username;
    if (!rawUsername || typeof rawUsername !== "string") {
      return res.status(400).json({ success: false, message: "Не указан Telegram Username." });
    }
    const username = rawUsername.trim().replace(/^@/, "").toLowerCase();
    if (!/^[a-zA-Z0-9_]{3,64}$/.test(username)) {
      return res.status(400).json({ success: false, message: "Некорректный формат Telegram Username." });
    }
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";

    execFile("python3", ["prompt_manager.py", "request_login", username, ip], { encoding: "utf-8" }, async (err, stdout, stderr) => {
      if (err) {
        console.error("Ошибка prompt_manager request_login:", err, stderr);
        return res.status(500).json({ success: false, message: "Ошибка сервера при запросе кода." });
      }
      try {
        const raw = stdout.trim();
        const startIdx = raw.indexOf("{");
        const endIdx = raw.lastIndexOf("}");
        const data = JSON.parse(raw.substring(startIdx, endIdx + 1));

        if (!data.success) {
          const status = data.code === "FORBIDDEN" ? 403 : (data.code === "NO_TELEGRAM_ID" ? 400 : 500);
          return res.status(status).json({ success: false, message: data.message });
        }

        const botToken = process.env.BOT_TOKEN;
        if (!botToken) {
          return res.status(500).json({ success: false, message: "BOT_TOKEN не настроен на сервере." });
        }

        // Отправка кода в Telegram через Bot API
        const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: data.telegram_id,
            text: `🔐 <b>Код авторизации в панель промпта ИИ:</b>\n\n<code>${data.code}</code>\n\n⏱ Действителен 5 минут.\nЕсли вы не запрашивали вход, проигнорируйте это сообщение.`,
            parse_mode: "HTML"
          })
        });

        if (!tgRes.ok) {
          const tgErr = await tgRes.text();
          console.error("Ошибка Telegram API при отправке кода:", tgErr);
          return res.status(500).json({
            success: false,
            message: "Не удалось отправить сообщение в Telegram. Убедитесь, что бот не заблокирован в вашем чате."
          });
        }

        return res.json({
          success: true,
          message: `Код подтверждения отправлен в ваш Telegram (@${username}). Проверьте сообщения от бота.`
        });
      } catch (e) {
        console.error("Ошибка обработки вывода Python:", stdout, e);
        return res.status(500).json({ success: false, message: "Ошибка сервера." });
      }
    });
  });

  // 2. Проверка кода авторизации и выдача сессионного токена
  app.post("/api/prompt/verify-login-code", tokenRateLimiter, (req, res) => {
    const { username: rawUsername, code } = req.body;
    if (!rawUsername || !code || typeof rawUsername !== "string" || typeof code !== "string") {
      return res.status(400).json({ success: false, message: "Заполните имя пользователя и код." });
    }
    const username = rawUsername.trim().replace(/^@/, "").toLowerCase();
    const cleanCode = code.trim();
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";

    execFile("python3", ["prompt_manager.py", "verify_login", username, cleanCode, ip], { encoding: "utf-8" }, (err, stdout, stderr) => {
      if (err) {
        console.error("Ошибка prompt_manager verify_login:", err, stderr);
        return res.status(500).json({ success: false, message: "Ошибка сервера при проверке кода." });
      }
      try {
        const raw = stdout.trim();
        const startIdx = raw.indexOf("{");
        const endIdx = raw.lastIndexOf("}");
        const data = JSON.parse(raw.substring(startIdx, endIdx + 1));

        if (!data.success) {
          return res.status(401).json({ success: false, message: data.message || "Неверный код." });
        }

        const sessionToken = createPromptSessionToken(username);
        return res.json({
          success: true,
          session_token: sessionToken,
          username: username
        });
      } catch (e) {
        console.error("Ошибка парсинга вывода Python:", stdout, e);
        return res.status(500).json({ success: false, message: "Ошибка сервера." });
      }
    });
  });

  // 3. Получение текущих промптов и логов аудита
  app.get("/api/prompt/data", promptAuthMiddleware, (req, res) => {
    execFile("python3", ["prompt_manager.py", "get_data"], { encoding: "utf-8" }, (err, stdout, stderr) => {
      if (err) {
        console.error("Ошибка prompt_manager get_data:", err, stderr);
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

  // 4. Запрос 6-значного кода в Telegram для сохранения или сброса промпта
  app.post("/api/prompt/request-save-code", promptAuthMiddleware, (req, res) => {
    const username = (req as any).promptUser;
    const action = req.body.action || "save_active";
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";

    execFile("python3", ["prompt_manager.py", "request_save_code", username, action, ip], { encoding: "utf-8" }, async (err, stdout, stderr) => {
      if (err) {
        console.error("Ошибка prompt_manager request_save_code:", err, stderr);
        return res.status(500).json({ success: false, message: "Ошибка сервера при генерации кода сохранения." });
      }
      try {
        const raw = stdout.trim();
        const startIdx = raw.indexOf("{");
        const endIdx = raw.lastIndexOf("}");
        const data = JSON.parse(raw.substring(startIdx, endIdx + 1));

        if (!data.success) {
          return res.status(400).json({ success: false, message: data.message });
        }

        const botToken = process.env.BOT_TOKEN;
        if (!botToken) {
          return res.status(500).json({ success: false, message: "BOT_TOKEN не настроен на сервере." });
        }

        const actionTitles: Record<string, string> = {
          save_active: "Сохранение рабочего промпта ИИ",
          save_base: "Фиксация нового базового эталона промпта",
          reset_to_base: "Сброс к сохраненному базовому эталону",
          reset_to_factory: "Сброс к заводскому промпту разработчика"
        };
        const actionDesc = actionTitles[action] || "Изменение системного промпта ИИ";

        const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: data.telegram_id,
            text: `⚠️ <b>Подтверждение изменения промпта ИИ</b>\n\nДействие: <b>${actionDesc}</b>\nАдминистратор: @${username}\n\nКод подтверждения:\n<code>${data.code}</code>\n\n⏱ Срок действия кода: 5 минут.`,
            parse_mode: "HTML"
          })
        });

        if (!tgRes.ok) {
          return res.status(500).json({ success: false, message: "Не удалось отправить код подтверждения в Telegram." });
        }

        return res.json({
          success: true,
          message: "Код подтверждения сохранения отправлен в ваш Telegram-бот."
        });
      } catch (e) {
        console.error("Ошибка обработки вывода Python:", stdout, e);
        return res.status(500).json({ success: false, message: "Ошибка сервера." });
      }
    });
  });

  // 5. Подтверждение сохранения промпта с кодом из Telegram
  app.post("/api/prompt/confirm-save", promptAuthMiddleware, (req, res) => {
    const username = (req as any).promptUser;
    const { code, action, prompt_text } = req.body;
    if (!code || !action || typeof code !== "string" || typeof action !== "string") {
      return res.status(400).json({ success: false, message: "Не указан код подтверждения или действие." });
    }
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";

    const child = execFile("python3", ["prompt_manager.py", "confirm_save", username, code.trim(), action, ip], { encoding: "utf-8" }, (err, stdout, stderr) => {
      if (err) {
        console.error("Ошибка prompt_manager confirm_save:", err, stderr);
        return res.status(500).json({ success: false, message: "Ошибка сервера при сохранении промпта." });
      }
      try {
        const raw = stdout.trim();
        const startIdx = raw.indexOf("{");
        const endIdx = raw.lastIndexOf("}");
        const data = JSON.parse(raw.substring(startIdx, endIdx + 1));
        if (!data.success) {
          return res.status(400).json({ success: false, message: data.message });
        }
        return res.json(data);
      } catch (e) {
        console.error("Ошибка парсинга вывода Python:", stdout, e);
        return res.status(500).json({ success: false, message: "Ошибка сервера при разборе ответа." });
      }
    });

    child.stdin?.write(prompt_text || "");
    child.stdin?.end();
  });

  // Автозапуск и супервизор процессов (Бот / Российский Воркер обработки лекций)
  let botProc: ChildProcess | null = null;
  let workerProc: ChildProcess | null = null;
  let isShuttingDown = false;

  const isLocalBotDisabled =
    process.env.RUN_LOCAL_BOT === "false" ||
    process.env.DISABLE_LOCAL_BOT === "true" ||
    process.env.BOT_MODE === "standalone";

  const isRussianWorkerEnabled =
    process.env.RUN_RUSSIAN_WORKER === "true" ||
    process.env.ENABLE_WORKER === "true" ||
    isLocalBotDisabled; // По умолчанию, если бот на зарубежном сервере, российский сервер запускает воркер обработки

  const startTelegramBot = () => {
    if (isShuttingDown) return;
    if (isLocalBotDisabled) {
      console.log("[Telegram Bot] Локальный запуск бота отключен (RUN_LOCAL_BOT=false). Бот работает на выделенном зарубежном сервере.");
      return;
    }
    if (!process.env.BOT_TOKEN) {
      console.log("[Telegram Bot] BOT_TOKEN не указан в окружении, бот не запущен.");
      return;
    }

    console.log("[Telegram Bot] Запуск процесса tg_bot.py...");
    botProc = spawn("python3", ["tg_bot.py"], {
      stdio: ["ignore", "inherit", "inherit"],
    });

    botProc.on("error", (err) => {
      console.error("[Telegram Bot] Ошибка запуска tg_bot.py:", err);
    });

    botProc.on("exit", (code, signal) => {
      botProc = null;
      if (!isShuttingDown) {
        console.warn(`[Telegram Bot] Процесс tg_bot.py завершился (код: ${code}, сигнал: ${signal}). Перезапуск через 3 сек...`);
        setTimeout(startTelegramBot, 3000);
      }
    });
  };

  const startRussianWorker = () => {
    if (isShuttingDown) return;
    if (!isRussianWorkerEnabled) return;

    console.log("[Russian Worker] Запуск фонового процессора обработки лекций worker_processor.py...");
    workerProc = spawn("python3", ["worker_processor.py"], {
      stdio: ["ignore", "inherit", "inherit"],
    });

    workerProc.on("error", (err) => {
      console.error("[Russian Worker] Ошибка запуска worker_processor.py:", err);
    });

    workerProc.on("exit", (code, signal) => {
      workerProc = null;
      if (!isShuttingDown) {
        console.warn(`[Russian Worker] Процесс worker_processor.py завершился (код: ${code}, сигнал: ${signal}). Перезапуск через 4 сек...`);
        setTimeout(startRussianWorker, 4000);
      }
    });
  };

  // Запуск компонентов
  if (!isLocalBotDisabled) {
    execFile("pkill", ["-9", "-f", "tg_bot.py"], () => {
      startTelegramBot();
    });
  } else {
    console.log("[Telegram Bot] Веб-сервер работает в автономном режиме. Бот хостится на зарубежном сервере.");
  }

  if (isRussianWorkerEnabled) {
    execFile("pkill", ["-9", "-f", "worker_processor.py"], () => {
      startRussianWorker();
    });
  }

  const cleanup = () => {
    isShuttingDown = true;
    if (botProc) {
      console.log("[Telegram Bot] Завершение процесса бота...");
      botProc.kill("SIGTERM");
    }
    if (workerProc) {
      console.log("[Russian Worker] Завершение процесса воркера...");
      workerProc.kill("SIGTERM");
    }
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("exit", cleanup);

  // Настройка Vite middleware
  if (process.env.NODE_ENV !== "production") {
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
    console.log(`Сервер запущен на http://0.0.0.0:${PORT}`);
  });
}

startServer();
