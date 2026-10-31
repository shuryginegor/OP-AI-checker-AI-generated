#!/usr/bin/env python3
"""
ktalk_gigachat_pipeline.py

Модуль взаимодействия с внешними сервисами КТалк (API) и Сбер GigaChat исключительно на Python.
Использует в первую очередь:
- fetch_talk.py: проверка доступности встречи, извлечение метаданных (название, спикер, дата), получение транскрипта и саммари.
- ai_gigachat.py: официальный клиент GigaChat с бандлом сертификатов Минцифры РФ и таймаутом 600 сек.
- ai_common.py: робастный парсинг и восстановление JSON (json.loads / json_repair / regex), расчет баллов и процентов.

Требования:
1. К каждому критерию при нарушении фиксировать точные таймкоды.
2. Подгружать динамический промпт и динамические критерии из data/.
3. Извлекать реального преподавателя из метаданных КТалк (никаких фиктивных/липовых данных).
4. При невозможности восстановить JSON помечать разбор как поврежденный (is_corrupted) и сохранять сырой ответ.
5. Кольцевой бэкап в data/lecture_tasks_backup.json — строго не более 100 лекций (FIFO).
"""

import os
import sys
import json
import re
import time
import asyncio
import traceback
from typing import Dict, Any, Optional, Tuple, List

from dotenv import load_dotenv
load_dotenv()

import fetch_talk
import ai_gigachat
import ai_common
from gigachat.models import Chat, Messages, MessagesRole

DATA_DIR = os.path.join(os.getcwd(), "data")
os.makedirs(DATA_DIR, exist_ok=True)
BACKUP_FILE = os.path.join(DATA_DIR, "lecture_tasks_backup.json")
MAX_BACKUP_TASKS = 100


def load_dynamic_criteria() -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Загружает критерии из data/criteria_active.json или использует эталонный список."""
    crit_file = os.path.join(DATA_DIR, "criteria_active.json")
    if os.path.exists(crit_file):
        try:
            with open(crit_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                std = data.get("standardCriteria", [])
                crit = data.get("criticalCriteria", [])
                if std and isinstance(std, list):
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
- `timecodes`: массив строк с точными таймкодами нарушений (например `["00:14:20", "00:42:15"]`). Если нарушений нет (score 0), передавай пустой массив `[]`.
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
    """Формирует итоговый системный промпт с динамическими критериями и JSON схемой."""
    std_criteria, crit_criteria = load_dynamic_criteria()
    template = load_dynamic_prompt()

    std_formatted_lines = [f"{c.get('id', i+1)}. {c.get('text', c.get('title', ''))}" for i, c in enumerate(std_criteria)]
    std_formatted = "\n".join(std_formatted_lines)

    crit_formatted_lines = [f"{c.get('id', i+1)}. {c.get('title', '')}: {c.get('desc', '')}" for i, c in enumerate(crit_criteria)]
    crit_formatted = "\n".join(crit_formatted_lines)

    info_str = additional_info.strip() if additional_info and additional_info.strip() else "Отсутствует"

    prompt = template
    prompt = prompt.replace("{additional_info}", info_str).replace("{{additional_info}}", info_str)
    prompt = prompt.replace("{standard_formatted}", std_formatted)
    prompt = prompt.replace("{critical_formatted}", crit_formatted)

    count = len(std_criteria)
    json_instructions = f"""

ТРЕБОВАНИЕ К СТРУКТУРЕ JSON-ОТВЕТА:
Твой ответ должен состоять ИСКЛЮЧИТЕЛЬНО из одного валидного JSON-объекта со следующими ключами:
{{
  "is_critical": false,
  "critical_details": ["<таймкод — подробное описание критического нарушения при наличии>"],
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
  "comment": "Развернутый экспертный разбор (10-15 предложений) с точными таймкодами...",
  "recommendations": "5 конкретных методических рекомендаций преподавателю..."
}}
ВАЖНО: Массив criteria_scores должен содержать РОВНО {count} объектов по каждому из критериев (id от 1 до {count}).
По каждому критерию, если было нарушение (score 1 или 2), в timecodes ОБЯЗАТЕЛЬНО укажи массив точных таймкодов!"""

    if "ТРЕБОВАНИЕ К СТРУКТУРЕ JSON-ОТВЕТА" not in prompt:
        prompt += json_instructions

    return prompt.strip(), std_criteria


def save_to_backup_rotation(task_record: Dict[str, Any]):
    """
    Сохраняет проверенную лекцию в кольцевой бэкап data/lecture_tasks_backup.json.
    Строго держит не более 100 лекций: если добавляется новая, удаляется самая старая.
    """
    tasks_list = []
    if os.path.exists(BACKUP_FILE):
        try:
            with open(BACKUP_FILE, "r", encoding="utf-8") as bf:
                tasks_list = json.load(bf)
                if not isinstance(tasks_list, list):
                    tasks_list = []
        except Exception:
            tasks_list = []

    # Удаляем дубликат по id
    task_id = task_record.get("id")
    tasks_list = [t for t in tasks_list if t.get("id") != task_id]

    # Добавляем новую запись в начало
    tasks_list.insert(0, task_record)

    # Ротация: не более 100 лекций в каждый момент
    if len(tasks_list) > MAX_BACKUP_TASKS:
        tasks_list = tasks_list[:MAX_BACKUP_TASKS]

    try:
        with open(BACKUP_FILE, "w", encoding="utf-8") as bf:
            json.dump(tasks_list, bf, ensure_ascii=False, indent=2)
        print(f"[Backup] Бэкап обновлен (всего лекций: {len(tasks_list)} из max {MAX_BACKUP_TASKS})", file=sys.stderr)
    except Exception as e:
        print(f"[Backup] Предупреждение сохранения бэкапа: {e}", file=sys.stderr)


async def execute_ktalk_gigachat_pipeline(
    task_id: str,
    lecture_url: str,
    teacher_name: str,
    subject: str = "",
    group_name: str = "",
    curator_email: str = "",
    additional_info: str = ""
) -> Dict[str, Any]:
    print(f"\n==================================================", file=sys.stderr)
    print(f"[Pipeline] Старт проверки лекции: {task_id}", file=sys.stderr)
    print(f"URL: {lecture_url} | Преподаватель (вход): {teacher_name}", file=sys.stderr)

    api_key = fetch_talk.get_api_key()
    meet_info = {}
    talk_metadata = {
        "title": "Онлайн-занятие КТалк",
        "url": lecture_url,
        "date": time.strftime("%Y-%m-%d %H:%M"),
        "author": teacher_name,
        "login": "",
        "domain": "ktalk.ru"
    }

    transcript_text = ""
    summary_text = ""

    # 1. Запрашиваем метаданные через fetch_talk
    if api_key:
        try:
            meet_info = await fetch_talk.is_meet_available(lecture_url, api_key)
            print(f"[KTalk] Получены метаданные встречи: {meet_info}", file=sys.stderr)
            if meet_info:
                talk_metadata["title"] = meet_info.get("title") or talk_metadata["title"]
                talk_metadata["date"] = meet_info.get("date") or talk_metadata["date"]
                talk_metadata["login"] = meet_info.get("login") or ""

                fn = (meet_info.get("name") or "").strip()
                sn = (meet_info.get("surname") or "").strip()
                if fn or sn:
                    real_teacher = f"{fn} {sn}".strip()
                    talk_metadata["author"] = real_teacher
                    # Если пользователь не вводил имя или оставил дефолт, используем реального учителя из КТалк
                    if not teacher_name or teacher_name.strip() in ("Преподаватель", "Иванов И.И.", ""):
                        teacher_name = real_teacher
                        print(f"[KTalk] Определен реальный преподаватель из метаданных КТалк: {teacher_name}", file=sys.stderr)

                # Попытка извлечь предмет из названия встречи (например "Экономика 9-10 класс")
                title = meet_info.get("title", "")
                if title and ("-" in title or "—" in title):
                    parts = re.split(r"[-—]", title)
                    candidate = parts[-1].strip()
                    if len(candidate) > 2 and (not subject or subject == "Олимпиадная подготовка"):
                        subject = candidate

            # Получаем текстовые артефакты (транскрипт и саммари)
            base_url = fetch_talk.get_base_url_from_url(lecture_url)
            rec_id = fetch_talk.extract_record_id(lecture_url)
            talk_metadata["recordingKey"] = rec_id

            import httpx
            async with httpx.AsyncClient(timeout=30.0) as client:
                artifacts_json = await fetch_talk.get_text_artifacts(client, base_url, rec_id, api_key)
                if artifacts_json:
                    os.makedirs("artifacts", exist_ok=True)
                    text_paths = fetch_talk.process_and_save_text_artifacts(artifacts_json, rec_id, "artifacts")
                    if text_paths.get("transcript") and os.path.exists(text_paths["transcript"]):
                        with open(text_paths["transcript"], "r", encoding="utf-8") as tf:
                            transcript_text = tf.read().strip()
                        print(f"[KTalk] Загружен транскрипт встречи ({len(transcript_text)} символов)", file=sys.stderr)
                    if text_paths.get("summary") and os.path.exists(text_paths["summary"]):
                        with open(text_paths["summary"], "r", encoding="utf-8") as sf:
                            summary_text = sf.read().strip()
        except Exception as e:
            print(f"[KTalk] Ошибка запроса артефактов КТалк: {e}", file=sys.stderr)

    # 2. Подготовка системного промпта и критериев
    system_prompt, active_criteria = build_system_prompt(additional_info)

    user_text = f"""--- МАТЕРИАЛЫ ЗАНЯТИЯ ДЛЯ АНАЛИЗА ---
• Преподаватель: {teacher_name}
• Предмет: {subject or 'Олимпиадная подготовка'}
• Группа: {group_name or 'Основная группа'}
• Название встречи в КТалк: {talk_metadata.get('title', 'Онлайн-занятие')}
• Дата проведения: {talk_metadata.get('date', '')}
• Автор по данным платформы КТалк: {talk_metadata.get('author', teacher_name)} ({talk_metadata.get('login', '')})

ИИ-Краткий пересказ встречи (Саммари):
{summary_text if summary_text else 'Отсутствует'}

Транскрипт общения с точными поминутными репликами спикеров:
{transcript_text if transcript_text else 'Транскрипт не был предоставлен сервером КТалк. Проанализируй доступные регламентные критерии.'}

ИНСТРУКЦИЯ ПО АНАЛИЗУ:
1. Внимательно сопоставь реплики и ход занятия с критериями оценивания.
2. Для каждого критерия, если допущено нарушение (score 1 или 2), ОБЯЗАТЕЛЬНО укажи массив точных таймкодов в `timecodes`!
3. Выдай итоговый ответ СТРОГО в виде валидного JSON-объекта."""

    # 3. Обращение к GigaChat через ai_gigachat.py (таймаут 600 сек)
    model_name = os.getenv("GIGACHAT_MODEL", "GigaChat-2-Pro")
    print(f"[GigaChat] Инициализация клиента GigaChat ({model_name})...", file=sys.stderr)

    client = ai_gigachat.get_gigachat_client()
    chat_payload = Chat(
        model=model_name,
        messages=[
            Messages(role=MessagesRole.SYSTEM, content=system_prompt),
            Messages(role=MessagesRole.USER, content=user_text)
        ],
        max_tokens=8192,
        temperature=0.1
    )

    raw_response = ""
    is_corrupted = False
    parsed_result = None

    try:
        t_start = time.time()
        print(f"[GigaChat] Отправка запроса на анализ встречи (DB ID: {task_id})...", file=sys.stderr)
        resp = await client.achat(chat_payload)
        gen_time = time.time() - t_start
        print(f"[GigaChat] Ответ успешно получен за {gen_time:.2f} сек!", file=sys.stderr)

        if resp.choices and resp.choices[0].message:
            raw_response = resp.choices[0].message.content or ""
        else:
            raw_response = str(resp)

        # Проверка на цензуру/отказ модели
        refusal_keywords = [
            "разговоры на чувствительные темы",
            "ограничены из соображений безопасности",
            "не могу ответить на данный вопрос",
            "не могу выполнить данный запрос"
        ]
        if any(kw in raw_response.lower() for kw in refusal_keywords):
            print(f"[GigaChat] Предупреждение: отказ модели по соображениям безопасности.", file=sys.stderr)
            is_corrupted = True

    except Exception as giga_err:
        tb = traceback.format_exc()
        print(f"[GigaChat] Ошибка вызова GigaChat API: {giga_err}\n{tb}", file=sys.stderr)
        raw_response = f"ОШИБКА GIGACHAT API: {giga_err}\n\n{tb}"
        is_corrupted = True
    finally:
        try:
            await client.aclose()
        except Exception:
            pass

    # 4. Парсинг ответа через ai_common.py
    if not is_corrupted and raw_response:
        try:
            parsed_result = ai_common.parse_analysis_json(raw_response)
            print(f"[ai_common] JSON успешно распарсен! Балл: {parsed_result.get('final_percentage')}%, Критично: {parsed_result.get('is_critical')}", file=sys.stderr)
        except Exception as parse_err:
            print(f"[ai_common] Не удалось распарсить JSON даже после json_repair: {parse_err}", file=sys.stderr)
            is_corrupted = True

    # 5. Формирование итоговой структуры задачи
    if is_corrupted or not parsed_result:
        # Режим поврежденного разбора
        final_criteria = [
            {
                "id": c.get("id", i+1),
                "text": c.get("text", c.get("title", "")),
                "category": c.get("category", "Методический стандарт"),
                "passed": False,
                "score": 0,
                "timecodes": [],
                "comment": "Ответ модели повреждён и не может быть структурирован.",
                "quote": ""
            }
            for i, c in enumerate(active_criteria)
        ]

        result_task = {
            "id": task_id,
            "lectureUrl": lecture_url,
            "teacherName": teacher_name,
            "subject": subject or "Олимпиадная подготовка",
            "groupName": group_name or "Основная группа",
            "date": talk_metadata.get("date") or time.strftime("%Y-%m-%d %H:%M"),
            "totalScore": 0,
            "criticalViolations": ["Ответ нейросети не удалось распарсить в корректный JSON."],
            "positiveHighlights": [],
            "recommendations": ["Рекомендуется открыть сырой ответ ИИ по кнопке в дашборде или запустить повторный анализ."],
            "criteria": final_criteria,
            "status": "completed",
            "progressPct": 100,
            "curatorEmail": curator_email,
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "talkMetadata": talk_metadata,
            "isCorrupted": True,
            "rawBrokenResponse": raw_response
        }
    else:
        # Успешный результат
        is_crit = parsed_result.get("is_critical", False)
        crit_details = parsed_result.get("critical_details") or []
        scores_arr = parsed_result.get("criteria_scores") or []

        scores_by_id: Dict[int, Dict[str, Any]] = {}
        for s in scores_arr:
            if isinstance(s, dict) and "id" in s:
                try:
                    cid = int(s["id"])
                    scores_by_id[cid] = s
                except (ValueError, TypeError):
                    pass

        final_criteria = []
        earned_sum = 0
        max_sum = len(active_criteria) * 2

        for i, c in enumerate(active_criteria):
            cid = c.get("id", i+1)
            ai_data = scores_by_id.get(cid, {})
            score_val = ai_data.get("score")

            # Таймкоды нарушений
            t_codes = ai_data.get("timecodes", [])
            if isinstance(t_codes, str) and t_codes.strip():
                t_codes = [t_codes.strip()]
            elif not isinstance(t_codes, list):
                t_codes = []

            details_text = str(ai_data.get("details") or "").strip()
            # Авто-поиск таймкодов в details если массив пуст
            if not t_codes and details_text:
                found = re.findall(r"\b(?:\d{1,2}:)?\d{2}:\d{2}\b", details_text)
                if found:
                    t_codes = found

            quote_text = str(ai_data.get("quote") or "").strip()

            if score_val is None or str(score_val).lower() in ("null", "none"):
                passed = True
                crit_score = 5
                details_text = details_text or "Критерий не применим к формату данного урока."
            else:
                try:
                    deducted = int(score_val)
                except (ValueError, TypeError):
                    deducted = 0

                if deducted == 0:
                    passed = True
                    crit_score = 5
                    details_text = details_text or "Выполнено качественно, нарушений нет."
                    earned_sum += 2
                elif deducted == 1:
                    passed = False
                    crit_score = 3
                    details_text = details_text or "Зафиксировано небольшое нарушение."
                    earned_sum += 1
                else:
                    passed = False
                    crit_score = 1
                    details_text = details_text or "Зафиксировано грубое или систематическое нарушение."
                    earned_sum += 0

            final_criteria.append({
                "id": cid,
                "text": c.get("text", c.get("title", "")),
                "category": c.get("category", "Методический стандарт"),
                "passed": passed,
                "score": crit_score,
                "timecodes": t_codes,
                "comment": details_text,
                "quote": quote_text
            })

        final_pct = parsed_result.get("final_percentage")
        if final_pct is not None:
            total_score_pct = int(round(final_pct))
        else:
            total_score_pct = int(round((earned_sum / max_sum) * 100)) if max_sum > 0 else 100

        if is_crit:
            total_score_pct = min(total_score_pct, 45)

        comment_full = parsed_result.get("comment", "")
        recs_full = parsed_result.get("recommendations", "")
        rec_list = [r.strip() for r in recs_full.split("\n") if r.strip() and len(r.strip()) > 5]
        if not rec_list:
            rec_list = [recs_full] if recs_full else ["Продолжать совершенствовать педагогическое мастерство."]

        passed_crits = [c for c in final_criteria if c["passed"]]
        pos_highlights = [f"«{c['category']}»: {c['comment']}" for c in passed_crits[:3]]

        result_task = {
            "id": task_id,
            "lectureUrl": lecture_url,
            "teacherName": teacher_name,
            "subject": subject or "Олимпиадная подготовка",
            "groupName": group_name or "Основная группа",
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
            "rawBrokenResponse": None
        }

    # 6. Кольцевой авто-бэкап (не более 100 лекций, FIFO)
    save_to_backup_rotation(result_task)

    return result_task


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
    subj = sys.argv[4] if len(sys.argv) > 4 else "Олимпиадная подготовка"
    grp = sys.argv[5] if len(sys.argv) > 5 else "Основная группа"
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
