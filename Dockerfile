# syntax=docker/dockerfile:1
# ------------------------------------------------------------------------------
# Stage 1: Build Frontend and Node Server
# ------------------------------------------------------------------------------
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Copy package definitions
COPY package.json package-lock.json* bun.lock* ./

# Install dependencies for compilation
RUN npm install

# Copy source code and config files
COPY tsconfig.json vite.config.ts index.html *.ts ./
COPY src ./src
COPY public ./public*

# Build Vite static assets and bundle server.ts into dist/server.cjs
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Production Runtime (Node.js + Python 3 + FFmpeg)
# ------------------------------------------------------------------------------
FROM node:20-bookworm-slim AS runner

# Set timezone and non-interactive frontend
ENV DEBIAN_FRONTEND=noninteractive \
    TZ=UTC

# Install system dependencies:
# - python3, python3-pip, python3-venv: Required for Telegram bot and AI logic
# - ffmpeg: Required for video/audio processing and frame extraction
# - procps: Required for pkill/ps process supervisor in server.ts
# - ca-certificates: Required for secure HTTPS requests (KTalk, GigaChat, etc.)
# - curl: Required for Docker healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    procps \
    ca-certificates \
    curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Configure isolated Python virtual environment
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Install Python packages inside virtual environment
COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt

# Install production-only Node.js dependencies
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Copy compiled frontend and backend from builder stage
COPY --from=builder /app/dist ./dist

# Copy Python modules, configuration, and static assets
COPY *.py ./
COPY *.ts ./
COPY db_schema.jpg ./
COPY COMPLIANCE_152FZ.md ./
COPY certs ./certs

# Prepare directory for persistent prompts and files storage
RUN mkdir -p /app/data && chmod 777 /app/data

# Default environment configuration (Production with PostgreSQL 16)
ENV NODE_ENV=production \
    PORT=3000 \
    DB_TYPE=postgres \
    DB_HOST=postgres \
    DB_PORT=5432 \
    DB_USER=postgres \
    DB_PASSWORD=postgres_password \
    DB_NAME=lecture_db \
    PYTHONUNBUFFERED=1

# Expose web server port
EXPOSE 3000

# Docker healthcheck checking web server readiness
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:${PORT}/api/config || exit 1

# Start Node.js server (which automatically supervises tg_bot.py)
CMD ["npm", "start"]
