import asyncio
import os
import ssl
import json
import logging
import uuid
import time
import traceback
import urllib.request
from typing import Optional, List, Tuple
import certifi
from PIL import Image

from gigachat import GigaChat
from gigachat.models import Chat, Messages, MessagesRole
from gigachat.exceptions import GigaChatException, ResponseError, AuthenticationError

import database
import file_processing
import criteria
import ai_common
import logger_config

# Настройка логирования
logger = logging.getLogger(__name__)

# URL-адреса сертификатов Минцифры по умолчанию
DEFAULT_MINCIFRY_ROOT_URL = "https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt"
DEFAULT_MINCIFRY_SUB_URL = "https://gu-st.ru/content/lending/russian_trusted_sub_ca_pem.crt"

# Локальная директория для хранения бандла сертификатов
CERTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "certs")
BUNDLE_CERT_PATH = os.path.join(CERTS_DIR, "russian_trusted_bundle.pem")


def ensure_russian_certificates() -> Optional[str]:
    """
    Автоматически скачивает сертификаты безопасности Минцифры РФ (корневой и подчиненный),
    объединяет их с системным пулом certifi и сохраняет в локальный бандл.
    Возвращает абсолютный путь к CA bundle файлу или None при ошибке.
    """
    mincifry_root_url = os.getenv("GIGACHAT_MINCIFRY_ROOT_URL", DEFAULT_MINCIFRY_ROOT_URL)
    mincifry_sub_url = os.getenv("GIGACHAT_MINCIFRY_SUB_URL", DEFAULT_MINCIFRY_SUB_URL)

    try:
        os.makedirs(CERTS_DIR, exist_ok=True)
        root_cert_path = os.path.join(CERTS_DIR, "russian_trusted_root_ca.pem")
        sub_cert_path = os.path.join(CERTS_DIR, "russian_trusted_sub_ca.pem")

        # Скачиваем корневой сертификат при отсутствии
        if not os.path.exists(root_cert_path) or os.path.getsize(root_cert_path) == 0:
            logger.info(f"Скачивание корневого сертификата Минцифры РФ с {mincifry_root_url}...")
            urllib.request.urlretrieve(mincifry_root_url, root_cert_path)
            logger.debug(f"Корневой сертификат сохранен: {root_cert_path} ({os.path.getsize(root_cert_path)} байт)")

        # Скачиваем подчиненный сертификат при отсутствии
        if not os.path.exists(sub_cert_path) or os.path.getsize(sub_cert_path) == 0:
            logger.info(f"Скачивание подчиненного сертификата Минцифры РФ с {mincifry_sub_url}...")
            urllib.request.urlretrieve(mincifry_sub_url, sub_cert_path)
            logger.debug(f"Подчиненный сертификат сохранен: {sub_cert_path} ({os.path.getsize(sub_cert_path)} байт)")

        # Создаем общий бандл (certifi cacert + сертификаты Минцифры)
        certifi_path = certifi.where()
        with open(BUNDLE_CERT_PATH, "w", encoding="utf-8") as bundle_f:
            if os.path.exists(certifi_path):
                with open(certifi_path, "r", encoding="utf-8") as cf:
                    bundle_f.write(cf.read() + "\n")
            with open(root_cert_path, "r", encoding="utf-8") as rf:
                bundle_f.write(rf.read() + "\n")
            with open(sub_cert_path, "r", encoding="utf-8") as sf:
                bundle_f.write(sf.read() + "\n")

        logger.debug(f"Сертификаты Минцифры РФ проверены и сохранены в: {BUNDLE_CERT_PATH} ({os.path.getsize(BUNDLE_CERT_PATH)} байт)")
        return BUNDLE_CERT_PATH
    except Exception as e:
        logger.warning(f"Не удалось подготовить сертификаты Минцифры РФ ({e}). Будет использован системный пул.")
        return None


def get_gigachat_client() -> GigaChat:
    """
    Инициализирует и возвращает экземпляр клиента GigaChat
    с правильными учетными данными, моделью и CA-бандлом сертификатов Минцифры.
    """
    credentials = os.getenv("GIGACHAT_CREDENTIALS")
    scope = os.getenv("GIGACHAT_SCOPE", "GIGACHAT_API_PERS")
    model = os.getenv("GIGACHAT_MODEL", "GigaChat-2-Pro")
    
    # Проверка и подготовка сертификатов Минцифры
    ca_bundle = ensure_russian_certificates()

    # Флаг принудительного отключения верификации (если указан в .env)
    verify_ssl_env = os.getenv("GIGACHAT_VERIFY_SSL_CERTS", "true").lower()
    verify_ssl = False if verify_ssl_env in ("0", "false", "no") else True

    kwargs = {
        "credentials": credentials,
        "scope": scope,
        "model": model,
        "verify_ssl_certs": verify_ssl,
        "timeout": 600.0,
    }

    if ca_bundle and os.path.exists(ca_bundle) and verify_ssl:
        kwargs["ca_bundle_file"] = ca_bundle

    logger.debug(f"[GigaChat Init] model={model}, scope={scope}, verify_ssl={verify_ssl}, ca_bundle={bool(ca_bundle)}")
    return GigaChat(**kwargs)


def _optimize_image_for_gigachat_sync(img_path: str) -> str:
    """
    Оптимизирует размер изображения (до ~960x960, JPEG 70%)
    для надежной быстрой передачи в GigaChat Vision API и экономии токенов контекста.
    """
    if not os.path.exists(img_path):
        return img_path
    try:
        opt_img_path = img_path.replace(".jpg", "_gigachat_opt.jpg")
        with Image.open(img_path) as img:
            orig_w, orig_h = img.size
            img.thumbnail((960, 960))
            new_w, new_h = img.size
            img.save(opt_img_path, "JPEG", quality=70, optimize=True)
        logger.debug(f"[GigaChat Image] {os.path.basename(img_path)}: {orig_w}x{orig_h} -> {new_w}x{new_h} ({os.path.getsize(opt_img_path)/1024:.1f} KB)")
        return opt_img_path
    except Exception as e:
        logger.warning(f"Не удалось сжать кадр {img_path} для GigaChat: {e}")
        return img_path


async def _upload_single_frame(client: GigaChat, sem: asyncio.Semaphore, time_sec: int, img_path: str) -> Optional[Tuple[str, str, str]]:
    if not os.path.exists(img_path):
        return None

    hours = time_sec // 3600
    minutes = (time_sec % 3600) // 60
    seconds = time_sec % 60
    time_str = f"{hours:02d}:{minutes:02d}:{seconds:02d}" if hours > 0 else f"{minutes:02d}:{seconds:02d}"

    target_img_path = await asyncio.to_thread(_optimize_image_for_gigachat_sync, img_path)
    async with sem:
        try:
            with open(target_img_path, "rb") as f:
                upload_res = await client.aupload_file(f, purpose="general")
                file_id = upload_res.id_
                logger.debug(f"[GigaChat] Кадр [{time_str}] загружен. File ID: {file_id}")
                return (time_str, file_id, img_path)
        except Exception as upload_err:
            logger.warning(f"[GigaChat] Ошибка загрузки кадра {img_path} ({time_str}): {upload_err}")
            return None
        finally:
            if target_img_path != img_path and os.path.exists(target_img_path):
                try:
                    os.remove(target_img_path)
                except Exception:
                    pass


async def _upload_files_to_gigachat(
    client: GigaChat,
    audio_path: Optional[str],
    image_paths: List[Tuple[int, str]],
    max_frames: int = 30
) -> Tuple[Optional[str], List[Tuple[str, str, str]]]:
    """
    Параллельно загружает аудиодорожку и ключевые кадры в хранилище GigaChat
    и возвращает (audio_file_id, [(time_str, frame_file_id, img_path)]).
    Число кадров адаптивно подстраивается под общий бюджет токенов.
    """
    audio_file_id = None
    if audio_path and os.path.exists(audio_path):
        try:
            audio_size_mb = os.path.getsize(audio_path) / (1024 * 1024)
            logger.info(f"[GigaChat] Загрузка аудиодорожки {audio_path} ({audio_size_mb:.2f} MB)...")
            t_audio_start = time.time()
            with open(audio_path, "rb") as f:
                upload_res = await client.aupload_file(f, purpose="general")
                audio_file_id = upload_res.id_
                elapsed = time.time() - t_audio_start
                logger.info(f"[GigaChat] Аудиодорожка успешно загружена за {elapsed:.2f} сек. File ID: {audio_file_id}")
        except Exception as audio_err:
            logger.warning(f"[GigaChat] Ошибка загрузки аудиодорожки {audio_path}: {audio_err}")

    # Адаптивно сэмплируем кадры на основе рассчитанного бюджета токенов
    if len(image_paths) > max_frames:
        step = len(image_paths) / max_frames
        selected_frames = [image_paths[int(i * step)] for i in range(max_frames)]
        logger.info(f"[GigaChat] Найдено {len(image_paths)} кадров. Адаптивное сэмплирование до {len(selected_frames)} кадров под токен-бюджет.")
    else:
        selected_frames = image_paths
        logger.info(f"[GigaChat] Отправка {len(selected_frames)} кадров занятия...")

    t_frames_start = time.time()
    sem = asyncio.Semaphore(8)
    tasks = [_upload_single_frame(client, sem, t_sec, img_p) for t_sec, img_p in selected_frames]
    results = await asyncio.gather(*tasks, return_exceptions=False)
    uploaded_info = [r for r in results if r is not None]

    elapsed_frames = time.time() - t_frames_start
    logger.info(f"[GigaChat] Параллельная загрузка {len(uploaded_info)} поминутных кадров завершена за {elapsed_frames:.2f} сек.")
    return audio_file_id, uploaded_info


async def _cleanup_gigachat_files(client: GigaChat, uploaded_file_ids: List[str]):
    """Удаляет загруженные файлы из облака GigaChat после завершения анализа для соблюдения 152-ФЗ."""
    for fid in uploaded_file_ids:
        try:
            await client.adelete_file(fid)
            logger.debug(f"[GigaChat 152-ФЗ] Удален удаленный файл {fid}")
        except Exception as e:
            logger.warning(f"[GigaChat] Не удалось удалить удаленный файл {fid}: {e}")


async def _execute_gigachat_task(bot, job_name: str, client: GigaChat, chat_payload: Chat, uploaded_file_ids: List[str], tg_id: int, db_id: int, frames_count: int = 0):
    """
    Асинхронно отправляет запрос к GigaChat API, получает ответ,
    парсит JSON, сохраняет результаты в БД и уведомляет пользователя.
    """
    t_start = time.time()
    logger.info(f"[GigaChat [{job_name}] DB_ID={db_id}] Старт отправки запроса к модели {chat_payload.model} (Вложений: {len(uploaded_file_ids)})...")
    try:
        response = await client.achat(chat_payload)
        gen_time = time.time() - t_start
        logger.info(f"[GigaChat [{job_name}]] Ответ успешно получен за {gen_time:.2f} сек!")

        if hasattr(response, "usage") and response.usage:
            logger.info(f"[GigaChat [{job_name}]] Использовано токенов: {response.usage}")
            logger.debug(f"[GigaChat [{job_name}] Usage Details] prompt_tokens={getattr(response.usage, 'prompt_tokens', None)}, completion_tokens={getattr(response.usage, 'completion_tokens', None)}, total_tokens={getattr(response.usage, 'total_tokens', None)}")

        choices = response.choices if hasattr(response, "choices") else []
        if not choices:
            err_msg = f"Ответ GigaChat не содержит вариантов choices: {response}"
            logger.error(f"[GigaChat [{job_name}]] {err_msg}")
            await ai_common.save_and_notify_failure(bot, tg_id, db_id, "GigaChat API", err_msg)
            return

        choice = choices[0]
        finish_reason = getattr(choice, "finish_reason", None)
        logger.info(f"[GigaChat [{job_name}]] Finish reason: {finish_reason}")
        
        choice_message = choice.message if hasattr(choice, "message") else None
        choice_content = choice_message.content if choice_message else ""

        if not choice_content:
            err_msg = f"GigaChat вернул пустое текстовое содержимое: {choice}"
            logger.error(f"[GigaChat [{job_name}]] {err_msg}")
            await ai_common.save_and_notify_failure(bot, tg_id, db_id, "GigaChat API", err_msg)
            return

        # Проверка на отказ/цензуру безопасности GigaChat
        refusal_keywords = [
            "разговоры на чувствительные темы",
            "ограничены из соображений безопасности",
            "не могу ответить на данный вопрос",
            "не могу выполнить данный запрос",
            "модели не обладают собственным мнением",
            "чувствительные темы могут быть ограничены"
        ]
        is_refused = (
            finish_reason in ["blacklist", "content_filter", "censorship"]
            or any(kw in choice_content.lower() for kw in refusal_keywords)
        )

        if is_refused:
            err_msg = (
                f"Нейросеть GigaChat отказалась от проверки лекции из-за цензуры/чувствительной темы (finish_reason: {finish_reason}). "
                f"Текст модели: {choice_content}"
            )
            logger.warning(f"[GigaChat [{job_name}]] {err_msg}")
            user_facing_err = (
                f"⚠️ Нейросеть GigaChat отказалась от проверки лекции из соображений безопасности/цензуры по чувствительным темам "
                f"(причина: {finish_reason or 'blacklist'}).\n\n"
                f"Пояснение модели: {choice_content}"
            )
            await ai_common.save_and_notify_failure(bot, tg_id, db_id, "GigaChat API (Цензура безопасности)", user_facing_err)
            return

        logger.debug(f"[GigaChat [{job_name}]] Полный сырой ответ:\n{choice_content}")
        logger.info(f"[GigaChat [{job_name}]] Длина ответа: {len(choice_content)} символов.")

        # Парсим JSON-структуру с помощью единого парсера ai_common
        try:
            parsed_result = ai_common.parse_analysis_json(choice_content)
        except Exception as parse_err:
            logger.error(f"[GigaChat [{job_name}]] Ошибка парсинга JSON: {parse_err}.\nПолный ответ:\n{choice_content}")
            raise parse_err

        await ai_common.save_and_notify_success(bot, tg_id, db_id, parsed_result, f"GigaChat ({chat_payload.model})", frames_count=frames_count)
        logger.info(f"Запрос {job_name} (DB ID: {db_id}) успешно выполнен через GigaChat и сохранен в БД! (Штраф: {parsed_result.get('point')}, Критично: {parsed_result.get('is_critical')})")

    except Exception as e:
        tb = traceback.format_exc()
        logger.error(f"[GigaChat [{job_name}]] Ошибка при выполнении запроса: {e}\n{tb}")
        err_detail = f"{type(e).__name__}: {str(e)}" if str(e) else repr(e)
        await ai_common.save_and_notify_failure(bot, tg_id, db_id, "GigaChat API", err_detail)
    finally:
        # Очистка загруженных в GigaChat файлов (152-ФЗ) и закрытие сессии клиента
        if uploaded_file_ids:
            await _cleanup_gigachat_files(client, uploaded_file_ids)
        try:
            await client.aclose()
        except Exception:
            pass


def _calculate_dynamic_frame_limit(
    transcript_text: str,
    summary_text: str,
    system_prompt_len: int,
    audio_path: Optional[str]
) -> int:
    """
    Рассчитывает допустимое число кадров на основе занятых текстовых/аудио токенов,
    гарантируя резерв в 8 000 токенов под генерацию и рассуждения модели.
    """
    TOTAL_CONTEXT_LIMIT = 128_000
    RESERVED_FOR_OUTPUT = 8_000

    # 1. Текстовые токены (~1 токен на 2.2 символа русского текста)
    text_chars = len(transcript_text) + len(summary_text) + system_prompt_len
    text_tokens = int(text_chars / 2.2)

    # 2. Аудио токены (~750 токенов на 1 МБ MP3)
    audio_tokens = 0
    if audio_path and os.path.exists(audio_path):
        audio_size_mb = os.path.getsize(audio_path) / (1024 * 1024)
        audio_tokens = int(audio_size_mb * 750)

    used_tokens = text_tokens + audio_tokens
    available_for_frames = TOTAL_CONTEXT_LIMIT - RESERVED_FOR_OUTPUT - used_tokens

    FRAME_TOKEN_COST = 1100  # 1 кадр в GigaChat Vision ~ 1100 токенов

    if available_for_frames <= 0:
        logger.warning(f"[Token Budget] Высокая загрузка контекста ({used_tokens} токенов). Выделяем минимум 5 кадров.")
        return 5

    calculated_frames = available_for_frames // FRAME_TOKEN_COST
    target_frames = max(5, min(30, calculated_frames))
    logger.info(
        f"[Token Budget] Оценка входных токенов: текст ~{text_tokens}, аудио ~{audio_tokens} (всего ~{used_tokens}). "
        f"Зарезервировано под ответ: {RESERVED_FOR_OUTPUT} токенов. "
        f"Адаптивный лимит кадров: {target_frames} шт."
    )
    return target_frames


async def process(artifacts: dict, additional_info: str = "", bot=None, tg_id: int = None, db_id: int = None) -> str:
    """
    Подготавливает медиа и текстовые артефакты, формирует запрос для GigaChat
    и запускает асинхронную обработку.
    """
    credentials = os.getenv("GIGACHAT_CREDENTIALS")
    if not credentials:
        err_msg = "GIGACHAT_CREDENTIALS не установлен в переменных окружения."
        logger.error(err_msg)
        if bot and tg_id and db_id:
            await ai_common.save_and_notify_failure(bot, tg_id, db_id, "GigaChat API", err_msg)
        raise ValueError(err_msg)

    video_path = artifacts.get("video")
    if not video_path:
        raise ValueError("Файл видео отсутствует в артефактах.")

    logger.debug(f"[GigaChat Process] Начинаем подготовку артефактов для DB_ID={db_id}...")

    # Извлекаем аудио и кадры
    audio_path, image_paths = await file_processing.extract_media_async(video_path)

    transcript_text = ""
    summary_text = ""
    if artifacts.get("transcript") and os.path.exists(artifacts["transcript"]):
        with open(artifacts["transcript"], "r", encoding="utf-8") as f:
            transcript_text = f.read()
        logger.debug(f"[GigaChat Process] Загружен транскрипт ({len(transcript_text)} символов)")

    if artifacts.get("summary") and os.path.exists(artifacts["summary"]):
        with open(artifacts["summary"], "r", encoding="utf-8") as f:
            summary_text = f.read()
        logger.debug(f"[GigaChat Process] Загружено саммари ({len(summary_text)} символов)")

    system_prompt = criteria.build_system_prompt(additional_info)
    logger.debug(f"[GigaChat Process] Системный промпт сформирован ({len(system_prompt)} символов)")

    # Рассчитываем адаптивный лимит кадров под токен-бюджет
    max_frames = _calculate_dynamic_frame_limit(transcript_text, summary_text, len(system_prompt), audio_path)

    # Инициализация GigaChat клиента
    client = get_gigachat_client()
    model_name = os.getenv("GIGACHAT_MODEL", "GigaChat-2-Pro")

    # Загружаем аудиодорожку и кадры в хранилище файлов GigaChat
    logger.info(f"Загрузка аудиодорожки и до {max_frames} кадров в хранилище GigaChat...")
    audio_file_id, uploaded_frames_data = await _upload_files_to_gigachat(client, audio_path, image_paths, max_frames=max_frames)
    
    uploaded_file_ids = []
    if audio_file_id:
        uploaded_file_ids.append(audio_file_id)
    uploaded_file_ids.extend([fid for _, fid, _ in uploaded_frames_data])

    # Формируем структуру сообщений
    messages: List[Messages] = []

    # 1. Системное сообщение с критериями и правилами оценивания
    messages.append(
        Messages(
            role=MessagesRole.SYSTEM,
            content=system_prompt
        )
    )

    # 2. Пользовательское сообщение с аудио, транскриптом, саммари, прикрепленными кадрами и JSON-инструкцией
    audio_desc = f"- Полная оригинальная аудиодорожка встречи прикреплена (ID файла: {audio_file_id})\n" if audio_file_id else "- Аудиодорожка не была извлечена.\n"
    frames_description = "\n".join([f"- Кадр [{t_str}] (ID файла: {fid})" for t_str, fid, _ in uploaded_frames_data])
    if not frames_description:
        frames_description = "Кадры видео отсутствуют."

    user_text = (
        "--- МУЛЬТИМОДАЛЬНЫЕ МАТЕРИАЛЫ ВСТРЕЧИ ---\n"
        f"ОСНОВНОЙ МАТЕРИАЛ (АУДИО):\n{audio_desc}\n"
        "ВАЖНОЕ ПРИМЕЧАНИЕ О КАДРАХ ВИДЕОЗАПИСИ:\n"
        "Прикреплены ключевые репрезентативные кадры экрана с указанием точного времени (слайды, окна, доска).\n"
        f"Список прикрепленных кадров:\n{frames_description}\n\n"
        f"--- ДОПОЛНИТЕЛЬНЫЙ ТЕКСТОВЫЙ МАТЕРИАЛ (ТРАНСКРИПТ И САММАРИ) ---\n"
        f"ИИ-Краткий пересказ встречи:\n{summary_text if summary_text else 'Отсутствует'}\n\n"
        f"Транскрипт общения с таймкодами реплик:\n{transcript_text if transcript_text else 'Отсутствует'}\n\n"
        "ИНСТРУКЦИЯ ПО АНАЛИЗУ:\n"
        "1. Внимательно сопоставь реплики из транскрипта и события в аудио/на кадрах с критериями оценивания.\n"
        "2. Найди ВСЕ моменты панибратства, флуда, задержек при поиске файлов, посторонних звуков/людей на фоне, игнорирования учеников, срыва ДЗ.\n"
        "3. Выстави строгие штрафные баллы в `criteria_scores` и укажи точные таймкоды нарушений в `comment` и `details`.\n\n"
        "СТРОГОЕ ТРЕБОВАНИЕ К ФОРМАТУ:\n"
        "Твой ответ должен состоять ИСКЛЮЧИТЕЛЬНО из валидного JSON-объекта (начинается с { и заканчивается на }). "
        "Обязательно включи массив 'criteria_scores' с детальной оценкой по каждому из 21 критериев.\n\n"
        f"{ai_common.JSON_OUTPUT_PROMPT_INSTRUCTIONS}"
    )

    messages.append(
        Messages(
            role=MessagesRole.USER,
            content=user_text,
            attachments=uploaded_file_ids if uploaded_file_ids else None
        )
    )

    logger.debug(f"[GigaChat Payload] system_len={len(system_prompt)}, user_len={len(user_text)}, attachments_count={len(uploaded_file_ids)}")

    chat_payload = Chat(
        model=model_name,
        messages=messages,
        max_tokens=8192,
        temperature=0.1
    )

    job_name = f"gigachat_{uuid.uuid4().hex[:12]}"

    # Удаляем локальные временные медиа-файлы с диска для соблюдения 152-ФЗ
    await file_processing.delete_files([
        audio_path,
        artifacts.get("audio"),
        artifacts.get("video"),
        artifacts.get("transcript"),
        artifacts.get("summary"),
        *[p for _, p in image_paths]
    ])

    # Запускаем прямую фоновую асинхронную задачу
    if bot and tg_id and db_id:
        asyncio.create_task(
            _execute_gigachat_task(bot, job_name, client, chat_payload, uploaded_file_ids, tg_id, db_id, frames_count=len(uploaded_frames_data))
        )

    logger.info(f"GigaChat задача инициализирована: {job_name}")
    return job_name


async def check_batch_jobs_loop(bot):
    """
    Проверка незавершенных задач при ЗАПУСКЕ бота.
    Если бот был перезапущен во время выполнения задачи (point = -1),
    мы сообщаем пользователю о сбое из-за перезапуска.
    """
    try:
        active_jobs = await database.get_jobs()
        for job in active_jobs:
            job_name = job.get("job_name", "")
            if job_name and job_name.startswith("gigachat_"):
                logger.error(f"GigaChat задача {job_name} была прервана из-за перезапуска бота.")
                db_id = job["id"]
                tg_id = job["telegram_id"]
                await ai_common.save_and_notify_failure(
                    bot, tg_id, db_id, "GigaChat API", "Задача была прервана из-за перезапуска сервиса бота."
                )
    except Exception as e:
        logger.error(f"Ошибка при стартовой проверке задач GigaChat: {e}")
