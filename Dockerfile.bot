# ==============================================================================
# Dockerfile для ЗАРУБЕЖНОГО СЕРВЕРА (Только Telegram-бот)
# ==============================================================================
# Этот сервер отвечает ИСКЛЮЧИТЕЛЬНО за взаимодействие с Telegram:
# - Прием команд от кураторов (/start, выбор преподавателя, отправка ссылок)
# - Генерация интерактивных кнопок и разовых ссылок
# - Регистрация задач в PostgreSQL на Российском сервере
# 
# Никаких тяжелых видеофайлов, ffmpeg и обращений к GigaChat здесь нет.
# Вся обработка медиа и ИИ происходят в РФ.
# ==============================================================================

FROM python:3.10-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Устанавливаем только библиотеки бота и базы данных (aiogram, asyncpg, httpx)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копируем файлы логики Telegram-бота
COPY tg_bot.py ./
COPY database.py ./
COPY fetch_talk.py ./
COPY criteria.py ./
COPY ai_common.py ./
COPY ai_gigachat.py ./
COPY file_processing.py ./
COPY logger_config.py ./
COPY testing_config.py ./

# Переменные окружения по умолчанию
ENV PYTHONUNBUFFERED=1 \
    DB_TYPE=postgres \
    REMOTE_PROCESSOR_MODE=true

# Точка входа: запуск легковесного Telegram-бота
CMD ["python3", "tg_bot.py"]
