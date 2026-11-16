import asyncio
import os
import sys
import ssl
import json
import logging
import uuid
import time
import traceback
import urllib.request
from typing import Optional, List, Tuple, Dict, Any
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

# Строгий приоритет моделей GigaChat:
# Сначала самые сильные мультимодальные модели (Pro -> Max -> Ultra),
# обычная модель (GigaChat-2) используется ТОЛЬКО в самом крайнем случае, так как плохо работает с аудио.
MODEL_ROTATION_CHAIN: List[str] = [
    "GigaChat-2-Pro",
    "GigaChat-2-Max",
    "GigaChat-3-Ultra",
    "GigaChat-2",
]

DEFAULT_AI_SETTINGS: Dict[str, Any] = {
    "maxRequestTokens": 128_000,
    "reservedOutputTokens": 8_192,
    "enableModelRotation": True,
}

AI_SETTINGS_PATH = os.path.join(
    os.path.abspath(os.getenv("APP_DATA_DIR")) if os.getenv("APP_DATA_DIR") else os.path.join(os.getcwd(), "data"),
    "ai_settings.json",
)

# URL-адреса сертификатов Минцифры по умолчанию
DEFAULT_MINCIFRY_ROOT_URL = "https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt"
DEFAULT_MINCIFRY_SUB_URL = "https://gu-st.ru/content/lending/russian_trusted_sub_ca_pem.crt"

# Локальная директория для хранения бандла сертификатов
CERTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "certs")
BUNDLE_CERT_PATH = os.path.join(CERTS_DIR, "russian_trusted_bundle.pem")


def load_ai_settings() -> Dict[str, Any]:
    """Читает актуальные настройки лимита токенов и ротации моделей, заданные старшим куратором."""
    settings = dict(DEFAULT_AI_SETTINGS)
    try:
        if os.path.exists(AI_SETTINGS_PATH):
            with open(AI_SETTINGS_PATH, "r", encoding="utf-8") as f:
                raw = json.load(f)
            if isinstance(raw, dict):
                max_req = int(raw.get("maxRequestTokens", DEFAULT_AI_SETTINGS["maxRequestTokens"]))
                res_out = int(raw.get("reservedOutputTokens", DEFAULT_AI_SETTINGS["reservedOutputTokens"]))
                settings["maxRequestTokens"] = max(32_000, min(256_000, max_req))
                settings["reservedOutputTokens"] = max(2_048, min(8_192, res_out))
                settings["enableModelRotation"] = bool(raw.get("enableModelRotation", True))
    except Exception as e:
        logger.warning(f"[AI Settings] Не удалось прочитать {AI_SETTINGS_PATH}, используем значения по умолчанию: {e}")
    return settings


def get_model_rotation_order(enable_rotation: bool = True) -> List[str]:
    """Возвращает упорядоченный список моделей для последовательного перебора."""
    if not enable_rotation:
        primary = os.getenv("GIGACHAT_MODEL", MODEL_ROTATION_CHAIN[0])
        return [primary]
    return list(MODEL_ROTATION_CHAIN)


def is_fallback_base_model(model_name: str) -> bool:
    """Проверяет, является ли модель базовой версией без приставки Pro/Max/Ultra."""
    m = (model_name or "").strip().lower()
    return m in ("gigachat", "gigachat-2", "gigachat-lite")


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

        if not os.path.exists(root_cert_path) or os.path.getsize(root_cert_path) == 0:
            logger.info(f"Скачивание корневого сертификата Минцифры РФ с {mincifry_root_url}...")
            urllib.request.urlretrieve(mincifry_root_url, root_cert_path)
            logger.debug(f"Корневой сертификат сохранен: {root_cert_path} ({os.path.getsize(root_cert_path)} байт)")

        if not os.path.exists(sub_cert_path) or os.path.getsize(sub_cert_path) == 0:
            logger.info(f"Скачивание подчиненного сертификата Минцифры РФ с {mincifry_sub_url}...")
            urllib.request.urlretrieve(mincifry_sub_url, sub_cert_path)
            logger.debug(f"Подчиненный сертификат сохранен: {sub_cert_path} ({os.path.getsize(sub_cert_path)} байт)")

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


def get_gigachat_client(model_override: Optional[str] = None) -> GigaChat:
    """
    Инициализирует и возвращает экземпляр клиента GigaChat
    с правильными учетными данными, моделью и CA-бандлом сертификатов Минцифры.
    """
    credentials = os.getenv("GIGACHAT_CREDENTIALS")
    scope = os.getenv("GIGACHAT_SCOPE", "GIGACHAT_API_PERS")
    model = model_override or os.getenv("GIGACHAT_MODEL", MODEL_ROTATION_CHAIN[0])

    ca_bundle = ensure_russian_certificates()
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


async def _upload_single_frame(
    client: GigaChat,
    sem: asyncio.Semaphore,
    time_sec: int,
    img_path: str,
    delay_idx: int = 0
) -> Optional[Tuple[str, str, str]]:
    if not os.path.exists(img_path):
        return None

    hours = time_sec // 3600
    minutes = (time_sec % 3600) // 60
    seconds = time_sec % 60
    time_str = f"{hours:02d}:{minutes:02d}:{seconds:02d}" if hours > 0 else f"{minutes:02d}:{seconds:02d}"

    target_img_path = await asyncio.to_thread(_optimize_image_for_gigachat_sync, img_path)
    max_attempts = 4
    try:
        async with sem:
            if delay_idx > 0:
                await asyncio.sleep(0.25)
            for attempt in range(1, max_attempts + 1):
                try:
                    with open(target_img_path, "rb") as f:
                        upload_res = await asyncio.wait_for(
                            client.aupload_file((os.path.basename(target_img_path), f, "image/jpeg"), purpose="general"),
                            timeout=60.0
                        )
                        file_id = upload_res.id_
                        logger.debug(f"[GigaChat] Кадр [{time_str}] загружен. File ID: {file_id}")
                        return (time_str, file_id, img_path)
                except Exception as upload_err:
                    err_str = str(upload_err)
                    is_retryable = (
                        "429" in err_str
                        or "Too Many Requests" in err_str
                        or "timeout" in err_str.lower()
                        or isinstance(upload_err, asyncio.TimeoutError)
                        or "500" in err_str
                        or "502" in err_str
                        or "503" in err_str
                        or "504" in err_str
                    )
                    if is_retryable and attempt < max_attempts:
                        wait_sec = min(12, attempt * 3)
                        logger.warning(
                            f"[GigaChat] Ошибка/429 при загрузке кадра {time_str} (попытка {attempt}/{max_attempts}): {upload_err}. Повтор через {wait_sec} сек..."
                        )
                        await asyncio.sleep(wait_sec)
                        continue
                    logger.warning(f"[GigaChat] Не удалось загрузить кадр {img_path} ({time_str}): {upload_err}")
                    return None
    finally:
        if target_img_path != img_path and os.path.exists(target_img_path):
            try:
                os.remove(target_img_path)
            except Exception:
                pass
    return None


_last_audio_upload_error: Optional[str] = None


def _resolve_audio_upload_candidates(audio_path: str) -> List[str]:
    """Возвращает приоритетный список MIME-типов для загрузки аудио в GigaChat /v1/files."""
    ext = os.path.splitext(audio_path)[1].lower()
    mapping = {
        ".mp3": ["audio/mpeg", "audio/mp3"],
        ".mp4": ["audio/mp4"],
        ".m4a": ["audio/x-m4a", "audio/mp4"],
        ".ogg": ["audio/ogg", "audio/x-ogg"],
        ".opus": ["audio/opus", "audio/ogg"],
        ".wav": ["audio/wav", "audio/x-wav"],
        ".webm": ["audio/webm"],
    }
    return mapping.get(ext, ["audio/mpeg"])


def _reencode_audio_bitrate_sync(audio_path: str, target_bitrate: str = "16k") -> Optional[str]:
    """
    Понижает битрейт аудио без обрезки длительности (вся лекция целиком),
    если исходный файл приближается к лимиту 35 МБ GigaChat /v1/files.
    """
    import subprocess
    if not os.path.exists(audio_path):
        return None
    base, _ = os.path.splitext(audio_path)
    out_path = f"{base}_reenc_{target_bitrate}.mp3"
    cmd = [
        "ffmpeg", "-y", "-i", audio_path,
        "-vn", "-ar", "16000", "-ac", "1", "-b:a", target_bitrate,
        out_path
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if res.returncode == 0 and os.path.exists(out_path) and os.path.getsize(out_path) >= 4096:
        return out_path
    return None


async def _upload_files_to_gigachat(
    client: GigaChat,
    audio_path: Optional[str],
    image_paths: List[Tuple[int, str]],
    max_frames: int = 30
) -> Tuple[Optional[str], List[Tuple[str, str, str]], int]:
    """
    Загружает полную аудиодорожку (audio/mpeg по умолчанию + запасной MIME/битрейт при >32 МБ)
    и равномерно выбранные кадры (через Semaphore(2) с повторами при 429) в хранилище GigaChat.
    Возвращает (audio_file_id, [(time_str, frame_file_id, img_path)], planned_frames_count).
    """
    global _last_audio_upload_error
    _last_audio_upload_error = None
    audio_file_id = None
    reencoded_temp_path: Optional[str] = None

    try:
        if audio_path and os.path.exists(audio_path):
            upload_target_path = audio_path
            audio_size_mb = os.path.getsize(upload_target_path) / (1024 * 1024)

            # Лимит /v1/files в GigaChat — 35 МБ: если длинная лекция (3+ часа) больше 32 МБ,
            # аккуратно снижаем битрейт до 16k, сохраняя 100% длительности аудиодорожки.
            if audio_size_mb > 32.0:
                logger.info(
                    f"[GigaChat] Размер аудиодорожки {audio_size_mb:.2f} MB > 32 MB. "
                    f"Сжимаем битрейт до 16k без обрезки длительности..."
                )
                compressed = await asyncio.to_thread(_reencode_audio_bitrate_sync, upload_target_path, "16k")
                if compressed:
                    reencoded_temp_path = compressed
                    upload_target_path = compressed
                    audio_size_mb = os.path.getsize(upload_target_path) / (1024 * 1024)
                    logger.info(f"[GigaChat] Перекодированная аудиодорожка: {audio_size_mb:.2f} MB")

            mime_candidates = _resolve_audio_upload_candidates(upload_target_path)
            mime_idx = 0

            for attempt in range(1, 4):
                current_mime = mime_candidates[min(mime_idx, len(mime_candidates) - 1)]
                try:
                    logger.info(
                        f"[GigaChat] Загрузка аудиодорожки {upload_target_path} ({audio_size_mb:.2f} MB, {current_mime}), "
                        f"попытка {attempt}/3..."
                    )
                    t_audio_start = time.time()
                    upload_timeout = min(600.0, max(360.0, audio_size_mb * 25.0))
                    with open(upload_target_path, "rb") as f:
                        upload_res = await asyncio.wait_for(
                            client.aupload_file(
                                (os.path.basename(upload_target_path), f, current_mime),
                                purpose="general"
                            ),
                            timeout=upload_timeout
                        )
                    audio_file_id = upload_res.id_
                    _last_audio_upload_error = None
                    elapsed = time.time() - t_audio_start
                    logger.info(f"[GigaChat] Аудиодорожка успешно загружена за {elapsed:.2f} сек. File ID: {audio_file_id}")
                    break
                except Exception as audio_err:
                    err_text = str(audio_err) or type(audio_err).__name__
                    _last_audio_upload_error = f"{type(audio_err).__name__}: {err_text}"
                    logger.warning(f"[GigaChat] Ошибка загрузки аудиодорожки ({current_mime}, попытка {attempt}/3): {audio_err}")
                    if "not supported" in err_text.lower() and mime_idx + 1 < len(mime_candidates):
                        mime_idx += 1
                    if attempt < 3:
                        await asyncio.sleep(attempt * 4)
    finally:
        if reencoded_temp_path and os.path.exists(reencoded_temp_path):
            try:
                os.remove(reencoded_temp_path)
            except Exception:
                pass

    # Адаптивно сэмплируем кадры равномерно по длительности лекции на основе бюджета
    if max_frames <= 0 or not image_paths:
        selected_frames: List[Tuple[int, str]] = []
    elif len(image_paths) > max_frames:
        step = len(image_paths) / max_frames
        selected_frames = [image_paths[int(i * step)] for i in range(max_frames)]
        logger.info(
            f"[GigaChat] Найдено {len(image_paths)} кадров. Адаптивное сэмплирование до {len(selected_frames)} кадров под токен-бюджет."
        )
    else:
        selected_frames = list(image_paths)
        logger.info(f"[GigaChat] Отправка всех {len(selected_frames)} извлечённых кадров занятия...")

    planned_count = len(selected_frames)
    t_frames_start = time.time()
    sem = asyncio.Semaphore(2)
    tasks = [_upload_single_frame(client, sem, t_sec, img_p, delay_idx=idx) for idx, (t_sec, img_p) in enumerate(selected_frames)]
    results = await asyncio.gather(*tasks, return_exceptions=False)
    uploaded_info = [r for r in results if r is not None]

    elapsed_frames = time.time() - t_frames_start
    logger.info(
        f"[GigaChat] Загрузка кадров завершена за {elapsed_frames:.2f} сек: успешно {len(uploaded_info)} из {planned_count} запланированных."
    )
    return audio_file_id, uploaded_info, planned_count


async def _cleanup_gigachat_files(client: GigaChat, uploaded_file_ids: List[str]):
    """Удаляет загруженные файлы из облака GigaChat после завершения анализа для соблюдения 152-ФЗ."""
    for fid in uploaded_file_ids:
        try:
            await client.adelete_file(fid)
            logger.debug(f"[GigaChat 152-ФЗ] Удален удаленный файл {fid}")
        except Exception as e:
            logger.warning(f"[GigaChat] Не удалось удалить удаленный файл {fid}: {e}")


def compact_transcript_preserving_timeline(text: str, max_chars: int) -> Tuple[str, bool]:
    """
    Равномерно сжимает длинный транскрипт до max_chars символов,
    сохраняя хронологию начала, середины и финала занятия с таймкодами.
    """
    raw = (text or "").strip()
    if not raw or max_chars <= 0 or len(raw) <= max_chars:
        return raw, False

    lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
    if not lines:
        return raw[:max_chars], True

    header = (
        f"[ТРАНСКРИПТ РАВНОМЕРНО СОКРАЩЁН С {len(raw)} ДО ~{max_chars} СИМВ. ПОД ТОКЕН-БЮДЖЕТ ЗАПРОСА. "
        f"ПОЛНАЯ АУДИОДОРОЖКА УРОКА ПЕРЕДАНА ЦЕЛИКОМ — ОПИРАЙСЯ НА НЕЁ КАК НА ПЕРВОИСТОЧНИК.]\n"
    )
    avail = max(400, max_chars - len(header))

    # Всегда сохраняем первые 12% реплик, последние 12% реплик и равномерный шаг из середины
    total_lines = len(lines)
    if total_lines <= 10:
        clipped = "\n".join(lines)[:avail]
        return header + clipped, True

    avg_line_len = max(20, sum(len(l) + 1 for l in lines) / total_lines)
    target_lines_count = max(8, min(total_lines, int(avail / avg_line_len)))

    head_cnt = max(2, int(target_lines_count * 0.2))
    tail_cnt = max(2, int(target_lines_count * 0.2))
    mid_cnt = max(2, target_lines_count - head_cnt - tail_cnt)

    head_lines = lines[:head_cnt]
    tail_lines = lines[-tail_cnt:]
    mid_pool = lines[head_cnt: total_lines - tail_cnt]

    selected_mid: List[str] = []
    if mid_pool and mid_cnt > 0:
        if len(mid_pool) <= mid_cnt:
            selected_mid = mid_pool
        else:
            step = len(mid_pool) / mid_cnt
            selected_mid = [mid_pool[int(i * step)] for i in range(mid_cnt)]

    combined = []
    combined.extend(head_lines)
    if selected_mid:
        combined.append("... [часть реплик середины сжата; аудиозапись полная] ...")
        combined.extend(selected_mid)
    if tail_lines:
        combined.append("... [переход к завершающей части урока] ...")
        combined.extend(tail_lines)

    body = "\n".join(combined)
    if len(body) > avail:
        body = body[:avail].rsplit("\n", 1)[0] or body[:avail]

    return header + body, True


def plan_multimodal_budget(
    transcript_text: str,
    summary_text: str,
    static_prompt_chars: int,
    audio_path: Optional[str],
    total_extracted_frames: int,
    max_request_tokens: Optional[int] = None,
    reserved_output_tokens: Optional[int] = None
) -> Dict[str, Any]:
    """
    Рассчитывает токен-бюджет одного запроса по строгому приоритету старшего куратора:
    1. АУДИО НИКОГДА НЕ РЕЖЕТСЯ И НЕ ОБРЕЗАЕТСЯ — отправляется целиком.
    2. Если материалы превышают доступный лимит (maxRequestTokens - reservedOutputTokens),
       сначала сжимается ТЕКСТОВЫЙ ТРАНСКРИПТ (сохраняя начало/середину/конец с таймкодами).
    3. Если после сжатия транскрипта бюджет всё ещё превышен — уменьшается число КАДРОВ.
    4. Если лимит увеличен (например > 128 000 токенов) — число кадров (до 60) и транскрипт пропорционально расширяются.
    """
    settings = load_ai_settings()
    budget_total = max_request_tokens if max_request_tokens is not None else settings["maxRequestTokens"]
    reserved_out = reserved_output_tokens if reserved_output_tokens is not None else settings["reservedOutputTokens"]
    budget_total = max(32_000, min(256_000, int(budget_total)))
    reserved_out = max(2_048, min(8_192, int(reserved_out)))

    available_input = max(12_000, budget_total - reserved_out)
    CHARS_PER_TOKEN = 2.2
    FRAME_TOKEN_COST = 1_100

    # 1. Аудиодорожка: НИКОГДА не обрезаем! Оценка ~1450 ток/МБ (или ~350 ток/мин).
    audio_size_mb = 0.0
    audio_duration_sec = 0.0
    audio_tokens = 0
    if audio_path and os.path.exists(audio_path):
        audio_size_mb = os.path.getsize(audio_path) / (1024 * 1024)
        audio_duration_sec = file_processing._get_video_duration_seconds(audio_path)
        est_by_mb = int(audio_size_mb * 1_450)
        est_by_dur = int((audio_duration_sec / 60.0) * 350) if audio_duration_sec > 0 else 0
        audio_tokens = max(est_by_mb, est_by_dur, 500)

    # 2. Базовые текстовые токены
    static_tokens = int(static_prompt_chars / CHARS_PER_TOKEN) + 600
    summary_raw = (summary_text or "").strip()
    summary_tokens = int(len(summary_raw) / CHARS_PER_TOKEN)

    orig_transcript = (transcript_text or "").strip()
    orig_transcript_tokens = int(len(orig_transcript) / CHARS_PER_TOKEN)

    # Целевое число кадров зависит от настроенного бюджета (30 при 128k, до 60 при 256k, меньше при 64k)
    scaled_cap = max(10, min(60, int(round((budget_total / 128_000.0) * 30))))
    desired_frames = min(total_extracted_frames, scaled_cap) if total_extracted_frames > 0 else 0

    remaining_after_audio_static = available_input - audio_tokens - static_tokens - summary_tokens

    final_summary = summary_raw
    final_transcript = orig_transcript
    transcript_trimmed = False
    target_frames = desired_frames

    # Проверяем, нужно ли сжатие
    total_with_desired = audio_tokens + static_tokens + summary_tokens + orig_transcript_tokens + (target_frames * FRAME_TOKEN_COST)

    if total_with_desired > available_input:
        # Шаг 1: Сначала пробуем уложиться, сжимая ТОЛЬКО транскрипт (сохраняя min_transcript_floor ~6000 токенов для таймкодов)
        min_transcript_tokens = min(orig_transcript_tokens, max(2_500, int(available_input * 0.10)))
        room_for_transcript = remaining_after_audio_static - (target_frames * FRAME_TOKEN_COST)

        if room_for_transcript >= min_transcript_tokens:
            # Достаточно сжать только транскрипт, все desired_frames сохраняются!
            max_chars = int(room_for_transcript * CHARS_PER_TOKEN)
            final_transcript, transcript_trimmed = compact_transcript_preserving_timeline(orig_transcript, max_chars)
        else:
            # Транскрипт сжимается до безопасного минимума, затем пропорционально уменьшаем число кадров
            if orig_transcript:
                max_chars = int(min_transcript_tokens * CHARS_PER_TOKEN)
                final_transcript, transcript_trimmed = compact_transcript_preserving_timeline(orig_transcript, max_chars)
            used_transcript_tokens = int(len(final_transcript) / CHARS_PER_TOKEN)

            # Шаг 2: Урезаем кадры под остаток после нетронутого аудио + базового промпта + сжатого транскрипта
            room_for_frames = remaining_after_audio_static - used_transcript_tokens
            if total_extracted_frames > 0:
                min_frames_floor = min(3, total_extracted_frames)
                calculated_frames = room_for_frames // FRAME_TOKEN_COST
                target_frames = max(min_frames_floor, min(desired_frames, calculated_frames))
            else:
                target_frames = 0

            # Если даже с минимумом кадров (3 шт.) все ещё не влезаем (очень маленький бюджет и сверхдлинное аудио),
            # дожимаем транскрипт/саммари (но аудио всё равно не трогаем!).
            recalc_room_for_text = available_input - audio_tokens - static_tokens - (target_frames * FRAME_TOKEN_COST)
            if recalc_room_for_text < summary_tokens + int(len(final_transcript) / CHARS_PER_TOKEN):
                if final_transcript:
                    avail_for_tr = max(800, recalc_room_for_text - min(summary_tokens, 2_000))
                    final_transcript, transcript_trimmed = compact_transcript_preserving_timeline(
                        orig_transcript, int(avail_for_tr * CHARS_PER_TOKEN)
                    )
                if len(final_summary) > 4_000 and recalc_room_for_text < 4_000:
                    final_summary = final_summary[:3_500] + "\n... [пересказ сокращён под лимит токенов]"

    final_text_tokens = static_tokens + int(len(final_summary) / CHARS_PER_TOKEN) + int(len(final_transcript) / CHARS_PER_TOKEN)
    frames_tokens = target_frames * FRAME_TOKEN_COST
    estimated_input_tokens = audio_tokens + final_text_tokens + frames_tokens

    logger.info(
        f"[Token Budget] Лимит запроса: {budget_total} (резерв ответа: {reserved_out}). "
        f"Аудио (целиком): ~{audio_tokens} ток. ({audio_size_mb:.2f} MB), "
        f"текст: ~{final_text_tokens} ток. (транскрипт {'сжат' if transcript_trimmed else 'полный'}: "
        f"{len(final_transcript)}/{len(orig_transcript)} симв.), "
        f"кадры: {target_frames} шт. (~{frames_tokens} ток.). "
        f"Итого вход: ~{estimated_input_tokens} ток."
    )

    return {
        "maxFrames": target_frames,
        "transcriptText": final_transcript,
        "summaryText": final_summary,
        "transcriptTrimmed": transcript_trimmed,
        "transcriptOriginalChars": len(orig_transcript),
        "transcriptSentChars": len(final_transcript),
        "audioEstimatedTokens": audio_tokens,
        "textEstimatedTokens": final_text_tokens,
        "framesEstimatedTokens": frames_tokens,
        "estimatedInputTokens": estimated_input_tokens,
        "configuredBudgetTokens": budget_total,
        "reservedOutputTokens": reserved_out,
    }


def _calculate_dynamic_frame_limit(
    transcript_text: str,
    summary_text: str,
    system_prompt_len: int,
    audio_path: Optional[str]
) -> int:
    """Совместимый обёрточный расчёт числа кадров через единый планировщик бюджета."""
    plan = plan_multimodal_budget(
        transcript_text=transcript_text,
        summary_text=summary_text,
        static_prompt_chars=system_prompt_len,
        audio_path=audio_path,
        total_extracted_frames=60,
    )
    return plan["maxFrames"]


async def fetch_live_gigachat_status() -> Dict[str, Any]:
    """
    Диагностирует фактический статус учётной записи Sber GigaChat API:
    - Доступные модели (`GET /models`)
    - Остатки пакетных токенов (`GET /balance` — для Freemium/pay-as-you-go Сбер честно отдаёт 403).
    """
    creds = os.getenv("GIGACHAT_CREDENTIALS")
    scope = os.getenv("GIGACHAT_SCOPE", "GIGACHAT_API_PERS")
    checked_at = time.strftime("%Y-%m-%dT%H:%M:%SZ")

    if not creds:
        return {
            "success": False,
            "scope": scope,
            "availableModels": [],
            "balances": [],
            "balanceSupported": False,
            "balanceHttpStatus": None,
            "balanceNote": "Переменная окружения GIGACHAT_CREDENTIALS не задана на сервере.",
            "error": "GIGACHAT_CREDENTIALS не настроены на сервере.",
            "checkedAt": checked_at,
        }

    client: Optional[GigaChat] = None
    available_models: List[str] = []
    balances: List[Dict[str, Any]] = []
    balance_supported = False
    balance_http_status: Optional[int] = None
    balance_note = ""

    try:
        client = get_gigachat_client(MODEL_ROTATION_CHAIN[0])

        try:
            models_resp = await asyncio.wait_for(client.aget_models(), timeout=20.0)
            raw_data = getattr(models_resp, "data", None) or []
            available_models = [str(getattr(m, "id_", "") or getattr(m, "id", "")) for m in raw_data if (getattr(m, "id_", None) or getattr(m, "id", None))]
        except AuthenticationError as auth_err:
            return {
                "success": False,
                "scope": scope,
                "availableModels": [],
                "balances": [],
                "balanceSupported": False,
                "balanceHttpStatus": 401,
                "balanceNote": "Ошибка OAuth-авторизации в Sber GigaChat (401). Проверьте GIGACHAT_CREDENTIALS и GIGACHAT_SCOPE.",
                "error": str(auth_err),
                "checkedAt": checked_at,
            }
        except Exception as mod_err:
            logger.warning(f"[GigaChat Status] Ошибка GET /models: {mod_err}")

        try:
            bal_resp = await asyncio.wait_for(client.aget_balance(), timeout=20.0)
            raw_bal = getattr(bal_resp, "balance", None) or []
            for item in raw_bal:
                balances.append({
                    "usage": str(getattr(item, "usage", "")),
                    "value": int(getattr(item, "value", 0) or 0),
                })
            balance_supported = True
            balance_http_status = 200
            balance_note = "Остаток токенов получен напрямую через метод Сбер API GET /v1/balance."
        except ResponseError as bal_err:
            status_code = getattr(bal_err, "status_code", None)
            balance_http_status = status_code
            balance_supported = False
            if status_code == 403:
                balance_note = (
                    "API Сбера вернул HTTP 403 на GET /balance: живой остаток токенов API отдаёт ТОЛЬКО "
                    "для предоплатных корпоративных пакетов. На бесплатном Freemium (GIGACHAT_API_PERS) или pay-as-you-go "
                    "живой счётчик Сбер не предоставляет — ниже показан локальный учёт потраченных токенов по каждой модели."
                )
            else:
                balance_note = f"Метод GET /balance вернул HTTP {status_code}: {bal_err}"
        except Exception as bal_other:
            balance_supported = False
            balance_note = f"Не удалось получить остаток токенов GET /balance: {bal_other}"

        return {
            "success": True,
            "scope": scope,
            "availableModels": available_models,
            "balances": balances,
            "balanceSupported": balance_supported,
            "balanceHttpStatus": balance_http_status,
            "balanceNote": balance_note,
            "checkedAt": checked_at,
        }
    except Exception as e:
        return {
            "success": False,
            "scope": scope,
            "availableModels": available_models,
            "balances": balances,
            "balanceSupported": balance_supported,
            "balanceHttpStatus": balance_http_status,
            "balanceNote": str(e),
            "error": str(e),
            "checkedAt": checked_at,
        }
    finally:
        if client is not None:
            try:
                await client.aclose()
            except Exception:
                pass


async def _execute_gigachat_task(bot, job_name: str, client: GigaChat, chat_payload: Chat, uploaded_file_ids: List[str], tg_id: int, db_id: int, frames_count: int = 0):
    """Устаревшая обёртка совместимости для Telegram-бота (если используется worker)."""
    t_start = time.time()
    logger.info(f"[GigaChat [{job_name}] DB_ID={db_id}] Старт отправки запроса к модели {chat_payload.model} (Вложений: {len(uploaded_file_ids)})...")
    try:
        max_retries = 5
        response = None
        for attempt in range(1, max_retries + 1):
            try:
                response = await client.achat(chat_payload)
                break
            except Exception as attempt_err:
                err_str = str(attempt_err)
                is_rate_limit = "429" in err_str or "Too Many Requests" in err_str or "RateLimit" in type(attempt_err).__name__
                if is_rate_limit and attempt < max_retries:
                    wait_time = attempt * 7
                    logger.warning(f"[GigaChat [{job_name}]] Получен 429 (RateLimit). Повтор {attempt}/{max_retries} через {wait_time} сек...")
                    await asyncio.sleep(wait_time)
                else:
                    raise attempt_err

        choices = response.choices if hasattr(response, "choices") else []
        if not choices:
            err_msg = f"Ответ GigaChat не содержит вариантов choices: {response}"
            await ai_common.save_and_notify_failure(bot, tg_id, db_id, "GigaChat API", err_msg)
            return

        choice = choices[0]
        choice_message = choice.message if hasattr(choice, "message") else None
        choice_content = choice_message.content if choice_message else ""
        if not choice_content:
            await ai_common.save_and_notify_failure(bot, tg_id, db_id, "GigaChat API", "Пустой ответ от модели")
            return

        parsed_result = ai_common.parse_analysis_json(choice_content)
        await ai_common.save_and_notify_success(bot, tg_id, db_id, parsed_result, f"GigaChat ({chat_payload.model})", frames_count=frames_count)
    except Exception as e:
        err_detail = f"{type(e).__name__}: {str(e)}" if str(e) else repr(e)
        await ai_common.save_and_notify_failure(bot, tg_id, db_id, "GigaChat API", err_detail)
    finally:
        if uploaded_file_ids:
            await _cleanup_gigachat_files(client, uploaded_file_ids)
        try:
            await client.aclose()
        except Exception:
            pass


async def process(artifacts: dict, additional_info: str = "", bot=None, tg_id: int = None, db_id: int = None, await_completion: bool = False) -> str:
    """Точка входа совместимости."""
    credentials = os.getenv("GIGACHAT_CREDENTIALS")
    if not credentials:
        raise ValueError("GIGACHAT_CREDENTIALS не установлен в переменных окружения.")

    video_path = artifacts.get("video")
    if not video_path:
        raise ValueError("Файл видео отсутствует в артефактах.")

    audio_path = None
    image_paths: List[Tuple[int, str]] = []
    client: Optional[GigaChat] = None
    uploaded_file_ids: List[str] = []
    task_dispatched = False

    try:
        audio_path, image_paths = await file_processing.extract_media_async(video_path)
        transcript_text = ""
        summary_text = ""
        if artifacts.get("transcript") and os.path.exists(artifacts["transcript"]):
            with open(artifacts["transcript"], "r", encoding="utf-8") as f:
                transcript_text = f.read()
        if artifacts.get("summary") and os.path.exists(artifacts["summary"]):
            with open(artifacts["summary"], "r", encoding="utf-8") as f:
                summary_text = f.read()

        std_criteria_list, _ = criteria.get_dynamic_criteria()
        system_prompt = criteria.build_system_prompt(additional_info)
        budget_plan = plan_multimodal_budget(
            transcript_text=transcript_text,
            summary_text=summary_text,
            static_prompt_chars=len(system_prompt),
            audio_path=audio_path,
            total_extracted_frames=len(image_paths),
        )

        client = get_gigachat_client(MODEL_ROTATION_CHAIN[0])
        audio_file_id, uploaded_frames_data, _ = await _upload_files_to_gigachat(
            client, audio_path, image_paths, max_frames=budget_plan["maxFrames"]
        )
        if audio_file_id:
            uploaded_file_ids.append(audio_file_id)
        uploaded_file_ids.extend([fid for _, fid, _ in uploaded_frames_data])

        messages: List[Messages] = [
            Messages(role=MessagesRole.SYSTEM, content=system_prompt),
            Messages(
                role=MessagesRole.USER,
                content=(
                    f"Саммари:\n{budget_plan['summaryText']}\n\n"
                    f"Транскрипт:\n{budget_plan['transcriptText']}\n\n"
                    f"{ai_common.get_json_output_prompt_instructions()}"
                ),
                attachments=uploaded_file_ids if uploaded_file_ids else None,
            ),
        ]
        chat_payload = Chat(model=MODEL_ROTATION_CHAIN[0], messages=messages, max_tokens=8192, temperature=0.1)
        job_name = f"gigachat_{uuid.uuid4().hex[:12]}"
        if bot and tg_id and db_id:
            task_dispatched = True
            coro = _execute_gigachat_task(
                bot, job_name, client, chat_payload, uploaded_file_ids, tg_id, db_id, frames_count=len(uploaded_frames_data)
            )
            if await_completion:
                await coro
            else:
                asyncio.create_task(coro)
        return job_name
    finally:
        await file_processing.delete_files([
            audio_path,
            artifacts.get("audio"),
            artifacts.get("video"),
            artifacts.get("transcript"),
            artifacts.get("summary"),
            *[p for _, p in image_paths]
        ])
        if not task_dispatched and client is not None:
            if uploaded_file_ids:
                await _cleanup_gigachat_files(client, uploaded_file_ids)
            try:
                await client.aclose()
            except Exception:
                pass


if __name__ == "__main__":
    if "--status" in sys.argv:
        from dotenv import load_dotenv
        load_dotenv()
        status_res = asyncio.run(fetch_live_gigachat_status())
        print(json.dumps(status_res, ensure_ascii=False))

