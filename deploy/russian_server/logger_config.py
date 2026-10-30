import os
import sys
import logging
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# По умолчанию ставим уровень DEBUG для детальной отладки и тестирования
LOG_LEVEL_STR = os.getenv("LOG_LEVEL", "DEBUG").upper().strip()
LOG_LEVEL = getattr(logging, LOG_LEVEL_STR, logging.DEBUG)

# Высокоточный формат логов с миллисекундами, уровнем, именем модуля, функцией и номером строки
LOG_FORMAT = "%(asctime)s.%(msecs)03d | %(levelname)-7s | [%(name)s:%(funcName)s:%(lineno)d] - %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


def setup_logging(level=None):
    """
    Инициализирует единую систему логирования проекта.
    Позволяет гибко регулировать уровень вывода через переменную окружения LOG_LEVEL.
    """
    target_level = level or LOG_LEVEL

    # Настройка корневого логгера (вывод в консоль + сохранение в файл /tmp/bot.log)
    handlers = [logging.StreamHandler(sys.stdout)]
    try:
        from logging.handlers import RotatingFileHandler
        handlers.append(RotatingFileHandler("/tmp/bot.log", maxBytes=10*1024*1024, backupCount=2, encoding="utf-8"))
    except Exception:
        pass

    logging.basicConfig(
        level=target_level,
        format=LOG_FORMAT,
        datefmt=DATE_FORMAT,
        handlers=handlers,
        force=True  # Переопределяет предыдущие базовые конфигурации
    )

    # Приглушаем чрезмерно шумные системные библиотеки при общем DEBUG уровне,
    # чтобы видеть точные отладочные логи нашей бизнес-логики
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("aiogram.event").setLevel(logging.INFO)
    logging.getLogger("asyncio").setLevel(logging.INFO)

    root_logger = logging.getLogger()
    root_logger.setLevel(target_level)
    return root_logger


# Инициализируем логирование при импорте модуля
setup_logging()
