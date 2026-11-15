import asyncio
import glob
import logging
import os
import subprocess
import time
try:
    from moviepy import VideoFileClip
except ImportError:
    try:
        from moviepy.editor import VideoFileClip
    except ImportError:
        VideoFileClip = None
import logger_config

logger = logging.getLogger(__name__)


async def delete_files(artifacts):
    """Асинхронно удаляет список файлов."""
    for artifact in artifacts:
        if not artifact:
            continue

        def sync_delete():
            if os.path.exists(artifact):
                os.remove(artifact)
                return True
            return False

        try:
            file_deleted = await asyncio.to_thread(sync_delete)
            if file_deleted:
                logger.debug(f"[152-ФЗ] Локальный временный файл удален: {artifact}")
        except Exception as e:
            logger.error(f"Ошибка при удалении файла {artifact}: {e}")


def _get_video_duration_seconds(video_path: str) -> float:
    """Возвращает длительность видео в секундах через ffprobe (или 0.0 при ошибке)."""
    try:
        res = subprocess.run(
            [
                "ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", video_path
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=15
        )
        if res.returncode == 0:
            val = res.stdout.decode("utf-8", errors="ignore").strip()
            if val:
                return max(0.0, float(val))
    except Exception:
        pass
    return 0.0


def extract_media_sync(video_path: str):
    """Синхронно извлекает сжатое аудио (MP3) и кадры (JPG) каждую минуту с помощью ffmpeg."""
    t0 = time.time()
    video_filename = os.path.basename(video_path)
    video_id, _ = os.path.splitext(video_filename)
    output_dir = os.path.abspath(os.path.dirname(video_path))
    video_id = video_id.replace("_video", "")

    audio_name = f"{video_id}_audio.mp3"
    audio_path = os.path.join(output_dir, audio_name)

    video_size_mb = os.path.getsize(video_path) / (1024 * 1024) if os.path.exists(video_path) else 0
    logger.debug(f"[extract_media_sync] Исходное видео: {video_path} ({video_size_mb:.2f} MB)")

    # 1. Извлекаем аудиодорожку через ffmpeg (если валидного файла ещё нет)
    if not os.path.exists(audio_path) or os.path.getsize(audio_path) < 4096:
        logger.info(f"[Media] Извлечение аудиодорожки через ffmpeg в {audio_path}...")
        cmd_audio = [
            "ffmpeg", "-y", "-i", video_path,
            "-vn", "-ar", "16000", "-ac", "1", "-b:a", "32k",
            audio_path
        ]
        logger.debug(f"[Media] Выполнение команды: {' '.join(cmd_audio)}")
        res_audio = subprocess.run(cmd_audio, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if res_audio.returncode != 0 or not os.path.exists(audio_path) or os.path.getsize(audio_path) < 4096:
            logger.warning(f"ffmpeg не смог извлечь аудио, пробуем moviepy... Ошибка: {res_audio.stderr.decode('utf-8', errors='ignore')}")
            if VideoFileClip is not None:
                clip = VideoFileClip(video_path)
                try:
                    if clip.audio is not None:
                        clip.audio.write_audiofile(audio_path, bitrate="32k", fps=16000, nbytes=2, logger=None)
                finally:
                    clip.close()
    else:
        logger.info(f"[Media] Используем уже извлечённое аудио ({os.path.getsize(audio_path) / (1024 * 1024):.2f} MB): {audio_path}")

    if os.path.exists(audio_path) and os.path.getsize(audio_path) >= 4096:
        audio_size_kb = os.path.getsize(audio_path) / 1024
        logger.debug(f"[Media] Аудио успешно сформировано: {audio_path} ({audio_size_kb:.1f} KB)")
    else:
        logger.warning(f"[Media] Не удалось извлечь аудио из {video_path}")
        audio_path = None

    # 2. Проверка существующих валидных кадров (чтобы не перенарезать после рестарта процесса)
    frame_glob = os.path.join(output_dir, f"{video_id}_frame_min_*.jpg")
    existing_files = sorted(f for f in glob.glob(frame_glob) if os.path.exists(f) and os.path.getsize(f) > 1024)
    duration_sec = _get_video_duration_seconds(video_path)
    expected_min_frames = max(3, int(duration_sec // 60) - 1) if duration_sec >= 180 else 1

    if len(existing_files) >= expected_min_frames and len(existing_files) > 0:
        logger.info(f"[Media] Найдено {len(existing_files)} уже нарезанных валидных кадров, повторная нарезка не требуется.")
        found_files = existing_files
    else:
        # Очищаем неполные старые кадры перед свежей нарезкой
        for old_f in glob.glob(frame_glob):
            try:
                os.remove(old_f)
            except Exception:
                pass

        # Быстрое извлечение по ключевым кадрам (-skip_frame nokey), затем fallback на полный проход
        logger.info("[Media] Быстрая нарезка кадров (1 кадр в минуту, режим ключевых кадров)...")
        pattern = os.path.join(output_dir, f"{video_id}_frame_min_%03d.jpg")
        cmd_fast = [
            "ffmpeg", "-y", "-skip_frame", "nokey", "-i", video_path,
            "-vf", "fps=1/60", "-vsync", "vfr", "-q:v", "3", pattern
        ]
        res_fast = subprocess.run(cmd_fast, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        found_files = sorted(f for f in glob.glob(frame_glob) if os.path.exists(f) and os.path.getsize(f) > 1024)

        if res_fast.returncode != 0 or len(found_files) < expected_min_frames:
            logger.info(f"[Media] Быстрая нарезка дала {len(found_files)} кадров (ожидалось >= {expected_min_frames}), запускаем стандартный проход ffmpeg...")
            for old_f in glob.glob(frame_glob):
                try:
                    os.remove(old_f)
                except Exception:
                    pass
            cmd_img = [
                "ffmpeg", "-y", "-i", video_path,
                "-vf", "fps=1/60", "-q:v", "3", pattern
            ]
            logger.debug(f"[Media] Выполнение команды нарезки кадров: {' '.join(cmd_img)}")
            res_img = subprocess.run(cmd_img, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            if res_img.returncode != 0:
                logger.warning(f"Ошибка нарезки кадров ffmpeg: {res_img.stderr.decode('utf-8', errors='ignore')}")
            found_files = sorted(f for f in glob.glob(frame_glob) if os.path.exists(f) and os.path.getsize(f) > 1024)

    image_paths = []
    for idx, img_p in enumerate(found_files):
        time_sec = idx * 60
        image_paths.append((time_sec, img_p))

    elapsed = time.time() - t0
    logger.info(f"[Media] Нарезка завершена за {elapsed:.2f} сек. Всего извлечено кадров: {len(image_paths)}")
    return audio_path, image_paths


async def extract_media_async(video_path: str):
    """Асинхронная обертка для извлечения медиа с использованием asyncio.to_thread."""
    return await asyncio.to_thread(extract_media_sync, video_path)
