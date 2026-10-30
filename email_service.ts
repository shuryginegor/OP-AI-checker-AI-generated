import nodemailer from 'nodemailer';

interface SendEmailResult {
  sent: boolean;
  message: string;
  devMode: boolean;
  from?: string;
}

// Проверяем, настроен ли реальный SMTP в файле .env
function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE !== 'false';

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass
    }
  });
}

/**
 * Отправляет красивое фирменное письмо с одноразовым кодом на электронную почту
 */
export async function sendOTPEmail(
  toEmail: string,
  code: string,
  purpose: 'login' | 'prompt_save' = 'login',
  actionDetails?: string
): Promise<SendEmailResult> {
  const transporter = getTransporter();
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || '"Олимпиадные Практики" <auth@olympiadpractices.ru>';

  const isLogin = purpose === 'login';
  const subject = isLogin
    ? 'Код авторизации в личный кабинет «Олимпиадные Практики»'
    : 'Код подтверждения изменения промпта ИИ «Олимпиадные Практики»';

  const title = isLogin
    ? 'Вход в личный кабинет куратора'
    : '2FA-подтверждение изменения промпта нейросети';

  const subtitle = isLogin
    ? 'Вы запросили одноразовый код для входа в единый портал методического контроля вебинаров КТалк.'
    : `Вы запросили подтверждение операции: ${actionDetails || 'Сохранение системного промпта нейросети GigaChat-2-Pro'}.`;

  const htmlContent = `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #14102C; margin: 0; padding: 24px; color: #FFFFFF; }
    .container { max-width: 540px; margin: 0 auto; background-color: #1B153B; border: 1px solid #4F3B9B; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .header { padding: 28px 24px 20px; background: linear-gradient(135deg, #2B2363, #1F1A44); border-bottom: 1px solid rgba(79, 59, 155, 0.4); text-align: center; }
    .brand-title { font-size: 15px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; color: #FFFFFF; margin-top: 8px; }
    .brand-coral { color: #FF5252; }
    .body { padding: 32px 24px; text-align: center; }
    .h1 { font-size: 20px; font-weight: 800; color: #FFFFFF; margin: 0 0 10px; }
    .desc { font-size: 13px; color: #CBD5E1; line-height: 1.6; margin: 0 0 24px; }
    .code-box { background-color: #14102C; border: 1px solid #FF5252; border-radius: 14px; padding: 18px 24px; display: inline-block; margin: 0 auto 20px; letter-spacing: 8px; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 32px; font-weight: 900; color: #FFFFFF; }
    .expiry { font-size: 12px; color: #F59E0B; margin: 0 0 20px; font-weight: 600; }
    .warning { font-size: 11px; color: #94A3B8; line-height: 1.5; padding: 16px; background-color: #120E27; border-radius: 12px; text-align: left; }
    .footer { padding: 20px; text-align: center; font-size: 11px; color: #64748B; border-top: 1px solid rgba(79, 59, 155, 0.2); }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand-title">Олимпиадные<span class="brand-coral">Практики</span></div>
      <div style="font-size: 11px; color: #A5B4FC; margin-top: 4px;">Центр олимпиадной подготовки • olympiadpractices.ru</div>
    </div>
    <div class="body">
      <div class="h1">${title}</div>
      <div class="desc">${subtitle}</div>
      <div class="code-box">${code}</div>
      <div class="expiry">⏱ Код действителен в течение 5 минут</div>
      <div class="warning">
        🔒 <strong>Безопасность:</strong> Никому не сообщайте этот код, даже сотрудникам методического отдела. Если вы не запрашивали вход или изменение промпта, срочно обратитесь к старшему куратору.
      </div>
    </div>
    <div class="footer">
      Школа Олимпиадной Подготовки «Олимпиадные Практики»<br>
      Автоматическая система контроля качества преподавания
    </div>
  </div>
</body>
</html>
  `;

  // 1. Если SMTP настроен в .env — отправляем реальное письмо через почтовый сервер
  if (transporter) {
    try {
      await transporter.sendMail({
        from: fromAddress,
        to: toEmail,
        subject,
        html: htmlContent,
        text: `${title}\n\nВаш одноразовый код: ${code}\n\nСрок действия: 5 минут.\nЕсли вы не запрашивали код, проигнорируйте это письмо.`
      });

      console.log(`[EMAIL SMTP] ✅ Настоящее письмо успешно доставлено на почту ${toEmail} от ${fromAddress}`);
      return {
        sent: true,
        message: `Письмо с кодом отправлено на адрес ${toEmail}. Проверьте входящие или папку Спам.`,
        devMode: false,
        from: fromAddress
      };
    } catch (err: any) {
      console.error(`[EMAIL SMTP] ❌ Ошибка отправки письма через SMTP (${err.message}). Выполнен fallback в консоль.`);
    }
  }

  // 2. Если SMTP еще не заполнен в .env — логируем в консоль (режим локальной разработки)
  console.log(`\n======================================================================`);
  console.log(`[EMAIL OTP СЕРВИС] 📧 Получатель: ${toEmail}`);
  console.log(`[EMAIL OTP СЕРВИС] 📨 Отправитель: ${fromAddress}`);
  console.log(`[EMAIL OTP СЕРВИС] 🔑 Одноразовый 6-значный код: >>> ${code} <<<`);
  console.log(`[EMAIL OTP СЕРВИС] ⏱ Срок действия: 5 минут`);
  console.log(`[EMAIL OTP СЕРВИС] (Чтобы слать реальные письма через интернет, укажите SMTP_* в .env)`);
  console.log(`======================================================================\n`);

  return {
    sent: false,
    message: `Код подтверждения сгенерирован для ${toEmail}.`,
    devMode: true,
    from: fromAddress
  };
}
