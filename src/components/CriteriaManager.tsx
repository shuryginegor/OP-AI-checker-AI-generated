import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Plus,
  Trash2,
  Edit3,
  Search,
  Check,
  X,
  AlertTriangle,
  Lock,
  Mail,
  Loader2,
  Sliders,
  Sparkles,
  Layers,
  Save,
  RotateCcw,
  CheckCircle2,
  Key,
  Info
} from 'lucide-react';

export interface StandardCriterion {
  id: number;
  text: string;
  category: string;
}

export interface CriticalCriterion {
  id: number;
  title: string;
  desc: string;
}

interface CriteriaManagerProps {
  authToken: string;
  currentUserEmail: string;
  onConfigUpdated?: () => void;
}

const CATEGORY_OPTIONS = [
  'Педагогика',
  'Подготовка',
  'Структура',
  'Тайм-менеджмент',
  'Вовлеченность',
  'Эмпатия',
  'Психологический климат',
  'Дифференциация',
  'Методика',
  'Глубина',
  'Техническое качество',
  'Визуал',
  'Безопасность',
  'Другое'
];

export const CriteriaManager: React.FC<CriteriaManagerProps> = ({
  authToken,
  currentUserEmail,
  onConfigUpdated
}) => {
  // Исходные (сохраненные в БД) списки
  const [savedStandard, setSavedStandard] = useState<StandardCriterion[]>([]);
  const [savedCritical, setSavedCritical] = useState<CriticalCriterion[]>([]);

  // Драфт-версии (редактируемые)
  const [draftStandard, setDraftStandard] = useState<StandardCriterion[]>([]);
  const [draftCritical, setDraftCritical] = useState<CriticalCriterion[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Навигация и фильтры внутри менеджера
  const [activeSubTab, setActiveSubTab] = useState<'standard' | 'critical'>('standard');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Состояние создания/редактирования Стандартного критерия
  const [isEditingStandard, setIsEditingStandard] = useState<boolean>(false);
  const [editingStandardId, setEditingStandardId] = useState<number | null>(null);
  const [stdCategoryInput, setStdCategoryInput] = useState<string>('Педагогика');
  const [stdCustomCategoryInput, setStdCustomCategoryInput] = useState<string>('');
  const [stdTextInput, setStdTextInput] = useState<string>('');

  // Состояние создания/редактирования Критического критерия
  const [isEditingCritical, setIsEditingCritical] = useState<boolean>(false);
  const [editingCriticalId, setEditingCriticalId] = useState<number | null>(null);
  const [critTitleInput, setCritTitleInput] = useState<string>('');
  const [critDescInput, setCritDescInput] = useState<string>('');

  // Модальное окно подтверждения 2FA OTP
  const [showOtpModal, setShowOtpModal] = useState<boolean>(false);
  const [otpCode, setOtpCode] = useState<string>('');
  const [isRequestingOtp, setIsRequestingOtp] = useState<boolean>(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState<boolean>(false);
  const [otpError, setOtpError] = useState<string>('');
  const [otpMessage, setOtpMessage] = useState<string>('');

  // Загрузка конфигурации из БД
  const fetchCriteriaConfig = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/criteria/config', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const data = await res.json();
      if (data.success) {
        setSavedStandard(data.standardCriteria || []);
        setSavedCritical(data.criticalCriteria || []);
        setDraftStandard(JSON.parse(JSON.stringify(data.standardCriteria || [])));
        setDraftCritical(JSON.parse(JSON.stringify(data.criticalCriteria || [])));
      } else {
        setError(data.message || 'Ошибка загрузки конфигурации критериев');
      }
    } catch (err) {
      setError('Ошибка соединения с сервером');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCriteriaConfig();
  }, [authToken]);

  // Проверка наличя несохраненных изменений
  const hasChanges =
    JSON.stringify(savedStandard) !== JSON.stringify(draftStandard) ||
    JSON.stringify(savedCritical) !== JSON.stringify(draftCritical);

  // Сброс драфта
  const handleResetDraft = () => {
    setDraftStandard(JSON.parse(JSON.stringify(savedStandard)));
    setDraftCritical(JSON.parse(JSON.stringify(savedCritical)));
    setIsEditingStandard(false);
    setIsEditingCritical(false);
    setError('');
    setSuccessMsg('Черновик сброшен к последней сохраненной версии в БД.');
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  // --- Операции со Стандартными критериями ---
  const handleOpenAddStandard = () => {
    setEditingStandardId(null);
    setStdCategoryInput('Педагогика');
    setStdCustomCategoryInput('');
    setStdTextInput('');
    setIsEditingStandard(true);
  };

  const handleOpenEditStandard = (item: StandardCriterion) => {
    setEditingStandardId(item.id);
    if (CATEGORY_OPTIONS.includes(item.category)) {
      setStdCategoryInput(item.category);
      setStdCustomCategoryInput('');
    } else {
      setStdCategoryInput('Другое');
      setStdCustomCategoryInput(item.category);
    }
    setStdTextInput(item.text);
    setIsEditingStandard(true);
  };

  const handleSaveStandardItem = (e: React.FormEvent) => {
    e.preventDefault();
    const finalCategory =
      stdCategoryInput === 'Другое'
        ? stdCustomCategoryInput.trim() || 'Разное'
        : stdCategoryInput;
    const finalText = stdTextInput.trim();

    if (!finalText) {
      setError('Укажите текст критерия.');
      return;
    }

    if (editingStandardId !== null) {
      // Редактирование
      setDraftStandard((prev) =>
        prev.map((c) =>
          c.id === editingStandardId
            ? { ...c, category: finalCategory, text: finalText }
            : c
        )
      );
    } else {
      // Создание нового
      const maxId = draftStandard.reduce((m, item) => Math.max(m, item.id), 0);
      const newCriterion: StandardCriterion = {
        id: maxId + 1,
        category: finalCategory,
        text: finalText
      };
      setDraftStandard((prev) => [...prev, newCriterion]);
    }

    setIsEditingStandard(false);
    setError('');
  };

  const handleDeleteStandard = (id: number) => {
    if (
      window.confirm(
        `Вы уверены, что хотите удалить стандартный критерий №${id}?`
      )
    ) {
      setDraftStandard((prev) => prev.filter((item) => item.id !== id));
    }
  };

  // --- Операции с Критическими критериями ---
  const handleOpenAddCritical = () => {
    setEditingCriticalId(null);
    setCritTitleInput('');
    setCritDescInput('');
    setIsEditingCritical(true);
  };

  const handleOpenEditCritical = (item: CriticalCriterion) => {
    setEditingCriticalId(item.id);
    setCritTitleInput(item.title);
    setCritDescInput(item.desc);
    setIsEditingCritical(true);
  };

  const handleSaveCriticalItem = (e: React.FormEvent) => {
    e.preventDefault();
    const title = critTitleInput.trim();
    const desc = critDescInput.trim();

    if (!title || !desc) {
      setError('Заполните название и описание критического критерия.');
      return;
    }

    if (editingCriticalId !== null) {
      setDraftCritical((prev) =>
        prev.map((c) =>
          c.id === editingCriticalId ? { ...c, title, desc } : c
        )
      );
    } else {
      const maxId = draftCritical.reduce((m, item) => Math.max(m, item.id), 0);
      const newCrit: CriticalCriterion = {
        id: maxId + 1,
        title,
        desc
      };
      setDraftCritical((prev) => [...prev, newCrit]);
    }

    setIsEditingCritical(false);
    setError('');
  };

  const handleDeleteCritical = (id: number) => {
    if (
      window.confirm(
        `Вы уверены, что хотите удалить критический критерий №${id}?`
      )
    ) {
      setDraftCritical((prev) => prev.filter((item) => item.id !== id));
    }
  };

  // --- 2FA OTP Этапы Сохранения ---
  const handleStartSaveProcess = async () => {
    if (draftStandard.length === 0) {
      setError('В списке должен быть хотя бы один стандартный критерий.');
      return;
    }

    setIsRequestingOtp(true);
    setOtpError('');
    setOtpMessage('');
    setShowOtpModal(true);

    try {
      const res = await fetch('/api/criteria/request-save-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          standardCount: draftStandard.length,
          criticalCount: draftCritical.length
        })
      });

      const data = await res.json();
      if (data.success) {
        setOtpMessage(
          data.message || `Код 2FA успешно отправлен на ${currentUserEmail}`
        );
      } else {
        setOtpError(data.message || 'Ошибка отправки 2FA-кода');
      }
    } catch (err) {
      setOtpError('Ошибка связи с сервером при запросе 2FA-кода');
    } finally {
      setIsRequestingOtp(false);
    }
  };

  const handleConfirmSaveWithOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.trim().length !== 6) {
      setOtpError('Введите 6-значный цифровой код подтверждения.');
      return;
    }

    setIsVerifyingOtp(true);
    setOtpError('');

    try {
      const res = await fetch('/api/criteria/confirm-save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          code: otpCode.trim(),
          standardCriteria: draftStandard,
          criticalCriteria: draftCritical
        })
      });

      const data = await res.json();
      if (data.success) {
        setSavedStandard(JSON.parse(JSON.stringify(draftStandard)));
        setSavedCritical(JSON.parse(JSON.stringify(draftCritical)));
        setShowOtpModal(false);
        setOtpCode('');
        setSuccessMsg(data.message || 'Критерии успешно сохранены в БД!');
        if (onConfigUpdated) onConfigUpdated();
      } else {
        setOtpError(data.message || 'Неверный код 2FA подтверждения');
      }
    } catch (err) {
      setOtpError(' Ошибка сохранения данных на сервере');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Вычисление категорий
  const allCategories = Array.from(
    new Set(draftStandard.map((c) => c.category))
  );

  const filteredStandard = draftStandard.filter((item) => {
    const matchesCategory =
      selectedCategory === 'all' || item.category === selectedCategory;
    const matchesSearch =
      !searchQuery.trim() ||
      item.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const filteredCritical = draftCritical.filter((item) => {
    return (
      !searchQuery.trim() ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.desc.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-4">
        <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
        <p className="text-sm font-medium text-indigo-300">
          Загрузка конфигурации критериев из базы данных...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Шапка раздела */}
      <div className="bg-[#1B153B]/90 border border-indigo-500/30 rounded-2xl p-6 shadow-xl relative overflow-hidden backdrop-blur-md">
        <div className="absolute -right-12 -top-12 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="bg-[#FF5252]/15 text-[#FF5252] border border-[#FF5252]/30 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> ТОЛЬКО ДЛЯ СТАРШИХ КУРАТОРОВ
              </span>
              <span className="text-xs text-indigo-300 bg-indigo-950/60 border border-indigo-500/20 px-3 py-1 rounded-full font-medium">
                Динамическое масштабирование шкалы
              </span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-wide flex items-center gap-3">
              <Sliders className="w-7 h-7 text-[#FF5252]" />
              Управление критериями методического аудита
            </h1>
            <p className="text-sm text-indigo-200/80 mt-1 max-w-2xl">
              Настраивайте состав и формулировки стандартных и критических
              критериев. Количество критериев, максимальный балл (N × 5) и
              промпты нейросети динамически пересчитываются. Сохранение
              требует подтверждения кодом 2FA.
            </p>
          </div>

          {/* Плашка статуса и кнопки сохранения */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {hasChanges && (
              <button
                type="button"
                onClick={handleResetDraft}
                className="px-4 py-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-600/50 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Сбросить
              </button>
            )}

            <button
              type="button"
              onClick={handleStartSaveProcess}
              disabled={!hasChanges}
              className={`px-6 py-3 rounded-xl font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2.5 shadow-lg ${
                hasChanges
                  ? 'bg-gradient-to-r from-[#FF5252] to-[#FF7B7B] text-white hover:opacity-95 shadow-[#FF5252]/25 animate-pulse'
                  : 'bg-indigo-950/40 border border-indigo-800/40 text-indigo-400 cursor-not-allowed opacity-60'
              }`}
            >
              <Save className="w-4 h-4" />
              {hasChanges
                ? 'Сохранить изменения (2FA)'
                : 'Сохранено в БД'}
            </button>
          </div>
        </div>

        {/* Информационные плашки счетчиков */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-indigo-500/20">
          <div className="bg-indigo-950/50 border border-indigo-500/20 rounded-xl p-3.5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/15 flex items-center justify-center text-indigo-400 font-bold shrink-0">
              {draftStandard.length}
            </div>
            <div>
              <div className="text-xs text-indigo-300 font-medium">
                Стандартных критериев
              </div>
              <div className="text-sm font-bold text-white">
                {draftStandard.length} вопросов
              </div>
            </div>
          </div>

          <div className="bg-indigo-950/50 border border-indigo-500/20 rounded-xl p-3.5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/15 flex items-center justify-center text-red-400 font-bold shrink-0">
              {draftCritical.length}
            </div>
            <div>
              <div className="text-xs text-indigo-300 font-medium">
                Критический контроль
              </div>
              <div className="text-sm font-bold text-white">
                {draftCritical.length} нарушений
              </div>
            </div>
          </div>

          <div className="bg-indigo-950/50 border border-indigo-500/20 rounded-xl p-3.5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-400 font-bold shrink-0">
              {draftStandard.length * 5}
            </div>
            <div>
              <div className="text-xs text-indigo-300 font-medium">
                Максимальный балл
              </div>
              <div className="text-sm font-bold text-white">
                {draftStandard.length * 5} очков (100%)
              </div>
            </div>
          </div>

          <div className="bg-indigo-950/50 border border-indigo-500/20 rounded-xl p-3.5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-500/15 flex items-center justify-center text-sky-400 font-bold shrink-0">
              {allCategories.length}
            </div>
            <div>
              <div className="text-xs text-indigo-300 font-medium">
                Активных категорий
              </div>
              <div className="text-sm font-bold text-white">
                {allCategories.length} тем
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Сообщения о статусе */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 px-5 py-4 rounded-xl text-sm flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError('')}
            className="ml-auto text-red-400 hover:text-red-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-5 py-4 rounded-xl text-sm flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
          <button
            type="button"
            onClick={() => setSuccessMsg('')}
            className="ml-auto text-emerald-400 hover:text-emerald-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Вкладки подраздела и Поиск */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 p-1.5 bg-[#1B153B] border border-indigo-500/20 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveSubTab('standard')}
            className={`px-5 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeSubTab === 'standard'
                ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md'
                : 'text-indigo-300 hover:text-white hover:bg-indigo-950/40'
            }`}
          >
            <Layers className="w-4 h-4" />
            Стандартные критерии ({draftStandard.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('critical')}
            className={`px-5 py-2.5 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeSubTab === 'critical'
                ? 'bg-gradient-to-r from-red-600 to-rose-700 text-white shadow-md'
                : 'text-indigo-300 hover:text-white hover:bg-indigo-950/40'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            Критический контроль ({draftCritical.length})
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-72">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-indigo-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по названию или тексту..."
              className="w-full pl-10 pr-4 py-2 bg-[#14102C] border border-indigo-500/30 rounded-xl text-xs text-white placeholder-indigo-400/60 focus:outline-none focus:border-indigo-400"
            />
          </div>

          {activeSubTab === 'standard' ? (
            <button
              type="button"
              onClick={handleOpenAddStandard}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition flex items-center gap-2 shrink-0 shadow-lg shadow-emerald-950/50"
            >
              <Plus className="w-4 h-4" />
              Добавить критерий
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOpenAddCritical}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl transition flex items-center gap-2 shrink-0 shadow-lg shadow-red-950/50"
            >
              <Plus className="w-4 h-4" />
              Добавить критическое нарушение
            </button>
          )}
        </div>
      </div>

      {/* --- ПОДРАЗДЕЛ 1: СТАНДАРТНЫЕ КРИТЕРИИ --- */}
      {activeSubTab === 'standard' && (
        <div className="space-y-4">
          {/* Фильтр по категориям */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                selectedCategory === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-indigo-950/60 text-indigo-300 border border-indigo-500/20 hover:text-white'
              }`}
            >
              Все категории ({draftStandard.length})
            </button>
            {allCategories.map((cat) => {
              const count = draftStandard.filter((c) => c.category === cat).length;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                    selectedCategory === cat
                      ? 'bg-indigo-600 text-white'
                      : 'bg-indigo-950/60 text-indigo-300 border border-indigo-500/20 hover:text-white'
                  }`}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>

          {/* Форма добавления/редактирования стандартного критерия */}
          {isEditingStandard && (
            <form
              onSubmit={handleSaveStandardItem}
              className="bg-[#1B153B] border-2 border-indigo-500/50 rounded-2xl p-6 shadow-2xl space-y-4 animate-fadeIn"
            >
              <div className="flex items-center justify-between border-b border-indigo-500/20 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-indigo-400" />
                  {editingStandardId !== null
                    ? `Редактирование критерия №${editingStandardId}`
                    : 'Добавление нового стандартного критерия'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsEditingStandard(false)}
                  className="text-indigo-300 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-indigo-200 mb-1">
                    Категория методического контроля:
                  </label>
                  <select
                    value={stdCategoryInput}
                    onChange={(e) => setStdCategoryInput(e.target.value)}
                    className="w-full px-3 py-2 bg-[#14102C] border border-indigo-500/30 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-400"
                  >
                    {CATEGORY_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                {stdCategoryInput === 'Другое' && (
                  <div>
                    <label className="block text-xs font-semibold text-indigo-200 mb-1">
                      Укажите название новой категории:
                    </label>
                    <input
                      type="text"
                      value={stdCustomCategoryInput}
                      onChange={(e) => setStdCustomCategoryInput(e.target.value)}
                      placeholder="Например: Взаимодействие с ассистентом"
                      className="w-full px-3 py-2 bg-[#14102C] border border-indigo-500/30 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-400"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-indigo-200 mb-1">
                  Текст проверяемого критерия (формулировка требования):
                </label>
                <textarea
                  rows={3}
                  value={stdTextInput}
                  onChange={(e) => setStdTextInput(e.target.value)}
                  placeholder="Введите полное и точное описание требования к преподавателю..."
                  className="w-full px-3.5 py-2.5 bg-[#14102C] border border-indigo-500/30 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-400"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditingStandard(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl hover:bg-slate-700"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-500 flex items-center gap-1.5 shadow-md shadow-emerald-950/50"
                >
                  <Check className="w-4 h-4" />
                  Применить изменения в черновик
                </button>
              </div>
            </form>
          )}

          {/* Список критериев */}
          <div className="grid grid-cols-1 gap-3">
            {filteredStandard.length === 0 ? (
              <div className="p-8 text-center bg-[#1B153B]/50 border border-indigo-500/20 rounded-2xl text-indigo-300 text-xs">
                Критерии по заданным параметрам поиска не найдены.
              </div>
            ) : (
              filteredStandard.map((item, idx) => (
                <div
                  key={item.id}
                  className="bg-[#1B153B]/80 border border-indigo-500/20 hover:border-indigo-500/40 rounded-xl p-4 transition flex items-start justify-between gap-4 group"
                >
                  <div className="flex items-start gap-3.5">
                    <span className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      #{item.id}
                    </span>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="bg-indigo-950 border border-indigo-500/30 text-indigo-300 text-[10px] font-bold px-2.5 py-0.5 rounded-md">
                          {item.category}
                        </span>
                      </div>
                      <p className="text-xs text-white leading-relaxed">
                        {item.text}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 opacity-80 group-hover:opacity-100 transition">
                    <button
                      type="button"
                      onClick={() => handleOpenEditStandard(item)}
                      className="p-1.5 bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-500/30 text-indigo-300 rounded-lg transition"
                      title="Редактировать"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteStandard(item.id)}
                      className="p-1.5 bg-red-950/40 hover:bg-red-900/60 border border-red-500/30 text-red-400 rounded-lg transition"
                      title="Удалить"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* --- ПОДРАЗДЕЛ 2: КРИТИЧЕСКИЙ КОНТРОЛЬ --- */}
      {activeSubTab === 'critical' && (
        <div className="space-y-4">
          {/* Форма добавления/редактирования критического критерия */}
          {isEditingCritical && (
            <form
              onSubmit={handleSaveCriticalItem}
              className="bg-[#1B153B] border-2 border-red-500/50 rounded-2xl p-6 shadow-2xl space-y-4 animate-fadeIn"
            >
              <div className="flex items-center justify-between border-b border-red-500/20 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  {editingCriticalId !== null
                    ? `Редактирование критического нарушения №${editingCriticalId}`
                    : 'Добавление нового критического нарушения'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsEditingCritical(false)}
                  className="text-indigo-300 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-indigo-200 mb-1">
                  Название критического инцидента:
                </label>
                <input
                  type="text"
                  value={critTitleInput}
                  onChange={(e) => setCritTitleInput(e.target.value)}
                  placeholder="Например: Использование ненормативной лексики"
                  className="w-full px-3.5 py-2 bg-[#14102C] border border-red-500/30 rounded-xl text-xs text-white focus:outline-none focus:border-red-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-indigo-200 mb-1">
                  Подробное описание и условия фиксации:
                </label>
                <textarea
                  rows={3}
                  value={critDescInput}
                  onChange={(e) => setCritDescInput(e.target.value)}
                  placeholder="Описание характера нарушения, при котором лекция признается не соответствующей стандартам..."
                  className="w-full px-3.5 py-2.5 bg-[#14102C] border border-red-500/30 rounded-xl text-xs text-white focus:outline-none focus:border-red-400"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditingCritical(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl hover:bg-slate-700"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-red-600 text-white text-xs font-bold rounded-xl hover:bg-red-500 flex items-center gap-1.5 shadow-md shadow-red-950/50"
                >
                  <Check className="w-4 h-4" />
                  Применить в черновик
                </button>
              </div>
            </form>
          )}

          {/* Список критических нарушений */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredCritical.length === 0 ? (
              <div className="col-span-full p-8 text-center bg-[#1B153B]/50 border border-indigo-500/20 rounded-2xl text-indigo-300 text-xs">
                Критическое управление пустует или записи не найдены по поиску.
              </div>
            ) : (
              filteredCritical.map((item) => (
                <div
                  key={item.id}
                  className="bg-[#1B153B]/80 border border-red-500/20 hover:border-red-500/40 rounded-xl p-5 transition flex flex-col justify-between gap-4 group"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="bg-red-500/15 border border-red-500/30 text-red-400 text-[11px] font-bold px-2.5 py-0.5 rounded-md flex items-center gap-1.5">
                        <AlertTriangle className="w-3 h-3" /> Нарушение #{item.id}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-white">
                      {item.title}
                    </h4>

                    <p className="text-xs text-indigo-200/80 leading-relaxed">
                      {item.desc}
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-red-500/10">
                    <button
                      type="button"
                      onClick={() => handleOpenEditCritical(item)}
                      className="px-3 py-1.5 bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-500/30 text-indigo-300 text-xs font-medium rounded-lg transition flex items-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Изменить
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCritical(item.id)}
                      className="px-3 py-1.5 bg-red-950/40 hover:bg-red-900/60 border border-red-500/30 text-red-400 text-xs font-medium rounded-lg transition flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Удалить
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* --- 2FA OTP МОДАЛЬНОЕ ОКНО ПОДТВЕРЖДЕНИЯ --- */}
      {showOtpModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1B153B] border-2 border-indigo-500/50 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 relative animate-scaleUp">
            <button
              type="button"
              onClick={() => setShowOtpModal(false)}
              className="absolute right-4 top-4 text-indigo-300 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 flex items-center justify-center mx-auto">
                <ShieldCheck className="w-6 h-6 text-[#FF5252]" />
              </div>

              <h3 className="text-lg font-black text-white">
                Подтверждение 2FA сохранения
              </h3>

              <p className="text-xs text-indigo-200">
                Для фиксации новых критериев оценки в базе данных, введите 6-значный код подтверждения, отправленный на вашу почту:
              </p>

              <div className="bg-indigo-950/80 border border-indigo-500/30 px-3 py-1.5 rounded-lg text-xs font-mono font-bold text-indigo-300 inline-block">
                {currentUserEmail}
              </div>
            </div>

            {otpMessage && (
              <div className="bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2">
                <Info className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>{otpMessage}</span>
              </div>
            )}

            {otpError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-300 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{otpError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmSaveWithOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-indigo-200 mb-1.5 text-center uppercase tracking-wider">
                  Одноразовый 6-значный код 2FA:
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  autoFocus
                  className="w-full text-center tracking-[0.4em] font-mono text-2xl py-3 bg-[#14102C] border-2 border-indigo-500/40 rounded-xl text-white focus:outline-none focus:border-[#FF5252]"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOtpModal(false)}
                  className="w-1/2 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl"
                >
                  Отмена
                </button>

                <button
                  type="submit"
                  disabled={isVerifyingOtp || otpCode.length !== 6}
                  className={`w-1/2 py-2.5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-2 shadow-lg transition ${
                    isVerifyingOtp || otpCode.length !== 6
                      ? 'bg-indigo-950 border border-indigo-800 text-indigo-500 cursor-not-allowed opacity-50'
                      : 'bg-gradient-to-r from-[#FF5252] to-[#FF7B7B] hover:opacity-95 shadow-[#FF5252]/30'
                  }`}
                >
                  {isVerifyingOtp ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Проверка...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Зафиксировать
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
