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

DATA_DIR = os.path.abspath(os.getenv("APP_DATA_DIR")) if os.getenv("APP_DATA_DIR") else os.path.join(os.getcwd(), "data")
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

    return """Ты — объективный, строгий старший эксперт по контролю качества онлайн-занятий.
Проводи аудит ЧЕСТНО, ПРИНЦИПИАЛЬНО И ВОСПРОИЗВОДИМО, строго по наблюдаемым фактам из аудиодорожки, кадров экрана и транскрипта.

БАЗОВЫЕ ПРИНЦИПЫ ОЦЕНКИ (НУЛЕВАЯ ВЕЖЛИВОСТЬ И СТАБИЛЬНОСТЬ):
1. `0` НЕ ЯВЛЯЕТСЯ ОЦЕНКОЙ ПО УМОЛЧАНИЮ: `0` ставится ТОЛЬКО если критерий подтверждён на протяжении всего урока безупречно и без единого методического, временного или визуального пробела. Отсутствие грубого скандала — это НЕ `0`!
2. ИЩИ РЕАЛЬНЫЕ ЗОНЫ РОСТА: в обычном 45–90-минутном онлайн-занятии почти всегда есть 4–8 реальных локальных недочётов (не озвучена цель в начале, не подведены итоги/закрепление в конце, говорит преимущественно преподаватель, отвечают только 1–2 активных ученика, нет проверки понимания у молчащих, не даны разноуровневые задания, мелкие/перегруженные слайды, заминки с окнами/материалами). Обязательно фиксируй каждый такой факт в `gap` и снижай балл (`1` или `2`).
3. НЕ ПРИДУМЫВАЙ НАРУШЕНИЯ: запрещено выдумывать ошибки без опоры на аудио, кадры или транскрипт; не штрафуй за естественные рабочие микропаузы 2–5 сек на переключение слайда или обдумывание.
4. МЕТОД «ФАКТЫ И НЕДОЧЁТ → ПОТОМ ОЦЕНКА»: по каждому критерию сначала выпиши подтверждающую реплику (`quote`), выявленный недочёт (`gap`), таймкоды (`timecodes`) и разбор (`details`), и только после этого выставляй штраф `score`.

КАЛИБРОВОЧНАЯ ШКАЛА КАЧЕСТВА ЗАНЯТИЯ (ОРИЕНТИР):
• 93–100% (суммарный штраф 0–3 балла): исключительное, эталонное занятие (<5% уроков) с явной целью, вовлечением всей группы, проверкой понимания, идеальной визуализацией и подведением итогов. `point: 0` (100%) допустимо только в редком, безупречном случае.
• 80–92% (суммарный штраф 4–8 баллов): добротное, качественное рабочее занятие хорошего преподавателя с парой-пятеркой типичных рабочих недочётов (`score: 1`) — это нормальный ориентир для сильного рабочего урока.
• 60–79% (суммарный штраф 9–16 баллов): заметные методические, организационные или технические пробелы.
• Ниже 60% (>16 баллов штрафа): системно слабое, хаотичное или частично сорванное занятие.

КРИТИЧЕСКИ ВАЖНО — ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ ОТ ПОЛЬЗОВАТЕЛЯ:
"{additional_info}"
Эта информация определяет реальный формат, целевую аудиторию и контекст занятия.
Если критерий объективно противоречит формату занятия (например, индивидуальный урок 1-на-1 для критерия о «всей группе / слабых и сильных учениках», либо запись без учеников для диалоговых критериев), ставь `"score": null` и `"gap": "нет"`.

СПИСОК НЕКРИТИЧЕСКИХ КРИТЕРИЕВ ДЛЯ ОЦЕНИВАНИЯ:
{standard_formatted}

ИЗМЕРИМЫЕ ПОРОГИ ШТРАФА ПО КАЖДОМУ КРИТЕРИЮ (`score`):
• `0` — безупречное выполнение без единого замечания (`"gap": "нет"`, `"timecodes": []`). Ставь ТОЛЬКО при прямом подтверждении по всему уроку.
• `1` — локальное или методическое отклонение (−1 балл): 1–2 эпизода или неполное выполнение критерия (формальный подход, отсутствие явного этапа, мелкие огрехи). В `gap` сформулируй недочёт, в `timecodes` обязательно укажи `["ЧЧ:ММ:СС"]`.
• `2` — системное или грубое нарушение (−2 балла): 3+ повторяющихся эпизода, проблема длилась >3 мин или существенно снизила пользу урока. В `gap` и `timecodes` укажи факты и таймкоды.
• `null` — критерий объективно неприменим к формату урока (`"gap": "нет"`, `"timecodes": []`, причину объясни в `details`).

СТРОГИЕ ЯКОРЯ ПРОВЕРКИ ПО ВСЕМ БЛОКАМ КРИТЕРИЕВ:
1. Материал, цель, логика и глубина (1–4, 12–13): проверь первые 3–5 мин — если преподаватель сразу перешёл к задачам без явной постановки цели и плана — кр. 3 = `1`. Если переходы между темами/задачами без связки — кр. 4 = `1`. Если много теории без практики ИЛИ поток задач без обобщения метода, закрепления и итогов/ДЗ в финале — кр. 12 или 13 = `1`.
2. Тайм-менеджмент и регламент (5, 14–15): задержка старта >1–2 мин — кр. 14 = `1`; затянутый разбор одной задачи / длинное вступление >4 мин / скомканная концовка — кр. 5 = `1`; раннее завершение >5 мин или задержка без предупреждения — кр. 15 = `1` (системный срыв — `2`).
3. Вовлечение, вся группа, понимание и дифференциация (6–8, 11): если говорит в основном преподаватель (>65–70% времени) — кр. 6 = `1`. Если отвечают только 1–2 активных ученика, а остальные молчат — кр. 7 = `1`. Если преподаватель ограничивается формальным «понятно?» без реальной проверки понимания шага — кр. 8 = `1`. Если нет разноуровневых заданий или поддержки отстающих — кр. 11 = `1`.
4. Этика, реакция на ошибки и гигиена (9–10, 20–21): торопливое/формальное отмахивание от неверной версии ученика вместо разбора — кр. 9 = `1`; раздражение, давление, непрофильный флуд >1 мин — кр. 10 = `1`; лишние вкладки, всплывающие уведомления или переписки в кадре — кр. 20 = `1`.
5. Звук, экран и оформление (16–19): любой поиск нужного окна/файла >10–15 сек — кр. 17 = `1`; мелкий или трудночитаемый текст/формулы, неаккуратная доска на части кадров — кр. 18 = `1`; кратковременные помехи, эхо, глотание слов — кр. 16 = `1`.

ПРАВИЛА СОГЛАСОВАННОСТИ, ФОРМАТА И ЁМКОСТИ ПОЛЕЙ:
1. Порядок полей каждого критерия: `id`, `criterion`, `quote`, `gap`, `timecodes`, `details`, `score`.
2. `criterion`: краткое название (2–4 слова, система подставит полный текст сама).
3. `quote`: точная дословная реплика из аудио/транскрипта (1–2 фразы; или `""`, если подтверждение чисто визуальное).
4. `gap`: коротко конкретный недочёт / зона роста (5–15 слов с таймкодом), либо `"нет"`, если выполнено безупречно.
5. `timecodes`: ТОЛЬКО таймкоды нарушений при `score` = `1` или `2`. При `score: 0` или `null` — СТРОГО `[]`.
6. `details`: 1–3 ёмких предложения с фактами и таймкодами. ЗАПРЕЩЕНО: если в `gap` написано что-либо кроме `"нет"`, нельзя ставить `score: 0`!
7. САМОПРОВЕРКА ПЕРЕД ИТОГОМ: если сумма баллов `point` получилась `0–2`, повторно проверь критерии 3, 4, 5, 6, 7, 8, 11, 12, 13, 15, 17, 18 на пропущенные методические/визуальные зоны роста.

СПИСОК КРИТИЧЕСКИХ НАРУШЕНИЙ:
{critical_formatted}

ПРАВИЛО КРИТИЧНОСТИ И ИТОГА:
1. Проверь занятие на ВСЕ КРИТИЧЕСКИЕ НАРУШЕНИЯ из списка выше. Если есть хотя бы одно доказанное — обязательно поставь `is_critical: true` и перечисли их в `critical_details` в формате `["ЧЧ:ММ:СС — Название нарушения: конкретный факт"]`. Если критических нарушений нет — ставь `is_critical: false` и `critical_details: []`.
2. В поле `point` укажи точную сумму всех СНЯТЫХ баллов (`score`) по применимым критериям.

ТРЕБОВАНИЯ К КОММЕНТАРИЮ И РЕКОМЕНДАЦИЯМ:
• В поле `comment` напиши взвешенный, содержательный хронологический разбор (8–12 предложений): отметь и сильные стороны урока, и конкретные недочёты с точными таймкодами вида (ЧЧ:ММ:СС или ММ:СС).
• В поле `recommendations` напиши ровно 5 конкретных, практичных рекомендаций преподавателю с привязкой к проблемным местам урока."""


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
Твой ответ должен состоять ИСКЛЮЧИТЕЛЬНО из одного валидного JSON-объекта со следующими ключами (по каждому критерию СТРОГО сначала факты и недочёт: `quote`, `gap`, `timecodes`, `details`, и только затем `score`):
{{
  "is_critical": false,
  "critical_details": [],
  "criteria_scores": [
    {{
      "id": 1,
      "criterion": "Краткое название (2–4 слова)",
      "quote": "«точная дословная реплика (1–2 фразы) или пустая строка»",
      "gap": "<конкретный недочёт с таймкодом (5–15 слов) или «нет» только если безупречно>",
      "timecodes": ["00:14:20"],
      "details": "<1–3 ёмких предложения по делу: что наблюдалось, что не дотянуто и обоснование балла>",
      "score": <0, 1, 2 или null>
    }}
  ],
  "point": <суммарный штраф — точная сумма всех score>,
  "comment": "Содержательный хронологический разбор (8–12 предложений) с точными таймкодами вида ЧЧ:ММ:СС...",
  "recommendations": [
    "Конкретная практическая рекомендация 1 (с таймкодом проблемного места)",
    "Конкретная практическая рекомендация 2",
    "Конкретная практическая рекомендация 3",
    "Конкретная практическая рекомендация 4",
    "Конкретная практическая рекомендация 5"
  ]
}}
ВАЖНО (ЧТОБЫ ВСЕ {count} КРИТЕРИЕВ СОХРАНИЛИ ГЛУБИНУ И ПОМЕСТИЛИСЬ В ОКНО ВЫВОДА):
1. Массив `criteria_scores` должен содержать РОВНО {count} объектов (id от 1 до {count}). Не дублируй в `criterion` длинную формулировку и пиши без «воды».
2. Для КАЖДОГО критерия сначала заполняй `"quote"`, `"gap"`, `"timecodes"` и `"details"`, и только потом `"score"` (`0`, `1`, `2` или `null`). Если в `"gap"` указан любой недочёт (всё, кроме `"нет"`), ЗАПРЕЩЕНО ставить `"score": 0` — обязательно ставь `1` или `2` и укажи таймкоды в `"timecodes"`. Ставь `0` ТОЛЬКО при безупречном выполнении.
3. Если критерий объективно не применим по формату занятия — ставь `"score": null` (не 0!), `"gap": "нет"`, `"timecodes": []` и объясни причину в `"details"`.
4. Критические нарушения: обязательно проверь занятие по всем пунктам СПИСКА КРИТИЧЕСКИХ НАРУШЕНИЙ. Если есть хотя бы одно доказанное критическое нарушение — укажи `"is_critical": true` и перечисли нарушения в `"critical_details"` в формате `["ЧЧ:ММ:СС — Название: конкретный факт"]`. Если критических нарушений нет — оставь `"is_critical": false` и `"critical_details": []`."""

    if "criteria_scores" not in prompt or "timecodes" not in prompt or ('"gap"' not in prompt and "`gap`" not in prompt):
        prompt += json_instructions
    elif "quote" not in prompt:
        prompt += (
            '\n\nДОПОЛНИТЕЛЬНОЕ ТРЕБОВАНИЕ К ПОЛЮ "quote":\n'
            'Для КАЖДОГО элемента массива `criteria_scores` обязательно добавь поле `"quote"` '
            'с прямой цитатой (репликой) из речи на занятии, подтверждающей оценку (ставь `"quote"` и `"details"` до поля `"score"`).'
        )

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

        # 3. Системный промпт, шаблон пользовательского сообщения и точный расчёт токен-бюджета
        # (включает полную длину system_prompt + статической части user_text, чтобы исключить выход за контекстное окно)
        system_prompt, active_criteria = build_system_prompt(additional_info)
        ai_settings = ai_gigachat.load_ai_settings()
        user_static_header = f"""--- МУЛЬТИМОДАЛЬНЫЕ МАТЕРИАЛЫ ЗАНЯТИЯ ---
• Преподаватель: {teacher_name}
• Предмет: {subject or 'Не указан'}
• Группа: {group_name or 'Не указана'}
• Название встречи в КТалк: {talk_metadata.get('title', 'Онлайн-занятие')}
• Дата проведения: {talk_metadata.get('date', '')}
• Автор по данным КТалк: {talk_metadata.get('author', teacher_name)} ({talk_metadata.get('login', '')})

АУДИОДОРОЖКА ВСТРЕЧИ:
- Полная оригинальная аудиодорожка занятия прикреплена без обрезки (ID файла: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)

КЛЮЧЕВЫЕ КАДРЫ ЭКРАНА С ТАЙМКОДАМИ (00 из 00 запланированных):
"""
        user_static_mid = """

--- ТЕКСТОВЫЕ МАТЕРИАЛЫ ---
ИИ-Краткий пересказ встречи (Саммари):
"""
        user_static_tr_hdr = "\n\nТранскрипт общения с таймкодами реплик:\n"
        user_static_footer = f"""

ИНСТРУКЦИЯ ПО АНАЛИЗУ:
1. Внимательно проанализируй аудиодорожку, прикреплённые кадры экрана и транскрипт в сопоставлении со стандартными и критическими критериями оценивания.
2. По каждому критерию соблюдай порядок «факты и недочёт → потом оценка»: выпиши цитату в `quote`, выявленный недочёт в `gap` (пиши `"нет"` только при безупречном выполнении), таймкоды нарушений в `timecodes` и разбор в `details`, и только затем `score` (0, 1, 2 или null).
3. Оцени ровно {len(active_criteria)} критериев (`id` от 1 до {len(active_criteria)}), а также отдельно проверь урок на критические нарушения (`is_critical` и `critical_details` с таймкодами). Не ставь `0` по умолчанию и не завышай из вежливости.
4. Выдай итоговый ответ СТРОГО в виде валидного JSON-объекта."""

        total_static_prompt_chars = (
            len(system_prompt)
            + len(user_static_header)
            + len(user_static_mid)
            + len(user_static_tr_hdr)
            + len(user_static_footer)
        )

        budget_plan = ai_gigachat.plan_multimodal_budget(
            transcript_text=transcript_text,
            summary_text=summary_text,
            static_prompt_chars=total_static_prompt_chars,
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
            audio_reason = getattr(ai_gigachat, "_last_audio_upload_error", None)
            reason_suffix = f" Причина: {audio_reason[:240]}" if audio_reason else ""
            err_msg = (
                "Не удалось загрузить аудиодорожку занятия в облако GigaChat. "
                f"По правилам полной мультимодальной проверки анализ без аудиодорожки не выполняется.{reason_suffix}"
            )
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
1. Внимательно проанализируй аудиодорожку, прикреплённые кадры экрана и транскрипт в сопоставлении со стандартными и критическими критериями оценивания.
2. По каждому критерию соблюдай порядок «факты и недочёт → потом оценка»: выпиши цитату в `quote`, выявленный недочёт в `gap` (пиши `"нет"` только при безупречном выполнении), таймкоды нарушений в `timecodes` и разбор в `details`, и только затем `score` (0, 1, 2 или null).
3. Оцени ровно {len(active_criteria)} критериев (`id` от 1 до {len(active_criteria)}), а также отдельно проверь урок на критические нарушения (`is_critical` и `critical_details` с таймкодами). Не ставь `0` по умолчанию и не завышай из вежливости.
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
        truncated_stop_model: Optional[str] = None

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
                temperature=0.0
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
                if finish_reason == "length" and parsed_count < len(active_criteria):
                    raise ValueError(
                        f"Ответ обрезан по окну вывода (finish_reason=length, разобрано критериев {parsed_count}/{len(active_criteria)})"
                    )

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
                if finish_reason == "length":
                    truncated_stop_model = candidate_model
                    print(
                        f"[GigaChat] Ответ модели {candidate_model} оборван по лимиту вывода (finish_reason=length): {parse_err}. "
                        "В следующую модель не переотправляем.",
                        file=sys.stderr
                    )
                    model_attempts.append({
                        "model": candidate_model,
                        "status": "truncated",
                        "finishReason": finish_reason,
                        "reason": str(parse_err)[:300],
                        "promptTokens": p_tokens,
                        "completionTokens": c_tokens,
                        "totalTokens": t_tokens,
                        "durationSec": elapsed_model
                    })
                    break

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
            if truncated_stop_model:
                err_msg = (
                    f"Ответ модели {truncated_stop_model} оборван по длине вывода (finish_reason=length): {last_error_text}. "
                    "Переотправка в следующую модель отключена — при необходимости перезапустите проверку вручную."
                )
            else:
                err_msg = f"Все доступные модели ротации ({', '.join(rotation_models)}) не смогли завершить проверку. Последняя ошибка: {last_error_text}"
            return _build_failed_task(
                task_id, lecture_url, teacher_name, subject, group_name, curator_email, talk_metadata,
                err_msg,
                is_corrupted=bool(last_raw_response),
                raw_broken_response=last_raw_response or last_error_text,
                ai_model=truncated_stop_model,
                frames_uploaded=frames_uploaded,
                frames_planned=frames_planned,
                model_attempts=model_attempts
            )

        # 6. Честный подсчет баллов без искусственных обнулений и с поддержкой Н/П (null)
        crit_details = [str(cd).strip() for cd in (parsed_result.get("critical_details") or []) if cd is not None and str(cd).strip()]
        is_crit = bool(parsed_result.get("is_critical", False)) or bool(crit_details)
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

            raw_t_codes = ai_data.get("timecodes", [])
            if isinstance(raw_t_codes, str) and raw_t_codes.strip():
                found_in_str = re.findall(r"\b(?:\d{1,2}:)?\d{2}:\d{2}\b", raw_t_codes)
                if found_in_str:
                    t_codes = found_in_str
                else:
                    t_codes = [part.strip() for part in re.split(r"[,;]+", raw_t_codes) if part.strip()]
            elif isinstance(raw_t_codes, list):
                t_codes = []
                for tc in raw_t_codes:
                    if tc is None:
                        continue
                    tc_str = str(tc).strip()
                    if not tc_str or tc_str.lower() in ("null", "none", "нет"):
                        continue
                    found_in_item = re.findall(r"\b(?:\d{1,2}:)?\d{2}:\d{2}\b", tc_str)
                    if len(found_in_item) > 1:
                        t_codes.extend(found_in_item)
                    else:
                        t_codes.append(tc_str)
            else:
                t_codes = []
            t_codes = list(dict.fromkeys(t_codes))

            details_text = str(ai_data.get("details") or "").strip()
            gap_text = str(ai_data.get("gap") or "").strip()
            if gap_text.lower() in ("null", "none", "нет", "нарушений нет", "замечаний нет", "—", "-"):
                gap_text = ""
            raw_quote = ai_data.get("quote")
            quote_text = str(raw_quote or "").strip()
            if quote_text.lower() in ("null", "none") or quote_text in ("«...»", "...", "—", "-"):
                quote_text = ""

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

                # Автоматически подтягиваем таймкоды из текста gap/details ТОЛЬКО если реально сняты баллы (нарушение),
                # чтобы положительные таймкоды подтверждения при score=0 не попадали в список нарушений.
                if deducted > 0 and not t_codes and (details_text or gap_text):
                    found = re.findall(r"\b(?:\d{1,2}:)?\d{2}:\d{2}\b", f"{gap_text} {details_text}".strip())
                    if found:
                        t_codes = list(dict.fromkeys(found))

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
                    details_text = details_text or gap_text or "Зафиксировано небольшое нарушение."
                else:
                    passed = False
                    crit_score = 1
                    details_text = details_text or gap_text or "Зафиксировано грубое или систематическое нарушение."

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
