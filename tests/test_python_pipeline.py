import asyncio
import functools
import http.server
import json
import os
import shutil
import socketserver
import subprocess
import sys
import tempfile
import threading
import types
import unittest
from unittest.mock import patch

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

import ai_common
import ai_gigachat
import fetch_talk
import file_processing
import ktalk_gigachat_pipeline


class _RangeVideoHandler(http.server.BaseHTTPRequestHandler):
    """Тестовый HTTP-сервер, имитирующий обрыв соединения и последующую докачку 206 Partial Content."""

    payload: bytes = b""
    request_log: list = []

    def log_message(self, format, *args):
        return

    def do_GET(self):
        range_hdr = self.headers.get("Range")
        self.request_log.append(range_hdr or "NO_RANGE")

        total = len(self.payload)
        if not range_hdr:
            # Имитируем обрыв на середине потока, отдавая Content-Length больше реально переданных байт
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(total))
            self.end_headers()
            split_pos = total // 2
            self.wfile.write(self.payload[:split_pos])
            self.wfile.flush()
            return

        # Парсим Range: bytes=<start>-
        start = int(range_hdr.replace("bytes=", "").split("-")[0])
        if start >= total:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{total}")
            self.end_headers()
            return

        remaining = self.payload[start:]
        self.send_response(206)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Range", f"bytes {start}-{total - 1}/{total}")
        self.send_header("Content-Length", str(len(remaining)))
        self.end_headers()
        self.wfile.write(remaining)
        self.wfile.flush()


class _ReusableTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True


class TestPythonPipeline(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp(prefix="olymp_py_test_")
        self._orig_settings_path = ai_gigachat.AI_SETTINGS_PATH
        self._orig_data_dir = ktalk_gigachat_pipeline.DATA_DIR
        ai_gigachat.AI_SETTINGS_PATH = os.path.join(self.tmp_dir, "ai_settings.json")
        ktalk_gigachat_pipeline.DATA_DIR = self.tmp_dir

    def tearDown(self):
        ai_gigachat.AI_SETTINGS_PATH = self._orig_settings_path
        ktalk_gigachat_pipeline.DATA_DIR = self._orig_data_dir
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    def test_model_rotation_order(self):
        chain = ai_gigachat.get_model_rotation_order(True)
        self.assertEqual(chain, ["GigaChat-2-Pro", "GigaChat-2-Max", "GigaChat-3-Ultra", "GigaChat-2"])
        single = ai_gigachat.get_model_rotation_order(False)
        self.assertEqual(len(single), 1)

    def test_budget_planner_trims_transcript_before_frames_and_scales_up(self):
        dummy_audio = os.path.join(self.tmp_dir, "lesson.mp3")
        with open(dummy_audio, "wb") as f:
            f.write(b"0" * (12 * 1024 * 1024))  # 12 MB (~17 400 токенов аудио)

        long_transcript = "\n".join(
            f"[00:{i:02d}:00] Спикер: Подробное объяснение олимпиадной задачи номер {i} со всеми шагами."
            for i in range(1, 900)
        )

        # Жёсткий бюджет (48 000): аудио целиком, транскрипт сжат, кадры также адаптированы
        tight = ai_gigachat.plan_multimodal_budget(
            transcript_text=long_transcript,
            summary_text="Краткое саммари урока.",
            static_prompt_chars=5500,
            audio_path=dummy_audio,
            total_extracted_frames=50,
            max_request_tokens=48_000,
            reserved_output_tokens=8_192,
        )
        self.assertTrue(tight["transcriptTrimmed"])
        self.assertGreater(tight["audioEstimatedTokens"], 15_000)
        self.assertLess(len(tight["transcriptText"]), len(long_transcript))
        self.assertGreaterEqual(tight["maxFrames"], 3)
        self.assertLessEqual(tight["maxFrames"], 15)

        # Повышенный бюджет (256 000): число кадров масштабируется вверх до 50 (из 50 извлечённых)
        expanded = ai_gigachat.plan_multimodal_budget(
            transcript_text=long_transcript,
            summary_text="Краткое саммари урока.",
            static_prompt_chars=5500,
            audio_path=dummy_audio,
            total_extracted_frames=50,
            max_request_tokens=256_000,
            reserved_output_tokens=8_192,
        )
        self.assertEqual(expanded["maxFrames"], 50)
        self.assertGreater(expanded["configuredBudgetTokens"], tight["configuredBudgetTokens"])

    def test_parse_analysis_json_with_broken_json_and_na_criteria(self):
        broken_wrapped = """```json
        {
          "is_critical": true,
          "critical_details": ["00:12:30 — Серьёзная ошибка в доказательстве"],
          "criteria_scores": [
            {"id": 1, "criterion": "К1", "score": 0, "details": "Отлично", "timecodes": []},
            {"id": 2, "criterion": "К2", "score": 1, "details": "Единичный сбой в 00:05:10", "timecodes": ["00:05:10"]},
            {"id": 3, "criterion": "К3", "score": null, "details": "Не применимо", "timecodes": []},
          ],
          "point": 1,
          "comment": "Разбор проведён.",
          "recommendations": ["Проверить слайды", "Следить за временем"]
        }
        ```"""
        parsed = ai_common.parse_analysis_json(broken_wrapped)
        self.assertTrue(parsed["is_critical"])
        self.assertEqual(parsed["applicable_count"], 2)
        self.assertEqual(parsed["max_possible_points"], 4)
        self.assertEqual(parsed["earned_points"], 3)
        self.assertEqual(parsed["final_percentage"], 75.0)
        self.assertEqual(len(parsed["recommendations_list"]), 2)

    def test_ffmpeg_extract_media_sync_and_cache_reuse(self):
        if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
            self.skipTest("ffmpeg/ffprobe не установлены в системе")

        video_path = os.path.join(self.tmp_dir, "sample_lec_video.mp4")
        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", "testsrc=duration=3:size=640x480:rate=10",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
            video_path,
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.assertEqual(res.returncode, 0, msg=res.stderr.decode("utf-8", errors="ignore"))

        audio_path, image_paths = file_processing.extract_media_sync(video_path)
        self.assertIsNotNone(audio_path)
        self.assertTrue(os.path.exists(audio_path))
        self.assertGreater(os.path.getsize(audio_path), 4096)
        self.assertGreaterEqual(len(image_paths), 1)
        self.assertTrue(os.path.exists(image_paths[0][1]))

        # Повторный вызов использует уже нарезанные файлы без ошибки
        audio_mtime = os.path.getmtime(audio_path)
        audio_path_2, image_paths_2 = file_processing.extract_media_sync(video_path)
        self.assertEqual(audio_path_2, audio_path)
        self.assertEqual(os.path.getmtime(audio_path_2), audio_mtime)
        self.assertEqual(len(image_paths_2), len(image_paths))

    def test_ktalk_video_download_range_resume(self):
        payload = os.urandom(204_800)  # 200 KB (> 128 KB порога)
        handler_cls = type(
            "TestRangeHandler",
            (_RangeVideoHandler,),
            {"payload": payload, "request_log": []},
        )
        server = _ReusableTCPServer(("127.0.0.1", 0), handler_cls)
        port = server.server_address[1]
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()

        out_video = os.path.join(self.tmp_dir, "resumed_video.mp4")

        async def run_download():
            import httpx
            timeout = httpx.Timeout(connect=5.0, read=10.0, write=10.0, pool=5.0)
            async with httpx.AsyncClient(timeout=timeout) as client:
                err_box = {}
                ok = await fetch_talk.download_talk_video(
                    client,
                    f"http://127.0.0.1:{port}/api",
                    "test_rec_key",
                    "test_api_key",
                    out_video,
                    quality="900p",
                    error_out=err_box,
                )
                return ok, err_box

        try:
            ok, err_box = asyncio.run(run_download())
            self.assertTrue(ok, msg=f"Ожидалась успешная докачка, ошибка: {err_box}")
            self.assertFalse(os.path.exists(f"{out_video}.part"))
            with open(out_video, "rb") as f:
                self.assertEqual(f.read(), payload)
            self.assertEqual(len(handler_cls.request_log), 2)
            self.assertEqual(handler_cls.request_log[0], "NO_RANGE")
            self.assertRegex(handler_cls.request_log[1], r"^bytes=\d+-$")
        finally:
            server.shutdown()
            server.server_close()

    def test_pipeline_model_rotation_pro_max_ultra_with_mocks(self):
        fake_video = os.path.join(self.tmp_dir, "fake_video.mp4")
        fake_audio = os.path.join(self.tmp_dir, "fake_audio.mp3")
        fake_frame = os.path.join(self.tmp_dir, "fake_frame_000.jpg")
        fake_transcript = os.path.join(self.tmp_dir, "fake_transcript.txt")
        fake_summary = os.path.join(self.tmp_dir, "fake_summary.txt")

        with open(fake_video, "wb") as f:
            f.write(b"v" * 4096)
        with open(fake_audio, "wb") as f:
            f.write(b"a" * 8192)
        with open(fake_frame, "wb") as f:
            f.write(b"f" * 2048)
        with open(fake_transcript, "w", encoding="utf-8") as f:
            f.write("[00:00:10] Преподаватель: Приветствуем всех на занятии.\n")
        with open(fake_summary, "w", encoding="utf-8") as f:
            f.write("Краткое содержание занятия.")

        std_criteria, _ = ktalk_gigachat_pipeline.load_dynamic_criteria()
        valid_scores = []
        for idx, crit in enumerate(std_criteria, start=1):
            if idx == 1:
                valid_scores.append({"id": idx, "criterion": crit["text"], "score": None, "details": "Н/П для теста", "timecodes": []})
            elif idx == 2:
                valid_scores.append({"id": idx, "criterion": crit["text"], "score": 1, "details": "Задержка на 00:04:12", "timecodes": []})
            else:
                valid_scores.append({"id": idx, "criterion": crit["text"], "score": 0, "details": "Всё хорошо", "timecodes": []})

        ultra_json = json.dumps({
            "is_critical": False,
            "critical_details": [],
            "criteria_scores": valid_scores,
            "point": 1,
            "comment": "Хорошее занятие с одним замечанием на 00:04:12.",
            "recommendations": ["Проверить слайды заранее", "Держать темп", "Больше вопросов", "Чётче выводы", "Дать ДЗ"],
        }, ensure_ascii=False)

        deleted_ids = []
        closed_flag = {"closed": False}

        class FakeGigaChatClient:
            def __init__(self):
                self.calls = []

            async def aupload_file(self, file_tuple, purpose="general"):
                name = file_tuple[0]
                return types.SimpleNamespace(id_=f"fid_{name}")

            async def adelete_file(self, fid):
                deleted_ids.append(fid)

            async def aclose(self):
                closed_flag["closed"] = True

            async def achat(self, chat_payload):
                self.calls.append(chat_payload.model)
                if chat_payload.model == "GigaChat-2-Pro":
                    raise Exception("HTTP 429 Too Many Requests")
                if chat_payload.model == "GigaChat-2-Max":
                    return types.SimpleNamespace(
                        usage=types.SimpleNamespace(prompt_tokens=14000, completion_tokens=8192, total_tokens=22192),
                        choices=[types.SimpleNamespace(
                            finish_reason="length",
                            message=types.SimpleNamespace(content='{"criteria_scores": [{"id": 1, "score": 0, "details": "обрыв"}]}'),
                        )],
                    )
                if chat_payload.model == "GigaChat-3-Ultra":
                    return types.SimpleNamespace(
                        usage=types.SimpleNamespace(prompt_tokens=15000, completion_tokens=950, total_tokens=15950),
                        choices=[types.SimpleNamespace(
                            finish_reason="stop",
                            message=types.SimpleNamespace(content=ultra_json),
                        )],
                    )
                raise AssertionError(f"Неожиданный вызов модели {chat_payload.model}")

        fake_client = FakeGigaChatClient()

        async def mock_is_meet_available(url, api_key):
            return {"title": "Олимпиадная алгебра", "login": "fokina", "name": "Анна", "surname": "Фокина", "date": "2026-11-10"}

        async def mock_download_all(url, api_key, task_prefix=""):
            return {"video": fake_video, "transcript": fake_transcript, "summary": fake_summary}

        async def mock_extract_media(v_path):
            return fake_audio, [(0, fake_frame)]

        async def mock_upload_files(client, audio_path, img_paths, max_frames=30):
            return "fid_audio", [("00:00", "fid_frame_0", fake_frame)], 1

        async def mock_sleep(_sec):
            return None

        with patch.dict(os.environ, {"TALK_API_KEY": "test_talk", "GIGACHAT_CREDENTIALS": "test_giga"}), \
             patch.object(fetch_talk, "is_meet_available", side_effect=mock_is_meet_available), \
             patch.object(fetch_talk, "download_all_artifacts_by_url", side_effect=mock_download_all), \
             patch.object(file_processing, "extract_media_async", side_effect=mock_extract_media), \
             patch.object(file_processing, "_get_video_duration_seconds", return_value=120.0), \
             patch.object(ai_gigachat, "get_gigachat_client", return_value=fake_client), \
             patch.object(ai_gigachat, "_upload_files_to_gigachat", side_effect=mock_upload_files), \
             patch.object(ktalk_gigachat_pipeline.asyncio, "sleep", side_effect=mock_sleep):
            task = asyncio.run(ktalk_gigachat_pipeline.execute_ktalk_gigachat_pipeline(
                task_id="lec_test_rotation",
                lecture_url="https://olymp.ktalk.ru/recordings/rec123456",
                teacher_name="Анна Фокина",
                subject="Математика",
                group_name="10 класс",
                curator_email="shurygin.egor2009@gmail.com",
            ))

        self.assertEqual(task["status"], "completed")
        self.assertEqual(task["aiModel"], "GigaChat-3-Ultra")
        self.assertEqual(len(task["modelAttempts"]), 3)
        self.assertEqual([a["model"] for a in task["modelAttempts"]], ["GigaChat-2-Pro", "GigaChat-2-Max", "GigaChat-3-Ultra"])
        self.assertEqual(task["applicableCount"], len(std_criteria) - 1)
        self.assertEqual(task["framesUploaded"], 1)
        self.assertEqual(task["framesPlanned"], 1)
        self.assertEqual(task["tokenUsage"]["totalTokens"], 15950)
        # Критерий #2 имеет score=1 без явного timecodes -> пайплайн подтягивает 00:04:12 из details
        self.assertEqual(task["criteria"][1]["timecodes"], ["00:04:12"])
        self.assertTrue(closed_flag["closed"])
        self.assertEqual(set(deleted_ids), {"fid_audio", "fid_frame_0"})
        # Локальные временные файлы удалены (152-ФЗ)
        self.assertFalse(os.path.exists(fake_video))
        self.assertFalse(os.path.exists(fake_audio))
        self.assertFalse(os.path.exists(fake_frame))

    def test_upload_audio_uses_audio_mpeg_and_mime_fallback(self):
        fake_audio = os.path.join(self.tmp_dir, "lecture_audio.mp3")
        with open(fake_audio, "wb") as f:
            f.write(b"ID3" + b"\x00" * 8192)

        uploaded_mimes = []

        class _MockClientOK:
            async def aupload_file(self, file_tuple, purpose="general"):
                uploaded_mimes.append(file_tuple[2])
                return types.SimpleNamespace(id_="fid_audio_mpeg")

        audio_id, uploaded_frames, planned = asyncio.run(
            ai_gigachat._upload_files_to_gigachat(_MockClientOK(), fake_audio, [], max_frames=0)
        )
        self.assertEqual(audio_id, "fid_audio_mpeg")
        self.assertEqual(uploaded_frames, [])
        self.assertEqual(planned, 0)
        self.assertEqual(uploaded_mimes, ["audio/mpeg"])
        self.assertIsNone(ai_gigachat._last_audio_upload_error)

        # Проверка автоматического переключения MIME при ответе "not supported" + сохранение ошибки при полном отказе
        fallback_mimes = []

        class _MockClientFallback:
            async def aupload_file(self, file_tuple, purpose="general"):
                fallback_mimes.append(file_tuple[2])
                if len(fallback_mimes) == 1:
                    raise Exception('400 {"status":400,"message":"File format audio/mpeg is not supported"}')
                return types.SimpleNamespace(id_="fid_audio_fallback")

        async def _no_sleep(_sec):
            return None

        with patch.object(ai_gigachat.asyncio, "sleep", side_effect=_no_sleep):
            audio_id_2, _, _ = asyncio.run(
                ai_gigachat._upload_files_to_gigachat(_MockClientFallback(), fake_audio, [], max_frames=0)
            )
        self.assertEqual(audio_id_2, "fid_audio_fallback")
        self.assertEqual(fallback_mimes, ["audio/mpeg", "audio/mp3"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
