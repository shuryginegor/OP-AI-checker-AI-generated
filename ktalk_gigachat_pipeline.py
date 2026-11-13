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
• 0 — ИДЕАЛЬНО / ПОЛНОЕ ОТСУТСТВИЕ НАРУШЕНИЙ (0 баллов снимается). Ставь 0 ТОЛЬКО если на протяжении ВСЕГО урока по этому критерию нет НИ ЕДИНОГО замечания. В массив `timecodes` передай пустой список `[]`.
• 1 — НЕБОЛЬШОЕ ИЛИ ЕДИНИЧНОЕ НАРУШЕНИЕ (снимается 1 балл). Если был хотя бы один эпизод отклонения (например: неформальный флуд, посторонний голос на фоне, единичный поиск файла, игнорирование молчащего ученика, отсутствие ДЗ). ОБЯЗАТЕЛЬНО укажи массив точных таймкодов в поле `timecodes` вида `["ЧЧ:ММ:СС"]` или `["ММ:СС"]`.
• 2 — СИСТЕМАТИЧЕСКОЕ ИЛИ ГРУБОЕ НАРУШЕНИЕ (снимается 2 балла). Если проблема повторялась регулярно, заняла существенную часть урока или существенно снизила пользу занятия. ОБЯЗАТЕЛЬНО укажи массив точных таймкодов в поле `timecodes`.
• null — КРИТЕРИЙ НЕ ПРИМЕНИМ из-за формата/специфики урока или информации от пользователя.

ОБЯЗАТЕЛЬНЫЕ ПОЛЯ К КАЖДОМУ КРИТЕРИЮ:
- `timecodes`: массив строк с точными таймкодами нарушений или наблюдений (например `["00:14:20", "00:42:15"]`). Если нарушений нет (score 0), можно указать ключевые таймкоды подтверждения или пустой массив `[]`.
- `quote`: прямая цитата из урока, подтверждающая нарушение или выполнение.
- `details`: развёрнутое обоснование оценки (почему сняты баллы или почему критерий не применим).

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
      "timecodes": ["00:15:20"],
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
2. Для КАЖДОГО критерия указывай `"timecodes"` и `"quote"`. При нарушении (`score` 1 или 2) в `timecodes` ОБЯЗАТЕЛЬНО передавай точные таймкоды вида `["ЧЧ:ММ:СС"]`.
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
    raw_broken_response: Optional[str] = None
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
        "maxPoints": None
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

        # 3. Системный промпт, бюджет токенов и загрузка медиа в GigaChat
        system_prompt, active_criteria = build_system_prompt(additional_info)
        max_frames = ai_gigachat._calculate_dynamic_frame_limit(
            transcript_text, summary_text, len(system_prompt), audio_path
        )

        emit_stage("uploading")
        client = ai_gigachat.get_gigachat_client()
        model_name = os.getenv("GIGACHAT_MODEL", "GigaChat-2-Pro")

        audio_file_id, uploaded_frames_data = await ai_gigachat._upload_files_to_gigachat(
            client, audio_path, image_paths, max_frames=max_frames
        )

        if audio_file_id:
            uploaded_file_ids.append(audio_file_id)
        uploaded_file_ids.extend([fid for _, fid, _ in uploaded_frames_data])

        talk_metadata["hasAudio"] = bool(audio_file_id)
        talk_metadata["framesUploaded"] = len(uploaded_frames_data)

        if not uploaded_file_ids:
            err_msg = "Не удалось загрузить аудиодорожку и видеокадры в облако GigaChat. Повторите проверку позже."
            print(f"[Pipeline] {err_msg}", file=sys.stderr)
            return _build_failed_task(
                task_id, lecture_url, teacher_name, subject, group_name, curator_email, talk_metadata, err_msg
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
            f"- Полная аудиодорожка занятия прикреплена (ID файла: {audio_file_id})\n"
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
КЛЮЧЕВЫЕ КАДРЫ ЭКРАНА С ТАЙМКОДАМИ ({len(uploaded_frames_data)} шт.):
{frames_description}

--- ТЕКСТОВЫЕ МАТЕРИАЛЫ ---
ИИ-Краткий пересказ встречи (Саммари):
{summary_text if summary_text else 'Отсутствует'}

Транскрипт общения с таймкодами реплик:
{transcript_text if transcript_text else 'Транскрипт не предоставлен сервером КТалк; ориентируйся на аудиодорожку и кадры экрана.'}

ИНСТРУКЦИЯ ПО АНАЛИЗУ:
1. Внимательно проанализируй аудиодорожку, прикреплённые кадры экрана и транскрипт в сопоставлении с критериями оценивания.
2. По каждому критерию при нарушении (score 1 или 2) ОБЯЗАТЕЛЬНО укажи точные таймкоды в `timecodes` вида `["ЧЧ:ММ:СС"]` и подтверждающую цитату в `quote`.
3. Оцени ровно {len(active_criteria)} критериев (`id` от 1 до {len(active_criteria)}). Неприменимые по формату критерии отмечай как `null`.
4. Выдай итоговый ответ СТРОГО в виде валидного JSON-объекта."""

        # 4. Мультимодальный запрос в GigaChat
        emit_stage("analyzing")
        chat_payload = Chat(
            model=model_name,
            messages=[
                Messages(role=MessagesRole.SYSTEM, content=system_prompt),
                Messages(role=MessagesRole.USER, content=user_text, attachments=uploaded_file_ids)
            ],
            max_tokens=8192,
            temperature=0.1
        )

        raw_response = ""
        t_start = time.time()
        print(
            f"[GigaChat] Отправка мультимодального запроса ({model_name}, вложений: {len(uploaded_file_ids)})...",
            file=sys.stderr
        )

        max_retries = 5
        resp = None
        for attempt in range(1, max_retries + 1):
            try:
                resp = await client.achat(chat_payload)
                break
            except Exception as attempt_err:
                err_str = str(attempt_err)
                is_rate_limit = (
                    "429" in err_str
                    or "Too Many Requests" in err_str
                    or "RateLimit" in type(attempt_err).__name__
                )
                if is_rate_limit and attempt < max_retries:
                    wait_time = attempt * 7
                    print(
                        f"[GigaChat] Ошибка 429 (Too Many Requests). Повтор {attempt}/{max_retries} через {wait_time} сек...",
                        file=sys.stderr
                    )
                    await asyncio.sleep(wait_time)
                else:
                    tb = traceback.format_exc()
                    return _build_failed_task(
                        task_id, lecture_url, teacher_name, subject, group_name, curator_email, talk_metadata,
                        f"Ошибка обращения к GigaChat API: {attempt_err}",
                        is_corrupted=False,
                        raw_broken_response=f"{attempt_err}\n\n{tb}"
                    )

        gen_time = time.time() - t_start
        print(f"[GigaChat] Ответ получен за {gen_time:.2f} сек!", file=sys.stderr)

        choices = resp.choices if resp and hasattr(resp, "choices") else []
        if not choices or not getattr(choices[0], "message", None):
            return _build_failed_task(
                task_id, lecture_url, teacher_name, subject, group_name, curator_email, talk_metadata,
                "GigaChat вернул пустой ответ (choices отсутствует).",
                is_corrupted=True,
                raw_broken_response=str(resp)
            )

        choice = choices[0]
        finish_reason = getattr(choice, "finish_reason", None)
        raw_response = choice.message.content or ""

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
            or any(kw in raw_response.lower() for kw in refusal_keywords)
        )
        if is_refused:
            return _build_failed_task(
                task_id, lecture_url, teacher_name, subject, group_name, curator_email, talk_metadata,
                f"Нейросеть отказалась проверять лекцию (причина: {finish_reason or 'цензура безопасности'}).",
                is_corrupted=True,
                raw_broken_response=raw_response
            )

        # 5. Парсинг ответа через ai_common.py
        try:
            parsed_result = ai_common.parse_analysis_json(raw_response)
        except Exception as parse_err:
            print(f"[ai_common] Ошибка парсинга JSON: {parse_err}", file=sys.stderr)
            return _build_failed_task(
                task_id, lecture_url, teacher_name, subject, group_name, curator_email, talk_metadata,
                f"Не удалось разобрать JSON-ответ нейросети: {parse_err}",
                is_corrupted=True,
                raw_broken_response=raw_response
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
            if not t_codes and details_text:
                found = re.findall(r"\b(?:\d{1,2}:)?\d{2}:\d{2}\b", details_text)
                if found:
                    t_codes = found

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
                    "timecodes": t_codes,
                    "comment": details_text or "Критерий не применим к формату данного занятия.",
                    "quote": quote_text
                })
            else:
                try:
                    deducted = max(0, min(2, int(float(score_val))))
                except (ValueError, TypeError):
                    deducted = 0

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
                raw_broken_response=raw_response
            )

        total_score_pct = int(round((earned_raw / max_raw) * 100))
        max_five_points = applicable_count * 5

        rec_list = parsed_result.get("recommendations_list") or []
        if not rec_list:
            recs_full = str(parsed_result.get("recommendations") or "").strip()
            rec_list = [r.strip() for r in recs_full.split("\n") if r.strip() and len(r.strip()) > 3]

        passed_crits = [c for c in final_criteria if not c.get("notApplicable") and c["passed"]]
        pos_highlights = [f"«{c['category']}»: {c['comment']}" for c in passed_crits[:3]]

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
            "maxPoints": max_five_points
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
