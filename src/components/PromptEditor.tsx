import React, { useState, useEffect } from 'react';
import {
  Shield,
  Key,
  Lock,
  Save,
  RotateCcw,
  Sparkles,
  History,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  Info,
  RefreshCw,
  Copy,
  Check,
  Cpu,
  Clock,
  User,
  Sliders,
  Send
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

interface PromptEditorProps {
  token?: string;
  userEmail?: string;
  isSeniorCurator?: boolean;
}

export const PromptEditor: React.FC<PromptEditorProps> = ({
  token: propToken,
  userEmail: propEmail,
  isSeniorCurator = false
}) => {
  const sessionToken = propToken || sessionStorage.getItem('prompt_session_token') || '';
  const sessionUser = propEmail || sessionStorage.getItem('prompt_session_user') || '';

  // Состояние данных промптов
  const [promptData, setPromptData] = useState<PromptData | null>(null);
  const [activePromptText, setActivePromptText] = useState<string>('');
  const [basePromptText, setBasePromptText] = useState<string>('');
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string>('');
  const [activeSubTab, setActiveSubTab] = useState<'editor' | 'base' | 'factory' | 'audit'>('editor');

  // Состояние модального окна подтверждения сохранения/сброса (2FA через Email)
  const [modalAction, setModalAction] = useState<string | null>(null);
  const [modalCode, setModalCode] = useState<string>('');
  const [isRequestingSaveCode, setIsRequestingSaveCode] = useState<boolean>(false);
  const [isConfirmingSave, setIsConfirmingSave] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string>('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4500);
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 2000);
  };

  // Загрузка данных промпта
  const loadPromptData = async () => {
    if (!sessionToken || !isSeniorCurator) return;
    setIsLoadingData(true);
    setLoadError('');

    try {
      const res = await fetch('/api/prompt/data', {
        headers: {
          Authorization: `Bearer ${sessionToken}`
        }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setLoadError(data.message || 'Ошибка загрузки системного промпта.');
        return;
      }
      setPromptData(data);
      setActivePromptText(data.active || '');
      setBasePromptText(data.base || '');
    } catch (err: any) {
      setLoadError(err.message || 'Сбой подключения к серверу.');
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    if (sessionToken && isSeniorCurator) {
      loadPromptData();
    }
  }, [sessionToken, isSeniorCurator]);

  // Запрос кода подтверждения для сохранения
  const handleOpenActionModal = async (action: string) => {
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
        body: JSON.stringify({
          action,
          prompt_text: action === 'save_active' ? activePromptText : (action === 'save_base' ? basePromptText : undefined)
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setModalError(data.message || 'Не удалось отправить код подтверждения на ваш email.');
        return;
      }
    } catch (err: any) {
      setModalError(err.message || 'Ошибка связи с сервером.');
    } finally {
      setIsRequestingSaveCode(false);
    }
  };

  // Подтверждение сохранения промпта кодом
  const handleConfirmSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalCode.trim()) {
      setModalError('Введите 6-значный код подтверждения.');
      return;
    }

    setIsConfirmingSave(true);
    setModalError('');

    try {
      const promptToSave = modalAction === 'save_active' ? activePromptText : (modalAction === 'save_base' ? basePromptText : undefined);

      const res = await fetch('/api/prompt/confirm-save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`
        },
        body: JSON.stringify({
          code: modalCode.trim(),
          action: modalAction,
          prompt_text: promptToSave
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setModalError(data.message || 'Ошибка подтверждения сохранения.');
        return;
      }

      showToast(data.message || 'Системный промпт нейросети успешно обновлен!');
      setModalAction(null);
      setModalCode('');
      await loadPromptData();
    } catch (err: any) {
      setModalError(err.message || 'Сбой подключения к серверу.');
    } finally {
      setIsConfirmingSave(false);
    }
  };

  // Если у пользователя нет прав старшего куратора
  if (!isSeniorCurator) {
    return (
      <div className="bg-[#1B153B] border border-amber-500/30 rounded-3xl p-8 text-center space-y-4 max-w-2xl mx-auto shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
          <Shield className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white">Доступ ограничен: ТОЛЬКО ДЛЯ СТАРШИХ КУРАТОРОВ</h2>
        <p className="text-sm text-indigo-200/80 leading-relaxed">
          Редактирование системного промпта нейросети и калибровка 21 педагогического критерия доступны исключительно старшим методистам и руководителям.
        </p>
        <div className="pt-2">
          <span className="text-xs text-amber-300 font-mono bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/20">
            Текущая роль: Обычный куратор
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-emerald-400/30 animate-fade-in text-sm font-semibold">
          <CheckCircle2 className="w-5 h-5 text-white" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Верхний баннер */}
      <div className="bg-gradient-to-r from-[#241E4F] via-[#2B2363] to-[#1F1A44] border border-amber-500/30 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-1.5 text-center md:text-left">
          <div className="flex items-center gap-2 justify-center md:justify-start">
            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full tracking-wider flex items-center gap-1.5">
              <Shield className="w-3 h-3 text-amber-400" />
              Только для старших кураторов
            </span>
            <span className="text-xs text-indigo-200/80">Калибровка нейросети GigaChat-2-Pro</span>
          </div>
          <h2 className="text-xl font-black text-white">
            Редактор системного промпта и критериев оценки
          </h2>
          <p className="text-xs text-indigo-200/70 max-w-2xl">
            Изменения вступают в силу немедленно для всех последующих проверок видеозаписей КТалк. Каждое сохранение подтверждается 2FA-кодом на вашу почту.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={loadPromptData}
            disabled={isLoadingData}
            className="p-2.5 bg-[#14102C] border border-indigo-700/50 hover:border-indigo-500 text-indigo-200 hover:text-white rounded-xl text-xs transition-colors"
            title="Обновить данные с сервера"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingData ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loadError && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-xs text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {/* Вкладки редактора */}
      <div className="bg-[#1B153B] border border-indigo-800/50 rounded-3xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-indigo-900/50 pb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveSubTab('editor')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeSubTab === 'editor'
                  ? 'bg-[#FF5252] text-white shadow-lg shadow-[#FF5252]/20'
                  : 'bg-[#14102C] text-indigo-300 hover:text-white'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              Рабочий промпт (Активный)
            </button>
            <button
              onClick={() => setActiveSubTab('base')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeSubTab === 'base'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                  : 'bg-[#14102C] text-indigo-300 hover:text-white'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              Базовый эталон
            </button>
            <button
              onClick={() => setActiveSubTab('factory')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeSubTab === 'factory'
                  ? 'bg-slate-700 text-white'
                  : 'bg-[#14102C] text-indigo-300 hover:text-white'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Заводской промпт
            </button>
          </div>

          <div className="flex items-center gap-2">
            {activeSubTab === 'editor' && (
              <button
                onClick={() => handleOpenActionModal('save_active')}
                className="px-4 py-2 bg-[#FF5252] hover:bg-[#ff3b3b] text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-[#FF5252]/30"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Сохранить рабочий промпт (2FA)</span>
              </button>
            )}
            {activeSubTab === 'base' && (
              <button
                onClick={() => handleOpenActionModal('save_base')}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Зафиксировать новый эталон</span>
              </button>
            )}
          </div>
        </div>

        {/* Рабочий редактор */}
        {activeSubTab === 'editor' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-indigo-300">
              <span>Системная инструкция, отправляемая в Сбер GigaChat-2-Pro перед анализом:</span>
              <button
                onClick={() => handleCopy(activePromptText, 'active')}
                className="hover:text-white flex items-center gap-1 font-mono"
              >
                {copiedKey === 'active' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Скопировать весь текст</span>
              </button>
            </div>
            <textarea
              value={activePromptText}
              onChange={(e) => setActivePromptText(e.target.value)}
              rows={22}
              className="w-full bg-[#120E27] border border-indigo-900/80 rounded-2xl p-4 text-xs font-mono text-slate-100 focus:outline-none focus:border-[#FF5252] transition-colors resize-y leading-relaxed"
              placeholder="Загрузка текста системного промпта..."
            />
          </div>
        )}

        {/* Базовый эталон */}
        {activeSubTab === 'base' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-indigo-300">
              <span>Зафиксированный методический эталон для быстрого восстановления:</span>
              <button
                onClick={() => handleCopy(basePromptText, 'base')}
                className="hover:text-white flex items-center gap-1 font-mono"
              >
                {copiedKey === 'base' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Скопировать</span>
              </button>
            </div>
            <textarea
              value={basePromptText}
              onChange={(e) => setBasePromptText(e.target.value)}
              rows={22}
              className="w-full bg-[#120E27] border border-indigo-900/80 rounded-2xl p-4 text-xs font-mono text-slate-100 focus:outline-none focus:border-indigo-500 transition-colors resize-y leading-relaxed"
            />
          </div>
        )}

        {/* Заводской промпт */}
        {activeSubTab === 'factory' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-indigo-300">
              <span>Вшитый в исходный код заводской промпт разработчика:</span>
              <button
                onClick={() => handleCopy(promptData?.factory || '', 'factory')}
                className="hover:text-white flex items-center gap-1 font-mono"
              >
                {copiedKey === 'factory' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Скопировать</span>
              </button>
            </div>
            <textarea
              value={promptData?.factory || 'Заводской промпт встроен в модуль criteria.py'}
              readOnly
              rows={22}
              className="w-full bg-[#120E27]/50 border border-indigo-900/40 rounded-2xl p-4 text-xs font-mono text-slate-400 focus:outline-none resize-y leading-relaxed"
            />
          </div>
        )}
      </div>

      {/* Модальное окно 2FA подтверждения сохранения */}
      {modalAction && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1B153B] border border-indigo-700/60 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">2FA-подтверждение сохранения</h3>
                <p className="text-[11px] text-indigo-300">
                  Одноразовый код отправлен на вашу почту: <strong>{sessionUser}</strong>
                </p>
              </div>
            </div>


            {modalError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmSave} className="space-y-4">
              <div>
                <label className="block text-xs text-indigo-200 mb-1 font-medium">
                  Введите 6-значный код подтверждения:
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={modalCode}
                  onChange={(e) => setModalCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full bg-[#14102C] border border-indigo-700/60 rounded-xl px-4 py-3 text-center text-xl font-mono tracking-[0.3em] text-white focus:outline-none focus:border-[#FF5252]"
                  autoFocus
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalAction(null)}
                  className="flex-1 py-2.5 bg-[#14102C] hover:bg-[#201A47] text-indigo-300 hover:text-white rounded-xl text-xs font-semibold transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isConfirmingSave || modalCode.length !== 6}
                  className="flex-1 py-2.5 bg-[#FF5252] hover:bg-[#ff3b3b] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-[#FF5252]/30 flex items-center justify-center gap-2"
                >
                  {isConfirmingSave ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>Подтвердить</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
