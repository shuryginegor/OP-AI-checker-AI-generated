import json
import logging
import re
import html
from typing import List, Optional
import json_repair
from pydantic import BaseModel, Field
import database
import criteria
from testing_config import is_testing_mode
import logger_config

logger = logging.getLogger(__name__)


class VideoAnalysisResponse(BaseModel):
    """Схема структуры JSON, которую строго должна вернуть модель."""

    is_critical: bool = Field(description="Есть ли хотя бы одно критическое нарушение (true or false)")
    critical_details: List[str] = Field(default=[], description="Список найденных критических нарушений с таймкодами")
    criteria_scores: List[dict] = Field(description="Снятые баллы по каждому некритическому критерию (0 — нет нарушений, 1 — небольшое нарушение, 2 — грубое нарушение, null — не применим)")
    point: int = Field(description="Сумма снятых баллов (штрафа) по всем применимым некритическим критериям")
    comment: str = Field(description="Подробный комментарий (10-15 предложений) с таймкодами и описанием основных недостатков")
    recommendations: str = Field(description="Рекомендации преподавателю (около 5 предложений) по исправлению ошибок")


def get_json_output_prompt_instructions() -> str:
    """Динамически формирует инструкции по JSON-ответу в зависимости от количества некритических критериев."""
    std_list, _ = criteria.get_dynamic_criteria()
    count = len(std_list)
    return f"""
Проведи строгий, честный, воспроизводимый аудит по ВСЕМ некритическим критериям (всего их {count}) и выдай итоговый ответ СТРОГО в формате одного валидного JSON-объекта со следующими ключами (для каждого критерия СТРОГО соблюдай порядок «факты и недочёт → затем оценка score»):
{{
  "is_critical": false,
  "critical_details": [],
  "criteria_scores": [
     {{
       "id": 1,
       "criterion": "Краткое название (2–4 слова)",
       "quote": "«точная дословная реплика (1–2 фразы) или пустая строка»",
       "gap": "<конкретный недочёт или зона роста с таймкодом (5–15 слов); пиши «нет» ТОЛЬКО если критерий выполнен безупречно от начала до конца>",
       "timecodes": ["00:14:20"],
       "details": "<1–3 ёмких предложения по делу: что наблюдалось, что именно не дотянуто и почему поставлен такой score>",
       "score": <0, 1, 2 или null>
     }}
     ... ВАЖНО: Массив "criteria_scores" должен содержать СТРОГО ВСЕ {count} КРИТЕРИЕВ (id от 1 до {count} по порядку). Не дублируй в `criterion` длинную формулировку и пиши без лишней «воды», сохраняя все факты и таймкоды!
  ],
  "point": <суммарный штраф — точная сумма всех СНЯТЫХ баллов (score) по применимым некритическим критериям>,
  "comment": "<содержательный хронологический разбор занятия (8–12 предложений) с сильными сторонами, замечаниями и таймкодами>",
  "recommendations": [
    "Конкретная практическая рекомендация 1 (с таймкодом проблемного места)",
    "Конкретная практическая рекомендация 2",
    "Конкретная практическая рекомендация 3",
    "Конкретная практическая рекомендация 4",
    "Конкретная практическая рекомендация 5"
  ]
}}
ПРАВИЛА ОЦЕНИВАНИЯ КРИТИЧЕСКИХ НАРУШЕНИЙ:
- Проверяй ВСЕ критические нарушения из списка.
- Если найдено хотя бы одно доказанное критическое нарушение — поставь `"is_critical": true` и перечисли их в `"critical_details"` в формате `["ЧЧ:ММ:СС — Название нарушения: конкретный факт"]`.
- Если критических нарушений нет — поставь `"is_critical": false` и `"critical_details": []`.

ПОРОГИ ОЦЕНИВАНИЯ НЕКРИТИЧЕСКИХ КРИТЕРИЕВ (`score` — сколько баллов СНИМАЕТСЯ):
- `0`: Безупречное, прямо подтверждённое выполнение от начала до конца урока (`"gap": "нет"`, `"timecodes": []`). Запрещено ставить `0` по инерции или «из-за отсутствия грубых скандалов».
- `1`: Любой реальный локальный или методический недочёт (1–2 эпизода, формальное «понятно?», нет явной цели в начале или итогов/закрепления в конце, говорит в основном преподаватель или 1–2 ученика, нет проверки молчащих, мелкий текст на части кадров, пауза/поиск >10–15 сек, спешка в финале). Укажи недочёт в `gap`, таймкоды в `timecodes` и факты в `details`.
- `2`: Системное или грубое нарушение (3+ повторяющихся эпизода, проблема длилась >3 мин или существенно снизила пользу урока). Укажи в `gap`, `timecodes` и `details`.
- `null`: Критерий объективно неприменим из-за формата занятия (например, 1-на-1 для критериев о «группе» или лекция без учеников). Укажи `"gap": "нет"`, `"timecodes": []` и объясни причину в `details`.
- СОГЛАСОВАННОСТЬ И ЧЕСТНОСТЬ: Если в `gap` или `details` зафиксирован любой реальный недочёт или зона роста — ЗАПРЕЩЕНО оставлять `score: 0`. В обычном живом уроке почти всегда есть 4–8 баллов суммарного штрафа (80–92%); итог `point: 0` (100%) допустим только для действительно эталонного занятия.
""".strip()


def __getattr__(name: str):
    if name == "JSON_OUTPUT_PROMPT_INSTRUCTIONS":
        return get_json_output_prompt_instructions()
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")



def parse_analysis_json(text_or_dict) -> dict:
    """Извлекает, валидирует и структурирует JSON-ответ от нейросети."""
    if isinstance(text_or_dict, str):
        cleaned = text_or_dict.strip()
        logger.info(f"[parse_analysis_json] Сырой ответ от ИИ ({len(cleaned)} символов):\n{cleaned[:3000]}")

        # Удаляем обертки markdown ```json ... ```
        if "```" in cleaned:
            lines = cleaned.split("\n")
            lines = [line for line in lines if not line.strip().startswith("```")]
            cleaned = "\n".join(lines).strip()

        # Извлекаем фрагмент с JSON (начиная с первого '{')
        if "{" in cleaned:
            start_idx = cleaned.find("{")
            if "}" in cleaned:
                end_idx = cleaned.rfind("}") + 1
                cleaned = cleaned[start_idx:end_idx]
            else:
                cleaned = cleaned[start_idx:]

        data = None
        # Попытка 1: стандартный json.loads
        try:
            data = json.loads(cleaned, strict=False)
            logger.info("[parse_analysis_json] Ответ успешно распарсен через json.loads")
        except Exception as primary_err:
            logger.warning(f"[parse_analysis_json] json.loads вернул ошибку ({primary_err}). Пробуем json_repair...")
            # Попытка 2: json_repair на очищенном фрагменте
            try:
                repaired = json_repair.repair_json(cleaned, return_objects=True)
                if isinstance(repaired, dict):
                    data = repaired
                else:
                    data = json_repair.loads(cleaned)
                logger.info("[parse_analysis_json] Ответ успешно восстановлен и распарсен через json_repair")
            except Exception as secondary_err:
                # Попытка 3: json_repair на полном исходном тексте
                try:
                    data = json_repair.loads(text_or_dict)
                    logger.info("[parse_analysis_json] Ответ восстановлен через json_repair из исходного текста")
                except Exception as tertiary_err:
                    logger.error(
                        f"[parse_analysis_json] НЕ УДАЛОСЬ РАСПАРСИТЬ JSON!\n"
                        f"primary_err: {primary_err}\n"
                        f"secondary_err: {secondary_err}\n"
                        f"tertiary_err: {tertiary_err}\n"
                        f"Полный сырой ответ ({len(text_or_dict)} символов):\n{text_or_dict}"
                    )
                    raise primary_err
    elif isinstance(text_or_dict, dict):
        data = text_or_dict
    else:
        raise ValueError(f"Неподдерживаемый тип ответа: {type(text_or_dict)}")

    if not isinstance(data, dict):
        logger.warning(f"[parse_analysis_json] Результат не является словарем ({type(data)}), пытаемся привести к словарю...")
        if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
            data = data[0]
        else:
            data = {"comment": str(data)}

    # Поиск массива критериев с поддержкой вложенных словарей и альтернативных ключей
    def _find_criteria_list(obj):
        if isinstance(obj, dict):
            for k in ["criteria_scores", "criteriaScores", "criteria", "scores", "evaluations", "criteria_evaluations", "results"]:
                val = obj.get(k)
                if isinstance(val, list) and len(val) > 0:
                    return val
                elif isinstance(val, dict) and len(val) > 0:
                    converted = []
                    for cid, item in val.items():
                        if isinstance(item, dict):
                            sc = item.get("score", 0)
                            converted.append({"criterion_id": str(cid), "score": sc, "details": item.get("details", "")})
                        elif isinstance(item, (int, float)):
                            converted.append({"criterion_id": str(cid), "score": item, "details": ""})
                    if converted:
                        return converted
            for v in obj.values():
                res = _find_criteria_list(v)
                if res:
                    return res
        return []

    criteria_scores = _find_criteria_list(data)
    deducted_scores = []
    applicable_count = 0

    if isinstance(criteria_scores, list):
        for item in criteria_scores:
            if not isinstance(item, dict):
                continue
            score = item.get("score")
            if isinstance(score, bool):
                continue
            if score is None:
                continue
            if isinstance(score, str):
                s_low = score.strip().lower()
                if s_low in ("", "null", "none", "н/п", "н/д", "n/a", "na", "не применим"):
                    continue
                try:
                    score_int = int(float(s_low))
                except (ValueError, TypeError):
                    continue
            elif isinstance(score, (int, float)):
                score_int = int(score)
            else:
                continue

            score_val = max(0, min(2, score_int))
            deducted_scores.append(score_val)
            applicable_count += 1

    total_deducted = sum(deducted_scores)
    point = total_deducted

    if applicable_count > 0:
        max_possible_points = 2 * applicable_count
        earned_points = max(0, max_possible_points - point)
        final_percentage = round((earned_points / max_possible_points) * 100, 2)
    else:
        logger.error(f"[parse_analysis_json] Массив критериев не найден или не содержит применимых критериев!\nИсходные данные: {data}")
        raise ValueError("Ответ модели не содержит валидного списка критериев оценки (criteria_scores пуст или все оценки некорректны).")

    def _is_empty_crit_text(text: str) -> bool:
        low = text.strip().lower().strip(" .!«»\"'")
        if not low:
            return True
        if low.startswith("<") and low.endswith(">"):
            return True
        return low in (
            "null",
            "none",
            "нет",
            "отсутствуют",
            "отсутствует",
            "не выявлено",
            "не обнаружено",
            "критических нарушений нет",
            "критических нарушений не выявлено",
            "критических нарушений не обнаружено",
            "без критических нарушений",
        )

    def _format_crit_item(cd) -> str:
        if cd is None:
            return ""
        if isinstance(cd, dict):
            tc_raw = cd.get("timecode") or cd.get("timecodes") or cd.get("tc") or ""
            if isinstance(tc_raw, list):
                tc_str = ", ".join(str(x).strip() for x in tc_raw if x is not None and str(x).strip())
            else:
                tc_str = str(tc_raw).strip()
            title = str(cd.get("title") or cd.get("criterion") or cd.get("name") or "").strip()
            desc = str(cd.get("details") or cd.get("description") or cd.get("desc") or cd.get("comment") or "").strip()
            parts = []
            if title and desc and title.lower() not in desc.lower():
                parts.append(f"{title}: {desc}")
            elif desc:
                parts.append(desc)
            elif title:
                parts.append(title)
            body = " ".join(parts).strip()
            if tc_str and tc_str not in body:
                return f"{tc_str} — {body}" if body else tc_str
            return body
        return str(cd).strip()

    raw_flag = data.get("is_critical", False)
    if isinstance(raw_flag, bool):
        is_critical = raw_flag
    elif isinstance(raw_flag, str):
        is_critical = raw_flag.strip().lower() in ("true", "1", "yes", "да")
    else:
        is_critical = bool(raw_flag)

    raw_crit = data.get("critical_details") or data.get("critical_violations") or data.get("criticalViolations") or []
    if isinstance(raw_crit, (str, dict)):
        raw_crit = [raw_crit]
    elif not isinstance(raw_crit, list):
        raw_crit = []

    critical_details: List[str] = []
    for cd in raw_crit:
        formatted_cd = _format_crit_item(cd)
        if formatted_cd and not _is_empty_crit_text(formatted_cd) and formatted_cd not in critical_details:
            critical_details.append(formatted_cd)

    if critical_details:
        is_critical = True
    else:
        is_critical = False

    comment = (
        data.get("comment") or
        data.get("comments") or
        data.get("summary") or
        data.get("overall_comment") or
        "Обработка завершена."
    )
    raw_recs = (
        data.get("recommendations") or
        data.get("recommendation") or
        data.get("advice") or
        ""
    )
    clean_recs: List[str] = []
    if isinstance(raw_recs, list):
        for r in raw_recs:
            s = re.sub(r"^\s*[-*•\d.)]+\s*", "", str(r or "")).strip()
            if s and s.lower() not in ("null", "none"):
                clean_recs.append(s)
    elif isinstance(raw_recs, str):
        for line in raw_recs.split("\n"):
            s = re.sub(r"^\s*[-*•]+\s*", "", line).strip()
            if s and s.lower() not in ("null", "none"):
                clean_recs.append(s)

    recommendations_str = "\n".join(clean_recs) if clean_recs else ""

    return {
        "point": point,
        "applicable_count": applicable_count,
        "max_possible_points": max_possible_points,
        "earned_points": earned_points,
        "final_percentage": final_percentage,
        "is_critical": is_critical,
        "critical_details": critical_details,
        "criteria_scores": criteria_scores,
        "comment": str(comment).strip(),
        "recommendations": recommendations_str,
        "recommendations_list": clean_recs,
        "raw_json": data
    }


def format_markdown_to_html(text: str) -> str:
    """Преобразует Markdown-разметку от моделей/пользователей в чистый Telegram HTML без сырых двойных звёздочек."""
    if not text:
        return ""
    clean = html.escape(str(text))
    clean = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', clean, flags=re.DOTALL)
    clean = re.sub(r'`(.*?)`', r'<code>\1</code>', clean)
    clean = re.sub(r'(?<!\w)\*(.*?)\*(?!\w)', r'<i>\1</i>', clean)
    return clean


async def send_long_message(bot, chat_id: int, text: str, parse_mode: str = "HTML"):
    """Отправляет длинное сообщение в Telegram, аккуратно разбивая его при превышении лимита."""
    if not text:
        return

    MAX_LEN = 3800
    if len(text) <= MAX_LEN:
        try:
            await bot.send_message(chat_id, text, parse_mode=parse_mode)
        except Exception as e:
            logger.warning(f"Ошибка при отправке с parse_mode={parse_mode}: {e}, пробуем без форматирования...")
            clean_text = re.sub(r'<[^>]+>', '', text)
            await bot.send_message(chat_id, clean_text)
        return

    lines = text.split("\n")
    chunks = []
    current_chunk = ""

    for line in lines:
        if len(current_chunk) + len(line) + 1 > MAX_LEN:
            chunks.append(current_chunk)
            current_chunk = line + "\n"
        else:
            current_chunk += line + "\n"

    if current_chunk.strip():
        chunks.append(current_chunk)

    for chunk in chunks:
        try:
            await bot.send_message(chat_id, chunk, parse_mode=parse_mode)
        except Exception as e:
            logger.warning(f"Ошибка отправки фрагмента с parse_mode={parse_mode}: {e}, пробуем без форматирования...")
            clean_chunk = re.sub(r'<[^>]+>', '', chunk)
            await bot.send_message(chat_id, clean_chunk)


async def save_and_notify_success(bot, tg_id: int, db_id: int, mark: dict, provider_name: str, frames_count: Optional[int] = None):
    """Записывает результаты работы нейросети в БД и отправляет пользователю наглядное подробное резюме без сырого JSON."""
    std_list, _ = criteria.get_dynamic_criteria()
    point = mark.get("point", 0)
    applicable_count = mark.get("applicable_count", 0)
    max_possible_points = mark.get("max_possible_points")
    if not max_possible_points or max_possible_points == 0:
        max_possible_points = 2 * (applicable_count if applicable_count > 0 else len(std_list))
    earned_points = mark.get("earned_points", max(0, max_possible_points - point))
    final_percentage = round(float(mark.get("final_percentage", 100.0)), 2)

    is_critical = bool(mark.get("is_critical", False))
    comment = mark.get("comment", "Обработка завершена.")
    recommendations = mark.get("recommendations", "")
    critical_details = mark.get("critical_details", [])
    criteria_scores = mark.get("criteria_scores", [])

    # Формируем список критических нарушений
    crit_text = "✅ Критических нарушений не обнаружено"
    if is_critical:
        crit_text = "🚨 <b>ОБНАРУЖЕНЫ КРИТИЧЕСКИЕ НАРУШЕНИЯ:</b>"
        if critical_details:
            crit_text += "\n" + "\n".join([f"  • {html.escape(str(cd))}" for cd in critical_details])

    # Формируем наглядную сводку оценок по критериям с эмодзи и деталями
    criteria_summary_lines = []
    if isinstance(criteria_scores, list) and criteria_scores:
        for item in criteria_scores:
            if isinstance(item, dict):
                c_id = item.get("id", "?")
                c_name = item.get("criterion", f"Критерий №{c_id}")
                c_name_short = c_name.split(". ")[-1] if ". " in c_name else c_name
                if len(c_name_short) > 65:
                    c_name_short = c_name_short[:62] + "..."

                score = item.get("score")
                details = str(item.get("details", "")).strip()

                is_null_score = (
                    score is None
                    or isinstance(score, bool)
                    or (isinstance(score, str) and score.strip().lower() in ("", "null", "none", "н/п", "н/д", "n/a", "na", "не применим"))
                )
                is_deducted = False

                if is_null_score:
                    icon = "⚪"
                    score_str = "Н/П (не применим)"
                else:
                    try:
                        score_int = int(float(score))
                        is_deducted = score_int > 0
                        if score_int == 0:
                            icon = "🟢"
                            score_str = "0 б. (без нарушений)"
                        elif score_int == 1:
                            icon = "🟡"
                            score_str = "-1 б. (небольшое нарушение)"
                        else:
                            icon = "🔴"
                            score_str = "-2 б. (грубое нарушение)"
                    except (ValueError, TypeError):
                        icon = "⚪"
                        score_str = "Н/П (не применим)"
                        is_null_score = True

                line = f"{icon} <b>Критерий {c_id}:</b> <code>{score_str}</code> — <i>{html.escape(c_name_short)}</i>"
                if details and (is_deducted or is_null_score):
                    line += f"\n   └ 💬 {html.escape(details)}"
                criteria_summary_lines.append(line)

    criteria_block = ""
    if criteria_summary_lines:
        criteria_block = "\n\n📌 <b>Детальный разбор критериев:</b>\n" + "\n".join(criteria_summary_lines)

    full_comment = f"{comment}\n\nРекомендации по исправлению:\n{recommendations}".strip()

    # Сохранение в БД
    await database.write_result(
        db_id,
        point,
        is_critical,
        full_comment,
        score_percent=final_percentage
    )

    formatted_comment = format_markdown_to_html(comment)
    formatted_recs = format_markdown_to_html(recommendations)

    frames_info = f"\n🖼️ <b>Кадров передано в ИИ:</b> <code>{frames_count} шт.</code>" if frames_count is not None else ""

    # Итоговое подробное оформление в Telegram в формате HTML
    result_text = (
        f"📊 <b>Анализ занятия завершен ({provider_name})!</b>\n\n"
        f"🎯 <b>ИТОГОВАЯ ОЦЕНКА КАЧЕСТВА:</b> <code>{final_percentage:.2f}%</code> "
        f"(<code>{earned_points}</code> из <code>{max_possible_points}</code> баллов, применимо {applicable_count} крит.)\n"
        f"🔻 <b>Сумма штрафных баллов:</b> <code>{point}</code>\n"
        f"⚠️ <b>Критический статус:</b> {crit_text}"
        f"{frames_info}"
        f"{criteria_block}\n\n"
        f"💬 <b>Комментарий эксперта (с таймкодами):</b>\n{formatted_comment}\n\n"
        f"💡 <b>Рекомендации преподавателю:</b>\n{formatted_recs}"
    )
    await send_long_message(bot, tg_id, result_text, parse_mode="HTML")


async def save_and_notify_failure(bot, tg_id: int, db_id: int, provider_name: str, error_msg: str):
    """Фиксирует ошибку в БД и сообщает пользователю."""
    err_str = str(error_msg).strip() if error_msg else "Неизвестная ошибка"
    err_lower = err_str.lower()

    is_balance_error = any(term in err_lower for term in [
        "402", "balance", "credit", "insufficient", "payment", "quota", 
        "resourcehasbeenexhausted", "resource_exhausted", "out of credits", 
        "low balance", "payment required", "exceeded your current quota"
    ])

    if is_balance_error:
        user_msg = (
            f"💳 **Ошибка ИИ-сервиса ({provider_name}): Недостаточно средств на балансе!**\n\n"
            f"⚠️ На балансе провайдера нейросети закончились средства или превышена лимитированная квота запросов.\n"
            f"Пожалуйста, пополните баланс API-аккаунта или обратитесь к администратору сервиса.\n\n"
            f"*(Детали ошибки: `{err_str}`)*"
        )
    else:
        user_msg = f"❌ Не удалось обработать встречу через {provider_name}: {err_str}"

    await database.write_result(
        db_id,
        -2,
        True,
        f"Ошибка обработки в {provider_name} ({err_str})"
    )
    try:
        await bot.send_message(
            tg_id, user_msg, parse_mode="Markdown"
        )
    except Exception:
        await bot.send_message(
            tg_id, f"❌ Ошибка обработки в {provider_name}:\n{err_str}"
        )
