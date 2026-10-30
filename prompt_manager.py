#!/usr/bin/env python3
"""
Утилита и модуль управления системным промптом ИИ и 2FA-авторизацией через Telegram.
"""

import sys
import os
import json
import asyncio
import database
import criteria

async def main():
    await database.init_db()

    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "message": "Не указано действие."}))
        return

    action = sys.argv[1]

    if action == "request_login":
        if len(sys.argv) < 3:
            print(json.dumps({"success": False, "message": "Не указан username."}))
            return
        username = sys.argv[2].strip().lstrip('@').lower()
        ip = sys.argv[3] if len(sys.argv) > 3 else "unknown"

        if not database.is_prompt_admin(username):
            await database.log_prompt_audit(username, "login_rejected_forbidden", None, ip, "Попытка входа пользователя без прав в PROMPT_ADMIN_USERNAMES")
            print(json.dumps({
                "success": False,
                "code": "FORBIDDEN",
                "message": f"У пользователя @{username} нет прав на редактирование системного промпта."
            }))
            return

        telegram_id = await database.get_telegram_id_by_username(username)
        if not telegram_id:
            await database.log_prompt_audit(username, "login_rejected_no_chat_id", None, ip, "Пользователь есть в списке, но не отправлял /start боту")
            print(json.dumps({
                "success": False,
                "code": "NO_TELEGRAM_ID",
                "message": f"Логин @{username} есть в списке доступа, но бот еще не знает ваш Telegram ID. Откройте вашего бота в Telegram и отправьте команду /start, затем повторите попытку."
            }))
            return

        code = await database.create_prompt_code(username, telegram_id, "login")
        await database.log_prompt_audit(username, "login_code_generated", telegram_id, ip, "Сгенерирован 6-значный код авторизации")
        print(json.dumps({
            "success": True,
            "telegram_id": telegram_id,
            "code": code
        }))

    elif action == "verify_login":
        if len(sys.argv) < 4:
            print(json.dumps({"success": False, "message": "Недостаточно параметров."}))
            return
        username = sys.argv[2].strip().lstrip('@').lower()
        code = sys.argv[3].strip()
        ip = sys.argv[4] if len(sys.argv) > 4 else "unknown"

        telegram_id = await database.get_telegram_id_by_username(username)
        valid = await database.verify_prompt_code(username, code, "login")
        if not valid:
            await database.log_prompt_audit(username, "login_failed_bad_code", telegram_id, ip, "Неверный или просроченный код")
            print(json.dumps({"success": False, "message": "Неверный или просроченный код подтверждения."}))
            return

        await database.log_prompt_audit(username, "login_success", telegram_id, ip, "Успешная 2FA-авторизация в веб-панели")
        print(json.dumps({"success": True, "username": username}))

    elif action == "get_data":
        active = criteria.get_active_system_prompt()
        base = criteria.get_base_system_prompt()
        factory = criteria.build_default_factory_prompt()
        audit_logs = await database.get_prompt_audit_history(30)
        print(json.dumps({
            "success": True,
            "active": active,
            "base": base,
            "factory": factory,
            "audit_logs": audit_logs
        }, default=str))

    elif action == "request_save_code":
        if len(sys.argv) < 4:
            print(json.dumps({"success": False, "message": "Недостаточно параметров."}))
            return
        username = sys.argv[2].strip().lstrip('@').lower()
        save_action = sys.argv[3].strip()
        ip = sys.argv[4] if len(sys.argv) > 4 else "unknown"

        if not database.is_prompt_admin(username):
            print(json.dumps({"success": False, "message": "Доступ запрещен."}))
            return

        telegram_id = await database.get_telegram_id_by_username(username)
        if not telegram_id:
            print(json.dumps({"success": False, "message": "Telegram ID не найден."}))
            return

        code = await database.create_prompt_code(username, telegram_id, "save")
        await database.log_prompt_audit(username, f"save_code_generated_{save_action}", telegram_id, ip, f"Запрос кода для действия: {save_action}")
        print(json.dumps({
            "success": True,
            "telegram_id": telegram_id,
            "code": code
        }))

    elif action == "confirm_save":
        if len(sys.argv) < 5:
            print(json.dumps({"success": False, "message": "Недостаточно параметров."}))
            return
        username = sys.argv[2].strip().lstrip('@').lower()
        code = sys.argv[3].strip()
        save_action = sys.argv[4].strip()
        ip = sys.argv[5] if len(sys.argv) > 5 else "unknown"

        # Читаем текст нового промпта из stdin
        prompt_text = sys.stdin.read().strip()

        telegram_id = await database.get_telegram_id_by_username(username)
        valid = await database.verify_prompt_code(username, code, "save")
        if not valid:
            await database.log_prompt_audit(username, f"save_failed_bad_code_{save_action}", telegram_id, ip, "Неверный код сохранения")
            print(json.dumps({"success": False, "message": "Неверный или истекший код подтверждения."}))
            return

        if save_action == "save_active":
            if not prompt_text:
                print(json.dumps({"success": False, "message": "Текст промпта не может быть пустым."}))
                return
            await database.set_prompt_config("active", prompt_text, username)
            await database.log_prompt_audit(username, "save_active_prompt", telegram_id, ip, f"Обновлен активный рабочий промпт ({len(prompt_text)} симв.)")

        elif save_action == "save_base":
            if not prompt_text:
                print(json.dumps({"success": False, "message": "Текст промпта не может быть пустым."}))
                return
            await database.set_prompt_config("base", prompt_text, username)
            await database.set_prompt_config("active", prompt_text, username)
            await database.log_prompt_audit(username, "save_base_prompt", telegram_id, ip, f"Зафиксирован новый базовый эталон и активный промпт ({len(prompt_text)} симв.)")

        elif save_action == "reset_to_base":
            base_prompt = criteria.get_base_system_prompt()
            await database.set_prompt_config("active", base_prompt, username)
            await database.log_prompt_audit(username, "reset_to_base", telegram_id, ip, "Текущий промпт сброшен к сохраненному базовому эталону")

        elif save_action == "reset_to_factory":
            factory_prompt = criteria.build_default_factory_prompt()
            await database.set_prompt_config("active", factory_prompt, username)
            await database.log_prompt_audit(username, "reset_to_factory", telegram_id, ip, "Текущий промпт сброшен к заводскому промпту разработчика")

        else:
            print(json.dumps({"success": False, "message": f"Неизвестное действие: {save_action}"}))
            return

        active = criteria.get_active_system_prompt()
        base = criteria.get_base_system_prompt()
        audit_logs = await database.get_prompt_audit_history(30)
        print(json.dumps({
            "success": True,
            "message": "Изменения успешно применены!",
            "active": active,
            "base": base,
            "audit_logs": audit_logs
        }, default=str))

    else:
        print(json.dumps({"success": False, "message": f"Неизвестная команда: {action}"}))

if __name__ == "__main__":
    asyncio.run(main())
