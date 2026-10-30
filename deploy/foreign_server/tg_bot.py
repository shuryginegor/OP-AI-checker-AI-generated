import os
import asyncio
import logging
import html
from aiogram import Bot, Dispatcher, F
from aiogram.types import (
    Message,
    ReplyKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardRemove,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    CallbackQuery,
    LinkPreviewOptions
)
from aiogram.filters import CommandStart, Command, StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import StatesGroup, State, default_state
from dotenv import load_dotenv

import database
import fetch_talk
import file_processing
import ai_gigachat as ai
import ai_common
from testing_config import is_testing_mode
import logger_config

logger = logging.getLogger(__name__)
load_dotenv()

logger.info(f"Активный ИИ-модуль анализа встреч: GigaChat API ({ai.__name__})")

BOT_TOKEN = os.getenv("BOT_TOKEN")

async def get_app_base_url() -> str:
    """Определяет базовый URL для генерации публичных веб-ссылок."""
    url = ""
    # 1. Приоритет: настройка в БД (заданная админом через /set_url)
    try:
        db_val = await database.get_setting("app_base_url")
        if db_val and db_val.strip():
            url = db_val.strip().rstrip("/")
    except Exception as e:
        logger.warning(f"Не удалось получить app_base_url из БД: {e}")

    # 2. Явно указанные переменные окружения
    if not url:
        # В среде раздельного хостинга: явный адрес веб-панели на российском сервере
        if os.getenv("WEB_BASE_URL"):
            url = os.getenv("WEB_BASE_URL").strip().rstrip("/")
        # В среде AI Studio SHARED_APP_URL — это гарантированно публичный URL (ais-pre-), доступный всем пользователям без авторизации в Google
        elif os.getenv("SHARED_APP_URL"):
            url = os.getenv("SHARED_APP_URL").strip().rstrip("/")
        elif os.getenv("APP_URL"):
            url = os.getenv("APP_URL").strip().rstrip("/")
        elif os.getenv("APP_BASE_URL"):
            url = os.getenv("APP_BASE_URL").strip().rstrip("/")
        elif os.getenv("PUBLIC_URL"):
            url = os.getenv("PUBLIC_URL").strip().rstrip("/")
        else:
            url = "http://localhost:3000"

    # Гарантируем, что ссылка откроется у всех пользователей:
    # Заменяем приватный dev-адрес (ais-dev-) на публичный Shared App URL (ais-pre-)
    if "ais-dev-" in url:
        url = url.replace("ais-dev-", "ais-pre-")

    return url


bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

# --- Чтение списка админов ---
raw_admins = os.getenv("ADMIN_USERNAMES", "")
ADMIN_USERNAMES = [
    name.strip().strip("[]'\"").lstrip('@').lower()
    for name in raw_admins.replace("[", "").replace("]", "").split(",")
    if name.strip().strip("[]'\"")
]
if not ADMIN_USERNAMES:
    ADMIN_USERNAMES = ["shurygin_egor", "aemss72"]


# --- Определение состояний FSM ---
class MeetStates(StatesGroup):
    wait_for_link = State()
    select_teacher = State()
    wait_for_new_teacher = State()
    wait_for_additional_information = State()
    wait_for_info_confirmation = State()
    wait_for_recheck_decision = State()


class AdminStates(StatesGroup):
    wait_for_admin_username = State()


# --- Клавиатуры ---
def get_auth_keyboard():
    button = KeyboardButton(text="🔐 Авторизоваться")
    return ReplyKeyboardMarkup(keyboard=[[button]], resize_keyboard=True)


def get_main_keyboard(is_admin: bool = False):
    button1 = KeyboardButton(text="📅 Проверить встречу")
    button2 = KeyboardButton(text="📊 Статистика преподавателя")
    keyboard = [[button1], [button2]]
    if is_admin:
        button3 = KeyboardButton(text="📋 Запросы кураторов (Responses)")
        button4 = KeyboardButton(text="👑 Управление пользователями")
        keyboard.append([button3])
        keyboard.append([button4])
    return ReplyKeyboardMarkup(keyboard=keyboard, resize_keyboard=True)


async def get_user_main_keyboard(user_id: int = 0):
    is_adm = False
    if user_id:
        is_adm = await database.is_admin(telegram_id=user_id)
    return get_main_keyboard(is_admin=is_adm)


def get_meet_inline_keyboard():
    buttons = [
        [
            InlineKeyboardButton(text="✅ Подтвердить", callback_data="meet_confirm"),
            InlineKeyboardButton(text="❌ Отменить", callback_data="meet_cancel")
        ]
    ]
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def get_recheck_inline_keyboard():
    buttons = [
        [
            InlineKeyboardButton(text="🔄 Запросить повторную проверку ИИ", callback_data="recheck_confirm")
        ],
        [
            InlineKeyboardButton(text="❌ Отклонить повторную проверку", callback_data="recheck_cancel")
        ]
    ]
    return InlineKeyboardMarkup(inline_keyboard=buttons)


async def get_teachers_inline_keyboard():
    teachers = await database.get_teachers()
    buttons = []
    for idx, teacher_name in enumerate(teachers):
        buttons.append([
            InlineKeyboardButton(text=f"👤 {teacher_name}", callback_data=f"teacher_sel:{idx}")
        ])
    buttons.append([
        InlineKeyboardButton(text="➕ Добавить нового", callback_data="teacher_add_new")
    ])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


async def get_stats_teachers_inline_keyboard():
    teachers = await database.get_teachers()
    buttons = []
    for idx, teacher_name in enumerate(teachers):
        buttons.append([
            InlineKeyboardButton(text=f"👤 {teacher_name}", callback_data=f"stats_teacher:{idx}")
        ])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def get_info_inline_keyboard():
    buttons = [
        [
            InlineKeyboardButton(text="✅ Подтвердить", callback_data="info_confirm")
        ],
        [
            InlineKeyboardButton(text="✏️ Изменить преподавателя", callback_data="info_edit_teacher"),
            InlineKeyboardButton(text="💬 Доп. информация", callback_data="info_edit_additional")
        ],
        [
            InlineKeyboardButton(text="❌ Отменить", callback_data="meet_cancel")
        ]
    ]
    return InlineKeyboardMarkup(inline_keyboard=buttons)


async def send_confirmation_panel(chat_id: int, state: FSMContext):
    await state.set_state(MeetStates.wait_for_info_confirmation)
    user_data = await state.get_data()
    teacher = user_data.get("saved_teacher", "Не указан")
    info = user_data.get("saved_info", "")
    info_display = info if info and info.strip() != "-" else "Не указана"

    text = (
        f"📋 <b>Проверьте данные перед отправкой на проверку ИИ:</b>\n\n"
        f"👤 <b>Преподаватель:</b> {html.escape(teacher)}\n"
        f"💬 <b>Доп. информация:</b> {html.escape(info_display)}\n\n"
        f"Подтвердите отправку на проверку ИИ или внесите изменения:"
    )
    await bot.send_message(chat_id, text, reply_markup=get_info_inline_keyboard(), parse_mode="HTML")


# --- Блок Администратора ---
async def get_del_users_inline_keyboard():
    allowed = await database.get_allowed_users()
    authorized = await database.get_authorized_users()
    admins = await database.get_admins()

    inline_keyboard = []

    if allowed:
        for u in allowed:
            is_adm = u.lower() in admins
            prefix = "👑 (Админ)" if is_adm else "📝"
            inline_keyboard.append([
                InlineKeyboardButton(
                    text=f"{prefix} @{u}",
                    callback_data=f"del_allowed:{u}"
                )
            ])

    if authorized:
        for telegram_id in authorized:
            inline_keyboard.append([
                InlineKeyboardButton(
                    text=f"🔑 ID: {telegram_id}",
                    callback_data=f"del_auth:{telegram_id}"
                )
            ])

    inline_keyboard.append([
        InlineKeyboardButton(text="❌ Отмена", callback_data="del_cancel")
    ])

    return InlineKeyboardMarkup(inline_keyboard=inline_keyboard), len(allowed), len(authorized)


@dp.message(Command("add_admin"))
async def cmd_add_admin(message: Message, state: FSMContext):
    await state.clear()
    user_id = message.from_user.id
    if not await database.is_admin(telegram_id=user_id):
        await message.answer("⚠️ У вас нет прав администратора.")
        return

    # Показываем список кураторов + кнопку ввода вручную
    curators = await database.get_curators()
    allowed_curators = curators.get("allowed", [])
    authorized_curators = curators.get("authorized", [])

    buttons = []
    for u in allowed_curators:
        buttons.append([InlineKeyboardButton(text=f"👤 @{u}", callback_data=f"promote_curator_usr:{u}")])

    for tid in authorized_curators:
        buttons.append([InlineKeyboardButton(text=f"🔑 ID: {tid}", callback_data=f"promote_curator_id:{tid}")])

    buttons.append([InlineKeyboardButton(text="➕ Администратор не из кураторов", callback_data="add_admin_custom")])
    buttons.append([InlineKeyboardButton(text="❌ Отмена", callback_data="del_cancel")])

    kb = InlineKeyboardMarkup(inline_keyboard=buttons)
    await message.answer(
        "Выберите куратора, которого хотите наделить правами администратора, или нажмите кнопку ниже, чтобы ввести юзернейм вручную:",
        reply_markup=kb
    )


@dp.callback_query(F.data.startswith("promote_curator_usr:"))
async def process_promote_curator_usr(callback: CallbackQuery):
    user_id = callback.from_user.id
    if not await database.is_admin(telegram_id=user_id):
        await callback.answer("⚠️ У вас нет прав администратора.", show_alert=True)
        return

    target_username = callback.data.split(":", 1)[1]
    await database.promote_to_admin(username=target_username)
    await callback.answer("Права администратора предоставлены!", show_alert=True)
    await callback.message.edit_text(
        f"✅ Пользователю `@{target_username}` успешно предоставлены права администратора!",
        parse_mode="Markdown"
    )


@dp.callback_query(F.data.startswith("promote_curator_id:"))
async def process_promote_curator_id(callback: CallbackQuery):
    user_id = callback.from_user.id
    if not await database.is_admin(telegram_id=user_id):
        await callback.answer("⚠️ У вас нет прав администратора.", show_alert=True)
        return

    target_id_str = callback.data.split(":", 1)[1]
    try:
        target_id = int(target_id_str)
        await database.promote_to_admin(telegram_id=target_id)
        await callback.answer("Права администратора предоставлены!", show_alert=True)
        await callback.message.edit_text(
            f"✅ Пользователю [ID: {target_id}](tg://user?id={target_id}) успешно предоставлены права администратора!",
            parse_mode="Markdown"
        )
    except ValueError:
        await callback.answer("Некорректный ID", show_alert=True)


@dp.callback_query(F.data == "add_admin_custom")
async def process_add_admin_custom(callback: CallbackQuery, state: FSMContext):
    user_id = callback.from_user.id
    if not await database.is_admin(telegram_id=user_id):
        await callback.answer("⚠️ У вас нет прав администратора.", show_alert=True)
        return

    await state.set_state(AdminStates.wait_for_admin_username)
    await callback.answer()
    await callback.message.edit_text(
        "Введите `username` человека, который будет администратором (например, `@username`):",
        parse_mode="Markdown"
    )


@dp.message(AdminStates.wait_for_admin_username)
async def process_admin_username_input(message: Message, state: FSMContext):
    target_username = message.text.strip().lstrip('@')
    if not target_username:
        await message.answer("⚠️ Укажите корректный юзернейм.")
        return

    success = await database.add_admin(target_username)
    await state.clear()
    kb = await get_user_main_keyboard(message.from_user.id)
    if success:
        await message.answer(
            f"✅ Пользователю `@{target_username}` успешно предоставлены права администратора!",
            reply_markup=kb,
            parse_mode="Markdown"
        )
    else:
        await message.answer("❌ Произошла ошибка при сохранении в базу данных.", reply_markup=kb)


@dp.message(Command("add"))
async def cmd_add_user(message: Message):
    user_id = message.from_user.id
    if not await database.is_admin(telegram_id=user_id):
        await message.answer("⚠️ У вас нет прав администратора.")
        return
    args = message.text.split(maxsplit=1)
    if len(args) < 2:
        await message.answer("⚠️ Использование команды: `/add username`", parse_mode="Markdown")
        return
    target_username = args[1].strip().lstrip('@')
    if not target_username:
        await message.answer("⚠️ Укажите корректный юзернейм.")
        return
    success = await database.add_allowed_user(target_username, role='curator')
    kb = await get_user_main_keyboard(user_id)
    if success:
        await message.answer(f"✅ Юзернейм `@{target_username}` успешно добавлен в белый список кураторов!", reply_markup=kb, parse_mode="Markdown")
    else:
        await message.answer("❌ Произошла ошибка при сохранении в базу данных.")


@dp.message(Command("del"))
async def cmd_del_user(message: Message):
    user_id = message.from_user.id
    if not await database.is_admin(telegram_id=user_id):
        await message.answer("⚠️ У вас нет прав администратора.")
        return

    kb, allowed_cnt, auth_cnt = await get_del_users_inline_keyboard()
    if allowed_cnt == 0 and auth_cnt == 0:
        main_kb = await get_user_main_keyboard(user_id)
        await message.answer("📋 Список пользователей в базе данных пуст.", reply_markup=main_kb)
        return

    await message.answer("Выберите пользователя для удаления из базы данных:", reply_markup=kb)


@dp.callback_query(F.data.startswith("del_allowed:"))
async def process_del_allowed(callback: CallbackQuery):
    user_id = callback.from_user.id
    if not await database.is_admin(telegram_id=user_id):
        await callback.answer("⚠️ У вас нет прав администратора.", show_alert=True)
        return

    target_username = callback.data.split(":", 1)[1]
    await database.delete_user(target_username)
    await callback.answer(f"Пользователь @{target_username} удален из базы данных!", show_alert=True)

    kb, allowed_cnt, auth_cnt = await get_del_users_inline_keyboard()
    if allowed_cnt == 0 and auth_cnt == 0:
        await callback.message.edit_text("📋 Все пользователи удалены из базы данных.")
    else:
        await callback.message.edit_reply_markup(reply_markup=kb)


@dp.callback_query(F.data.startswith("del_auth:"))
async def process_del_auth(callback: CallbackQuery):
    user_id = callback.from_user.id
    if not await database.is_admin(telegram_id=user_id):
        await callback.answer("⚠️ У вас нет прав администратора.", show_alert=True)
        return

    target_id_str = callback.data.split(":", 1)[1]
    try:
        target_id = int(target_id_str)
        await database.delete_authorized_user(target_id)
        await callback.answer(f"Пользователь ID {target_id} удален из авторизованных!", show_alert=True)
    except ValueError:
        await callback.answer("Некорректный ID", show_alert=True)

    kb, allowed_cnt, auth_cnt = await get_del_users_inline_keyboard()
    if allowed_cnt == 0 and auth_cnt == 0:
        await callback.message.edit_text("📋 Все пользователи удалены из базы данных.")
    else:
        await callback.message.edit_reply_markup(reply_markup=kb)


@dp.callback_query(F.data == "del_cancel")
async def process_del_cancel(callback: CallbackQuery, state: FSMContext):
    await state.clear()
    await callback.answer("Действие отменено.")
    await callback.message.delete()


@dp.message(StateFilter("*"), Command("list"))
@dp.message(StateFilter("*"), F.text == "👑 Управление пользователями")
async def cmd_list_users(message: Message, state: FSMContext = None):
    if state:
        await state.clear()
    user_id = message.from_user.id
    username = message.from_user.username
    if not await database.is_admin(telegram_id=user_id, username=username):
        await message.answer("⚠️ У вас нет прав администратора.")
        return

    admins = await database.get_admins()
    curators = await database.get_curators()
    allowed_curators = curators.get("allowed", [])
    authorized_curators = curators.get("authorized", [])

    admins_formatted = []
    for adm in admins:
        if adm["type"] == "username":
            admins_formatted.append(f"• @{html.escape(adm['value'])}")
        elif adm["type"] == "telegram_id":
            admins_formatted.append(f"• <a href='tg://user?id={adm['value']}'>ID: {adm['value']}</a>")

    admins_str = "\n".join(admins_formatted) if admins_formatted else "<i>(пусто)</i>"

    allowed_str = "\n".join([f"• @{html.escape(u)}" for u in allowed_curators]) if allowed_curators else "<i>(пусто)</i>"

    auth_formatted = []
    for tid in authorized_curators:
        auth_formatted.append(f"• <a href='tg://user?id={tid}'>ID: {tid}</a>")

    authorized_str = "\n".join(auth_formatted) if auth_formatted else "<i>(пусто)</i>"

    msg = (
        f"📋 <b>Управление доступом пользователей</b>\n\n"
        f"👑 <b>Администраторы ({len(admins_formatted)}):</b>\n"
        f"{admins_str}\n\n"
        f"📝 <b>Белый список кураторов (ожидают авторизации — {len(allowed_curators)}):</b>\n"
        f"{allowed_str}\n\n"
        f"🔑 <b>Авторизованные кураторы ({len(authorized_curators)}):</b>\n"
        f"{authorized_str}"
    )
    kb = await get_user_main_keyboard(user_id)
    await message.answer(msg, reply_markup=kb, parse_mode="HTML")


@dp.message(StateFilter("*"), Command("admin_responses"))
@dp.message(StateFilter("*"), Command("responses"))
@dp.message(StateFilter("*"), Command("admin_logs"))
@dp.message(StateFilter("*"), F.text == "📋 Запросы кураторов (Responses)")
@dp.message(StateFilter("*"), F.text == "📋 Запросы кураторов")
@dp.message(StateFilter("*"), F.text == "📋 Проверить куратора")
@dp.message(StateFilter("*"), F.text == "📋 Проверить кураторов")
@dp.message(StateFilter("*"), F.text == "📊 Статистика кураторов")
async def process_admin_responses_cmd(message: Message, state: FSMContext = None):
    if state:
        await state.clear()
    user_id = message.from_user.id
    username = message.from_user.username
    if not await database.is_admin(telegram_id=user_id, username=username):
        await message.answer("⚠️ Данная команда доступна только администраторам системы.")
        return

    token = await database.create_admin_responses_token(user_id)
    base_url = await get_app_base_url()
    admin_web_url = f"{base_url.rstrip('/')}/?admin_token={token}"

    link_kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🌐 Открыть реестр запросов кураторов (responses)", url=admin_web_url)]
    ])

    text = (
        "📋 <b>Реестр всех запросов кураторов (таблица responses)</b>\n\n"
        "Сгенерирована защищенная веб-ссылка для просмотра истории всех запросов кураторов.\n\n"
        f"🔗 <b>Интерактивная веб-ссылка:</b>\n{admin_web_url}\n\n"
        "⏱ <i>Ссылка действительна в течение 3 часов (доступны повторные переходы и обновление страницы).</i>"
    )

    kb = await get_user_main_keyboard(user_id)
    try:
        await message.answer(
            text,
            reply_markup=link_kb,
            parse_mode="HTML",
            link_preview_options=LinkPreviewOptions(is_disabled=True)
        )
    except Exception as e:
        logger.warning(f"Не удалось отправить inline-кнопку со ссылкой ({admin_web_url}): {e}")
        await message.answer(
            text,
            reply_markup=kb,
            parse_mode="HTML",
            link_preview_options=LinkPreviewOptions(is_disabled=True)
        )


# --- Блок Обычного Пользователя ---
@dp.message(Command("set_url"))
async def cmd_set_url(message: Message):
    user_id = message.from_user.id
    username = message.from_user.username
    if not await database.is_admin(telegram_id=user_id, username=username):
        await message.answer("⚠️ Данная команда доступна только администраторам системы.")
        return

    parts = message.text.split(maxsplit=1)
    if len(parts) < 2 or not parts[1].strip().startswith("http"):
        current_url = await get_app_base_url()
        await message.answer(
            f"🌐 <b>Текущий адрес веб-интерфейса:</b>\n<code>{current_url}</code>\n\n"
            "Чтобы изменить адрес (например, на публичную ссылку <code>ais-pre-...</code>), отправьте:\n"
            "<code>/set_url https://ais-pre-rf2evczqihqu6rg6vc4njk-714950613284.europe-west2.run.app</code>",
            parse_mode="HTML"
        )
        return

    new_url = parts[1].strip().rstrip("/")
    if "ais-dev-" in new_url:
        new_url = new_url.replace("ais-dev-", "ais-pre-")
    await database.set_setting("app_base_url", new_url)
    await message.answer(
        f"✅ <b>Базовый адрес веб-интерфейса успешно изменен!</b>\n\n"
        f"Новый адрес:\n<code>{new_url}</code>\n\n"
        f"Теперь все ссылки на статистику преподавателей и реестр запросов кураторов будут формироваться с этим адресом.",
        parse_mode="HTML"
    )


@dp.message(Command("get_url"))
async def cmd_get_url(message: Message):
    user_id = message.from_user.id
    username = message.from_user.username
    if not await database.is_admin(telegram_id=user_id, username=username):
        await message.answer("⚠️ Данная команда доступна только администраторам системы.")
        return

    current_url = await get_app_base_url()
    await message.answer(
        f"🌐 <b>Текущий базовый адрес веб-интерфейса:</b>\n<code>{current_url}</code>",
        parse_mode="HTML"
    )


@dp.message(CommandStart())
async def cmd_start(message: Message, state: FSMContext):
    await state.clear()
    user_id = message.from_user.id
    username = message.from_user.username
    is_authorized = await database.ensure_user_authorized(user_id, username)
    if is_authorized:
        kb = await get_user_main_keyboard(user_id)
        await message.answer(
            f"Привет, {message.from_user.full_name}! Вы авторизованы.\nНажмите кнопку ниже для работы с ботом.",
            reply_markup=kb
        )
    else:
        await message.answer(
            f"Привет, {message.from_user.full_name}! Нажми кнопку ниже для проверки доступа.",
            reply_markup=get_auth_keyboard()
        )


@dp.message(Command("cancel"))
async def cmd_cancel(message: Message, state: FSMContext):
    await state.clear()
    user_id = message.from_user.id
    username = message.from_user.username
    is_authorized = await database.ensure_user_authorized(user_id, username)
    if is_authorized:
        kb = await get_user_main_keyboard(user_id)
        await message.answer("Процесс отменен. Главное меню:", reply_markup=kb)
    else:
        await message.answer("Процесс отменен.", reply_markup=get_auth_keyboard())


@dp.message(F.text == "🔐 Авторизоваться")
async def process_authorization(message: Message):
    username = message.from_user.username
    user_id = message.from_user.id
    try:
        is_authorized = await database.ensure_user_authorized(user_id, username)
        if is_authorized:
            kb = await get_user_main_keyboard(user_id)
            await message.answer(
                "✅ Доступ разрешен! Вы успешно авторизованы.",
                reply_markup=kb
            )
        else:
            await message.answer(
                "Вас нет в базе данных. Обратитесь к администратору для добавления вас.",
                reply_markup=get_auth_keyboard()
            )
    except Exception as e:
        logging.error(f"Ошибка при обработке авторизации: {e}")
        await message.answer("❌ Произошла техническая ошибка при проверке доступа.")


@dp.message(StateFilter("*"), F.text == "📅 Проверить встречу")
async def check_meet_start(message: Message, state: FSMContext):
    await state.clear()
    user_id = message.from_user.id
    username = message.from_user.username
    is_authorized = await database.ensure_user_authorized(user_id, username)
    if not is_authorized:
        await message.answer("⚠️ Пожалуйста, сначала авторизуйтесь с помощью кнопки ниже.", reply_markup=get_auth_keyboard())
        return
    await state.set_state(MeetStates.wait_for_link)
    await message.answer("Отправьте ссылку на запись встречи (КТалк):", reply_markup=ReplyKeyboardRemove())


@dp.message(MeetStates.wait_for_link)
async def process_meet_link(message: Message, state: FSMContext):
    link = message.text.strip()

    # Если пользователь вместо ссылки нажал кнопку меню или команду
    if link.startswith("/") or link in {
        "📅 Проверить встречу", "📊 Статистика преподавателя",
        "📋 Запросы кураторов (Responses)", "📋 Запросы кураторов",
        "👑 Управление пользователями", "🔐 Авторизоваться"
    }:
        await state.clear()
        if "Запросы кураторов" in link or link in {"/admin_responses", "/responses", "/admin_logs"}:
            await process_admin_responses_cmd(message, state)
            return
        elif "Статистика преподавателя" in link:
            await process_teacher_stats_cmd(message, state)
            return
        elif "Управление пользователями" in link or link in {"/list"}:
            await cmd_list_users(message, state)
            return
        elif "Проверить встречу" in link:
            await check_meet_start(message, state)
            return

    # Проверка: проверялась ли лекция с такой ссылкой или кодом ранее
    existing = await database.get_existing_response(link)
    if existing:
        await state.update_data(
            saved_link=link,
            saved_teacher=existing.get("teacher", ""),
            saved_info=""
        )
        await state.set_state(MeetStates.wait_for_recheck_decision)

        point = existing.get("point", 0)
        is_critical = bool(existing.get("critical", False))
        comment = existing.get("comment", "")
        ex_teacher = existing.get("teacher", "")

        score_percent = existing.get("score_percent")
        if score_percent is None:
            score_percent = (max(0, 42 - point) / 42.0) * 100.0
        score_percent = round(float(score_percent), 2)

        teacher_text = f"👤 <b>Преподаватель:</b> {html.escape(ex_teacher)}\n" if ex_teacher else ""
        formatted_comment = ai_common.format_markdown_to_html(comment)

        result_text = (
            f"⚡️ <b>Данная лекция уже была проверена ранее!</b>\n"
            f"<i>(Результаты загружены из базы данных без повторного обращения к ИИ)</i>\n\n"
            f"{teacher_text}"
            f"🎯 <b>Итоговая оценка качества:</b> <code>{score_percent:.2f}%</code>\n"
            f"🔻 <b>Сумма штрафных баллов:</b> <code>{point}</code>\n"
            f"⚠️ <b>Критичный статус:</b> {'🚨 ДА' if is_critical else '✅ Нет'}\n\n"
            f"💬 <b>Результаты проверки из базы данных:</b>\n\n{formatted_comment}\n\n"
            f"❓ <b>Хотите отправить эту лекцию на повторную проверку ИИ?</b>"
        )
        await ai_common.send_long_message(bot, message.chat.id, result_text, parse_mode="HTML")
        await message.answer("Выберите действие:", reply_markup=get_recheck_inline_keyboard())
        return

    meet_available = await fetch_talk.is_meet_available(link, fetch_talk.get_api_key())
    if len(meet_available) != 0:
        await state.update_data(saved_link=link)

        info_text = (
            f"✅ **Встреча найдена!**\n\n"
            f"📌 **Название:** {meet_available.get('title', 'Без названия')}\n"
            f"👤 **Организатор:** {meet_available.get('name', '')} {meet_available.get('surname', '')} ({meet_available.get('login', '')})\n"
            f"📆 **Дата:** {meet_available.get('date', '')}\n\n"
            f"Подтвердите, что это нужная встреча:"
        )
        await message.answer(info_text, reply_markup=get_meet_inline_keyboard(), parse_mode="Markdown")
    else:
        await state.clear()
        await message.answer("❌ Встреча по данной ссылке не найдена или недоступна.", reply_markup=await get_user_main_keyboard(message.from_user.id))


# --- Обработка Повторной Проверки Лекции ---
@dp.callback_query(F.data == "recheck_confirm", MeetStates.wait_for_recheck_decision)
async def process_recheck_confirm(callback: CallbackQuery, state: FSMContext):
    await callback.answer()
    await callback.message.edit_reply_markup(reply_markup=None)

    await state.update_data(force_recheck=True)
    user_data = await state.get_data()
    link = user_data.get("saved_link")

    if not link:
        await state.clear()
        await callback.message.answer("⚠️ Ошибка: ссылка на встречу не найдена. Попробуйте отправить ссылку заново.", reply_markup=await get_user_main_keyboard(callback.from_user.id))
        return

    meet_available = await fetch_talk.is_meet_available(link, fetch_talk.get_api_key())
    if len(meet_available) != 0:
        info_text = (
            f"🔄 <b>Запуск повторной проверки встречи!</b>\n\n"
            f"📌 <b>Название:</b> {meet_available.get('title', 'Без названия')}\n"
            f"👤 <b>Организатор:</b> {meet_available.get('name', '')} {meet_available.get('surname', '')} ({meet_available.get('login', '')})\n"
            f"📆 <b>Дата:</b> {meet_available.get('date', '')}\n\n"
            f"Подтвердите запуск повторной проверки ИИ:"
        )
        await callback.message.answer(info_text, reply_markup=get_meet_inline_keyboard(), parse_mode="HTML")
    else:
        await state.clear()
        await callback.message.answer("❌ Встреча по данной ссылке недоступна в КТалк.", reply_markup=await get_user_main_keyboard(callback.from_user.id))


@dp.callback_query(F.data == "recheck_cancel", MeetStates.wait_for_recheck_decision)
async def process_recheck_cancel(callback: CallbackQuery, state: FSMContext):
    await callback.answer()
    await callback.message.edit_reply_markup(reply_markup=None)

    await state.clear()
    await callback.message.answer("❌ Повторная проверка отклонена.", reply_markup=await get_user_main_keyboard(callback.from_user.id))


# --- Обработка кнопок Первого этапа (Встреча) ---
@dp.callback_query(F.data == "meet_confirm")
async def process_confirm_meet(callback: CallbackQuery, state: FSMContext):
    await callback.answer()
    await callback.message.edit_reply_markup(reply_markup=None)

    await state.set_state(MeetStates.select_teacher)
    teachers_kb = await get_teachers_inline_keyboard()
    await callback.message.answer(
        "Выберите преподавателя из списка или добавьте нового:",
        reply_markup=teachers_kb
    )


@dp.callback_query(F.data == "meet_cancel")
async def process_cancel_meet(callback: CallbackQuery, state: FSMContext):
    await callback.answer()
    await callback.message.edit_reply_markup(reply_markup=None)

    await state.clear()
    await callback.message.answer("Процесс отменен. Возврат в главное меню.", reply_markup=await get_user_main_keyboard(callback.from_user.id))


# --- Обработка выбора/добавления преподавателя ---
@dp.callback_query(F.data.startswith("teacher_sel:"), MeetStates.select_teacher)
async def process_select_teacher(callback: CallbackQuery, state: FSMContext):
    await callback.answer()
    await callback.message.edit_reply_markup(reply_markup=None)

    idx_str = callback.data.split(":")[1]
    teachers = await database.get_teachers()
    selected_teacher = "Не указан"
    try:
        idx = int(idx_str)
        if 0 <= idx < len(teachers):
            selected_teacher = teachers[idx]
    except ValueError:
        pass

    await state.update_data(saved_teacher=selected_teacher)
    await send_confirmation_panel(callback.message.chat.id, state)


@dp.message(MeetStates.select_teacher)
async def process_typed_teacher_input(message: Message, state: FSMContext):
    teacher_name = message.text.strip()
    if not teacher_name:
        await message.answer("Пожалуйста, введите имя и фамилию преподавателя:")
        return

    await database.add_teacher(teacher_name)
    await state.update_data(saved_teacher=teacher_name)
    await send_confirmation_panel(message.chat.id, state)


@dp.callback_query(F.data == "teacher_add_new", MeetStates.select_teacher)
async def process_add_new_teacher_btn(callback: CallbackQuery, state: FSMContext):
    await callback.answer()
    await callback.message.edit_reply_markup(reply_markup=None)

    await state.set_state(MeetStates.wait_for_new_teacher)
    await callback.message.answer("Введите имя и фамилию преподавателя:")


@dp.message(MeetStates.wait_for_new_teacher)
async def process_new_teacher_input(message: Message, state: FSMContext):
    teacher_name = message.text.strip()
    if not teacher_name:
        await message.answer("Пожалуйста, введите имя и фамилию преподавателя:")
        return

    await database.add_teacher(teacher_name)
    await state.update_data(saved_teacher=teacher_name)
    await send_confirmation_panel(message.chat.id, state)


# --- Обработка Ввода Дополнительной Информации ---
@dp.callback_query(F.data == "info_edit_additional")
async def process_edit_additional_choice(callback: CallbackQuery, state: FSMContext):
    await callback.answer()
    await callback.message.edit_reply_markup(reply_markup=None)

    await state.set_state(MeetStates.wait_for_additional_information)
    await callback.message.answer("Введите дополнительную информацию о встрече (или '-' чтобы очистить):")


@dp.message(MeetStates.wait_for_additional_information)
async def process_additional_information(message: Message, state: FSMContext):
    text = message.text.strip()
    if text == "-":
        text = ""
    await state.update_data(saved_info=text)
    await send_confirmation_panel(message.chat.id, state)


@dp.callback_query(F.data.in_({"info_edit", "info_edit_teacher"}))
async def process_edit_teacher_choice(callback: CallbackQuery, state: FSMContext):
    await callback.answer()
    await callback.message.edit_reply_markup(reply_markup=None)

    await state.set_state(MeetStates.select_teacher)
    teachers_kb = await get_teachers_inline_keyboard()
    await callback.message.answer(
        "Выберите преподавателя из списка или введите имя прямо в чат:",
        reply_markup=teachers_kb
    )


# --- Обработка кнопок Второго этапа (Подтверждение текста) ---
@dp.callback_query(F.data == "info_confirm", MeetStates.wait_for_info_confirmation)
async def process_confirm_info_data(callback: CallbackQuery, state: FSMContext):
    await callback.answer()
    await callback.message.edit_reply_markup(reply_markup=None)

    user_data = await state.get_data()
    link = user_data.get("saved_link")
    teacher = user_data.get("saved_teacher", "")
    additional_info = user_data.get("saved_info")
    force_recheck = user_data.get("force_recheck", False)
    tg_id = callback.from_user.id

    # Проверка на случай если лекция уже была проверена (если не затребован принудительный повтор)
    if not force_recheck:
        existing = await database.get_existing_response(link)
        if existing:
            await state.update_data(
                saved_link=link,
                saved_teacher=existing.get("teacher", ""),
                saved_info=""
            )
            await state.set_state(MeetStates.wait_for_recheck_decision)

            point = existing.get("point", 0)
            is_critical = bool(existing.get("critical", False))
            comment = existing.get("comment", "")
            ex_teacher = existing.get("teacher", "")

            score_percent = existing.get("score_percent")
            if score_percent is None:
                score_percent = (max(0, 42 - point) / 42.0) * 100.0
            score_percent = round(float(score_percent), 2)

            teacher_text = f"👤 <b>Преподаватель:</b> {html.escape(ex_teacher)}\n" if ex_teacher else ""
            formatted_comment = ai_common.format_markdown_to_html(comment)

            result_text = (
                f"⚡️ <b>Данная лекция уже была проверена ранее!</b>\n"
                f"<i>(Результаты загружены из базы данных без повторного обращения к ИИ)</i>\n\n"
                f"{teacher_text}"
                f"🎯 <b>Итоговая оценка качества:</b> <code>{score_percent:.2f}%</code>\n"
                f"🔻 <b>Сумма штрафных баллов:</b> <code>{point}</code>\n"
                f"⚠️ <b>Критичный статус:</b> {'🚨 ДА' if is_critical else '✅ Нет'}\n\n"
                f"💬 <b>Результаты проверки из базы данных:</b>\n\n{formatted_comment}\n\n"
                f"❓ <b>Хотите отправить эту лекцию на повторную проверку ИИ?</b>"
            )
            await ai_common.send_long_message(bot, callback.message.chat.id, result_text, parse_mode="HTML")
            await callback.message.answer("Выберите действие:", reply_markup=get_recheck_inline_keyboard())
            return

    response_id = None
    try:
        response_id = await database.write_response(
            tg_id=tg_id,
            link=link,
            additional_info=additional_info,
            teacher=teacher
        )
        logging.info(f"Запись сохранена в БД. ID: {response_id}, Преподаватель: {teacher}")

        # Проверяем режим обработки:
        # Если бот работает на зарубежном сервере (REMOTE_PROCESSOR_MODE=true или USE_REMOTE_PROCESSOR=true),
        # он НЕ скачивает и НЕ обрабатывает видео сам. Он делегирует эту задачу Российскому воркеру.
        use_russian_worker = os.getenv("REMOTE_PROCESSOR_MODE", "true").lower() in ("true", "1", "yes", "on")

        if use_russian_worker:
            await callback.message.answer(
                f"📥 <b>Заявка на проверку #{response_id} зарегистрирована!</b>\n\n"
                f"👤 <b>Преподаватель:</b> {html.escape(teacher)}\n"
                f"🇷🇺 <b>Локация обработки:</b> Российский сервер аналитики\n"
                f"⏳ Скачивание лекции с КТалк, извлечение аудио и анализ через <b>Сбер GigaChat-2-Pro</b> "
                f"выполняются на сервере в РФ.\n\n"
                f"Как только экспертный анализ будет готов, вы получите полный отчет в этом чате.",
                parse_mode="HTML"
            )
            await callback.message.answer("Вы можете продолжать работу с ботом.", reply_markup=await get_user_main_keyboard(callback.from_user.id))
            return

        status_msg = await callback.message.answer("⏳ Скачиваем видеозапись и текстовые материалы с КТалк...")

        artifacts = await fetch_talk.download_all_artifacts_by_url(link, fetch_talk.get_api_key())
        if not artifacts or not artifacts.get("video"):
            await status_msg.edit_text(
                "❌ Не удалось скачать видеозапись с сервера. Попробуйте еще раз позже.",
            )
            await database.write_result(response_id, 0, True, "Ошибка скачивания видеозаписи с КТалк.")
            await callback.message.answer("Возврат в главное меню.", reply_markup=await get_user_main_keyboard(callback.from_user.id))
            return

        await status_msg.edit_text("🚀 Обработка медиафайлов и отправка в ИИ-сервис...")

        job_name = await ai.process(artifacts, additional_info, bot=bot, tg_id=tg_id, db_id=response_id)
        await database.write_job_name(response_id, job_name)

        await status_msg.edit_text(
            f"✅ <b>Материалы успешно отправлены на проверку ИИ!</b>\n\n"
            f"👤 <b>Преподаватель:</b> {html.escape(teacher)}\n"
            f"🆔 <b>ID задачи:</b> <code>{html.escape(job_name)}</code>\n"
            f"⏳ Задача выполняется в фоновом режиме.\n"
            f"Как только экспертный анализ будет завершен, вы получите результаты в этом чате.",
            parse_mode="HTML"
        )
        await callback.message.answer("Вы можете продолжать работу с ботом.", reply_markup=await get_user_main_keyboard(callback.from_user.id))

        # Очищаем исходные тяжелые файлы с диска
        await file_processing.delete_files([
            artifacts.get("video"),
            artifacts.get("audio"),
            artifacts.get("transcript"),
            artifacts.get("summary")
        ])

    except Exception as e:
        logging.error(f"Ошибка при запуске анализа встречи: {e}", exc_info=True)
        if response_id is not None:
            await database.write_result(response_id, 0, True, f"Ошибка при инициализации задачи: {e}")
        await callback.message.answer("❌ Произошла ошибка при отправке видео на проверку ИИ.", reply_markup=await get_user_main_keyboard(callback.from_user.id))
    finally:
        await state.clear()


# --- Статистика преподавателя ---
@dp.message(StateFilter("*"), F.text == "📊 Статистика преподавателя")
async def process_teacher_stats_cmd(message: Message, state: FSMContext = None):
    if state:
        await state.clear()
    user_id = message.from_user.id
    username = message.from_user.username
    is_authorized = await database.ensure_user_authorized(user_id, username)
    if not is_authorized:
        await message.answer(
            "У вас нет доступа к боту. Нажмите кнопку ниже для проверки доступа.",
            reply_markup=get_auth_keyboard()
        )
        return

    teachers = await database.get_teachers()
    if not teachers:
        await message.answer("📋 В базе данных пока нет сохраненных преподавателей.", reply_markup=await get_user_main_keyboard(user_id))
        return

    kb = await get_stats_teachers_inline_keyboard()
    await message.answer("Выберите преподавателя для просмотра статистики:", reply_markup=kb)


@dp.callback_query(F.data.startswith("stats_teacher:"))
async def process_select_stats_teacher(callback: CallbackQuery):
    await callback.answer()
    idx_str = callback.data.split(":")[1]
    teachers = await database.get_teachers()
    try:
        idx = int(idx_str)
        if 0 <= idx < len(teachers):
            teacher_name = teachers[idx]
        else:
            await callback.message.answer("Преподаватель не найден.")
            return
    except ValueError:
        await callback.message.answer("Некорректные данные.")
        return

    responses = await database.get_responses_by_teacher(teacher_name)
    if not responses:
        await callback.message.answer(
            f"📊 <b>Статистика преподавателя: {html.escape(teacher_name)}</b>\n\n"
            f"По данному преподавателю пока нет проверенных встреч.",
            parse_mode="HTML"
        )
        return

    total_count = len(responses)
    points = [r["point"] for r in responses if r.get("point") is not None and r.get("point") >= 0]
    avg_point = sum(points) / len(points) if points else 0.0
    critical_count = sum(1 for r in responses if r.get("critical"))

    token = await database.create_stats_token(teacher_name, callback.from_user.id)
    base_url = await get_app_base_url()
    stats_web_url = f"{base_url.rstrip('/')}/?token={token}"

    link_kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🌐 Открыть веб-отчет со статистикой", url=stats_web_url)]
    ])

    header = (
        f"📊 <b>Статистика преподавателя: {html.escape(teacher_name)}</b>\n\n"
        f"👥 <b>Всего проверенных встреч:</b> {total_count}\n"
        f"⭐️ <b>Средний штрафной балл:</b> {avg_point:.1f}\n"
        f"⚠️ <b>Критических нарушений:</b> {critical_count}\n\n"
        f"🔗 <b>Интерактивная веб-ссылка на отчет:</b>\n"
        f"{stats_web_url}\n\n"
        f"⏱ <i>Ссылка действительна в течение 3 часов (доступны повторные переходы и обновление страницы).</i>"
    )

    try:
        await callback.message.answer(
            header,
            reply_markup=link_kb,
            parse_mode="HTML",
            link_preview_options=LinkPreviewOptions(is_disabled=True)
        )
    except Exception as e:
        logger.warning(f"Не удалось отправить inline-кнопку со статистикой ({stats_web_url}): {e}")
        await callback.message.answer(
            header,
            parse_mode="HTML",
            link_preview_options=LinkPreviewOptions(is_disabled=True)
        )

    for i, resp in enumerate(responses, 1):
        link = resp.get("link", "Не указана")
        add_info = resp.get("additional_info", "—")
        point = resp.get("point", "—")
        is_crit = resp.get("critical", False)
        comment = resp.get("comment", "—")

        text = (
            f"<b>Встреча #{i}</b>\n"
            f"🔗 <b>Ссылка:</b> {link}\n"
            f"💬 <b>Доп. инфо:</b> {add_info}\n"
            f"⭐️ <b>Балл:</b> <code>{point}</code>\n"
            f"⚠️ <b>Крит. нарушения:</b> {'🚨 ДА' if is_crit else '✅ Нет'}\n\n"
            f"📝 <b>Результат проверки:</b>\n{comment}"
        )

        if len(text) > 4000:
            for chunk_start in range(0, len(text), 4000):
                await callback.message.answer(text[chunk_start:chunk_start+4000], parse_mode="HTML")
        else:
            await callback.message.answer(text, parse_mode="HTML")


@dp.message(default_state)
async def fallback_handler(message: Message):
    user_id = message.from_user.id
    username = message.from_user.username
    is_authorized = await database.ensure_user_authorized(user_id, username)
    if is_authorized:
        kb = await get_user_main_keyboard(user_id)
        await message.answer(
            "Для работы воспользуйтесь меню ниже 👇",
            reply_markup=kb
        )
    else:
        await message.answer(
            "Для работы с ботом необходимо авторизоваться 👇",
            reply_markup=get_auth_keyboard()
        )


async def heartbeat_loop():
    while True:
        try:
            await asyncio.sleep(60)
            logger.info("❤️ [Heartbeat] Telegram бот активен и ожидает новые встречи...")
        except asyncio.CancelledError:
            break
        except Exception:
            pass


@dp.startup()
async def on_startup(dispatcher: Dispatcher, bot: Bot):
    use_russian_worker = os.getenv("REMOTE_PROCESSOR_MODE", "true").lower() in ("true", "1", "yes", "on")
    if not use_russian_worker:
        asyncio.create_task(ai.check_batch_jobs_loop(bot))
    asyncio.create_task(heartbeat_loop())
    logging.info(f"Telegram-бот успешно запущен (режим обработки в РФ: {use_russian_worker}).")


# --- Основной цикл запуска ---
async def main():
    await database.init_db()
    try:
        while True:
            try:
                logger.info("Сброс вебхука и запуск Telegram polling...")
                await bot.delete_webhook(drop_pending_updates=True)
                await dp.start_polling(bot, handle_signals=False)
            except (asyncio.CancelledError, KeyboardInterrupt):
                logger.info("Получен сигнал завершения работы бота.")
                break
            except Exception as e:
                logger.error(f"Сбой polling цикла Telegram бота: {e}. Переподключение через 3 секунды...")
                await asyncio.sleep(3)
    finally:
        logger.info("Завершение работы и закрытие соединений...")
        await database.close_db()
        await bot.session.close()


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Бот остановлен.")
