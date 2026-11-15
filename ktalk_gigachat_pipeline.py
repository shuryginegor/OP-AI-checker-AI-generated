#!/usr/bin/env python3
"""
ktalk_gigachat_pipeline.py

Модуль взаимодействия с внешними сервисами КТалк (API) и Сбер GigaChat исключительно на Python.
Принцип Кристальной честности:
1. Никогда не оцениваем лекцию вслепую по одному транскрипту: если видеозапись КТалк
   не удалось скачать или медиа не удалось передать в GigaChat, задача честно завершается
   со статусом `failed`, `totalScore: None` и точной причиной ошибки.
2. В нейросеть обязательно передаются аудиодорожка и ключевые кадры видеозаписи + транскрипт/саммари.
3. Все локальные временные медиафайлы (видео, аудио, кадры, транскрипт, саммари) и файлы в облаке
   GigaChat гарантированно удаляются после завершения проверки (152-ФЗ).
4. Динамические критерии перенумеровываются без дырок (`1..N`). Критерий со значением `null`
   отмечается как «Н/П» (`notApplicable: True`) и не включается ни в числитель, ни в знаменатель.
5. Критические нарушения НЕ обнуляют и не урезают реальный балл — они фиксируются отдельно.
6. Никогда не затираем серверный кольцевой бэкап `data/lecture_tasks_backup.json` из Python-пайплайна.
"""

import os
import sys
import glob
import json
import re
import time
import asyncio
import traceback
from typing import Dict, Any, Optional, Tuple, List

from dotenv import load_dotenv
load_dotenv()

import fetch_talk
import file_processing
import ai_gigachat
import ai_common
from gigachat.models import Chat, Messages, MessagesRole

DATA_DIR = os.path.join(os.getcwd(), "data")
os.makedirs(DATA_DIR, exist_ok=True)


def emit_stage(stage: str):
    """Передает реальный этап выполнения родительскому процессу server.ts."""
    print(f"[STAGE] {stage}", file=sys.stderr, flush=True)


def load_dynamic_criteria() -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Загружает критерии из data/criteria_active.json и нормализует их нумерацию 1..N без дырок."""
    crit_file = os.path.join(DATA_DIR, "criteria_active.json")
    if os.path.exists(crit_file):
        try:
            with open(crit_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                raw_std = data.get("standardCriteria", [])
                raw_crit = data.get("criticalCriteria", [])
                if raw_std and isinstance(raw_std, list):
                    std = []
                    for i, c in enumerate(raw_std):
                        if not isinstance(c, dict):
                            continue
                        std.append({
                            "id": i + 1,
                            "text": str(c.get("text") or c.get("title") or "").strip(),
                            "category": str(c.get("category") or "Методический стандарт").strip()
                        })
                    crit = []
                    if raw_crit and isinstance(raw_crit, list):
                        for i, c in enumerate(raw_crit):
                            if not isinstance(c, dict):
                                continue
                            crit.append({
                                "id": i + 1,
                                "title": str(c.get("title") or "").strip(),
                                "desc": str(c.get("desc") or "").strip()
                            })
                    if std:
                        return std, crit
        except Exception as e:
            print(f"[Criteria] Ошибка чтения {crit_file}: {e}", file=sys.stderr)

    default_std = [
        {"id": 1, "text": "Преподаватель уверенно ведёт разбор, не решает задания впервые и не путается в обозначениях.", "category": "Владение материалом"},
        {"id": 2, "text": "Презентация, доска, задачи, ссылки и дополнительные материалы подготовлены и быстро доступны.", "category": "Подготовка к занятию"},
        {"id": 3, "text": "В начале ученикам понятно, чему посвящено занятие.", "category": "Целеполагание"},
        {"id": 4, "text": "Смена тем и заданий мотивирована; занятие не выглядит набором несвязанных эпизодов.", "category": "Логика и переходы"},
        {"id": 5, "text": "Нет чрезмерно длинного вступления, затянутого разбора одной задачи или спешки в конце.", "category": "Тайм-менеджмент"},
        {"id": 6, "text": "Ученики отвечают, предлагают идеи, решают или комментируют ход рассуждения.", "category": "Вовлечение учеников"},
        {"id": 7, "text": "Преподаватель не работает исключительно с одним-двумя наиболее активными учениками.", "category": "Работа со всей группой"},
        {"id": 8, "text": "Преподаватель замечает, когда часть группы не успевает или не понимает.", "category": "Контроль понимания"},
        {"id": 9, "text": "Ошибочные версии не высмеиваются и используются для содержательного разбора.", "category": "Работа с ошибками"},
        {"id": 10, "text": "Нет грубости, раздражения, излишнего давления или неуместной фамильярности.", "category": "Этика общения"},
        {"id": 11, "text": "Слабые ученики не выпадают из работы, а сильные получают содержательную нагрузку.", "category": "Дифференциация"},
        {"id": 12, "text": "Нет длительной лекции без применения и бесконечного решения без обобщения.", "category": "Методический баланс"},
        {"id": 13, "text": "Материал не сводится к поверхностному перечислению правил.", "category": "Глубина подачи"},
        {"id": 14, "text": "Занятие начинается без необоснованной задержки.", "category": "Пунктуальность"},
        {"id": 15, "text": "Преподаватель не завершает существенно раньше и не превышает время без необходимости.", "category": "Соблюдение регламента"},
        {"id": 16, "text": "Речь разборчива, постоянные помехи и эхо отсутствуют.", "category": "Качество речи и звука"},
        {"id": 17, "text": "Показывается нужное окно; нет длительного поиска файлов и вкладок.", "category": "Демонстрация экрана"},
        {"id": 18, "text": "Текст достаточно крупный, обозначения видны, оформление не перегружено.", "category": "Визуальное оформление"},
        {"id": 19, "text": "Сбои решаются спокойно и не занимают значительную часть занятия.", "category": "Реакция на сбои"},
        {"id": 20, "text": "Уведомления, личная переписка и лишние вкладки не демонстрируются.", "category": "Цифровая гигиена"},
        {"id": 21, "text": "Не раскрываются персональные данные и не обсуждаются неуместные темы.", "category": "Безопасность и регламент"}
    ]
    default_crit = [
        {"id": 1, "title": "Фактическая или методическая ошибка", "desc": "Серьезная ошибка в теории или решении, оставшаяся без исправления."},
        {"id": 2, "title": "Некорректное общение", "desc": "Грубое, унизительное или дискриминирующее общение с учеником."},
        {"id": 3, "title": "Некомпетентность в задаче", "desc": "Преподаватель не владеет решением рассматриваемой задачи и не может закончить разбор."},
        {"id": 4, "title": "Игнорирование учеников", "desc": "Систематическое игнорирование вопросов и явных признаков непонимания группы."},
        {"id": 5, "title": "Срыв тайминга из-за неподготовленности", "desc": "Значительная часть занятия потрачена на организационные или технические действия."},
        {"id": 6, "title": "Утечка конфиденциальных данных", "desc": "Демонстрация персональных данных, личной переписки или приватной информации."},
        {"id": 7, "title": "Заведомо ложный материал", "desc": "Выдача заведомо неверного ответа, правила или алгоритма без исправления."},
        {"id": 8, "title": "Длительное отсутствие", "desc": "Отсутствие преподавателя или учебной работы в течение значительной части занятия."}
    ]
    return default_std, default_crit


def load_dynamic_prompt() -> str:
    """Загружает системный промпт из data/prompt_active.txt или возвращает заводской."""
    for fn in ["prompt_active.txt", "system_prompt_active.txt"]:
        p = os.path.join(DATA_DIR, fn)
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    content = f.read().strip()
                    if content:
                        return content
            except Exception:
                pass

    return """Ты — строгий, бескомпромиссный главный методист и старший эксперт по контролю качества онлайн-занятий.
Твоя задача — провести ПРЕДЕЛЬНО ДЕТАЛЬНЫЙ, КРИТИЧЕСКИЙ И ПРИДИРЧИВЫЙ аудит предоставленного занятия.
Не сглаживай углы, не будь излишне вежливым, фиксируй ВСЕ недочёты, нарушения дисциплины, панибратство, технические сбои и методические огрехи.

КРИТИЧЕСКИ ВАЖНО — ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ ОТ ПОЛЬЗОВАТЕЛЯ:
"{additional_info}"
Эта информация определяет реальный формат, целевую аудиторию и контекст занятия.
Если критерий противоречит явно указанному формату (например, запись лекции без учеников, а критерий требует работы с классом), ставь в поле `score` значение `null`.

СПИСОК НЕКРИТИЧЕСКИХ КРИТЕРИЕВ ДЛЯ ОЦЕНИВАНИЯ:
{standard_formatted}

СТРОГИЕ ПРАВИЛА ВЫСТАВЛЕНИЯ ШТРАФНЫХ БАЛЛОВ ПО КАЖДОМУ КРИТЕРИЮ:
По каждому критерию определи количество СНЯТЫХ баллов (`score`):
• 0 — ИДЕАЛЬНО / ПОЛНОЕ ОТСУТСТВИЕ НАРУШЕНИЙ (0 баллов снимается). Ставь 0 ТОЛЬКО если на протяжении ВСЕГО урока по этому критерию нет НИ ЕДИНОГО замечания. В массив `timecodes` передавай СТРОГО пустой список `[]`!
• 1 — НЕБОЛЬШОЕ ИЛИ ЕДИНИЧНОЕ НАРУШЕНИЕ (снимается 1 балл). Если был хотя бы один эпизод отклонения (например: неформальный флуд, посторонний голос на фоне, единичный поиск файла, игнорирование молчащего ученика, отсутствие ДЗ). ОБЯЗАТЕЛЬНО укажи массив точных таймкодов нарушений в поле `timecodes` вида `["ЧЧ:ММ:СС"]` или `["ММ:СС"]`.
• 2 — СИСТЕМАТИЧЕСКОЕ ИЛИ ГРУБОЕ НАРУШЕНИЕ (снимается 2 балла). Если проблема повторялась регулярно, заняла существенную часть урока или существенно снизила пользу занятия. ОБЯЗАТЕЛЬНО укажи массив точных таймкодов нарушений в поле `timecodes`.
• null — КРИТЕРИЙ НЕ ПРИМЕНИМ из-за формата/специфики урока или информации от пользователя (в `timecodes` передавай `[]`).

КРИТИЧЕСКОЕ ПРАВИЛО СОГЛАСОВАННОСТИ ОЦЕНКИ И ТАЙМКОДОВ:
- Если ты обнаружил реальное нарушение или замечание по критерию и зафиксировал его таймкод — ЗАПРЕЩЕНО оставлять `score: 0`! Обязательно снимай `1` или `2` балла.
- В поле `timecodes` передаются ТОЛЬКО таймкоды НАРУШЕНИЙ (когда `score` равен `1` или `2`). Если нарушений нет (`score: 0`) или критерий неприменим (`score: null`), в `timecodes` ВСЕГДА передавай пустой массив `[]` (позитивные таймкоды упоминай только внутри `details` и `quote`).

ОБЯЗАТЕЛЬНЫЕ ПОЛЯ К КАЖДОМУ КРИТЕРИЮ:
- `timecodes`: массив строк ТОЛЬКО с таймкодами нарушений (например `["00:14:20", "00:42:15"]` при `score` 1 или 2). При `score: 0` или `null` — СТРОГО `[]`.
- `quote`: прямая цитата из урока, подтверждающая нарушение (или выполнение при `score: 0`).
- `details`: развёрнутое обоснование оценки (почему сняты баллы или почему критерий выполнен/не применим).

СПИСОК КРИТИЧЕСКИХ НАРУШЕНИЙ:
{critical_formatted}

ПРАВИЛО КРИТИЧНОСТИ:
1. Проверь занятие на ВСЕ КРИТИЧЕСКИЕ НАРУШЕНИЯ. Если есть хотя бы одно — `is_critical: true` и перечисли их в `critical_details` с точными таймкодами.
2. В поле `point` укажи сумму всех СНЯТЫХ баллов (суммарный штраф).

ТРЕБОВАНИЯ К КОММЕНТАРИЮ И РЕКОМЕНДАЦИЯМ:
• В поле `comment` напиши развернутый экспертный разбор (10-15 предложений) в хронологическом порядке: подробно распиши все замеченные недостатки, срыв тайминга, флуд, технические задержки, работу с учениками ОБЯЗАТЕЛЬНО С ТОЧНЫМИ ТАЙМКОДАМИ вида (ЧЧ:ММ:СС или ММ:СС).
• В поле `recommendations` напиши ровно 5 четких, конкретных рекомендаций преподавателю, как устранить эти недостатки."""


def build_system_prompt(additional_info: str = "") -> Tuple[str, List[Dict[str, Any]]]:
    """Формирует итоговый системный промпт с динамическими критериями и гарантированной JSON-схемой."""
    std_criteria, crit_criteria = load_dynamic_criteria()
    template = load_dynamic_prompt()

    std_formatted_lines = [f"{c['id']}. {c['text']}" for c in std_criteria]
    std_formatted = "\n".join(std_formatted_lines)

    crit_formatted_lines = [f"{c['id']}. {c['title']}: {c['desc']}" for c in crit_criteria]
    crit_formatted = "\n".join(crit_formatted_lines)

    info_str = additional_info.strip() if additional_info and additional_info.strip() else "Отсутствует"

    prompt = template
    if "{additional_info}" in prompt or "{{additional_info}}" in prompt:
        prompt = prompt.replace("{additional_info}", info_str).replace("{{additional_info}}", info_str)
    elif info_str != "Отсутствует":
        prompt += f'\n\nДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ ОТ ПОЛЬЗОВАТЕЛЯ:\n"{info_str}"\n'

    prompt = prompt.replace("{standard_formatted}", std_formatted)
    prompt = prompt.replace("{critical_formatted}", crit_formatted)

    count = len(std_criteria)
    json_instructions = f"""

ТРЕБОВАНИЕ К СТРУКТУРЕ JSON-ОТВЕТА:
Твой ответ должен состоять ИСКЛЮЧИТЕЛЬНО из одного валидного JSON-объекта со следующими ключами:
{{
  "is_critical": false,
  "critical_details": ["<ЧЧ:ММ:СС — подробное описание критического нарушения при наличии>"],
  "criteria_scores": [
    {{
      "id": 1,
      "criterion": "...",
      "score": 0,
      "details": "...",
      "timecodes": [],
      "quote": "«...»"
    }}
  ],
  "point": 0,
  "comment": "Развернутый экспертный разбор (10-15 предложений) с точными таймкодами вида ЧЧ:ММ:СС...",
  "recommendations": [
    "Конкретная рекомендация 1 (с указанием таймкодов проблемных мест)",
    "Конкретная рекомендация 2",
    "Конкретная рекомендация 3",
    "Конкретная рекомендация 4",
    "Конкретная рекомендация 5"
  ]
}}
ВАЖНО:
1. Массив `criteria_scores` должен содержать РОВНО {count} объектов по каждому из критериев (id от 1 до {count}).
2. Для КАЖДОГО критерия указывай `"timecodes"` и `"quote"`. При нарушении (`score` 1 или 2) в `timecodes` ОБЯЗАТЕЛЬНО передавай точные таймкоды нарушения вида `["ЧЧ:ММ:СС"]` и НЕ занижай штраф до `0`, если нарушение зафиксировано. При отсутствии нарушений (`score` 0) или `null` передавай `"timecodes": []`.
3. Если критерий не применим по формату занятия — ставь `"score": null` (не 0!) и объясни причину в `"details"`."""

    if "criteria_scores" not in prompt or "timecodes" not in prompt:
        prompt += json_instructions

    return prompt.strip(), std_criteria


def _build_failed_task(
    task_id: str,
    lecture_url: str,
    teacher_name: str,
    subject: str,
    group_name: str,
    curator_email: str,
    talk_metadata: Dict[str, Any],
    error_message: str,
    is_corrupted: bool = False,
    raw_broken_response: Optional[str] = None,
    ai_model: Optional[str] = None,
    frames_uploaded: Optional[int] = None,
    frames_planned: Optional[int] = None,
    model_attempts: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    return {
        "id": task_id,
        "lectureUrl": lecture_url,
        "teacherName": teacher_name or "Преподаватель",
        "subject": subject or "",
        "groupName": group_name or "",
        "date": talk_metadata.get("date") or time.strftime("%Y-%m-%d %H:%M"),
        "totalScore": None,
        "criticalViolations": [],
        "positiveHighlights": [],
        "recommendations": [],
        "criteria": [],
        "status": "failed",
        "progressPct": 100,
        "curatorEmail": curator_email,
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "talkMetadata": talk_metadata,
        "isCorrupted": is_corrupted,
        "rawBrokenResponse": raw_broken_response,
        "errorMessage": error_message,
        "applicableCount": None,
        "earnedPoints": None,
        "maxPoints": None,
        "aiModel": ai_model,
        "framesUploaded": frames_uploaded,
        "framesPlanned": frames_planned,
        "tokenUsage": None,
        "modelAttempts": model_attempts or []
    }


def _cleanup_local_artifacts_sync(paths: List[Optional[str]], rec_id: str = "", task_id: str = ""):
    for p in paths:
        if p and os.path.exists(p):
            try:
                os.remove(p)
            except Exception as e:
                print(f"[152-ФЗ] Не удалось удалить {p}: {e}", file=sys.stderr)
    if rec_id:
        safe_prefix = re.sub(r"[^a-zA-Z0-9_\-]", "_", task_id).strip("_") if task_id else ""
        pattern = os.path.join("artifacts", f"{rec_id}_{safe_prefix}_*" if safe_prefix else f"{rec_id}_*_gigachat_opt.jpg")
        for leftover in glob.glob(pattern):
            try:
                os.remove(leftover)
            except Exception:
                pass


async def execute_ktalk_gigachat_pipeline(
    task_id: str,
    lecture_url: str,
    teacher_name: str,
    subject: str = "",
    group_name: str = "",
    curator_email: str = "",
    additional_info: str = ""
) -> Dict[str, Any]:
    print("\n==================================================", file=sys.stderr)
    print(f"[Pipeline] Старт проверки лекции: {task_id}", file=sys.stderr)
    print(f"URL: {lecture_url} | Преподаватель (вход): {teacher_name}", file=sys.stderr)

    talk_metadata: Dict[str, Any] = {
        "title": "Онлайн-занятие КТалк",
        "url": lecture_url,
        "date": time.strftime("%Y-%m-%d %H:%M"),
        "author": teacher_name,
        "login": "",
        "domain": "ktalk.ru"
    }

    api_key = fetch_talk.get_api_key()
    if not api_key:
        err = "Ключ API Контур.Толка (TALK_API_KEY) не настроен на сервере. Проверка невозможна."
        print(f"[Pipeline] {err}", file=sys.stderr)
        return _build_failed_task(task_id, lecture_url, teacher_name, subject, group_name, curator_email, talk_metadata, err)

    giga_creds = os.getenv("GIGACHAT_CREDENTIALS")
    if not giga_creds:
        err = "Ключ GigaChat API (GIGACHAT_CREDENTIALS) не настроен на сервере. Проверка невозможна."
        print(f"[Pipeline] {err}", file=sys.stderr)
        return _build_failed_task(task_id, lecture_url, teacher_name, subject, group_name, curator_email, talk_metadata, err)

    rec_id = ""
    artifacts: Dict[str, Any] = {}
    audio_path: Optional[str] = None
    image_paths: List[Tuple[int, str]] = []
    client = None
    uploaded_file_ids: List[str] = []

    try:
        try:
            rec_id = fetch_talk.extract_record_id(lecture_url)
            talk_metadata["recordingKey"] = rec_id
        except Exception as rec_err:
            return _build_failed_task(
                task_id, lecture_url, teacher_name, subject, group_name, curator_email, talk_metadata,
                f"Некорректная ссылка на запись КТалк: {rec_err}"
            )

        # 1. Загружаем метаданные встречи и все артефакты (видео + транскрипт + саммари)
        emit_stage("downloading")
        meet_info = await fetch_talk.is_meet_available(lecture_url, api_key)
        print(f"[KTalk] Метаданные встречи: {meet_info}", file=sys.stderr)
        if meet_info:
            talk_metadata["title"] = meet_info.get("title") or talk_metadata["title"]
            talk_metadata["date"] = meet_info.get("date") or talk_metadata["date"]
            talk_metadata["login"] = meet_info.get("login") or ""

            fn = (meet_info.get("name") or "").strip()
            sn = (meet_info.get("surname") or "").strip()
            if fn or sn:
                real_teacher = f"{fn} {sn}".strip()
                talk_metadata["author"] = real_teacher
                if not teacher_name or teacher_name.strip() in ("Преподаватель", ""):
                    teacher_name = real_teacher

        artifacts = await fetch_talk.download_all_artifacts_by_url(lecture_url, api_key, task_prefix=task_id)
        video_path = artifacts.get("video")

        # ПРИНЦИП КРИСТАЛЬНОЙ ЧЕСТНОСТИ: если видео не скачалось — немедленная честная ошибка, без проверки вслепую!
        if not video_path or not os.path.exists(video_path):
            video_err = artifacts.get("video_error") or "Не удалось скачать видеозапись лекции с Контур.Толка."
            err_msg = f"{video_err} По правилам честной проверки без видеозаписи (аудио и кадров) анализ не выполняется."
            print(f"[Pipeline] Ошибка скачивания видео: {err_msg}", file=sys.stderr)
            return _build_failed_task(
                task_id, lecture_url, teacher_name, subject, group_name, curator_email, talk_metadata, err_msg
            )

        # 2. Нарезаем аудио и кадры из скачанного видео
        emit_stage("extracting")
        audio_path, image_paths = await file_processing.extract_media_async(video_path)

        transcript_text = ""
        summary_text = ""
        if artifacts.get("transcript") and os.path.exists(artifacts["transcript"]):
            with open(artifacts["transcript"], "r", encoding="utf-8") as tf:
                transcript_text = tf.read().strip()
        if artifacts.get("summary") and os.path.exists(artifacts["summary"]):
            with open(artifacts["summary"], "r", encoding="utf-8") as sf:
                summary_text = sf.read().strip()

        # 3. Системный промпт, динамический токен-бюджет (аудио всегда целиком -> сперва транскрипт -> потом кадры)
        system_prompt, active_criteria = build_system_prompt(additional_info)
        ai_settings = ai_gigachat.load_ai_settings()
        budget_plan = ai_gigachat.plan_multimodal_budget(
            transcript_text=transcript_text,
            summary_text=summary_text,
            static_prompt_chars=len(system_prompt),
            audio_path=audio_path,
            total_extracted_frames=len(image_paths),
            max_request_tokens=ai_settings["maxRequestTokens"],
            reserved_output_tokens=ai_settings["reservedOutputTokens"]
        )
        max_frames = budget_plan["maxFrames"]
        planned_transcript = budget_plan["transcriptText"]
        planned_summary = budget_plan["summaryText"]

        emit_stage("uploading")
        rotation_models = ai_gigachat.get_model_rotation_order(ai_settings.get("enableModelRotation", True))
        client = ai_gigachat.get_gigachat_client(rotation_models[0])

        audio_file_id, uploaded_frames_data, frames_planned = await ai_gigachat._upload_files_to_gigachat(
            client, audio_path, image_paths, max_frames=max_frames
        )

        if audio_file_id:
            uploaded_file_ids.append(audio_file_id)
        uploaded_file_ids.extend([fid for _, fid, _ in uploaded_frames_data])

        frames_uploaded = len(uploaded_frames_data)
        talk_metadata["hasAudio"] = bool(audio_file_id)
        talk_metadata["framesUploaded"] = frames_uploaded
        talk_metadata["framesPlanned"] = frames_planned

        if audio_path and os.path.exists(audio_path) and not audio_file_id:
            err_msg = "Не удалось загрузить аудиодорожку занятия в облако GigaChat. По правилам полной мультимодальной проверки анализ без аудиодорожки не выполняется."
            print(f"[Pipeline] {err_msg}", file=sys.stderr)
            return _build_failed_task(
                task_id, lecture_url, teacher_name, subject, group_name, curator_email, talk_metadata, err_msg,
                frames_uploaded=frames_uploaded, frames_planned=frames_planned
            )

        if not uploaded_file_ids:
            err_msg = "Не удалось загрузить аудиодорожку и видеокадры в облако GigaChat. Повторите проверку позже."
            print(f"[Pipeline] {err_msg}", file=sys.stderr)
            return _build_failed_task(
                task_id, lecture_url, teacher_name, subject, group_name, curator_email, talk_metadata, err_msg,
                frames_uploaded=frames_uploaded, frames_planned=frames_planned
            )

        # Удаляем локальные временные медиа сразу после завершения загрузки в GigaChat
        _cleanup_local_artifacts_sync(
            [
                video_path,
                audio_path,
                artifacts.get("audio"),
                artifacts.get("transcript"),
                artifacts.get("summary"),
                *[p for _, p in image_paths]
            ],
            rec_id=rec_id,
            task_id=task_id
        )

        audio_desc = (
            f"- Полная оригинальная аудиодорожка занятия прикреплена без обрезки (ID файла: {audio_file_id})\n"
            if audio_file_id
            else "- Аудиодорожка не была извлечена.\n"
        )
        frames_description = "\n".join(
            [f"- Кадр [{t_str}] (ID файла: {fid})" for t_str, fid, _ in uploaded_frames_data]
        ) or "Кадры видео отсутствуют."

        user_text = f"""--- МУЛЬТИМОДАЛЬНЫЕ МАТЕРИАЛЫ ЗАНЯТИЯ ---
• Преподаватель: {teacher_name}
• Предмет: {subject or 'Не указан'}
• Группа: {group_name or 'Не указана'}
• Название встречи в КТалк: {talk_metadata.get('title', 'Онлайн-занятие')}
• Дата проведения: {talk_metadata.get('date', '')}
• Автор по данным КТалк: {talk_metadata.get('author', teacher_name)} ({talk_metadata.get('login', '')})

АУДИОДОРОЖКА ВСТРЕЧИ:
{audio_desc}
КЛЮЧЕВЫЕ КАДРЫ ЭКРАНА С ТАЙМКОДАМИ ({frames_uploaded} из {frames_planned} запланированных):
{frames_description}

--- ТЕКСТОВЫЕ МАТЕРИАЛЫ ---
ИИ-Краткий пересказ встречи (Саммари):
{planned_summary if planned_summary else 'Отсутствует'}

Транскрипт общения с таймкодами реплик:
{planned_transcript if planned_transcript else 'Транскрипт не предоставлен сервером КТалк; ориентируйся на аудиодорожку и кадры экрана.'}

ИНСТРУКЦИЯ ПО АНАЛИЗУ:
1. Внимательно проанализируй аудиодорожку, прикреплённые кадры экрана и транскрипт в сопоставлении с критериями оценивания.
2. По каждому критерию при нарушении (score 1 или 2) ОБЯЗАЛЬНО укажи точные таймкоды в `timecodes` вида `["ЧЧ:ММ:СС"]` и подтверждающую цитату в `quote`.
3. Оцени ровно {len(active_criteria)} критериев (`id` от 1 до {len(active_criteria)}). Неприменимые по формату критерии отмечай как `null`.
4. Выдай итоговый ответ СТРОГО в виде валидного JSON-объекта."""

        # 4. Мультимодальный запрос в GigaChat со строгой ротацией моделей:
        # Pro -> Max -> Ultra -> Base (обычная только в крайнем случае)
        emit_stage("analyzing")
        model_attempts: List[Dict[str, Any]] = []
        winning_model: Optional[str] = None
        winning_finish_reason: Optional[str] = None
        winning_usage: Dict[str, Any] = {}
        parsed_result: Optional[Dict[str, Any]] = None
        last_raw_response: str = ""
        last_error_text: str = "Ни одна модель GigaChat не смогла завершить проверку."

        refusal_keywords = [
            "разговоры на чувствительные темы",
            "ограничены из соображений безопасности",
            "не могу ответить на данный вопрос",
            "не могу выполнить данный запрос",
            "модели не обладают собственным мнением",
            "чувствительные темы могут быть ограничены"
        ]

        messages_payload = [
            Messages(role=MessagesRole.SYSTEM, content=system_prompt),
            Messages(role=MessagesRole.USER, content=user_text, attachments=uploaded_file_ids)
        ]

        for candidate_model in rotation_models:
            t_model_start = time.time()
            print(
                f"[GigaChat] Попытка анализа на модели {candidate_model} "
                f"(вложений: {len(uploaded_file_ids)}, кадры: {frames_uploaded}/{frames_planned}, бюджет: {budget_plan['configuredBudgetTokens']})...",
                file=sys.stderr
            )
            chat_payload = Chat(
                model=candidate_model,
                messages=messages_payload,
                max_tokens=budget_plan["reservedOutputTokens"],
                temperature=0.1
            )

            resp = None
            call_err: Optional[Exception] = None
            for sub_try in range(1, 3):
                try:
                    resp = await client.achat(chat_payload)
                    call_err = None
                    break
                except Exception as attempt_err:
                    call_err = attempt_err
                    err_str = str(attempt_err)
                    is_transient_429 = ("429" in err_str or "Too Many Requests" in err_str) and sub_try < 2
                    if is_transient_429:
                        print(
                            f"[GigaChat] Модель {candidate_model}: 429 Too Many Requests, короткая пауза 5 сек перед переключением...",
                            file=sys.stderr
                        )
                        await asyncio.sleep(5)
                    else:
                        break

            elapsed_model = round(time.time() - t_model_start, 2)

            if call_err is not None or resp is None:
                err_str = str(call_err or "Пустой ответ API")
                last_error_text = f"{candidate_model}: {err_str}"
                print(f"[GigaChat] Модель {candidate_model} не завершила запрос ({elapsed_model}s): {err_str}. Переход к следующей модели...", file=sys.stderr)
                model_attempts.append({
                    "model": candidate_model,
                    "status": "failed",
                    "reason": err_str[:300],
                    "durationSec": elapsed_model
                })
                continue

            usage_obj = getattr(resp, "usage", None)
            p_tokens = int(getattr(usage_obj, "prompt_tokens", 0) or 0) if usage_obj else 0
            c_tokens = int(getattr(usage_obj, "completion_tokens", 0) or 0) if usage_obj else 0
            t_tokens = int(getattr(usage_obj, "total_tokens", 0) or 0) if usage_obj else (p_tokens + c_tokens)

            choices = resp.choices if hasattr(resp, "choices") else []
            if not choices or not getattr(choices[0], "message", None):
                last_error_text = f"{candidate_model}: пустой ответ choices"
                model_attempts.append({
                    "model": candidate_model,
                    "status": "failed",
                    "reason": "Пустой choices от модели",
                    "promptTokens": p_tokens,
                    "completionTokens": c_tokens,
                    "totalTokens": t_tokens,
                    "durationSec": elapsed_model
                })
                continue

            choice = choices[0]
            finish_reason = str(getattr(choice, "finish_reason", "") or "")
            raw_response = choice.message.content or ""
            last_raw_response = raw_response

            is_refused = (
                finish_reason in ("blacklist", "content_filter", "censorship")
                or any(kw in raw_response.lower() for kw in refusal_keywords)
            )
            if is_refused:
                last_error_text = f"{candidate_model}: отказ по фильтру безопасности ({finish_reason or 'blacklist'})"
                print(f"[GigaChat] {last_error_text}. Переключаемся на следующую модель...", file=sys.stderr)
                model_attempts.append({
                    "model": candidate_model,
                    "status": "refused",
                    "finishReason": finish_reason or "blacklist",
                    "reason": "Сработал фильтр безопасности модели",
                    "promptTokens": p_tokens,
                    "completionTokens": c_tokens,
                    "totalTokens": t_tokens,
                    "durationSec": elapsed_model
                })
                continue

            try:
                candidate_parsed = ai_common.parse_analysis_json(raw_response)
                parsed_count = len(candidate_parsed.get("criteria_scores") or [])
                if finish_reason == "length" and parsed_count < max(1, len(active_criteria) // 2):
                    raise ValueError(f"Ответ обрезан по окну генерации (finish_reason=length, разобрано критериев {parsed_count}/{len(active_criteria)})")

                winning_model = candidate_model
                winning_finish_reason = finish_reason or "stop"
                winning_usage = {
                    "promptTokens": p_tokens,
                    "completionTokens": c_tokens,
                    "totalTokens": t_tokens,
                    "finishReason": winning_finish_reason,
                    "durationSec": elapsed_model
                }
                parsed_result = candidate_parsed
                model_attempts.append({
                    "model": candidate_model,
                    "status": "completed",
                    "finishReason": winning_finish_reason,
                    "promptTokens": p_tokens,
                    "completionTokens": c_tokens,
                    "totalTokens": t_tokens,
                    "durationSec": elapsed_model
                })
                print(
                    f"[GigaChat] ✅ Проверка успешно завершена моделью {winning_model} за {elapsed_model}s "
                    f"(токены: {t_tokens}, finish_reason={winning_finish_reason})",
                    file=sys.stderr
                )
                break
            except Exception as parse_err:
                last_error_text = f"{candidate_model}: {parse_err}"
                print(f"[GigaChat] Ошибка разбора JSON от {candidate_model}: {parse_err}. Переключаемся на следующую модель...", file=sys.stderr)
                model_attempts.append({
                    "model": candidate_model,
                    "status": "corrupted",
                    "finishReason": finish_reason,
                    "reason": str(parse_err)[:300],
                    "promptTokens": p_tokens,
                    "completionTokens": c_tokens,
                    "totalTokens": t_tokens,
                    "durationSec": elapsed_model
                })
                continue

        if not winning_model or parsed_result is None:
            return _build_failed_task(
                task_id, lecture_url, teacher_name, subject, group_name, curator_email, talk_metadata,
                f"Все доступные модели ротации ({', '.join(rotation_models)}) не смогли завершить проверку. Последняя ошибка: {last_error_text}",
                is_corrupted=bool(last_raw_response),
                raw_broken_response=last_raw_response or last_error_text,
                ai_model=None,
                frames_uploaded=frames_uploaded,
                frames_planned=frames_planned,
                model_attempts=model_attempts
            )

        # 6. Честный подсчет баллов без искусственных обнулений и с поддержкой Н/П (null)
        is_crit = bool(parsed_result.get("is_critical", False))
        crit_details = parsed_result.get("critical_details") or []
        scores_arr = parsed_result.get("criteria_scores") or []

        scores_by_id: Dict[int, Dict[str, Any]] = {}
        for s in scores_arr:
            if isinstance(s, dict):
                raw_cid = s.get("id", s.get("criterion_id"))
                if raw_cid is not None:
                    try:
                        scores_by_id[int(raw_cid)] = s
                    except (ValueError, TypeError):
                        pass

        use_index_fallback = len(scores_arr) == len(active_criteria)

        final_criteria = []
        applicable_count = 0
        earned_raw = 0
        max_raw = 0
        earned_five_points = 0

        for i, c in enumerate(active_criteria):
            cid = i + 1
            ai_data = scores_by_id.get(cid)
            if ai_data is None and use_index_fallback and isinstance(scores_arr[i], dict):
                ai_data = scores_arr[i]
            ai_data = ai_data or {}

            score_val = ai_data.get("score")

            t_codes = ai_data.get("timecodes", [])
            if isinstance(t_codes, str) and t_codes.strip():
                t_codes = [t_codes.strip()]
            elif not isinstance(t_codes, list):
                t_codes = []
            t_codes = [str(tc).strip() for tc in t_codes if tc is not None and str(tc).strip()]

            details_text = str(ai_data.get("details") or "").strip()
            quote_text = str(ai_data.get("quote") or "").strip()

            is_na = (
                score_val is None
                or isinstance(score_val, bool)
                or (isinstance(score_val, str) and score_val.strip().lower() in ("", "null", "none", "н/п", "н/д", "n/a", "na", "не применим"))
            )

            if is_na:
                final_criteria.append({
                    "id": cid,
                    "text": c["text"],
                    "category": c["category"],
                    "passed": True,
                    "notApplicable": True,
                    "score": None,
                    "penaltyScore": None,
                    "timecodes": [],
                    "comment": details_text or "Критерий не применим к формату данного занятия.",
                    "quote": quote_text
                })
            else:
                try:
                    deducted = max(0, min(2, int(float(score_val))))
                except (ValueError, TypeError):
                    deducted = 0

                # Автоматически подтягиваем таймкоды из текста details ТОЛЬКО если реально сняты баллы (нарушение),
                # чтобы положительные таймкоды подтверждения при score=0 не попадали в список нарушений.
                if deducted > 0 and not t_codes and details_text:
                    found = re.findall(r"\b(?:\d{1,2}:)?\d{2}:\d{2}\b", details_text)
                    if found:
                        t_codes = found

                applicable_count += 1
                max_raw += 2
                earned_raw += max(0, 2 - deducted)

                if deducted == 0:
                    passed = True
                    crit_score = 5
                    details_text = details_text or "Выполнено качественно, нарушений нет."
                elif deducted == 1:
                    passed = False
                    crit_score = 3
                    details_text = details_text or "Зафиксировано небольшое нарушение."
                else:
                    passed = False
                    crit_score = 1
                    details_text = details_text or "Зафиксировано грубое или систематическое нарушение."

                earned_five_points += crit_score
                final_criteria.append({
                    "id": cid,
                    "text": c["text"],
                    "category": c["category"],
                    "passed": passed,
                    "notApplicable": False,
                    "score": crit_score,
                    "penaltyScore": deducted,
                    "timecodes": t_codes,
                    "comment": details_text,
                    "quote": quote_text
                })

        if applicable_count <= 0:
            return _build_failed_task(
                task_id, lecture_url, teacher_name, subject, group_name, curator_email, talk_metadata,
                "Нейросеть отметила все критерии как неприменимые — расчёт оценки невозможен.",
                is_corrupted=True,
                raw_broken_response=last_raw_response,
                ai_model=winning_model,
                frames_uploaded=frames_uploaded,
                frames_planned=frames_planned,
                model_attempts=model_attempts
            )

        total_score_pct = int(round((earned_raw / max_raw) * 100))
        max_five_points = applicable_count * 5

        rec_list = parsed_result.get("recommendations_list") or []
        if not rec_list:
            recs_full = str(parsed_result.get("recommendations") or "").strip()
            rec_list = [r.strip() for r in recs_full.split("\n") if r.strip() and len(r.strip()) > 3]

        passed_crits = [c for c in final_criteria if not c.get("notApplicable") and c["passed"]]
        pos_highlights = [f"«{c['category']}»: {c['comment']}" for c in passed_crits[:3]]

        talk_metadata["aiModel"] = winning_model
        token_usage_payload = {
            "promptTokens": winning_usage.get("promptTokens", 0),
            "completionTokens": winning_usage.get("completionTokens", 0),
            "totalTokens": winning_usage.get("totalTokens", 0),
            "estimatedInputTokens": budget_plan["estimatedInputTokens"],
            "configuredBudgetTokens": budget_plan["configuredBudgetTokens"],
            "reservedOutputTokens": budget_plan["reservedOutputTokens"],
            "audioEstimatedTokens": budget_plan["audioEstimatedTokens"],
            "textEstimatedTokens": budget_plan["textEstimatedTokens"],
            "framesEstimatedTokens": budget_plan["framesEstimatedTokens"],
            "transcriptTrimmed": budget_plan["transcriptTrimmed"],
            "transcriptOriginalChars": budget_plan["transcriptOriginalChars"],
            "transcriptSentChars": budget_plan["transcriptSentChars"],
            "finishReason": winning_finish_reason,
            "durationSec": winning_usage.get("durationSec", 0)
        }

        result_task = {
            "id": task_id,
            "lectureUrl": lecture_url,
            "teacherName": teacher_name,
            "subject": subject or "",
            "groupName": group_name or "",
            "date": talk_metadata.get("date") or time.strftime("%Y-%m-%d %H:%M"),
            "totalScore": total_score_pct,
            "criticalViolations": crit_details if is_crit else [],
            "positiveHighlights": pos_highlights,
            "recommendations": rec_list[:5],
            "criteria": final_criteria,
            "status": "completed",
            "progressPct": 100,
            "curatorEmail": curator_email,
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "talkMetadata": talk_metadata,
            "isCorrupted": False,
            "rawBrokenResponse": None,
            "errorMessage": None,
            "applicableCount": applicable_count,
            "earnedPoints": earned_five_points,
            "maxPoints": max_five_points,
            "aiModel": winning_model,
            "framesUploaded": frames_uploaded,
            "framesPlanned": frames_planned,
            "tokenUsage": token_usage_payload,
            "modelAttempts": model_attempts
        }
        return result_task

    finally:
        if client is not None:
            if uploaded_file_ids:
                await ai_gigachat._cleanup_gigachat_files(client, uploaded_file_ids)
            try:
                await client.aclose()
            except Exception:
                pass
        _cleanup_local_artifacts_sync(
            [
                artifacts.get("video"),
                audio_path,
                artifacts.get("audio"),
                artifacts.get("transcript"),
                artifacts.get("summary"),
                *[p for _, p in image_paths]
            ],
            rec_id=rec_id,
            task_id=task_id
        )


def main():
    if len(sys.argv) < 3:
        print(json.dumps({
            "success": False,
            "error": "Недостаточно параметров. Использование: ktalk_gigachat_pipeline.py <taskId> <lectureUrl> [teacher] [subject] [group] [curator] [additionalInfo]"
        }))
        sys.exit(1)

    t_id = sys.argv[1]
    l_url = sys.argv[2]
    t_name = sys.argv[3] if len(sys.argv) > 3 else "Преподаватель"
    subj = sys.argv[4] if len(sys.argv) > 4 else ""
    grp = sys.argv[5] if len(sys.argv) > 5 else ""
    curator = sys.argv[6] if len(sys.argv) > 6 else "shurygin.egor2009@gmail.com"
    add_info = sys.argv[7] if len(sys.argv) > 7 else ""

    try:
        task_res = asyncio.run(execute_ktalk_gigachat_pipeline(
            t_id, l_url, t_name, subj, grp, curator, add_info
        ))
        print(json.dumps({"success": True, "task": task_res}, ensure_ascii=False))
    except Exception as e:
        tb = traceback.format_exc()
        print(f"[Pipeline] Фатальная ошибка: {e}\n{tb}", file=sys.stderr)
        print(json.dumps({"success": False, "error": str(e), "traceback": tb}, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
