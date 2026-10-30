import os
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Флаг режима тестирования:
# false (по умолчанию) - ПРОДАКШЕН: все тестовые костыли, заглушки и моки ОТКЛЮЧЕНЫ.
# true - ТЕСТИРОВАНИЕ: разрешает выполнение тестовых костылей, заглушек и отладочных задержек.
TESTING_MODE = os.getenv("TESTING_MODE", "false").lower() in ("true", "1", "yes", "on")

def is_testing_mode() -> bool:
    """Возвращает True, если приложение запущено в режиме тестирования (TESTING_MODE=true)."""
    return os.getenv("TESTING_MODE", "false").lower() in ("true", "1", "yes", "on")
