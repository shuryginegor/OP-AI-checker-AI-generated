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
    count = len(criteria.STANDARD_CRITERIA)
    return f"""
Проведи детальный анализ по ВСЕМ некритическим критериям (всего их {count}) и выдай итоговый ответ СТРОГО в формате JSON со следующими ключами:
{{
  "is_critical": <true или false>,
  "critical_details": ["<таймкод — подробное описание критического нарушения 1>", "<таймкод — подробное описание критического нарушения 2>"],
  "criteria_scores": [
     {{
       "id": 1,
       "criterion": "1. Преподаватель уверенно ведёт разбор...",
       "score": <0, 1, 2 или null>,
       "details": "<подробная фиксация с таймкодами и объяснением, почему снято 0, 1 или 2 балла>"
     }}
     ... ВАЖНО: Массив "criteria_scores" должен содержать СТРОГО ВСЕ {count} КРИТЕРИЕВ (id от 1 до {count} по порядку). Не пропускай ни одного критерия!
  ],
  "point": <суммарный штраф — сумма всех СНЯТЫХ баллов по применимым некритическим критериям>,
  "comment": "<подробный комментарий (ровно 10-15 предложений) с таймкодами и фиксацией основных недостатков>",
  "recommendations": "<рекомендации преподавателю (ровно 5 предложений) как исправить ошибки>"
}}
ПРАВИЛА ОЦЕНИВАНИЯ КРИТИЧЕСКИХ НАРУШЕНИЙ:
- Ищи и зафиксируй ВСЕ критические нарушения из списка. НЕ останавливайся при обнаружении первого!
- Если найдено хотя бы одно нарушение — поставь `"is_critical": true` и перечисли ВСЕ найденные критические нарушения в `"critical_details"` с таймкодами и подробным описанием.
- Если критических нарушений нет — поставь `"is_critical": false` и `"critical_details": []`.

ПРАВИЛА ОЦЕНИВАНИЯ НЕКРИТИЧЕСКИХ КРИТЕРИЕВ (`score` — сколько баллов СНИМАЕТСЯ):
- `0`: Критерий выполнен качественно, нарушений нет (0 баллов снимается).
- `1`: Частичное выполнение / небольшое нарушение (снимается 1 балл). Укажи точную причину в `details`.
- `2`: Критерий не выполнен / грубое нарушение (снимается 2 балла). Укажи точную причину в `details`.
- `null`: Критерий не применим из-за формата урока или доп. информации. ОБЯЗАТЕЛЬНО укажи причину неприменимости в `details`.

СТРОГОЕ ТРЕБОВАНИЕ: В массиве `criteria_scores` должно быть ровно {count} объектов (по одному объекту на каждый критерий от id 1 до {count}). Если критерий не применим — ставь `score: null` и обязательно заполняй `details` с причиной.
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
            if isinstance(item, dict):
                score = item.get("score")
                if score is not None and isinstance(score, (int, float)):
                    score_val = max(0, min(2, int(score)))
                    deducted_scores.append(score_val)
                    applicable_count += 1

    total_deducted = sum(deducted_scores)
    point = total_deducted

    if applicable_count > 0:
        max_possible_points = 2 * applicable_count
        earned_points = max(0, max_possible_points - point)
        final_percentage = round((earned_points / max_possible_points) * 100, 2)
    else:
        logger.error(f"[parse_analysis_json] Массив критериев не найден или пуст в ответе модели!\nИсходные данные: {data}")
        raise ValueError("Ответ модели не содержит валидного списка критериев оценки (criteria_scores пуст или отсутствует). Возможно, модель вернула текстовый отказ или ошибку.")

    is_critical = bool(data.get("is_critical", False))
    critical_details = data.get("critical_details") or data.get("critical_violations") or []
    
    comment = (
        data.get("comment") or 
        data.get("comments") or 
        data.get("summary") or 
        data.get("overall_comment") or 
        "Обработка завершена."
    )
    recommendations = (
        data.get("recommendations") or 
        data.get("recommendation") or 
        data.get("advice") or 
        ""
    )

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
        "recommendations": str(recommendations).strip(),
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
    point = mark.get("point", 0)
    applicable_count = mark.get("applicable_count", 0)
    max_possible_points = mark.get("max_possible_points")
    if not max_possible_points or max_possible_points == 0:
        max_possible_points = 2 * (applicable_count if applicable_count > 0 else len(criteria.STANDARD_CRITERIA))
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

                if score is None:
                    icon = "⚪"
                    score_str = "н/д (не применим)"
                else:
                    try:
                        score_int = int(score)
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
                        score_str = "н/д"
                
                line = f"{icon} <b>Критерий {c_id}:</b> <code>{score_str}</code> — <i>{html.escape(c_name_short)}</i>"
                is_deducted = False
                if score is not None:
                    try:
                        is_deducted = int(score) > 0
                    except (ValueError, TypeError):
                        pass

                is_null_score = (score is None) or (isinstance(score, str) and score.lower() in ("null", "none"))

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
        f"🎯 <b>ИТОГОВАЯ ОЦЕНКА КАЧЕСТВА:</b> <code>{final_percentage:.2f}%</code> (<code>{earned_points}</code> из <code>{max_possible_points}</code> баллов)\n"
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
