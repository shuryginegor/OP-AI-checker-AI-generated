"""
Фоновый воркер для обработки лекций на Российском сервере.
Запускается на Российском сервере, опрашивает базу данных PostgreSQL
на наличие новых задач (point = -1), выполняет:
1. Скачивание видео/транскрипта через КТалк API
2. Нарезку аудио и ключевых кадров через ffmpeg
3. Анализ занятия в нейросети Сбер GigaChat-2-Pro
4. Сохранение экспертной оценки в БД
5. Уведомление куратора в Telegram через официальный Bot API (sendMessage)
"""

import asyncio
import logging
import os
import sys
import time
import html
import traceback
from typing import Optional
from dotenv import load_dotenv

import database
import fetch_talk
import file_processing
import ai_gigachat as ai
import ai_common
import logger_config

logger = logging.getLogger("worker_processor")
load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")


class DirectTelegramNotifier:
    """
    Легковесный клиент для отправки результатов в Telegram с Российского сервера.
    Использует прямой HTTP-запрос к Telegram Bot API без необходимости запускать polling.
    """
    def __init__(self, token: str):
        self.token = token
        import httpx
        self.client = httpx.AsyncClient(timeout=httpx.Timeout(30.0))

    async def send_message(self, chat_id: int, text: str, parse_mode: Optional[str] = "HTML"):
        if not self.token:
            logger.warning("[Telegram Notifier] BOT_TOKEN не задан, уведомление пропущено.")
            return

        url = f"https://api.telegram.org/bot{self.token}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": text,
            "disable_web_page_preview": True
        }
        if parse_mode:
            payload["parse_mode"] = parse_mode

        try:
            resp = await self.client.post(url, json=payload)
            if resp.status_code != 200:
                logger.warning(f"[Telegram Notifier] Ошибка отправки ({resp.status_code}): {resp.text}")
                # Пробуем без форматирования если ошибка парсинга HTML/Markdown
                if parse_mode:
                    import re
                    clean_text = re.sub(r'<[^>]+>', '', text)
                    payload["text"] = clean_text
                    payload.pop("parse_mode", None)
                    await self.client.post(url, json=payload)
        except Exception as e:
            logger.error(f"[Telegram Notifier] Исключение при отправке сообщения в Telegram: {e}")

    async def aclose(self):
        try:
            await self.client.aclose()
        except Exception:
            pass


async def process_single_task(job: dict, notifier: DirectTelegramNotifier):
    """Выполняет полный цикл обработки одной лекции."""
    response_id = job.get("id")
    tg_id = job.get("telegram_id")
    link = job.get("link")
    additional_info = job.get("additional_info") or ""
    teacher = job.get("teacher") or "Преподаватель"

    logger.info(f"🚀 [Воркер РФ] Начало обработки лекции #{response_id} для куратора {tg_id}...")

    # Уведомляем куратора о начале скачивания на российском сервере
    await notifier.send_message(
        tg_id,
        f"⏳ <b>Сервер в РФ приступил к обработке лекции #{response_id}</b>\n"
        f"👤 <b>Преподаватель:</b> {html.escape(teacher)}\n"
        f"📥 Скачиваем видеозапись и материалы с КТалк...",
        parse_mode="HTML"
    )

    artifacts = None
    try:
        # 1. Скачивание видеозаписи и текстовых материалов
        artifacts = await fetch_talk.download_all_artifacts_by_url(link, fetch_talk.get_api_key())
        if not artifacts or not artifacts.get("video"):
            err_msg = "Не удалось скачать видеозапись лекции с КТалк. Проверьте права доступа к записи."
            logger.error(f"[Воркер РФ] {err_msg} (response_id: {response_id})")
            await database.write_result(response_id, 0, True, err_msg)
            await notifier.send_message(tg_id, f"❌ Ошибка проверки лекции #{response_id}: {err_msg}")
            return

        await notifier.send_message(
            tg_id,
            f"🎬 Видеозапись успешно скачана!\n"
            f"⚙️ Выполняем нарезку аудио, извлечение кадров и отправку в Сбер GigaChat-2-Pro..."
        )

        # 2. Обработка медиафайлов и отправка в GigaChat
        job_name = await ai.process(
            artifacts,
            additional_info,
            bot=notifier,
            tg_id=tg_id,
            db_id=response_id
        )
        await database.write_job_name(response_id, job_name)
        logger.info(f"[Воркер РФ] Лекция #{response_id} передана в GigaChat (job_name: {job_name})")

    except Exception as e:
        tb = traceback.format_exc()
        logger.error(f"[Воркер РФ] Критическая ошибка обработки лекции #{response_id}: {e}\n{tb}")
        await database.write_result(response_id, 0, True, f"Внутренняя ошибка воркера: {e}")
        await notifier.send_message(
            tg_id,
            f"❌ Произошла ошибка при обработке лекции #{response_id} нейросетью: {html.escape(str(e))}",
            parse_mode="HTML"
        )
    finally:
        # Очистка локальных временных файлов на диске (152-ФЗ)
        if artifacts:
            await file_processing.delete_files([
                artifacts.get("video"),
                artifacts.get("audio"),
                artifacts.get("transcript"),
                artifacts.get("summary")
            ])


async def run_worker_loop():
    """Бесконечный фоновый цикл поиска задач в БД."""
    logger.info("Запуск фонового воркера обработки лекций на Российском сервере...")
    await database.init_db()

    notifier = DirectTelegramNotifier(BOT_TOKEN)

    try:
        while True:
            try:
                # Ищем задачи со статусом point = -1
                jobs = await database.get_jobs()
                if jobs:
                    for job in jobs:
                        # Обрабатываем только новые задачи (где еще не сформирован gigachat_ job_name)
                        job_name = job.get("job_name") or ""
                        if not job_name or not job_name.startswith("gigachat_"):
                            await process_single_task(job, notifier)
                
                await asyncio.sleep(4)
            except (asyncio.CancelledError, KeyboardInterrupt):
                break
            except Exception as e:
                logger.error(f"[Воркер РФ] Ошибка в цикле опроса задач: {e}")
                await asyncio.sleep(5)
    finally:
        await notifier.aclose()
        await database.close_db()
        logger.info("[Воркер РФ] Воркер остановлен.")


if __name__ == "__main__":
    try:
        asyncio.run(run_worker_loop())
    except (KeyboardInterrupt, SystemExit):
        pass
