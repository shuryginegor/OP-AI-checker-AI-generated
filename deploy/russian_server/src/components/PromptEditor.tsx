import React, { useState, useEffect } from 'react';
import {
  Shield,
  Key,
  Lock,
  Send,
  Save,
  RotateCcw,
  Sparkles,
  History,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  Info,
  LogOut,
  RefreshCw,
  Copy,
  Check,
  Cpu,
  Clock,
  User,
  Sliders
} from 'lucide-react';

interface AuditLog {
  id: number;
  timestamp: number;
  username: string;
  telegram_id: number | null;
  action: string;
  ip_address: string | null;
  details: string | null;
}

interface PromptData {
  active: string;
  base: string;
  factory: string;
  audit_logs: AuditLog[];
}

export const PromptEditor: React.FC = () => {
  // Состояние авторизации
  const [sessionToken, setSessionToken] = useState<string>(() => {
    return sessionStorage.getItem('prompt_session_token') || '';
  });
  const [sessionUser, setSessionUser] = useState<string>(() => {
    return sessionStorage.getItem('prompt_session_user') || '';
  });

  // Состояние формы логина
  const [loginUsername, setLoginUsername] = useState<string>('');
  const [loginCode, setLoginCode] = useState<string>('');
  const [isCodeSent, setIsCodeSent] = useState<boolean>(false);
  const [isLoadingLogin, setIsLoadingLogin] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string>('');
  const [loginSuccessMessage, setLoginSuccessMessage] = useState<string>('');
  const [codeTimer, setCodeTimer] = useState<number>(0);

  // Состояние данных промптов
  const [promptData, setPromptData] = useState<PromptData | null>(null);
  const [activePromptText, setActivePromptText] = useState<string>('');
  const [basePromptText, setBasePromptText] = useState<string>('');
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [activeSubTab, setActiveSubTab] = useState<'editor' | 'base' | 'factory' | 'audit'>('editor');

  // Состояние модального окна подтверждения сохранения/сброса (2FA)
  const [modalAction, setModalAction] = useState<string | null>(null);
  const [modalCode, setModalCode] = useState<string>('');
  const [isRequestingSaveCode, setIsRequestingSaveCode] = useState<boolean>(false);
  const [isConfirmingSave, setIsConfirmingSave] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string>('');

  // Таймер повторной отправки кода
  useEffect(() => {
    if (codeTimer <= 0) return;
    const interval = setInterval(() => {
      setCodeTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [codeTimer]);

  // Загрузка данных при наличии токена
  useEffect(() => {
    if (sessionToken) {
      loadPromptData();
    }
  }, [sessionToken]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4500);
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 2000);
  };

  // 1. Запрос кода для входа в Telegram
  const handleRequestLoginCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginSuccessMessage('');
    const clean = loginUsername.trim().replace(/^@/, '');
    if (!clean) {
      setLoginError('Введите ваш Telegram Username.');
      return;
    }

    setIsLoadingLogin(true);
    try {
      const res = await fetch('/api/prompt/request-login-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: clean })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setLoginError(data.message || 'Ошибка запроса кода авторизации.');
        return;
      }
      setIsCodeSent(true);
      setLoginSuccessMessage(data.message || 'Код авторизации отправлен в ваш Telegram!');
      setCodeTimer(60);
    } catch (err: any) {
      setLoginError(err.message || 'Ошибка подключения к серверу.');
    } finally {
      setIsLoadingLogin(false);
    }
  };

  // 2. Проверка кода авторизации
  const handleVerifyLoginCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (!loginCode.trim()) {
      setLoginError('Введите 6-значный код подтверждения.');
      return;
    }

    setIsLoadingLogin(true);
    try {
      const res = await fetch('/api/prompt/verify-login-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginUsername.trim().replace(/^@/, ''),
          code: loginCode.trim()
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setLoginError(data.message || 'Неверный или просроченный код.');
        return;
      }

      setSessionToken(data.session_token);
      setSessionUser(data.username);
      sessionStorage.setItem('prompt_session_token', data.session_token);
      sessionStorage.setItem('prompt_session_user', data.username);
      setIsCodeSent(false);
      setLoginCode('');
      showToast('Авторизация успешна! Добро пожаловать в редактор промпта.');
    } catch (err: any) {
      setLoginError(err.message || 'Ошибка проверки кода.');
    } finally {
      setIsLoadingLogin(false);
    }
  };

  // Выход из системы
  const handleLogout = () => {
    setSessionToken('');
    setSessionUser('');
    sessionStorage.removeItem('prompt_session_token');
    sessionStorage.removeItem('prompt_session_user');
    setPromptData(null);
  };

  // Загрузка промптов с сервера
  const loadPromptData = async () => {
    setIsLoadingData(true);
    try {
      const res = await fetch('/api/prompt/data', {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      const data = await res.json();
      if (res.status === 401) {
        handleLogout();
        setLoginError('Сессия истекла. Пожалуйста, выполните вход заново.');
        return;
      }
      if (data.success) {
        setPromptData(data);
        setActivePromptText(data.active || '');
        setBasePromptText(data.base || '');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingData(false);
    }
  };

  // Открытие модального окна для действия и отправка 2FA-кода в Telegram
  const startModalAction = async (action: string) => {
    setModalAction(action);
    setModalCode('');
    setModalError('');
    setIsRequestingSaveCode(true);

    try {
      const res = await fetch('/api/prompt/request-save-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setModalError(data.message || 'Ошибка отправки кода подтверждения.');
        return;
      }
    } catch (err: any) {
      setModalError(err.message || 'Ошибка подключения к серверу.');
    } finally {
      setIsRequestingSaveCode(false);
    }
  };

  // Подтверждение сохранения с кодом
  const handleConfirmSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalCode.trim()) {
      setModalError('Введите 6-значный код из Telegram.');
      return;
    }
    if (!modalAction) return;

    setIsConfirmingSave(true);
    setModalError('');

    let promptPayload = activePromptText;
    if (modalAction === 'save_base') {
      promptPayload = activePromptText; // или basePromptText
    }

    try {
      const res = await fetch('/api/prompt/confirm-save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`
        },
        body: JSON.stringify({
          code: modalCode.trim(),
          action: modalAction,
          prompt_text: promptPayload
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setModalError(data.message || 'Неверный код или ошибка сохранения.');
        return;
      }

      setPromptData((prev) =>
        prev
          ? {
              ...prev,
              active: data.active,
              base: data.base,
              audit_logs: data.audit_logs || prev.audit_logs
            }
          : null
      );
      setActivePromptText(data.active);
      setBasePromptText(data.base);
      setModalAction(null);
      setModalCode('');
      showToast(data.message || 'Изменения успешно применены!');
    } catch (err: any) {
      setModalError(err.message || 'Ошибка сохранения.');
    } finally {
      setIsConfirmingSave(false);
    }
  };

  const getActionTitle = (action: string | null) => {
    switch (action) {
      case 'save_active':
        return 'Сохранение нового рабочего промпта ИИ';
      case 'save_base':
        return 'Фиксация нового базового эталона промпта';
      case 'reset_to_base':
        return 'Сброс к сохраненному базовому эталону';
      case 'reset_to_factory':
        return 'Сброс к заводскому промпту разработчика';
      default:
        return 'Изменение промпта';
    }
  };

  // ==========================================
  // РЕНДЕР: ЕСЛИ НЕ АВТОРИЗОВАН (ЭКРАН ВХОДА)
  // ==========================================
  if (!sessionToken) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4 animate-fade-in">
        <div className="bg-[#1B153B] border border-indigo-700/50 rounded-3xl p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex p-3 rounded-2xl bg-gradient-to-br from-[#FF5252]/20 to-indigo-600/20 border border-[#FF5252]/30 mb-2">
              <Lock className="w-8 h-8 text-[#FF5252]" />
            </div>
            <h2 className="text-2xl font-black text-white">Редактор промпта ИИ</h2>
            <p className="text-xs text-indigo-200/70 max-w-sm mx-auto">
              Защищенная панель управления системным промптом методиста. Вход осуществляется через двухфакторный код в Telegram.
            </p>
          </div>

          {loginError && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="text-xs text-red-200 space-y-1">
                <p className="font-semibold">Доступ ограничен</p>
                <p>{loginError}</p>
              </div>
            </div>
          )}

          {loginSuccessMessage && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-200">{loginSuccessMessage}</p>
            </div>
          )}

          {!isCodeSent ? (
            <form onSubmit={handleRequestLoginCode} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-indigo-200 flex items-center justify-between">
                  <span>Ваш Telegram Username</span>
                  <span className="text-[10px] text-indigo-400">из переменной PROMPT_ADMIN_USERNAMES</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-400 font-bold">@</span>
                  <input
                    type="text"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    placeholder="shurygin_egor"
                    disabled={isLoadingLogin}
                    className="w-full pl-8 pr-4 py-3 bg-[#110D27] border border-indigo-700/60 rounded-xl text-white text-sm focus:outline-none focus:border-[#FF5252] transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoadingLogin || !loginUsername.trim()}
                className="w-full py-3.5 bg-gradient-to-r from-[#FF5252] to-[#FF7043] hover:from-[#E04848] hover:to-[#F4511E] text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                {isLoadingLogin ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Отправка кода...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Получить код в Telegram</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyLoginCode} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-800/40 text-xs text-indigo-300 flex items-center justify-between">
                <span>
                  Пользователь: <b className="text-white">@{loginUsername.trim().replace(/^@/, '')}</b>
                </span>
                <button
                  type="button"
                  onClick={() => setIsCodeSent(false)}
                  className="text-[#38BDF8] hover:underline cursor-pointer"
                >
                  Изменить
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-indigo-200">
                  Одноразовый 6-значный код из Telegram
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={loginCode}
                  onChange={(e) => setLoginCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  autoFocus
                  disabled={isLoadingLogin}
                  className="w-full text-center tracking-[0.5em] font-mono text-xl py-3 bg-[#110D27] border border-indigo-700/60 rounded-xl text-white focus:outline-none focus:border-[#38BDF8] transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={isLoadingLogin || loginCode.length < 6}
                className="w-full py-3.5 bg-gradient-to-r from-[#38BDF8] to-indigo-600 hover:from-[#0EA5E9] hover:to-indigo-700 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                {isLoadingLogin ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Проверка...</span>
                  </>
                ) : (
                  <>
                    <Key className="w-4 h-4" />
                    <span>Войти в редактор</span>
                  </>
                )}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  disabled={codeTimer > 0 || isLoadingLogin}
                  onClick={handleRequestLoginCode}
                  className="text-xs text-indigo-400 hover:text-indigo-200 disabled:opacity-50 cursor-pointer"
                >
                  {codeTimer > 0 ? `Запросить повторно через ${codeTimer} сек` : 'Отправить код еще раз'}
                </button>
              </div>
            </form>
          )}

          <div className="border-t border-indigo-900/50 pt-4 flex items-center gap-2 text-[11px] text-indigo-400">
            <Info className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>Если бот не присылает сообщение, убедитесь, что вы отправили боту команду <code>/start</code>.</span>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // РЕНДЕР: АВТОРИЗОВАННЫЙ ЭКРАН РЕДАКТОРА
  // ==========================================
  const activeLength = activePromptText.length;
  const activeWords = activePromptText.trim() ? activePromptText.trim().split(/\s+/).length : 0;
  const activeLines = activePromptText ? activePromptText.split('\n').length : 0;
  const hasChanges = promptData && activePromptText !== promptData.active;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 border border-emerald-400/40 animate-bounce">
          <CheckCircle2 className="w-5 h-5" />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="bg-gradient-to-r from-[#2B2363] via-[#3A2E80] to-[#1F1A44] border border-indigo-500/30 rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xl">
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-[11px] font-bold tracking-wide flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              2FA Сессия активна
            </span>
            <span className="px-3 py-1 bg-indigo-900/60 text-indigo-200 border border-indigo-700/40 rounded-full text-[11px] font-semibold flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#38BDF8]" />
              @{sessionUser}
            </span>
            {hasChanges && (
              <span className="px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full text-[11px] font-bold animate-pulse">
                Есть несохраненные изменения
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-3">
            <Sparkles className="w-7 h-7 text-[#FF5252]" />
            Редактор системного промпта нейросети
          </h1>
          <p className="text-xs sm:text-sm text-indigo-200/80 max-w-2xl">
            Управляйте текстом инструкций, шкалами штрафных баллов и требованиями методиста. Все изменения подтверждаются через код в Telegram и логируются в аудите БД.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={loadPromptData}
            disabled={isLoadingData}
            title="Обновить данные с сервера"
            className="p-3 bg-[#1B153B] hover:bg-[#251E4E] border border-indigo-700/50 rounded-xl text-indigo-200 hover:text-white transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingData ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleLogout}
            className="px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Выйти
          </button>
        </div>
      </div>

      {/* Sub Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-indigo-900/60 pb-1 overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('editor')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'editor'
              ? 'bg-[#FF5252] text-white shadow-lg shadow-[#FF5252]/20'
              : 'bg-[#1B153B] text-indigo-300 hover:text-white border border-indigo-800/40'
          }`}
        >
          <FileCode className="w-4 h-4" />
          Рабочий промпт (Активный)
        </button>

        <button
          onClick={() => setActiveSubTab('base')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'base'
              ? 'bg-[#38BDF8] text-[#110D27] shadow-lg shadow-[#38BDF8]/20 font-black'
              : 'bg-[#1B153B] text-indigo-300 hover:text-white border border-indigo-800/40'
          }`}
        >
          <Sliders className="w-4 h-4" />
          Базовый эталон
        </button>

        <button
          onClick={() => setActiveSubTab('factory')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'factory'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
              : 'bg-[#1B153B] text-indigo-300 hover:text-white border border-indigo-800/40'
          }`}
        >
          <Cpu className="w-4 h-4" />
          Заводской шаблон (Резерв)
        </button>

        <button
          onClick={() => setActiveSubTab('audit')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'audit'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
              : 'bg-[#1B153B] text-indigo-300 hover:text-white border border-indigo-800/40'
          }`}
        >
          <History className="w-4 h-4" />
          Журнал аудита ({promptData?.audit_logs?.length || 0})
        </button>
      </div>

      {/* ======================================================== */}
      {/* SUB-TAB 1: РЕДАКТОР РАБОЧЕГО ПРОМПТА                     */}
      {/* ======================================================== */}
      {activeSubTab === 'editor' && (
        <div className="space-y-4">
          {/* Top Actions & Variables Cheatsheet */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4 text-xs text-indigo-300">
                <span>Символов: <b className="text-white font-mono">{activeLength.toLocaleString()}</b></span>
                <span>Слов: <b className="text-white font-mono">{activeWords.toLocaleString()}</b></span>
                <span>Строк: <b className="text-white font-mono">{activeLines}</b></span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-indigo-400">
                <Info className="w-3.5 h-3.5 text-[#38BDF8]" />
                <span>Теги подстановки:</span>
                <code
                  onClick={() => handleCopy('{additional_info}', 'tag1')}
                  className="bg-[#110D27] px-2 py-0.5 rounded text-amber-300 border border-indigo-800 cursor-pointer hover:border-amber-400"
                  title="Нажмите чтобы скопировать"
                >
                  {copiedKey === 'tag1' ? 'Скопировано!' : '{additional_info}'}
                </code>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={() => startModalAction('save_active')}
                disabled={!activePromptText.trim()}
                className="flex-1 py-3 px-4 bg-gradient-to-r from-[#FF5252] to-[#FF7043] hover:from-[#E04848] hover:to-[#F4511E] text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 text-xs cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                Сохранить в ИИ
              </button>
            </div>
          </div>

          {/* Prompt Textarea */}
          <div className="bg-[#110D27] border border-indigo-700/50 rounded-2xl p-4 shadow-2xl relative">
            <textarea
              value={activePromptText}
              onChange={(e) => setActivePromptText(e.target.value)}
              rows={24}
              placeholder="Введите системный промпт нейросети..."
              className="w-full bg-transparent text-indigo-100 font-mono text-xs sm:text-sm leading-relaxed focus:outline-none resize-y selection:bg-[#FF5252]/40"
            />
          </div>

          {/* Bottom Toolbar with Reset / Fix as Base */}
          <div className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => startModalAction('save_base')}
                className="px-4 py-2.5 bg-[#38BDF8]/20 hover:bg-[#38BDF8]/30 border border-[#38BDF8]/40 text-[#38BDF8] rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
                title="Зафиксировать текущий текст как новый базовый эталон"
              >
                <Check className="w-3.5 h-3.5" />
                Зафиксировать как новый базовый эталон
              </button>

              <button
                type="button"
                onClick={() => startModalAction('reset_to_base')}
                className="px-4 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                title="Сбросить текущий текст к сохраненному базовому состоянию"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Сбросить к базовому состоянию
              </button>

              <button
                type="button"
                onClick={() => startModalAction('reset_to_factory')}
                className="px-4 py-2.5 bg-indigo-900/40 hover:bg-indigo-900/60 border border-indigo-700/40 text-indigo-300 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                title="Вернуть исходный заводской шаблон разработчика"
              >
                <Cpu className="w-3.5 h-3.5" />
                Сбросить к заводскому шаблону
              </button>
            </div>

            <div className="text-[11px] text-indigo-400 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span>Каждое действие требует код из Telegram</span>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SUB-TAB 2: БАЗОВЫЙ ЭТАЛОН                                */}
      {/* ======================================================== */}
      {activeSubTab === 'base' && (
        <div className="space-y-4">
          <div className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#38BDF8]" />
                Текущий сохраненный базовый эталон
              </h3>
              <p className="text-xs text-indigo-300">
                Это резервная базовая версия, к которой можно в любой момент откатить активный промпт, если эксперимент окажется неудачным.
              </p>
            </div>
            <button
              onClick={() => {
                setActivePromptText(promptData?.base || '');
                setActiveSubTab('editor');
                showToast('Базовый эталон скопирован в редактор!');
              }}
              className="px-4 py-2 bg-[#38BDF8] text-[#110D27] font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer hover:bg-[#0EA5E9]"
            >
              <Copy className="w-3.5 h-3.5" />
              Загрузить в редактор
            </button>
          </div>

          <div className="bg-[#110D27] border border-indigo-800/50 rounded-2xl p-4">
            <pre className="text-xs font-mono text-indigo-200 whitespace-pre-wrap max-h-[600px] overflow-y-auto leading-relaxed">
              {promptData?.base || 'Базовый эталон не найден (используется заводской)'}
            </pre>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SUB-TAB 3: ЗАВОДСКОЙ ШАБЛОН РАЗРАБОТЧИКА                */}
      {/* ======================================================== */}
      {activeSubTab === 'factory' && (
        <div className="space-y-4">
          <div className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-indigo-400" />
                Исходный заводской промпт разработчика
              </h3>
              <p className="text-xs text-indigo-300">
                Эталонный шаблон из репозитория со всеми 21 стандартными и 8 критическими критериями и правилами штрафов.
              </p>
            </div>
            <button
              onClick={() => {
                setActivePromptText(promptData?.factory || '');
                setActiveSubTab('editor');
                showToast('Заводской шаблон скопирован в редактор!');
              }}
              className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer hover:bg-indigo-700"
            >
              <Copy className="w-3.5 h-3.5" />
              Загрузить в редактор
            </button>
          </div>

          <div className="bg-[#110D27] border border-indigo-800/50 rounded-2xl p-4">
            <pre className="text-xs font-mono text-indigo-300 whitespace-pre-wrap max-h-[600px] overflow-y-auto leading-relaxed">
              {promptData?.factory || 'Загрузка...'}
            </pre>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SUB-TAB 4: ЖУРНАЛ АУДИТА И КОНТРОЛЯ В БД                 */}
      {/* ======================================================== */}
      {activeSubTab === 'audit' && (
        <div className="space-y-4">
          <div className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-1">
              <History className="w-4 h-4 text-emerald-400" />
              Журнал аудита и действий в базе данных
            </h3>
            <p className="text-xs text-indigo-300">
              Таблица <code>prompt_audit_log</code> фиксирует каждый запрос кода, авторизацию, изменение промпта, сбросы и IP-адреса.
            </p>
          </div>

          <div className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#110D27] text-indigo-300 border-b border-indigo-900/60">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Время (МСК)</th>
                    <th className="py-3 px-4 font-semibold">Администратор</th>
                    <th className="py-3 px-4 font-semibold">Действие</th>
                    <th className="py-3 px-4 font-semibold">IP-адрес</th>
                    <th className="py-3 px-4 font-semibold">Подробности</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-indigo-900/40 text-indigo-200">
                  {promptData?.audit_logs && promptData.audit_logs.length > 0 ? (
                    promptData.audit_logs.map((log) => {
                      const dateStr = new Date(log.timestamp * 1000).toLocaleString('ru-RU', {
                        timeZone: 'Europe/Moscow',
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      });

                      const isSave = log.action.includes('save') || log.action.includes('reset');
                      const isSuccess = log.action.includes('success');
                      const isFail = log.action.includes('fail') || log.action.includes('rejected');

                      return (
                        <tr key={log.id} className="hover:bg-indigo-950/30 transition-colors">
                          <td className="py-3 px-4 font-mono text-indigo-300 whitespace-nowrap">
                            <span className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-indigo-400" />
                              {dateStr}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-semibold text-white whitespace-nowrap">
                            @{log.username}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isSave
                                  ? 'bg-[#FF5252]/20 text-[#FF5252] border border-[#FF5252]/30'
                                  : isSuccess
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : isFail
                                  ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                  : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                              }`}
                            >
                              {log.action}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-indigo-400 whitespace-nowrap">
                            {log.ip_address || '—'}
                          </td>
                          <td className="py-3 px-4 text-indigo-300 max-w-md truncate">
                            {log.details || '—'}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-indigo-400">
                        Записей в журнале аудита пока нет.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* МОДАЛЬНОЕ ОКНО 2FA-ПОДТВЕРЖДЕНИЯ СОХРАНЕНИЯ В TELEGRAM   */}
      {/* ======================================================== */}
      {modalAction && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#1B153B] border border-indigo-600 rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl space-y-6 relative">
            <div className="text-center space-y-2">
              <div className="inline-flex p-3 rounded-2xl bg-amber-500/20 border border-amber-500/30 mb-2">
                <Key className="w-8 h-8 text-amber-400" />
              </div>
              <h3 className="text-xl font-black text-white">Подтверждение через Telegram</h3>
              <p className="text-xs text-indigo-200">
                Действие: <b className="text-amber-300">{getActionTitle(modalAction)}</b>
              </p>
            </div>

            {modalError && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <div className="p-3.5 rounded-xl bg-[#110D27] border border-indigo-800 text-xs text-indigo-300 space-y-1">
              <p>
                Код подтверждения отправлен администратору <b>@{sessionUser}</b> в Telegram-бот.
              </p>
              <p className="text-[11px] text-indigo-400">Код действителен 5 минут.</p>
            </div>

            <form onSubmit={handleConfirmSave} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-indigo-200">
                  Введите 6-значный код подтверждения
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={modalCode}
                  onChange={(e) => setModalCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  autoFocus
                  disabled={isConfirmingSave || isRequestingSaveCode}
                  className="w-full text-center tracking-[0.5em] font-mono text-2xl py-3 bg-[#110D27] border border-indigo-700 rounded-xl text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalAction(null)}
                  disabled={isConfirmingSave}
                  className="flex-1 py-3 bg-indigo-900/40 hover:bg-indigo-900/60 border border-indigo-700/50 text-indigo-300 font-semibold rounded-xl text-xs cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isConfirmingSave || modalCode.length < 6}
                  className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-[#FF5252] hover:from-amber-600 hover:to-[#E04848] text-white font-bold rounded-xl text-xs shadow-lg flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isConfirmingSave ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Применение...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Подтвердить</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
