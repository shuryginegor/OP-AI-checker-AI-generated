# ==============================================================================
# Dockerfile для Российского Сервера (Web UI, API, Редактор промптов, База,
# СКАЧИВАНИЕ ЛЕКЦИЙ, ОБРАБОТКА МЕДИА И ОТПРАВКА В СБЕР GIGACHAT)
# ==============================================================================
# Российский сервер обеспечивает:
# 1. Локализацию базы данных и ПДн преподавателей в РФ (152-ФЗ)
# 2. Скачивание видеозаписей и материалов из КТалк на российский диск
# 3. Нарезку аудиодорожек и ключевых кадров (ffmpeg)
# 4. Анализ встреч через Сбер GigaChat-2-Pro (сертификаты Минцифры РФ)
# 5. Веб-панель аналитики, разовые ссылки и редактор системного промпта
# ==============================================================================

# ------------------------------------------------------------------------------
# ЭТАП 1: Сборка React фронтенда и Node.js сервера
# ------------------------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# ------------------------------------------------------------------------------
# ЭТАП 2: Финальный рабочий образ (с ffmpeg и сертификатами Минцифры РФ)
# ------------------------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

# Установка Python3, ffmpeg для нарезки видео, curl и сертификатов
RUN apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg \
    ca-certificates \
    curl

# Установка доверенных корневых сертификатов Минцифры РФ (для API Сбера)
COPY certs/russian_trusted_root_ca.pem /usr/local/share/ca-certificates/russian_trusted_root_ca.crt
RUN update-ca-certificates

# Установка только production npm-пакетов
COPY package*.json ./
RUN npm install --omit=dev

# Установка всех Python-зависимостей (asyncpg, gigachat, httpx, moviepy, pillow)
COPY requirements.txt ./
RUN pip install --no-cache-dir --break-system-packages -r requirements.txt

# Копирование скомпилированного фронтенда и бандла сервера
COPY --from=builder /app/dist ./dist

# Копирование модулей веб-сервера, базы данных, промптов и аналитики
COPY server.ts ./
COPY database.py ./
COPY criteria.py ./
COPY prompt_manager.py ./
COPY logger_config.py ./
COPY testing_config.py ./
COPY COMPLIANCE_152FZ.md ./
COPY certs ./certs

# Копирование модулей скачивания, обработки видео и GigaChat
COPY worker_processor.py ./
COPY fetch_talk.py ./
COPY file_processing.py ./
COPY ai_gigachat.py ./
COPY ai_common.py ./

# Директории для постоянного хранения промптов и временной обработки медиа
RUN mkdir -p /app/data /app/temp_lectures && chmod -R 777 /app/data /app/temp_lectures

# Переменные окружения по умолчанию
ENV NODE_ENV=production \
    PORT=3000 \
    RUN_LOCAL_BOT=false \
    RUN_RUSSIAN_WORKER=true \
    DB_TYPE=postgres \
    DB_HOST=postgres \
    DB_PORT=5432 \
    DB_USER=postgres \
    DB_PASSWORD=postgres_password \
    DB_NAME=lecture_db \
    PYTHONUNBUFFERED=1

EXPOSE 3000

# Запуск единого производственного сервера (поднимает Web API + фоновый воркер обработки лекций)
CMD ["node", "dist/server.cjs"]
