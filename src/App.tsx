import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  ShieldCheck,
  Cpu,
  Sparkles,
  AlertTriangle,
  Database,
  Layers,
  Search,
  Check,
  Video,
  FileText,
  Users,
  Award,
  Zap,
  Clock,
  ExternalLink,
  GraduationCap,
  Loader2,
  BarChart3,
  Filter,
  FileSpreadsheet,
  Plus,
  Crown,
  UserPlus,
  Mail,
  Key,
  LogOut,
  ChevronRight,
  X,
  Play,
  RotateCcw,
  Sliders,
  Lock,
  ArrowRight,
  Trash2,
  RefreshCw,
  EyeOff,
  Calendar,
  User,
  Link2,
  Ban,
  CheckCircle
} from 'lucide-react';
import { PromptEditor, ReportDisplaySettings } from './components/PromptEditor';
import { CriteriaManager } from './components/CriteriaManager';
import { AILimitsPanel } from './components/AILimitsPanel';

// Official Brand Logo component for "Олимпиадные Практики" (olympiadpractices.ru)
function OlympLogo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="purple_stripes_app" width="10" height="10" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="10" stroke="#6C5CE7" strokeWidth="4.8" />
          <line x1="5" y1="0" x2="5" y2="10" stroke="#1B153B" strokeWidth="5.2" />
        </pattern>
        <linearGradient id="olymp_grad_bg_app" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop stopColor="#35296D" />
          <stop offset="1" stopColor="#151030" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="22" fill="url(#olymp_grad_bg_app)" stroke="#4F3B9B" strokeWidth="1.5" />
      <g>
        <rect x="16" y="16" width="30" height="30" rx="3" fill="url(#purple_stripes_app)" />
      </g>
      <path
        d="M 69,16.5 L 82,24 L 82,39 L 69,46.5 L 56,39 L 56,24 Z"
        stroke="#FF5549"
        strokeWidth="5.5"
        strokeLinejoin="round"
        fill="none"
      />
      <g fill="#1FB896">
        <path d="M 16,54 A 15,15 0 0,1 16,84 Z" />
        <path d="M 46,54 A 15,15 0 0,0 46,84 Z" />
      </g>
      <g fill="#29B6F6">
        <rect x="60" y="60" width="16" height="16" rx="1" />
        <rect x="54" y="54" width="6" height="6" rx="0.5" />
        <rect x="76" y="54" width="6" height="6" rx="0.5" />
        <rect x="54" y="76" width="6" height="6" rx="0.5" />
        <rect x="76" y="76" width="6" height="6" rx="0.5" />
      </g>
    </svg>
  );
}

function OlympHeaderLogo() {
  return (
    <div className="flex items-center gap-3">
      <OlympLogo className="w-9 h-9 shadow-lg shadow-indigo-950/60 shrink-0" />
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-black uppercase tracking-[0.12em] text-white leading-none">
            Олимпиадные<span className="text-[#FF5252] ml-1">Практики</span>
          </span>
          <span className="text-[9px] bg-[#FF5252]/15 text-[#FF5252] border border-[#FF5252]/30 px-2 py-0.5 rounded-full font-bold">
            Единый портал
          </span>
        </div>
        <span className="text-[10px] text-indigo-300/80 font-medium tracking-wide mt-0.5">
          Портал контроля качества онлайн-занятий
        </span>
      </div>
    </div>
  );
}

const STANDARD_CRITERIA = [
  { id: 1, text: "Преподаватель уверенно ведёт разбор, не решает задания впервые и не путается в обозначениях.", category: "Педагогика" },
  { id: 2, text: "Презентация, доска, задачи, ссылки и дополнительные материалы подготовлены и быстро доступны.", category: "Подготовка" },
  { id: 3, text: "В начале ученикам понятно, чему посвящено занятие.", category: "Структура" },
  { id: 4, text: "Смена тем и заданий мотивирована; занятие не выглядит набором несвязанных эпизодов.", category: "Структура" },
  { id: 5, text: "Нет чрезмерно длинного вступления, затянутого разбора одной задачи или спешки в конце.", category: "Тайм-менеджмент" },
  { id: 6, text: "Ученики отвечают, предлагают идеи, решают или комментируют ход рассуждения.", category: "Вовлеченность" },
  { id: 7, text: "Преподаватель не работает исключительно с одним-двумя наиболее активными учениками.", category: "Вовлеченность" },
  { id: 8, text: "Преподаватель замечает, когда часть группы не успевает или не понимает.", category: "Эмпатия" },
  { id: 9, text: "Ошибочные версии не высмеиваются и используются для содержательного разбора.", category: "Психологический климат" },
  { id: 10, text: "Нет грубости, раздражения, излишнего давления или неуместной фамильярности.", category: "Психологический климат" },
  { id: 11, text: "Слабые ученики не выпадают из работы, а сильные получают содержательную нагрузку.", category: "Дифференциация" },
  { id: 12, text: "Нет длительной лекции без применения и бесконечного решения без обобщения.", category: "Методика" },
  { id: 13, text: "Материал не сводится к поверхностному перечислению правил.", category: "Глубина" },
  { id: 14, text: "Занятие начинается без необоснованной задержки.", category: "Тайм-менеджмент" },
  { id: 15, text: "Преподаватель не завершает существенно раньше и не превышает время без необходимости.", category: "Тайм-менеджмент" },
  { id: 16, text: "Речь разборчива, постоянные помехи и эхо отсутствуют.", category: "Техническое качество" },
  { id: 17, text: "Показывается нужное окно; нет длительного поиска файлов и вкладок.", category: "Техническое качество" },
  { id: 18, text: "Текст достаточно крупный, обозначения видны, оформление не перегружено.", category: "Визуал" },
  { id: 19, text: "Сбои решаются спокойно и не занимают значительную часть занятия.", category: "Техническое качество" },
  { id: 20, text: "Уведомления, личная переписка и лишние вкладки не демонстрируются.", category: "Безопасность" },
  { id: 21, text: "Не раскрываются персональные данные и не обсуждаются неуместные темы.", category: "Безопасность" }
];

const CRITICAL_CRITERIA = [
  { id: 1, title: "Фактическая или методическая ошибка", desc: "Серьезная ошибка в теории или решении, оставшаяся без исправления." },
  { id: 2, title: "Некорректное общение", desc: "Грубое, унизительное или дискриминирующее общение с учеником." },
  { id: 3, title: "Некомпетентность в задаче", desc: "Преподаватель не владеет решением рассматриваемой задачи и не может закончить разбор." },
  { id: 4, title: "Игнорирование учеников", desc: "Систематическое игнорирование вопросов и явных признаков непонимания группы." },
  { id: 5, title: "Срыв тайминга из-за неподготовленности", desc: "Значительная часть занятия потрачена на организационные или технические действия." },
  { id: 6, title: "Утечка конфиденциальных данных", desc: "Демонстрация персональных данных, личной переписки или приватной информации." },
  { id: 7, title: "Заведомо ложный материал", desc: "Выдача заведомо неверного ответа, правила или алгоритма без исправления." },
  { id: 8, title: "Длительное отсутствие", desc: "Отсутствие преподавателя или учебной работы в течение значительной части занятия." }
];

interface CuratorUser {
  id: string;
  email: string;
  fullName: string;
  role: 'curator' | 'senior_curator';
  status: 'active' | 'blocked';
  addedBy?: string;
  createdAt?: string;
}

interface KtalkRecordingItem {
  recordingKey: string;
  lectureUrl: string;
  title: string;
  createdDate: string;
  duration: string;
  authorName: string;
  authorLogin: string;
  authorEmail: string;
  roomName: string;
  resolutions: string[];
  hasTranscript?: boolean;
  hasSummary?: boolean;
  status: 'new' | 'submitted' | 'hidden';
  syncedAt: string;
}

interface KtalkSyncStatusInfo {
  configured: boolean;
  domain: string;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  lastAddedCount: number;
  lastFetchedCount: number;
}

function formatKtalkDateTime(isoStr: string): string {
  if (!isoStr) return 'Дата не указана';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return isoStr;
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function App() {
  // Аутентификация
  const [authToken, setAuthToken] = useState<string>(() => localStorage.getItem('curator_token') || '');
  const [currentUser, setCurrentUser] = useState<CuratorUser | null>(() => {
    const raw = localStorage.getItem('curator_profile');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      localStorage.removeItem('curator_profile');
      return null;
    }
  });

  // Состояние формы входа (Email OTP)
  const [loginEmail, setLoginEmail] = useState<string>('');
  const [otpCode, setOtpCode] = useState<string>('');
  const [isOtpSent, setIsOtpSent] = useState<boolean>(false);
  const [loginLoading, setLoginLoading] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string>('');
  const [loginMessage, setLoginMessage] = useState<string>('');

  // Вкладки
  const [activeTab, setActiveTab] = useState<'dashboard' | 'submit' | 'curators' | 'audit' | 'criteria' | 'prompt_editor' | 'ai_limits' | 'criteria_manager'>('dashboard');

  // Дашборд и задачи
  const [tasks, setTasks] = useState<any[]>([]);
  const [teachersList, setTeachersList] = useState<string[]>([]);
  const [selectedTeacherFilter, setSelectedTeacherFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeDetailTask, setActiveDetailTask] = useState<any | null>(null);
  const [rawJsonModalTask, setRawJsonModalTask] = useState<any | null>(null);
  const [copiedRawJson, setCopiedRawJson] = useState<boolean>(false);
  const [retryingTaskId, setRetryingTaskId] = useState<string | null>(null);
  const [dashboardNotice, setDashboardNotice] = useState<string>('');

  // Форма отправки встречи КТалк (без фейкового предзаполнения)
  const [lectureUrl, setLectureUrl] = useState<string>('');
  const [selectedTeacher, setSelectedTeacher] = useState<string>('');
  const [newTeacherName, setNewTeacherName] = useState<string>('');
  const [subject, setSubject] = useState<string>('');
  const [groupName, setGroupName] = useState<string>('');
  const [isSubmittingTask, setIsSubmittingTask] = useState<boolean>(false);
  const [submitSuccessTask, setSubmitSuccessTask] = useState<any | null>(null);
  const [submitSuccessMessage, setSubmitSuccessMessage] = useState<string>('');
  const [submitError, setSubmitError] = useState<string>('');
  const [duplicateErrorTask, setDuplicateErrorTask] = useState<any | null>(null);

  // Список непроверенных и скрытых записей Контур.Толк
  const [unreviewedRecordings, setUnreviewedRecordings] = useState<KtalkRecordingItem[]>([]);
  const [hiddenRecordings, setHiddenRecordings] = useState<KtalkRecordingItem[]>([]);
  const [showHiddenKtalk, setShowHiddenKtalk] = useState<boolean>(false);
  const [isLoadingHiddenKtalk, setIsLoadingHiddenKtalk] = useState<boolean>(false);
  const [restoringRecordingKey, setRestoringRecordingKey] = useState<string | null>(null);
  const [ktalkSyncStatus, setKtalkSyncStatus] = useState<KtalkSyncStatusInfo | null>(null);
  const [isLoadingKtalk, setIsLoadingKtalk] = useState<boolean>(false);
  const [isSyncingKtalk, setIsSyncingKtalk] = useState<boolean>(false);
  const [ktalkSyncNotice, setKtalkSyncNotice] = useState<string>('');
  const [ktalkSearchQuery, setKtalkSearchQuery] = useState<string>('');
  const [selectedKtalkRecording, setSelectedKtalkRecording] = useState<KtalkRecordingItem | null>(null);
  const [isCheckModalOpen, setIsCheckModalOpen] = useState<boolean>(false);
  const [hidingRecordingKey, setHidingRecordingKey] = useState<string | null>(null);

  // Управление кураторами (ТОЛЬКО ДЛЯ СТАРШИХ КУРАТОРОВ)
  const [curatorsList, setCuratorsList] = useState<CuratorUser[]>([]);
  const [isLoadingCurators, setIsLoadingCurators] = useState<boolean>(false);
  const [newCuratorEmail, setNewCuratorEmail] = useState<string>('');
  const [newCuratorName, setNewCuratorName] = useState<string>('');
  const [newCuratorRole, setNewCuratorRole] = useState<'curator' | 'senior_curator'>('curator');
  const [curatorActionMessage, setCuratorActionMessage] = useState<string>('');
  const [curatorActionError, setCuratorActionError] = useState<string>('');
  const [confirmDeleteCuratorEmail, setConfirmDeleteCuratorEmail] = useState<string | null>(null);

  // Журнал аудита базы данных (ТОЛЬКО ДЛЯ СТАРШИХ КУРАТОРОВ)
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState<boolean>(false);
  const [auditSearch, setAuditSearch] = useState<string>('');

  // Динамические критерии оценки и настройки формата отчёта (Н/П)
  const [dynamicStandardCriteria, setDynamicStandardCriteria] = useState<any[]>(STANDARD_CRITERIA);
  const [dynamicCriticalCriteria, setDynamicCriticalCriteria] = useState<any[]>(CRITICAL_CRITERIA);
  const [reportSettings, setReportSettings] = useState<ReportDisplaySettings>({
    displayMode: 'five_point',
    naBadgeText: 'Н/П',
    naDescription: 'Критерий не применим к формату данного занятия — исключён из максимального и набранного балла.'
  });
  const [criteriaSearch, setCriteriaSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const isSenior = currentUser?.role === 'senior_curator' || currentUser?.email?.toLowerCase() === 'shurygin.egor2009@gmail.com';

  const fetchCriteriaConfig = async () => {
    if (!authToken) return;
    try {
      const res = await fetch('/api/criteria/config', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const data = await res.json();
      if (data.success) {
        if (Array.isArray(data.standardCriteria) && data.standardCriteria.length > 0) {
          setDynamicStandardCriteria(data.standardCriteria);
        }
        if (Array.isArray(data.criticalCriteria) && data.criticalCriteria.length > 0) {
          setDynamicCriticalCriteria(data.criticalCriteria);
        }
        if (data.reportSettings) {
          setReportSettings(data.reportSettings);
        }
      }
    } catch (e) {
      console.warn('Не удалось загрузить динамические критерии:', e);
    }
  };

  // Проверка сессии при запуске
  useEffect(() => {
    if (authToken) {
      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${authToken}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data.success && data.curator) {
            setCurrentUser(data.curator);
            localStorage.setItem('curator_profile', JSON.stringify(data.curator));
          } else {
            handleLogout();
          }
        })
        .catch(() => handleLogout());
    }
  }, [authToken]);

  // Загрузка задач и преподавателей
  const fetchTasksAndTeachers = async () => {
    if (!authToken) return;
    try {
      const [resTasks, resTeachers] = await Promise.all([
        fetch('/api/tasks', { headers: { Authorization: `Bearer ${authToken}` } }),
        fetch('/api/teachers', { headers: { Authorization: `Bearer ${authToken}` } })
      ]);
      const dataTasks = await resTasks.json();
      const dataTeachers = await resTeachers.json();

      if (dataTasks.success) setTasks(dataTasks.tasks);
      if (dataTeachers.success) {
        const list = Array.isArray(dataTeachers.teachers) ? dataTeachers.teachers : [];
        setTeachersList(list);
        if (list.length === 0 && !selectedTeacher) {
          setSelectedTeacher('__new__');
        }
      }
    } catch (e) {
      console.error('Ошибка загрузки данных:', e);
    }
  };

  // Загрузка списка непроверенных записей из Контур.Толк
  const fetchUnreviewedRecordings = async () => {
    if (!authToken) return;
    setIsLoadingKtalk(true);
    try {
      const res = await fetch('/api/ktalk/recordings', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const data = await res.json();
      if (data.success) {
        const list: KtalkRecordingItem[] = Array.isArray(data.recordings) ? data.recordings : [];
        setUnreviewedRecordings(list);
        if (data.syncStatus) {
          setKtalkSyncStatus(data.syncStatus);
        }
        setSelectedKtalkRecording(prev =>
          prev ? list.find(r => r.recordingKey === prev.recordingKey) || prev : null
        );
      }
    } catch (e) {
      console.error('Ошибка загрузки записей КТалк:', e);
    } finally {
      setIsLoadingKtalk(false);
    }
  };

  // Ручное обновление списка встреч из Контур.Толк
  const handleManualKtalkSync = async () => {
    if (!authToken || isSyncingKtalk) return;
    setIsSyncingKtalk(true);
    setKtalkSyncNotice('');
    try {
      const res = await fetch('/api/ktalk/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const data = await res.json();
      if (data.syncStatus) {
        setKtalkSyncStatus(data.syncStatus);
      }
      if (Array.isArray(data.recordings)) {
        setUnreviewedRecordings(data.recordings);
        setSelectedKtalkRecording(prev =>
          prev ? data.recordings.find((r: KtalkRecordingItem) => r.recordingKey === prev.recordingKey) || prev : null
        );
      }
      if (data.success) {
        setKtalkSyncNotice(
          `Синхронизировано записей: ${data.fetchedCount ?? 0}, новых: ${data.addedCount ?? 0}`
        );
      } else {
        setKtalkSyncNotice(data.error || 'Не удалось обновить список встреч.');
      }
    } catch (e: any) {
      setKtalkSyncNotice(e?.message || 'Ошибка соединения при синхронизации.');
    } finally {
      setIsSyncingKtalk(false);
    }
  };

  // Выбор непроверенной встречи: открывает модальное окно проверки и подставляет ТОЛЬКО ссылку
  const handleSelectKtalkRecording = (rec: KtalkRecordingItem) => {
    setSelectedKtalkRecording(rec);
    setLectureUrl(rec.lectureUrl);
    setSelectedTeacher(teachersList.length === 0 ? '__new__' : '');
    setNewTeacherName('');
    setSubject('');
    setGroupName('');
    setSubmitError('');
    setDuplicateErrorTask(null);
    setSubmitSuccessTask(null);
    setSubmitSuccessMessage('');
    setIsCheckModalOpen(true);
  };

  // Открытие окна для ручной вставки ссылки на лекцию КТалк
  const openManualCheckModal = () => {
    setSelectedKtalkRecording(null);
    setLectureUrl('');
    setSelectedTeacher(teachersList.length === 0 ? '__new__' : '');
    setNewTeacherName('');
    setSubject('');
    setGroupName('');
    setSubmitError('');
    setDuplicateErrorTask(null);
    setSubmitSuccessTask(null);
    setSubmitSuccessMessage('');
    setIsCheckModalOpen(true);
  };

  // Скрытие нецелевой встречи ("Скрыть / Не лекция")
  const handleHideKtalkRecording = async (e: React.MouseEvent, rec: KtalkRecordingItem) => {
    e.stopPropagation();
    if (!authToken || hidingRecordingKey) return;
    setHidingRecordingKey(rec.recordingKey);
    try {
      const res = await fetch(`/api/ktalk/recordings/${encodeURIComponent(rec.recordingKey)}/hide`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUnreviewedRecordings(prev => prev.filter(item => item.recordingKey !== rec.recordingKey));
        if (selectedKtalkRecording?.recordingKey === rec.recordingKey) {
          setSelectedKtalkRecording(null);
          if (lectureUrl.trim() === rec.lectureUrl.trim()) {
            setLectureUrl('');
          }
        }
        if (showHiddenKtalk) {
          void fetchHiddenRecordings();
        }
      }
    } catch (err) {
      console.error('Ошибка скрытия записи КТалк:', err);
    } finally {
      setHidingRecordingKey(null);
    }
  };

  // Загрузка списка скрытых записей Контур.Толк
  const fetchHiddenRecordings = async () => {
    if (!authToken) return;
    setIsLoadingHiddenKtalk(true);
    try {
      const res = await fetch('/api/ktalk/recordings/hidden', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setHiddenRecordings(Array.isArray(data.recordings) ? data.recordings : []);
      }
    } catch (err) {
      console.error('Ошибка загрузки скрытых записей КТалк:', err);
    } finally {
      setIsLoadingHiddenKtalk(false);
    }
  };

  // Возвращение скрытой встречи в список непроверенных
  const handleRestoreKtalkRecording = async (e: React.MouseEvent, rec: KtalkRecordingItem) => {
    e.stopPropagation();
    if (!authToken || restoringRecordingKey) return;
    setRestoringRecordingKey(rec.recordingKey);
    try {
      const res = await fetch(`/api/ktalk/recordings/${encodeURIComponent(rec.recordingKey)}/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setHiddenRecordings(prev => prev.filter(item => item.recordingKey !== rec.recordingKey));
        await fetchUnreviewedRecordings();
      }
    } catch (err) {
      console.error('Ошибка восстановления записи КТалк:', err);
    } finally {
      setRestoringRecordingKey(null);
    }
  };

  // Повторный запуск любой завершённой, сбойной или прерванной проверки в очередь
  const handleRetryTask = async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    if (!authToken || retryingTaskId) return;
    setRetryingTaskId(taskId);
    setDashboardNotice('');
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDashboardNotice(data.message || 'Лекция возвращена в очередь на повторную проверку.');
        if (rawJsonModalTask?.id === taskId) {
          setRawJsonModalTask(null);
        }
        if (activeDetailTask?.id === taskId) {
          setActiveDetailTask(null);
        }
        if (duplicateErrorTask?.id === taskId) {
          setDuplicateErrorTask(null);
          setSubmitError('');
          setIsCheckModalOpen(false);
          setActiveTab('dashboard');
        }
        await fetchTasksAndTeachers();
        setTimeout(() => setDashboardNotice(''), 5000);
      } else {
        setDashboardNotice(data.message || 'Не удалось перезапустить проверку.');
      }
    } catch (err: any) {
      setDashboardNotice(err?.message || 'Ошибка соединения при перезапуске.');
    } finally {
      setRetryingTaskId(null);
    }
  };

  // Загрузка списка кураторов
  const fetchCurators = async () => {
    if (!authToken || !isSenior) return;
    setIsLoadingCurators(true);
    try {
      const res = await fetch('/api/curators', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const data = await res.json();
      if (data.success) {
        setCuratorsList(data.curators);
      }
    } catch (e) {
      console.error('Ошибка загрузки кураторов:', e);
    } finally {
      setIsLoadingCurators(false);
    }
  };

  // Загрузка журнала аудита действий из БД
  const fetchAuditLogs = async () => {
    if (!authToken || !isSenior) return;
    setIsLoadingAudit(true);
    try {
      const res = await fetch('/api/audit-logs?limit=150', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const data = await res.json();
      if (data.success) {
        setAuditLogs(data.logs || []);
      }
    } catch (e) {
      console.error('Ошибка загрузки audit-logs:', e);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  useEffect(() => {
    fetchCriteriaConfig();
    if (authToken) {
      fetchTasksAndTeachers();
      fetchUnreviewedRecordings();
      if (isSenior) {
        fetchCurators();
        fetchAuditLogs();
      }
    }
  }, [authToken, isSenior]);

  // Повторный запрос при переключении вкладок
  useEffect(() => {
    if (!authToken) return;
    if (activeTab === 'submit') {
      fetchUnreviewedRecordings();
    }
    if (isSenior) {
      if (activeTab === 'curators') fetchCurators();
      if (activeTab === 'audit') fetchAuditLogs();
    }
  }, [activeTab, authToken, isSenior]);

  // Автообновление списка непроверенных встреч каждые 60 сек, пока открыта вкладка отправки
  useEffect(() => {
    if (!authToken || activeTab !== 'submit') return;
    const interval = setInterval(() => {
      fetchUnreviewedRecordings();
    }, 60000);
    return () => clearInterval(interval);
  }, [authToken, activeTab]);

  // Непрерывный опрос статуса задач: каждые 4 сек при активной очереди и каждые 15 сек в фоне
  useEffect(() => {
    if (!authToken) return;
    const hasPending = tasks.some(t => t.status !== 'completed' && t.status !== 'failed');
    const delayMs = hasPending ? 4000 : 15000;

    const interval = setInterval(() => {
      void fetchTasksAndTeachers();
    }, delayMs);
    return () => clearInterval(interval);
  }, [authToken, tasks]);

  // 1. Запрос кода OTP
  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginMessage('');
    if (!loginEmail.trim()) {
      setLoginError('Введите адрес вашей корпоративной электронной почты.');
      return;
    }

    setLoginLoading(true);
    try {
      const res = await fetch('/api/auth/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.trim() })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setLoginError(data.message || 'Ошибка запроса кода.');
        return;
      }

      setIsOtpSent(true);
      setOtpCode(''); // Поле кода ввода обязательно пустое — пользователь вводит код сам
      setLoginMessage(data.message || 'Код подтверждения отправлен на вашу почту.');
    } catch (err: any) {
      setLoginError(err.message || 'Ошибка связи с сервером.');
    } finally {
      setLoginLoading(false);
    }
  };

  // 2. Подтверждение кода OTP
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (!otpCode.trim()) {
      setLoginError('Введите 6-значный код из письма.');
      return;
    }

    setLoginLoading(true);
    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.trim(), code: otpCode.trim() })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setLoginError(data.message || 'Неверный код.');
        return;
      }

      setAuthToken(data.token);
      setCurrentUser(data.curator);
      localStorage.setItem('curator_token', data.token);
      localStorage.setItem('curator_profile', JSON.stringify(data.curator));
      setIsOtpSent(false);
      setOtpCode('');
    } catch (err: any) {
      setLoginError(err.message || 'Ошибка проверки кода.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    setAuthToken('');
    setCurrentUser(null);
    localStorage.removeItem('curator_token');
    localStorage.removeItem('curator_profile');
    setIsOtpSent(false);
    setOtpCode('');
  };

  // 3. Отправка встречи КТалк на анализ
  const handleSubmitLecture = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitSuccessTask(null);
    setSubmitSuccessMessage('');
    setDuplicateErrorTask(null);

    const teacherToUse = selectedTeacher === '__new__' ? newTeacherName.trim() : selectedTeacher.trim();
    const cleanSubject = subject.trim();
    const cleanGroup = groupName.trim();

    if (!lectureUrl.trim()) {
      setSubmitError('Укажите ссылку на встречу КТалк.');
      return;
    }
    if (!teacherToUse) {
      setSubmitError('Выберите или введите ФИО преподавателя.');
      return;
    }
    if (!cleanSubject) {
      setSubmitError('Укажите дисциплину / предмет.');
      return;
    }
    if (!cleanGroup) {
      setSubmitError('Укажите группу / параллель.');
      return;
    }

    setIsSubmittingTask(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          lectureUrl: lectureUrl.trim(),
          teacherName: teacherToUse,
          subject: cleanSubject,
          groupName: cleanGroup
        })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.code === 'DUPLICATE_URL' || data.existingTask) {
          setDuplicateErrorTask(data.existingTask);
        }
        setSubmitError(data.message || 'Ошибка отправки встречи.');
        return;
      }

      const submittedUrlNorm = lectureUrl.trim().toLowerCase().replace(/\/+$/, '');
      setSubmitSuccessTask(data.task);
      setSubmitSuccessMessage(data.message || 'Заявка добавлена в очередь на проверку.');
      setUnreviewedRecordings(prev =>
        prev.filter(
          r =>
            r.recordingKey !== selectedKtalkRecording?.recordingKey &&
            r.lectureUrl.trim().toLowerCase().replace(/\/+$/, '') !== submittedUrlNorm
        )
      );
      setSelectedKtalkRecording(null);
      setLectureUrl('');
      setSubject('');
      setGroupName('');
      setNewTeacherName('');
      setTasks(prev => [data.task, ...prev.filter(t => t.id !== data.task.id)]);
      await Promise.all([fetchTasksAndTeachers(), fetchUnreviewedRecordings()]);
      if (isSenior) {
        fetchAuditLogs();
        fetchCurators();
      }
    } catch (err: any) {
      setSubmitError(err.message || 'Сбой подключения к серверу.');
    } finally {
      setIsSubmittingTask(false);
    }
  };

  // 4. Добавление куратора старшим куратором
  const handleAddCurator = async (e: React.FormEvent) => {
    e.preventDefault();
    setCuratorActionError('');
    setCuratorActionMessage('');

    if (!newCuratorEmail.trim()) {
      setCuratorActionError('Укажите email куратора.');
      return;
    }

    try {
      const res = await fetch('/api/curators', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          email: newCuratorEmail.trim(),
          fullName: newCuratorName.trim(),
          role: newCuratorRole
        })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setCuratorActionError(data.message || 'Ошибка добавления куратора.');
        return;
      }

      setCuratorActionMessage(data.message);
      setNewCuratorEmail('');
      setNewCuratorName('');
      await fetchCurators();
    } catch (err: any) {
      setCuratorActionError(err.message || 'Ошибка сервера.');
    }
  };

  // 5. Перевод роли куратора
  const handleUpdateRole = async (email: string, newRole: 'curator' | 'senior_curator') => {
    setCuratorActionError('');
    setCuratorActionMessage('');
    try {
      const res = await fetch(`/api/curators/${encodeURIComponent(email)}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({ role: newRole })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setCuratorActionError(data.message || 'Ошибка изменения роли.');
        return;
      }
      setCuratorActionMessage(data.message);
      await fetchCurators();
    } catch (err: any) {
      setCuratorActionError(err.message || 'Ошибка сети.');
    }
  };

  // 6. Блокировка/разблокировка куратора
  const handleToggleStatus = async (email: string, status: 'active' | 'blocked') => {
    setCuratorActionError('');
    setCuratorActionMessage('');
    try {
      const res = await fetch(`/api/curators/${encodeURIComponent(email)}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setCuratorActionError(data.message || 'Ошибка обновления статуса.');
        return;
      }
      setCuratorActionMessage(data.message);
      await fetchCurators();
    } catch (err: any) {
      setCuratorActionError(err.message || 'Ошибка сети.');
    }
  };

  // Удаление куратора из белого списка (через внутрипрограммное подтверждение)
  const confirmAndDeleteCurator = async () => {
    const email = confirmDeleteCuratorEmail;
    if (!email) return;
    setConfirmDeleteCuratorEmail(null);
    setCuratorActionError('');
    setCuratorActionMessage('');
    try {
      const res = await fetch(`/api/curators/${encodeURIComponent(email)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setCuratorActionError(data.message || 'Ошибка удаления куратора.');
        return;
      }
      setCuratorActionMessage(data.message);
      await fetchCurators();
    } catch (err: any) {
      setCuratorActionError(err.message || 'Ошибка сети.');
    }
  };

  // 7. Серверный экспорт в Excel (.xlsx) с обязательной записью в audit_logs БД
  const handleServerExportExcel = async () => {
    try {
      const res = await fetch('/api/analytics/export-excel', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (!res.ok) {
        setDashboardNotice('Не удалось выгрузить Excel-отчет с сервера.');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Olympiad_Practices_Analytics_2026.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Ошибка выгрузки Excel:', err);
      setDashboardNotice('Ошибка соединения при выгрузке отчета.');
    }
  };

  // Фильтрация уроков в дашборде
  const filteredTasks = tasks.filter(t => {
    if (!t) return false;
    const matchesTeacher = selectedTeacherFilter === 'all' || t.teacherName === selectedTeacherFilter;
    if (!matchesTeacher) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      (t.teacherName || '').toLowerCase().includes(q) ||
      (t.subject || '').toLowerCase().includes(q) ||
      (t.groupName || '').toLowerCase().includes(q) ||
      (t.lectureUrl || '').toLowerCase().includes(q) ||
      (t.date || '').toLowerCase().includes(q) ||
      (t.curatorEmail || '').toLowerCase().includes(q)
    );
  });

  const categories = ['all', ...Array.from(new Set(dynamicStandardCriteria.map(c => c.category)))];
  const filteredCriteria = dynamicStandardCriteria.filter(c => {
    const matchesSearch = c.text.toLowerCase().includes(criteriaSearch.toLowerCase()) || c.id.toString().includes(criteriaSearch);
    const matchesCat = selectedCategory === 'all' || c.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  // ЕСЛИ НЕ АВТОРИЗОВАН -> ПОКАЗЫВАЕМ СТРАНИЦУ ВХОДА (Email OTP)
  if (!authToken || !currentUser) {
    return (
      <div className="min-h-screen bg-[#14102C] text-slate-100 flex items-center justify-center p-4 selection:bg-[#FF5252]/30 selection:text-white">
        <div className="w-full max-w-md bg-[#1B153B] border border-indigo-700/50 rounded-3xl p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <OlympLogo className="w-14 h-14 mx-auto shadow-xl shadow-indigo-950/60" />
            <h1 className="text-lg font-black tracking-wider uppercase text-white mt-2">
              Олимпиадные<span className="text-[#FF5252] ml-1">Практики</span>
            </h1>
            <p className="text-xs text-indigo-300">
              Вход в единый портал методического контроля
            </p>
          </div>

          <div className="p-3 bg-[#120E27] border border-indigo-900/80 rounded-2xl text-[11px] text-indigo-300/90 leading-relaxed">
            <div className="flex items-center gap-1.5 font-bold text-white mb-1">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>Закрытый корпоративный доступ</span>
            </div>
            Вход осуществляется по электронной почте куратора из разрешенного белого списка через одноразовый пароль (OTP).
          </div>

          {loginError && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-xs text-rose-300 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{loginError}</span>
            </div>
          )}

          {loginMessage && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{loginMessage}</span>
            </div>
          )}

          {!isOtpSent ? (
            <form onSubmit={handleRequestCode} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-indigo-200 mb-1.5">
                  Рабочий Email куратора:
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-indigo-400 absolute left-3.5 top-3.5" />
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="curator@olympiadpractices.ru"
                    required
                    className="w-full bg-[#14102C] border border-indigo-800/60 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-indigo-400/50 focus:outline-none focus:border-[#FF5252] transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-3 bg-[#FF5252] hover:bg-[#ff3b3b] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-[#FF5252]/30 flex items-center justify-center gap-2"
              >
                {loginLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ArrowRight className="w-4 h-4" />
                )}
                <span>Получить код подтверждения</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-indigo-200">
                    6-значный код подтверждения:
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsOtpSent(false)}
                    className="text-[10px] text-[#38BDF8] hover:underline"
                  >
                    Изменить email
                  </button>
                </div>
                <div className="relative">
                  <Key className="w-4 h-4 text-indigo-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    autoFocus
                    required
                    className="w-full bg-[#14102C] border border-indigo-800/60 rounded-xl pl-10 pr-4 py-2.5 text-center font-mono text-lg tracking-[0.25em] text-white placeholder-indigo-400/30 focus:outline-none focus:border-[#FF5252] transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loginLoading || otpCode.length !== 6}
                className="w-full py-3 bg-[#FF5252] hover:bg-[#ff3b3b] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-[#FF5252]/30 flex items-center justify-center gap-2"
              >
                {loginLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>Войти в личный кабинет</span>
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // ОСНОВНОЙ ИНТЕРФЕЙС АВТОРИЗОВАННОГО КУРАТОРА
  return (
    <div className="min-h-screen bg-[#14102C] text-slate-100 flex flex-col font-sans antialiased selection:bg-[#FF5252]/30 selection:text-white">
      {/* Шапка портала */}
      <header className="border-b border-indigo-900/40 bg-[#1B153B]/95 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-4">
          <OlympHeaderLogo />

          {/* Правая зона профиля и роли куратора */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5 bg-[#14102C] border border-indigo-800/50 px-3 py-1.5 rounded-xl">
              <div className="w-7 h-7 rounded-lg bg-indigo-700/30 flex items-center justify-center font-bold text-xs text-white uppercase">
                {currentUser.fullName ? currentUser.fullName[0] : currentUser.email[0]}
              </div>
              <div className="text-left hidden sm:block">
                <div className="text-xs font-bold text-white truncate max-w-[170px]">
                  {currentUser.fullName || currentUser.email}
                </div>
                <div className="flex items-center gap-1.5">
                  {isSenior ? (
                    <span className="text-[10px] text-amber-300 font-extrabold flex items-center gap-1">
                      <Crown className="w-3 h-3 text-amber-400" />
                      Старший куратор
                    </span>
                  ) : (
                    <span className="text-[10px] text-emerald-400 font-medium">
                      Куратор
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="p-2 bg-[#14102C] hover:bg-rose-950/30 border border-indigo-800/50 hover:border-rose-500/50 text-indigo-300 hover:text-rose-300 rounded-xl transition-colors"
              title="Выйти из аккаунта"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Навигационная панель */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-1 border-t border-indigo-900/30 pt-1.5 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all flex items-center gap-2 border-b-2 ${
              activeTab === 'dashboard'
                ? 'border-[#FF5252] text-white bg-[#2B2363]'
                : 'border-transparent text-indigo-200/70 hover:text-white hover:bg-[#241E4F]/60'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-[#FF5252]" />
            Дашборд преподавателей
          </button>

          <button
            onClick={() => setActiveTab('submit')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all flex items-center gap-2 border-b-2 ${
              activeTab === 'submit'
                ? 'border-[#FF5252] text-white bg-[#2B2363]'
                : 'border-transparent text-indigo-200/70 hover:text-white hover:bg-[#241E4F]/60'
            }`}
          >
            <Video className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Проверить встречу КТалк</span>
            {unreviewedRecordings.length > 0 && (
              <span className="font-mono tabular-nums text-[11px] font-bold text-[#38BDF8]">
                ({unreviewedRecordings.length})
              </span>
            )}
          </button>

          <button
            onClick={() => { setActiveTab('criteria'); fetchCriteriaConfig(); }}
            className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all flex items-center gap-2 border-b-2 ${
              activeTab === 'criteria'
                ? 'border-[#FF5252] text-white bg-[#2B2363]'
                : 'border-transparent text-indigo-200/70 hover:text-white hover:bg-[#241E4F]/60'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Критерии оценки ({dynamicStandardCriteria.length} + {dynamicCriticalCriteria.length})
          </button>

          {/* Вкладки ТОЛЬКО ДЛЯ СТАРШИХ КУРАТОРОВ */}
          {isSenior && (
            <button
              onClick={() => { setActiveTab('criteria_manager'); fetchCriteriaConfig(); }}
              className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all flex items-center gap-2 border-b-2 ${
                activeTab === 'criteria_manager'
                  ? 'border-[#FF5252] text-white bg-[#2B2363]'
                  : 'border-transparent text-amber-200/80 hover:text-white hover:bg-[#241E4F]/60'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-[#FF5252]" />
              <span>Управление критериями</span>
              <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-bold border border-amber-500/30">
                Senior
              </span>
            </button>
          )}

          {isSenior && (
            <button
              onClick={() => { setActiveTab('curators'); fetchCurators(); }}
              className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all flex items-center gap-2 border-b-2 ${
                activeTab === 'curators'
                  ? 'border-amber-400 text-white bg-[#2B2363]'
                  : 'border-transparent text-amber-200/80 hover:text-white hover:bg-[#241E4F]/60'
              }`}
            >
              <Crown className="w-3.5 h-3.5 text-amber-400" />
              <span>Управление кураторами</span>
              <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-bold border border-amber-500/30">
                Senior
              </span>
            </button>
          )}

          {isSenior && (
            <button
              onClick={() => { setActiveTab('audit'); fetchAuditLogs(); }}
              className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all flex items-center gap-2 border-b-2 ${
                activeTab === 'audit'
                  ? 'border-[#38BDF8] text-white bg-[#2B2363]'
                  : 'border-transparent text-cyan-200/80 hover:text-white hover:bg-[#241E4F]/60'
              }`}
            >
              <Database className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span>История действий</span>
              <span className="text-[9px] bg-cyan-500/20 text-[#38BDF8] px-1.5 py-0.2 rounded font-bold border border-cyan-500/30">
                Senior
              </span>
            </button>
          )}

          {isSenior && (
            <button
              onClick={() => setActiveTab('prompt_editor')}
              className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all flex items-center gap-2 border-b-2 whitespace-nowrap shrink-0 ${
                activeTab === 'prompt_editor'
                  ? 'border-amber-400 text-white bg-[#2B2363]'
                  : 'border-transparent text-amber-200/80 hover:text-white hover:bg-[#241E4F]/60'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Правила проверки</span>
              <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-bold border border-amber-500/30">
                Senior
              </span>
            </button>
          )}

          {isSenior && (
            <button
              onClick={() => setActiveTab('ai_limits')}
              className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all flex items-center gap-2 border-b-2 whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'ai_limits'
                  ? 'border-[#38BDF8] text-white bg-[#2B2363]'
                  : 'border-transparent text-cyan-200/80 hover:text-white hover:bg-[#241E4F]/60'
              }`}
            >
              <Cpu className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span>Лимиты и модели</span>
              <span className="text-[9px] bg-cyan-500/20 text-[#38BDF8] px-1.5 py-0.2 rounded font-bold border border-cyan-500/30">
                Senior
              </span>
            </button>
          )}
        </div>
      </header>

      {/* Основное рабочее пространство */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* ======================================================== */}
        {/* ВКЛАДКА 1: ДАШБОРД ПРЕПОДАВАТЕЛЕЙ + ЭКСПОРТ В EXCEL       */}
        {/* ======================================================== */}
        {activeTab === 'dashboard' && (() => {
          const validCompletedTasks = tasks.filter(
            t => t.status === 'completed' && !t.isCorrupted && typeof t.totalScore === 'number'
          );
          const avgScore =
            validCompletedTasks.length > 0
              ? Math.round(
                  validCompletedTasks.reduce((acc, t) => acc + Number(t.totalScore), 0) /
                    validCompletedTasks.length
                )
              : null;
          const activeWorkerTasks = tasks.filter(
            t =>
              t.status === 'downloading' ||
              t.status === 'extracting' ||
              t.status === 'uploading' ||
              t.status === 'analyzing'
          );
          const queuedPendingTasks = tasks.filter(t => t.status === 'pending');

          return (
          <div className="space-y-6 animate-fade-in">
            {dashboardNotice && (
              <div className="p-3.5 bg-[#38BDF8]/10 border border-[#38BDF8]/30 rounded-2xl text-xs text-[#38BDF8] flex items-center justify-between gap-2">
                <span>{dashboardNotice}</span>
                <button
                  type="button"
                  onClick={() => setDashboardNotice('')}
                  className="text-indigo-300 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* KPI карточки (честный подсчет строго по валидно проверенным занятиям) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-4">
                <div className="text-[11px] text-indigo-300 font-medium">Проверено занятий</div>
                <div className="text-2xl font-black text-white mt-1 tabular-nums">
                  {validCompletedTasks.length}
                </div>
                <div className="text-[10px] text-emerald-400 mt-1">Завершённые проверки</div>
              </div>

              <div className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-4">
                <div className="text-[11px] text-indigo-300 font-medium">Средний балл школы</div>
                <div className="text-2xl font-black text-[#FF5252] mt-1 tabular-nums">
                  {avgScore !== null ? (
                    <>
                      {avgScore} <span className="text-sm font-normal text-indigo-300">/ 100</span>
                    </>
                  ) : (
                    <span className="text-indigo-400">—</span>
                  )}
                </div>
                <div className="text-[10px] text-indigo-300 mt-1">
                  {avgScore !== null ? 'По всем проверенным занятиям' : 'Нет завершённых оценок'}
                </div>
              </div>

              <div className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-4">
                <div className="text-[11px] text-indigo-300 font-medium">Эталонных занятий (90+)</div>
                <div className="text-2xl font-black text-emerald-400 mt-1 tabular-nums">
                  {validCompletedTasks.filter(t => t.totalScore >= 90).length}
                </div>
                <div className="text-[10px] text-emerald-400/80 mt-1">Высокий методический уровень</div>
              </div>

              <div className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-4">
                <div className="text-[11px] text-indigo-300 font-medium">Критических замечаний</div>
                <div className="text-2xl font-black text-amber-400 mt-1 tabular-nums">
                  {validCompletedTasks.filter(t => t.criticalViolations && t.criticalViolations.length > 0).length}
                </div>
                <div className="text-[10px] text-amber-400/80 mt-1">Требуют внимания куратора</div>
              </div>
            </div>

            {/* Панель фильтров и кнопка экспорта в Excel */}
            <div className="bg-[#1B153B] border border-indigo-800/50 rounded-3xl p-5 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <div className="relative min-w-[220px]">
                  <Search className="w-4 h-4 text-indigo-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Поиск по ссылке КТалк / преподавателю / предмету / группе / куратору..."
                    className="w-full bg-[#14102C] border border-indigo-800/60 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-indigo-400/50 focus:outline-none focus:border-[#FF5252]"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Filter className="w-3.5 h-3.5 text-indigo-400" />
                  <select
                    value={selectedTeacherFilter}
                    onChange={(e) => setSelectedTeacherFilter(e.target.value)}
                    className="bg-[#14102C] border border-indigo-800/60 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FF5252]"
                  >
                    <option value="all">Все преподаватели</option>
                    {teachersList.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                <button
                  onClick={handleServerExportExcel}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-900/40 flex items-center gap-2 shrink-0 cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Выгрузить в Excel (.xlsx)</span>
                </button>
              </div>
            </div>

            {/* Таблица проверенных уроков */}
            <div className="bg-[#1B153B] border border-indigo-800/50 rounded-3xl overflow-hidden shadow-xl">
              <div className="px-6 py-4 border-b border-indigo-900/50 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#FF5252]" />
                    <span>Реестр проверенных занятий ({filteredTasks.length})</span>
                  </h3>
                  {(activeWorkerTasks.length > 0 || queuedPendingTasks.length > 0) && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-cyan-300 font-semibold bg-cyan-500/10 border border-cyan-500/30 px-2.5 py-1 rounded-lg">
                      <Clock className="w-3.5 h-3.5 text-cyan-400" />
                      <span>
                        Сейчас проверяется: {activeWorkerTasks.length} • в очереди: {queuedPendingTasks.length}
                      </span>
                    </span>
                  )}
                </div>
                <span className="text-xs text-indigo-300">
                  Нажмите на строку, чтобы открыть подробный разбор занятия
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#14102C]/80 text-indigo-300 uppercase text-[10px] tracking-wider border-b border-indigo-900/40">
                    <tr>
                      <th className="px-6 py-3">Дата / Время</th>
                      <th className="px-6 py-3">Преподаватель</th>
                      <th className="px-6 py-3">Предмет & Группа</th>
                      <th className="px-6 py-3">Ссылка на занятие</th>
                      <th className="px-6 py-3 text-center">Оценка</th>
                      <th className="px-6 py-3">Статус проверки</th>
                      <th className="px-6 py-3 text-right">Действие</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-indigo-900/30">
                    {filteredTasks.map((t) => {
                      const hasCritical = Array.isArray(t.criticalViolations) && t.criticalViolations.length > 0;
                      const isCompletedValid = t.status === 'completed' && !t.isCorrupted && typeof t.totalScore === 'number';
                      const isInProgress = ['pending', 'downloading', 'extracting', 'uploading', 'analyzing'].includes(t.status);
                      const canRetry = !isInProgress;

                      return (
                      <tr
                        key={t.id}
                        onClick={() => {
                          if (isCompletedValid) {
                            setActiveDetailTask(t);
                          } else if (t.status === 'failed' || t.isCorrupted || t.rawBrokenResponse) {
                            setRawJsonModalTask(t);
                          }
                        }}
                        className={`transition-colors group ${
                          isCompletedValid || t.status === 'failed' || t.isCorrupted || t.rawBrokenResponse
                            ? 'hover:bg-[#241E4F]/50 cursor-pointer'
                            : 'opacity-85 cursor-default'
                        }`}
                      >
                        <td className="px-6 py-4 font-mono text-indigo-200/80 whitespace-nowrap">
                          {t.date}
                        </td>
                        <td className="px-6 py-4 font-bold text-white">
                          <div>{t.teacherName}</div>
                          {hasCritical && isCompletedValid && (
                            <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-rose-300">
                              <AlertTriangle className="w-3 h-3 text-rose-400" />
                              <span>Крит. нарушение</span>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-indigo-200">
                          <div>{t.subject}</div>
                          <div className="text-[10px] text-indigo-400">{t.groupName}</div>
                        </td>
                        <td className="px-6 py-4 max-w-[200px]" onClick={(e) => e.stopPropagation()}>
                          {t.lectureUrl ? (
                            <a
                              href={t.lectureUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#38BDF8] hover:text-[#70d3ff] underline text-[11px] font-mono inline-flex items-center gap-1.5 truncate max-w-full"
                              title={t.lectureUrl}
                            >
                              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{t.lectureUrl.replace(/^https?:\/\//, '')}</span>
                            </a>
                          ) : (
                            <span className="text-indigo-400 font-mono">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {t.isCorrupted ? (
                            <span className="inline-block px-2.5 py-1 rounded-lg font-mono font-bold text-[11px] bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              Не оценено
                            </span>
                          ) : isCompletedValid ? (
                            <div className="space-y-1">
                              <span
                                className={`inline-block px-2.5 py-1 rounded-lg font-mono font-bold text-xs tabular-nums ${
                                  hasCritical
                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                    : t.totalScore >= 90
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : t.totalScore >= 80
                                    ? 'bg-[#38BDF8]/20 text-[#38BDF8] border border-[#38BDF8]/30'
                                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                }`}
                              >
                                {t.totalScore} / 100
                              </span>
                              {typeof t.applicableCount === 'number' && Array.isArray(t.criteria) && t.criteria.length > 0 && t.applicableCount < t.criteria.length && (
                                <div className="text-[10px] font-mono text-indigo-300">
                                  учтено {t.applicableCount}/{t.criteria.length}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-indigo-400 font-mono">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 max-w-[240px]">
                          {t.status === 'failed' ? (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1.5 text-[11px] text-rose-300 font-semibold bg-rose-500/10 border border-rose-500/30 px-2.5 py-1 rounded-lg">
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                <span>{t.isCorrupted ? 'Не удалось разобрать отчёт' : 'Ошибка проверки'}</span>
                              </span>
                              {t.errorMessage && (
                                <div className="text-[11px] text-rose-200/80 leading-snug line-clamp-2" title={t.errorMessage}>
                                  {t.errorMessage}
                                </div>
                              )}
                            </div>
                          ) : t.isCorrupted ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-300 font-semibold bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-lg">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              Не удалось разобрать отчёт
                            </span>
                          ) : t.status === 'completed' ? (
                            <div className="space-y-1">
                              {(() => {
                                const completedModel = t.aiModel || t.talkMetadata?.aiModel || null;
                                const isBaseModel = completedModel === 'GigaChat-2' || completedModel === 'GigaChat';
                                const usage = t.tokenUsage;
                                const framesUp = t.framesUploaded ?? t.talkMetadata?.framesUploaded ?? null;
                                const framesPlan = t.framesPlanned ?? t.talkMetadata?.framesPlanned ?? null;
                                return (
                                  <>
                                    <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
                                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                      <span>
                                        {completedModel ? (
                                          <>
                                            Проверено{' '}
                                            <span className={`font-mono ${isBaseModel ? 'text-amber-300 font-semibold' : 'text-emerald-300 font-semibold'}`}>
                                              {completedModel}
                                            </span>
                                          </>
                                        ) : (
                                          'Проверка завершена'
                                        )}
                                      </span>
                                    </span>
                                    {isSenior && (
                                      <div className="text-[10px] font-mono tabular-nums text-indigo-300/85">
                                        {usage && typeof usage.totalTokens === 'number' && usage.totalTokens > 0 ? (
                                          <>
                                            {Number(usage.totalTokens).toLocaleString('ru-RU')} ток.
                                            {typeof framesUp === 'number' && (
                                              <>
                                                <span aria-hidden="true"> · </span>
                                                {framesUp}{typeof framesPlan === 'number' ? `/${framesPlan}` : ''} кадр.
                                              </>
                                            )}
                                          </>
                                        ) : typeof framesUp === 'number' ? (
                                          <span>{framesUp}{typeof framesPlan === 'number' ? `/${framesPlan}` : ''} кадр.</span>
                                        ) : (
                                          <span className="text-indigo-400/70">Без учёта токенов</span>
                                        )}
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          ) : t.status === 'pending' ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-indigo-200 font-semibold bg-indigo-500/15 border border-indigo-400/30 px-2.5 py-1 rounded-lg">
                              <Clock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                              <span>
                                В очереди {t.queuePosition ? `#${t.queuePosition}` : ''}
                              </span>
                            </span>
                          ) : (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1.5 text-[11px] text-[#38BDF8] font-medium">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                {t.status === 'downloading'
                                  ? 'Скачиваем видеозапись...'
                                  : t.status === 'extracting'
                                  ? 'Готовим аудио и кадры...'
                                  : t.status === 'uploading'
                                  ? 'Загружаем материалы...'
                                  : 'Идёт проверка занятия...'}
                              </span>
                              <div className="w-28 bg-[#14102C] h-1.5 rounded-full overflow-hidden">
                                <div
                                  className="bg-[#38BDF8] h-full transition-all duration-500"
                                  style={{ width: `${t.progressPct}%` }}
                                ></div>
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          {t.status === 'pending' ? (
                            <button
                              disabled
                              className="px-2.5 py-1.5 bg-indigo-950/50 border border-indigo-700/40 text-indigo-300/80 rounded-xl text-xs font-medium cursor-not-allowed ml-auto flex items-center gap-1.5"
                              title="Занятие ожидает своей очереди на проверку"
                            >
                              <Clock className="w-3 h-3 text-cyan-400" />
                              <span>Ожидает</span>
                            </button>
                          ) : isInProgress ? (
                            <button
                              disabled
                              className="px-2.5 py-1.5 bg-indigo-950/30 border border-indigo-800/20 text-indigo-400/40 rounded-xl text-xs font-medium cursor-not-allowed ml-auto flex items-center gap-1.5"
                              title="Проверка занятия ещё выполняется"
                            >
                              <span>В процессе...</span>
                            </button>
                          ) : isCompletedValid ? (
                            <div className="flex items-center justify-end gap-2.5">
                              <button
                                type="button"
                                onClick={(e) => handleRetryTask(e, t.id)}
                                disabled={retryingTaskId === t.id}
                                className="px-2.5 py-1.5 bg-[#14102C] hover:bg-[#241E4F] border border-indigo-700/60 text-indigo-200 hover:text-white disabled:opacity-50 rounded-xl text-xs font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                                title="Отправить это занятие на повторную проверку"
                              >
                                <RotateCcw className={`w-3.5 h-3.5 text-[#38BDF8] ${retryingTaskId === t.id ? 'animate-spin' : ''}`} />
                                <span>{retryingTaskId === t.id ? 'Запуск...' : 'Перепроверить'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveDetailTask(t);
                                }}
                                className="text-[#FF5252] group-hover:text-white font-semibold text-xs flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                              >
                                <span>Подробнее</span>
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : canRetry ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={(e) => handleRetryTask(e, t.id)}
                                disabled={retryingTaskId === t.id}
                                className="px-3 py-1.5 bg-[#FF5252] hover:bg-[#ff3b3b] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                                title="Повторно поставить занятие в очередь проверки"
                              >
                                <RotateCcw className={`w-3.5 h-3.5 ${retryingTaskId === t.id ? 'animate-spin' : ''}`} />
                                <span>{retryingTaskId === t.id ? 'Запуск...' : 'Повторить'}</span>
                              </button>
                              {t.rawBrokenResponse && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRawJsonModalTask(t);
                                  }}
                                  className="px-2.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 hover:text-white rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1 cursor-pointer shrink-0"
                                  title="Посмотреть детали ошибки"
                                >
                                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                                </button>
                              )}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                      );
                    })}
                    {filteredTasks.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-xs text-indigo-300">
                          <div className="max-w-md mx-auto space-y-3">
                            <FileText className="w-8 h-8 text-indigo-400 mx-auto opacity-40" />
                            <div className="font-bold text-white text-sm">
                              {tasks.length === 0 ? 'База проверок пуста' : 'Нет занятий, соответствующих выбранным фильтрам'}
                            </div>
                            <p className="text-indigo-300/80 text-xs">
                              {tasks.length === 0
                                ? 'В системе пока нет проверенных занятий. Перейдите во вкладку «Проверить встречу КТалк», чтобы отправить первую запись.'
                                : 'Попробуйте сбросить фильтр преподавателя или поисковый запрос.'}
                            </p>
                            {tasks.length === 0 && (
                              <button
                                onClick={() => setActiveTab('submit')}
                                className="px-4 py-2 bg-[#FF5252] hover:bg-[#ff3b3b] text-white rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Отправить первую встречу КТалк</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          );
        })()}

        {/* ======================================================== */}
        {/* ВКЛАДКА 2: ОТПРАВКА ВСТРЕЧИ КТАЛК НА АНАЛИЗ               */}
        {/* ======================================================== */}
        {activeTab === 'submit' && (() => {
          const q = ktalkSearchQuery.trim().toLowerCase();
          const filteredUnreviewed = unreviewedRecordings.filter(r => {
            if (!q) return true;
            return (
              (r.title || '').toLowerCase().includes(q) ||
              (r.authorName || '').toLowerCase().includes(q) ||
              (r.authorLogin || '').toLowerCase().includes(q) ||
              (r.authorEmail || '').toLowerCase().includes(q) ||
              (r.roomName || '').toLowerCase().includes(q) ||
              (r.recordingKey || '').toLowerCase().includes(q) ||
              formatKtalkDateTime(r.createdDate).toLowerCase().includes(q)
            );
          });

          return (
            <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
              <div className="bg-gradient-to-r from-[#241E4F] via-[#2B2363] to-[#1F1A44] border border-indigo-500/30 rounded-3xl p-6 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#38BDF8]">
                    Контур.Толк • Автообновление каждые 5 минут
                  </div>
                  <h2 className="text-xl font-black text-white">
                    Новые записи вебинаров и отправка на проверку
                  </h2>
                  <p className="text-xs text-indigo-200/80 leading-relaxed max-w-3xl">
                    Нажмите на любую непроверенную встречу — откроется окно с её данными и ссылкой. Укажите преподавателя, предмет и группу и отправьте запись на проверку.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end gap-3 shrink-0">
                  {ktalkSyncStatus?.configured && ktalkSyncStatus.domain && (
                    <div className="text-xs text-indigo-200/90 lg:text-right space-y-0.5">
                      <div className="text-[11px] text-indigo-300">Пространство КТалк</div>
                      <div className="font-mono font-semibold text-white">{ktalkSyncStatus.domain.replace(/^https?:\/\//i, '')}</div>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={openManualCheckModal}
                    className="px-4 py-2.5 bg-[#FF5252] hover:bg-[#ff3b3b] text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-[#FF5252]/30 inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Ввести ссылку вручную</span>
                  </button>
                </div>
              </div>

              {/* СПИСОК НЕПРОВЕРЕННЫХ / СКРЫТЫХ ВСТРЕЧ КОНТУР.ТОЛК */}
              <div className="bg-[#1B153B] border border-indigo-800/50 rounded-3xl p-5 sm:p-6 space-y-4 shadow-xl">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Video className="w-4 h-4 text-[#38BDF8]" />
                      <span>{showHiddenKtalk ? 'Скрытые встречи (не лекции)' : 'Непроверенные встречи'}</span>
                      <span className="font-mono tabular-nums text-xs text-[#38BDF8]">
                        ({showHiddenKtalk ? hiddenRecordings.length : unreviewedRecordings.length})
                      </span>
                    </h3>
                    <div className="text-[11px] text-indigo-300/80 mt-0.5 font-mono tabular-nums">
                      {ktalkSyncStatus?.lastSyncedAt
                        ? `Обновлено: ${formatKtalkDateTime(ktalkSyncStatus.lastSyncedAt)}`
                        : 'Ожидание первой синхронизации'}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        const next = !showHiddenKtalk;
                        setShowHiddenKtalk(next);
                        if (next) void fetchHiddenRecordings();
                      }}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                        showHiddenKtalk
                          ? 'bg-indigo-600/40 border-[#38BDF8] text-white'
                          : 'bg-[#14102C] hover:bg-[#241E4F] border-indigo-700/60 text-indigo-300 hover:text-white'
                      }`}
                    >
                      {showHiddenKtalk ? 'К новым встречам' : 'Скрытые'}
                    </button>

                    <button
                      type="button"
                      onClick={handleManualKtalkSync}
                      disabled={isSyncingKtalk}
                      className="px-3.5 py-2 bg-[#14102C] hover:bg-[#241E4F] border border-indigo-700/60 hover:border-[#38BDF8]/60 text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 text-[#38BDF8] ${isSyncingKtalk ? 'animate-spin' : ''}`} />
                      <span>{isSyncingKtalk ? 'Обновление...' : 'Обновить список'}</span>
                    </button>
                  </div>
                </div>

                {ktalkSyncStatus && !ktalkSyncStatus.configured && (
                  <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-xs text-amber-200 leading-relaxed">
                    Автоматическая загрузка встреч отключена: задайте параметры <code className="font-mono text-white bg-[#14102C] px-1.5 py-0.5 rounded">TALK_DOMAIN</code> и <code className="font-mono text-white bg-[#14102C] px-1.5 py-0.5 rounded">TALK_API_KEY</code> в файле <code className="font-mono text-white bg-[#14102C] px-1.5 py-0.5 rounded">.env</code> на сервере. Вы можете отправить лекцию по ссылке через кнопку «Ввести ссылку вручную».
                  </div>
                )}

                {ktalkSyncStatus?.lastError && ktalkSyncStatus.configured && (
                  <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-xs text-rose-200 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{ktalkSyncStatus.lastError}</span>
                  </div>
                )}

                {ktalkSyncNotice && !ktalkSyncStatus?.lastError && (
                  <div className="px-3.5 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300">
                    {ktalkSyncNotice}
                  </div>
                )}

                {!showHiddenKtalk && (
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-indigo-400 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      value={ktalkSearchQuery}
                      onChange={(e) => setKtalkSearchQuery(e.target.value)}
                      placeholder="Поиск по названию, автору, комнате или дате..."
                      className="w-full bg-[#14102C] border border-indigo-800/60 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-indigo-400/50 focus:outline-none focus:border-[#38BDF8]"
                    />
                  </div>
                )}

                {showHiddenKtalk ? (
                  isLoadingHiddenKtalk ? (
                    <div className="py-12 text-center text-xs text-indigo-300 flex flex-col items-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin text-[#38BDF8]" />
                      <span>Загрузка скрытых встреч...</span>
                    </div>
                  ) : hiddenRecordings.length === 0 ? (
                    <div className="py-10 px-4 text-center bg-[#14102C]/70 border border-indigo-900/50 rounded-2xl space-y-2">
                      <EyeOff className="w-6 h-6 text-indigo-400/70 mx-auto" />
                      <div className="text-xs font-bold text-white">Скрытых встреч нет</div>
                      <p className="text-[11px] text-indigo-300/80 max-w-sm mx-auto">
                        Здесь отображаются встречи, отмеченные кнопкой «Скрыть / Не лекция». При необходимости любую из них можно вернуть обратно.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[680px] overflow-y-auto pr-1">
                      {hiddenRecordings.map((rec) => {
                        const isRestoring = restoringRecordingKey === rec.recordingKey;
                        return (
                          <div
                            key={rec.recordingKey}
                            className="rounded-2xl p-4 border bg-[#14102C] border-indigo-900/60 space-y-2 flex flex-col justify-between"
                          >
                            <div className="space-y-1.5">
                              <div className="font-bold text-white text-sm leading-snug">
                                {rec.title || `Встреча ${rec.recordingKey}`}
                              </div>
                              <div className="text-[11px] text-indigo-300 font-mono tabular-nums">
                                {formatKtalkDateTime(rec.createdDate)} {rec.duration ? `· ${rec.duration}` : ''}
                              </div>
                            </div>
                            <div className="pt-2 border-t border-indigo-900/50 flex items-center justify-between gap-2">
                              <span className="text-[11px] text-indigo-400 font-mono truncate">{rec.authorName || 'Автор не указан'}</span>
                              <button
                                type="button"
                                onClick={(e) => handleRestoreKtalkRecording(e, rec)}
                                disabled={isRestoring}
                                className="px-3 py-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-400/40 text-white rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shrink-0"
                              >
                                <RotateCcw className={`w-3 h-3 ${isRestoring ? 'animate-spin' : ''}`} />
                                <span>Вернуть в список</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : isLoadingKtalk && unreviewedRecordings.length === 0 ? (
                  <div className="py-12 text-center text-xs text-indigo-300 flex flex-col items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-[#38BDF8]" />
                    <span>Загрузка записей Контур.Толк...</span>
                  </div>
                ) : filteredUnreviewed.length === 0 ? (
                  <div className="py-10 px-4 text-center bg-[#14102C]/70 border border-indigo-900/50 rounded-2xl space-y-3">
                    <Video className="w-6 h-6 text-indigo-400/70 mx-auto" />
                    <div className="text-xs font-bold text-white">
                      {unreviewedRecordings.length === 0
                        ? 'Новых непроверенных встреч пока нет'
                        : 'Ничего не найдено по вашему запросу'}
                    </div>
                    <p className="text-[11px] text-indigo-300/80 max-w-md mx-auto leading-relaxed">
                      {unreviewedRecordings.length === 0
                        ? 'Все синхронизированные записи уже отправлены на проверку или скрыты. Нажмите «Обновить список» или отправьте запись по ссылке вручную.'
                        : 'Попробуйте изменить строку поиска или сбросить фильтр.'}
                    </p>
                    <div>
                      <button
                        type="button"
                        onClick={openManualCheckModal}
                        className="px-4 py-2 bg-[#FF5252] hover:bg-[#ff3b3b] text-white rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Ввести ссылку вручную</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[680px] overflow-y-auto pr-1">
                    {filteredUnreviewed.map((rec) => {
                      const isSelected = isCheckModalOpen && selectedKtalkRecording?.recordingKey === rec.recordingKey;
                      const isHiding = hidingRecordingKey === rec.recordingKey;
                      return (
                        <div
                          key={rec.recordingKey}
                          onClick={() => handleSelectKtalkRecording(rec)}
                          className={`rounded-2xl p-4 border transition-all cursor-pointer space-y-2.5 flex flex-col justify-between ${
                            isSelected
                              ? 'bg-[#241E4F] border-[#38BDF8] shadow-lg shadow-[#38BDF8]/10'
                              : 'bg-[#14102C] border-indigo-900/60 hover:border-[#38BDF8]/70 hover:bg-[#1E1843]'
                          }`}
                        >
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="font-bold text-white text-sm leading-snug">
                                {rec.title || `Встреча ${rec.recordingKey}`}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-indigo-200/90 font-mono tabular-nums">
                              <span>{formatKtalkDateTime(rec.createdDate)}</span>
                              {rec.duration && (
                                <>
                                  <span className="text-indigo-500">·</span>
                                  <span>{rec.duration}</span>
                                </>
                              )}
                              {rec.resolutions && rec.resolutions.length > 0 && (
                                <>
                                  <span className="text-indigo-500">·</span>
                                  <span>{rec.resolutions.join(', ')}</span>
                                </>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-indigo-200">
                              <span>
                                Ведущий: <strong className="text-white font-semibold">{rec.authorName || 'Не указан'}</strong>
                              </span>
                              {(rec.authorEmail || rec.authorLogin) && (
                                <>
                                  <span className="text-indigo-500">·</span>
                                  <span className="font-mono text-[11px] text-indigo-300">
                                    {rec.authorEmail || rec.authorLogin}
                                  </span>
                                </>
                              )}
                              {rec.roomName && (
                                <>
                                  <span className="text-indigo-500">·</span>
                                  <span className="text-indigo-300">Комната: {rec.roomName}</span>
                                </>
                              )}
                            </div>

                            <div className="text-[11px] font-mono text-[#38BDF8]/80 truncate">
                              {rec.lectureUrl}
                            </div>
                          </div>

                          <div className="pt-2 border-t border-indigo-900/50 flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectKtalkRecording(rec);
                              }}
                              className="px-3 py-1.5 bg-[#FF5252] hover:bg-[#ff3b3b] text-white rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <Play className="w-3 h-3 fill-white" />
                              <span>Открыть для проверки</span>
                            </button>

                            <button
                              type="button"
                              onClick={(e) => handleHideKtalkRecording(e, rec)}
                              disabled={isHiding}
                              className="px-2.5 py-1.5 bg-[#1B153B] hover:bg-rose-950/50 border border-indigo-800/60 hover:border-rose-500/40 text-indigo-300 hover:text-rose-200 rounded-lg text-[11px] font-medium transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                              title="Скрыть встречу, если это внутренний созвон или тест"
                            >
                              {isHiding ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <EyeOff className="w-3 h-3" />
                              )}
                              <span>Скрыть / Не лекция</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Недавние проверки внизу на всю ширину */}
              {tasks.length > 0 && (
                <div className="bg-[#1B153B] border border-indigo-800/50 rounded-3xl p-6 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[#FF5252]" />
                      <span>Последние отправленные занятия ({tasks.slice(0, 5).length})</span>
                    </h3>
                    <button
                      onClick={() => setActiveTab('dashboard')}
                      className="text-xs text-[#FF5252] hover:text-white font-semibold transition-colors flex items-center gap-1"
                    >
                      <span>Перейти в полный дашборд</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {tasks.slice(0, 5).map((t) => (
                      <div
                        key={t.id}
                        onClick={() => {
                          setActiveTab('dashboard');
                          if (t.status === 'completed' && !t.isCorrupted) {
                            setActiveDetailTask(t);
                          } else if (t.status === 'failed' || t.isCorrupted || t.rawBrokenResponse) {
                            setRawJsonModalTask(t);
                          }
                        }}
                        className="bg-[#14102C] hover:bg-[#241E4F]/60 border border-indigo-900/40 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-colors cursor-pointer group"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-xs">{t.teacherName}</span>
                            <span className="text-[10px] text-indigo-300 bg-indigo-900/40 px-2 py-0.5 rounded-full border border-indigo-700/30">
                              {t.subject}
                            </span>
                          </div>
                          <div className="text-[11px] text-indigo-400 truncate max-w-md">
                            {t.lectureUrl}
                          </div>
                        </div>

                        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                          {t.status === 'completed' && !t.isCorrupted && typeof t.totalScore === 'number' ? (
                            <span className="px-3 py-1 rounded-xl font-mono font-bold text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              {t.totalScore} / 100
                            </span>
                          ) : t.status === 'failed' || t.isCorrupted ? (
                            <span className="px-3 py-1 rounded-xl font-semibold text-xs bg-rose-500/20 text-rose-300 border border-rose-500/30 inline-flex items-center gap-1.5">
                              <AlertTriangle className="w-3 h-3" />
                              {t.isCorrupted ? 'Ошибка отчёта' : 'Ошибка'}
                            </span>
                          ) : t.status === 'pending' ? (
                            <span className="px-3 py-1 rounded-xl font-semibold text-xs bg-indigo-500/15 text-indigo-200 border border-indigo-400/30 inline-flex items-center gap-1.5">
                              <Clock className="w-3 h-3 text-cyan-400" />
                              <span>В очереди {t.queuePosition ? `#${t.queuePosition}` : ''}</span>
                            </span>
                          ) : (
                            <div className="space-y-1 w-32">
                              <div className="flex items-center gap-1.5 text-[10px] text-[#38BDF8]">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>
                                  {t.progressPct}% • {t.status === 'downloading' ? 'Скачивание...' : t.status === 'extracting' ? 'Подготовка...' : t.status === 'uploading' ? 'Загрузка...' : 'Проверка...'}
                                </span>
                              </div>
                              <div className="w-full bg-indigo-950 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className="bg-[#38BDF8] h-full transition-all duration-500"
                                  style={{ width: `${t.progressPct}%` }}
                                ></div>
                              </div>
                            </div>
                          )}
                          <span className="text-xs text-[#FF5252] group-hover:text-white font-semibold flex items-center gap-0.5">
                            <span>{t.status === 'completed' && !t.isCorrupted ? 'Карточка' : 'Дашборд'}</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ======================================================== */}
        {/* ВКЛАДКА 3: УПРАВЛЕНИЕ КУРАТОРАМИ (SENIOR CURATOR ONLY)    */}
        {/* ======================================================== */}
        {activeTab === 'curators' && isSenior && (
          <div className="space-y-6 animate-fade-in">
            {/* Баннер */}
            <div className="bg-gradient-to-r from-[#241E4F] via-[#2B2363] to-[#1F1A44] border border-amber-500/30 rounded-3xl p-6 shadow-xl space-y-2">
              <div className="flex items-center gap-2">
                <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full tracking-wider flex items-center gap-1.5">
                  <Crown className="w-3 h-3 text-amber-400" />
                  Панель старшего куратора
                </span>
                <span className="text-xs text-indigo-300">Белый список и распределение ролей</span>
              </div>
              <h2 className="text-xl font-black text-white">
                Управление командой кураторов и доступом к системе
              </h2>
              <p className="text-xs text-indigo-200/80 leading-relaxed max-w-3xl">
                Здесь вы можете добавить email нового сотрудника, чтобы он смог войти в систему. При необходимости куратора можно назначить старшим — это откроет доступ к настройкам критериев, правил проверки и лимитов.
              </p>
            </div>

            {curatorActionMessage && (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-xs text-emerald-300 flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>{curatorActionMessage}</span>
              </div>
            )}

            {curatorActionError && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-xs text-rose-300 flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span>{curatorActionError}</span>
              </div>
            )}

            {/* Форма добавления нового куратора */}
            <form onSubmit={handleAddCurator} className="bg-[#1B153B] border border-indigo-800/50 rounded-3xl p-6 space-y-4 shadow-xl">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-[#FF5252]" />
                <span>Добавить email куратора в белый список</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-indigo-200 mb-1">Email куратора:</label>
                  <input
                    type="email"
                    value={newCuratorEmail}
                    onChange={(e) => setNewCuratorEmail(e.target.value)}
                    placeholder="curator@olympiadpractices.ru"
                    required
                    className="w-full bg-[#14102C] border border-indigo-800/60 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FF5252]"
                  />
                </div>

                <div>
                  <label className="block text-xs text-indigo-200 mb-1">ФИО (для отображения):</label>
                  <input
                    type="text"
                    value={newCuratorName}
                    onChange={(e) => setNewCuratorName(e.target.value)}
                    placeholder="Анна Смирнова"
                    className="w-full bg-[#14102C] border border-indigo-800/60 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FF5252]"
                  />
                </div>

                <div>
                  <label className="block text-xs text-indigo-200 mb-1">Начальная роль:</label>
                  <select
                    value={newCuratorRole}
                    onChange={(e) => setNewCuratorRole(e.target.value as any)}
                    className="w-full bg-[#14102C] border border-indigo-800/60 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FF5252]"
                  >
                    <option value="curator">Обычный куратор</option>
                    <option value="senior_curator">Старший куратор (полный доступ)</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[#FF5252] hover:bg-[#ff3b3b] text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-[#FF5252]/30 flex items-center gap-2"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Добавить в белый список</span>
                </button>
              </div>
            </form>

            {/* Таблица зарегистрированных кураторов */}
            <div className="bg-[#1B153B] border border-indigo-800/50 rounded-3xl overflow-hidden shadow-xl">
              <div className="px-6 py-4 border-b border-indigo-900/50 flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-amber-400" />
                  <span>Разрешенные кураторы ({curatorsList.length})</span>
                </h3>
                <span className="text-xs text-indigo-300">
                  Только эти пользователи могут авторизоваться
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#14102C]/80 text-indigo-300 uppercase text-[10px] tracking-wider border-b border-indigo-900/40">
                    <tr>
                      <th className="px-6 py-3">Email & Имя</th>
                      <th className="px-6 py-3">Текущая роль</th>
                      <th className="px-6 py-3">Статус</th>
                      <th className="px-6 py-3">Кем добавлен</th>
                      <th className="px-6 py-3 text-right">Управление ролью</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-indigo-900/30">
                    {curatorsList.map((c) => (
                      <tr key={c.email} className="hover:bg-[#241E4F]/40 transition-colors">
                        <td className="px-6 py-4 font-mono">
                          <div className="font-bold text-white">{c.email}</div>
                          <div className="text-[11px] text-indigo-300 font-sans">{c.fullName}</div>
                        </td>
                        <td className="px-6 py-4">
                          {c.role === 'senior_curator' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              <Crown className="w-3 h-3 text-amber-400" />
                              Старший куратор
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium bg-[#14102C] text-indigo-200 border border-indigo-700/40">
                              Куратор
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {c.status === 'active' ? (
                            <span className="text-emerald-400 font-medium">Активен</span>
                          ) : (
                            <span className="text-rose-400 font-medium">Заблокирован</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-indigo-300 text-[11px]">
                          {c.addedBy || 'Система'}
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          {c.role === 'curator' ? (
                            <button
                              onClick={() => handleUpdateRole(c.email, 'senior_curator')}
                              className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1"
                            >
                              <Crown className="w-3 h-3" />
                              <span>Назначить старшим</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleUpdateRole(c.email, 'curator')}
                              disabled={c.email === currentUser.email}
                              className="px-3 py-1.5 bg-indigo-900/40 hover:bg-indigo-900/60 border border-indigo-700/40 text-indigo-300 hover:text-white disabled:opacity-40 rounded-lg text-xs transition-colors"
                            >
                              Снять права старшего
                            </button>
                          )}

                          {c.email !== currentUser.email && c.email !== 'shurygin.egor2009@gmail.com' && (
                            <>
                              <button
                                onClick={() =>
                                  handleToggleStatus(c.email, c.status === 'active' ? 'blocked' : 'active')
                                }
                                className={`px-2.5 py-1.5 rounded-lg text-xs border transition-colors inline-flex items-center gap-1 cursor-pointer ${
                                  c.status === 'active'
                                    ? 'bg-amber-950/40 hover:bg-amber-900/60 border-amber-500/30 text-amber-300'
                                    : 'bg-emerald-950/40 hover:bg-emerald-900/60 border-emerald-500/30 text-emerald-300'
                                }`}
                                title={c.status === 'active' ? 'Заблокировать доступ' : 'Разблокировать доступ'}
                              >
                                {c.status === 'active' ? (
                                  <>
                                    <Ban className="w-3.5 h-3.5" />
                                    <span>Блок</span>
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    <span>Разблок</span>
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => setConfirmDeleteCuratorEmail(c.email)}
                                className="px-2.5 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/30 text-rose-300 hover:text-rose-100 rounded-lg text-xs transition-colors inline-flex items-center gap-1 cursor-pointer"
                                title="Удалить из белого списка"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Удалить</span>
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* ВКЛАДКА: ЖУРНАЛ АУДИТА БД (ТОЛЬКО ДЛЯ СТАРШИХ КУРАТОРОВ) */}
        {/* ======================================================== */}
        {activeTab === 'audit' && isSenior && (
          <div className="space-y-6 animate-fade-in">
            {/* Карточка заголовка */}
            <div className="bg-[#1B153B] border border-cyan-800/50 rounded-3xl p-6 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center">
                    <Database className="w-6 h-6 text-[#38BDF8]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black uppercase tracking-widest text-[#38BDF8]">
                        Журнал событий системы
                      </span>
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-mono border border-emerald-500/30">
                        Хранение по 152-ФЗ
                      </span>
                    </div>
                    <h2 className="text-lg font-black text-white">
                      История действий кураторов и проверок
                    </h2>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={fetchAuditLogs}
                    disabled={isLoadingAudit}
                    className="px-4 py-2 bg-[#14102C] hover:bg-cyan-950/40 border border-cyan-700/50 text-[#38BDF8] rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${isLoadingAudit ? 'animate-spin' : ''}`} />
                    <span>Обновить</span>
                  </button>
                </div>
              </div>

              <p className="text-xs text-indigo-200/80 leading-relaxed">
                Здесь фиксируются все ключевые события: входы сотрудников, изменение ролей и белого списка, отправка записей на проверку, выгрузка отчётов и обновление критериев.
              </p>

              {/* Мини-статистика аудита */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-indigo-900/40">
                <div className="p-3 bg-[#14102C] rounded-xl border border-indigo-900/60">
                  <div className="text-[10px] text-indigo-400 font-medium">Записей в журнале</div>
                  <div className="text-lg font-black font-mono text-cyan-400 mt-0.5">
                    {auditLogs.length} событий
                  </div>
                </div>
                <div className="p-3 bg-[#14102C] rounded-xl border border-indigo-900/60">
                  <div className="text-[10px] text-indigo-400 font-medium">Надёжность хранения</div>
                  <div className="text-lg font-black font-mono text-emerald-400 mt-0.5">
                    Автосохранение
                  </div>
                </div>
                <div className="p-3 bg-[#14102C] rounded-xl border border-indigo-900/60">
                  <div className="text-[10px] text-indigo-400 font-medium">Срок хранения</div>
                  <div className="text-lg font-black font-mono text-indigo-200 mt-0.5">
                    Без ограничений
                  </div>
                </div>
              </div>
            </div>

            {/* Фильтр и поиск */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-indigo-400" />
                <input
                  type="text"
                  placeholder="Поиск по сотруднику, событию, занятию или IP..."
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-[#1B153B] border border-indigo-800/50 rounded-xl text-xs text-white placeholder-indigo-400 focus:outline-none focus:border-[#38BDF8]"
                />
              </div>
            </div>

            {/* Таблица событий аудита */}
            <div className="bg-[#1B153B] border border-indigo-800/50 rounded-3xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-[#14102C] text-indigo-300 uppercase text-[10px] font-bold tracking-wider border-b border-indigo-900/60">
                    <tr>
                      <th className="px-5 py-3">Дата и время</th>
                      <th className="px-5 py-3">Сотрудник</th>
                      <th className="px-5 py-3">Событие</th>
                      <th className="px-5 py-3">Занятие / объект</th>
                      <th className="px-5 py-3">Подробности</th>
                      <th className="px-5 py-3 text-right">IP-адрес</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-indigo-900/30">
                    {auditLogs
                      .filter((l) => {
                        if (!auditSearch) return true;
                        const q = auditSearch.toLowerCase();
                        return (
                          l.actorEmail?.toLowerCase().includes(q) ||
                          l.action?.toLowerCase().includes(q) ||
                          l.target?.toLowerCase().includes(q) ||
                          l.details?.toLowerCase().includes(q) ||
                          l.ipAddress?.toLowerCase().includes(q)
                        );
                      })
                      .map((log) => {
                        const isAuth = log.action?.startsWith('LOGIN');
                        const isCurator = log.action?.startsWith('CURATOR');
                        const isTask = log.action?.startsWith('KTALK') || log.action?.startsWith('TASK');
                        const isPrompt = log.action?.startsWith('PROMPT');
                        const isExport = log.action?.startsWith('ANALYTICS');

                        let badgeColor = 'bg-indigo-900/40 text-indigo-300 border-indigo-700/40';
                        if (log.action?.includes('SUCCESS') || log.action?.includes('COMPLETED')) {
                          badgeColor = 'bg-emerald-950/40 text-emerald-300 border-emerald-600/40';
                        } else if (log.action?.includes('FAILED') || log.action?.includes('REJECTED')) {
                          badgeColor = 'bg-rose-950/40 text-rose-300 border-rose-600/40';
                        } else if (isCurator) {
                          badgeColor = 'bg-amber-950/40 text-amber-300 border-amber-600/40';
                        } else if (isTask) {
                          badgeColor = 'bg-cyan-950/40 text-[#38BDF8] border-cyan-600/40';
                        } else if (isPrompt) {
                          badgeColor = 'bg-purple-950/40 text-purple-300 border-purple-600/40';
                        } else if (isExport) {
                          badgeColor = 'bg-emerald-950/40 text-emerald-400 border-emerald-500/40';
                        }

                        return (
                          <tr key={log.id} className="hover:bg-[#14102C]/60 transition-colors">
                            <td className="px-5 py-3 font-mono text-[11px] text-indigo-300 whitespace-nowrap">
                              {log.timestamp ? log.timestamp.replace('T', ' ').slice(0, 19) : '—'}
                            </td>
                            <td className="px-5 py-3">
                              <div className="font-semibold text-white">{log.actorEmail}</div>
                              <div className="text-[10px] text-indigo-400 font-mono">{log.actorRole}</div>
                            </td>
                            <td className="px-5 py-3 whitespace-nowrap">
                              <span className={`inline-block px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono border ${badgeColor}`}>
                                {log.action}
                              </span>
                            </td>
                            <td className="px-5 py-3 font-mono text-xs text-indigo-200 whitespace-nowrap">
                              {log.target || '—'}
                            </td>
                            <td className="px-5 py-3 text-xs text-slate-200 max-w-md">
                              {log.details || '—'}
                            </td>
                            <td className="px-5 py-3 text-right font-mono text-[11px] text-indigo-400 whitespace-nowrap">
                              {log.ipAddress || '127.0.0.1'}
                            </td>
                          </tr>
                        );
                      })}

                    {auditLogs.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-indigo-300 text-xs">
                          {isLoadingAudit ? 'Загрузка записей из базы данных...' : 'В журнале аудита пока нет записей.'}
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
        {/* ВКЛАДКА 4: УПРАВЛЕНИЕ КРИТЕРИЯМИ (ТОЛЬКО СТАРШИЙ КУРАТОР) */}
        {/* ======================================================== */}
        {activeTab === 'criteria_manager' && isSenior && (
          <CriteriaManager
            authToken={authToken}
            currentUserEmail={currentUser.email}
            onConfigUpdated={fetchCriteriaConfig}
          />
        )}

        {/* ======================================================== */}
        {/* ВКЛАДКА 5: РЕДАКТОР ПРОМПТА ИИ (ТОЛЬКО ДЛЯ СТАРШИХ)      */}
        {/* ======================================================== */}
        {activeTab === 'prompt_editor' && isSenior && (
          <PromptEditor
            token={authToken}
            userEmail={currentUser.email}
            isSeniorCurator={isSenior}
            onConfigUpdated={fetchCriteriaConfig}
          />
        )}

        {/* ======================================================== */}
        {/* ВКЛАДКА 5.5: ТОКЕНЫ И МОДЕЛИ ИИ (ТОЛЬКО ДЛЯ СТАРШИХ)     */}
        {/* ======================================================== */}
        {activeTab === 'ai_limits' && isSenior && (
          <AILimitsPanel
            token={authToken}
            isSeniorCurator={isSenior}
            tasks={tasks}
            onSettingsSaved={fetchTasksAndTeachers}
          />
        )}

        {/* ======================================================== */}
        {/* ВКЛАДКА 6: КРИТЕРИИ ОЦЕНКИ (ДИНАМИЧЕСКИЙ СПИСОК)         */}
        {/* ======================================================== */}
        {activeTab === 'criteria' && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-[#1B153B] border border-indigo-800/50 rounded-3xl p-6 space-y-4 shadow-xl">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-indigo-900/50 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-[#38BDF8]" />
                    <span>{dynamicStandardCriteria.length} стандартных педагогических критериев</span>
                  </h2>
                  <p className="text-xs text-indigo-300 mt-0.5">
                    Официальный стандарт школы «Олимпиадные Практики» (Макс. балл: {dynamicStandardCriteria.length * 5})
                  </p>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:flex-initial">
                    <Search className="w-3.5 h-3.5 text-indigo-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={criteriaSearch}
                      onChange={(e) => setCriteriaSearch(e.target.value)}
                      placeholder="Поиск критерия..."
                      className="bg-[#14102C] border border-indigo-800/60 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-indigo-400/50 focus:outline-none focus:border-[#FF5252]"
                    />
                  </div>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="bg-[#14102C] border border-indigo-800/60 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#FF5252]"
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c === 'all' ? 'Все категории' : c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredCriteria.map((c) => (
                  <div
                    key={c.id}
                    className="p-3.5 bg-[#14102C] border border-indigo-900/60 rounded-2xl flex items-start gap-3 hover:border-indigo-700/60 transition-colors"
                  >
                    <div className="w-6 h-6 rounded-lg bg-[#FF5252]/15 text-[#FF5252] border border-[#FF5252]/30 flex items-center justify-center font-mono font-bold text-xs shrink-0 mt-0.5">
                      {c.id}
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] text-indigo-400 uppercase font-bold tracking-wider">
                        {c.category}
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed">
                        {c.text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Критические критерии */}
            <div className="bg-[#1B153B] border border-rose-500/30 rounded-3xl p-6 space-y-4 shadow-xl">
              <div className="border-b border-rose-500/20 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-400" />
                  <span>{dynamicCriticalCriteria.length} критических нарушений методического контроля</span>
                </h3>
                <p className="text-xs text-rose-200/80 mt-0.5">
                  При выявлении хотя бы одного из этих пунктов фиксируется критический флаг в карточке проверки и отчётах с обязательными таймкодами (реальный процентный балл по критериям сохраняется без искажения)
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {dynamicCriticalCriteria.map((crit) => (
                  <div key={crit.id} className="p-3.5 bg-[#14102C] border border-rose-900/40 rounded-2xl space-y-1">
                    <div className="text-xs font-bold text-rose-300 flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full bg-rose-500/20 flex items-center justify-center font-mono text-[10px]">
                        {crit.id}
                      </span>
                      <span>{crit.title}</span>
                    </div>
                    <p className="text-[11px] text-indigo-200/80 leading-relaxed pl-6">
                      {crit.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </main>

      {/* МОДАЛЬНОЕ ОКНО ДЕТАЛЬНОГО ОТЧЕТА ПО ЗАНЯТИЮ */}
      {activeDetailTask && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1B153B] border border-indigo-700/60 rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl animate-fade-in overflow-hidden">
            {/* Шапка модалки */}
            <div className="p-6 border-b border-indigo-900/60 flex items-center justify-between bg-[#14102C]/60">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono tabular-nums text-indigo-300">
                  <span className="text-[#FF5252] font-bold">#{activeDetailTask.id}</span>
                  <span aria-hidden="true">·</span>
                  <span>{activeDetailTask.date}</span>
                  {(activeDetailTask.aiModel || activeDetailTask.talkMetadata?.aiModel) && (() => {
                    const m = activeDetailTask.aiModel || activeDetailTask.talkMetadata?.aiModel;
                    const isBase = m === 'GigaChat-2' || m === 'GigaChat';
                    return (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className={isBase ? 'text-amber-300 font-bold' : 'text-[#38BDF8] font-semibold'}>
                          Модель: {m}{isBase ? ' (резерв)' : ''}
                        </span>
                      </>
                    );
                  })()}
                </div>
                <h3 className="text-lg font-black text-white mt-1">
                  {activeDetailTask.teacherName}
                </h3>
                <div className="text-xs text-indigo-300">
                  {activeDetailTask.subject} • {activeDetailTask.groupName}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-[10px] text-indigo-300 font-medium">Оценка урока</div>
                  <div className="text-2xl font-black font-mono text-emerald-400 tabular-nums">
                    {typeof activeDetailTask.totalScore === 'number' ? (
                      <>
                        {activeDetailTask.totalScore} <span className="text-xs text-indigo-300">/ 100</span>
                      </>
                    ) : (
                      <span className="text-indigo-400">—</span>
                    )}
                  </div>
                  {typeof activeDetailTask.earnedPoints === 'number' &&
                    typeof activeDetailTask.maxPoints === 'number' &&
                    typeof activeDetailTask.applicableCount === 'number' && (
                      <div className="text-[10px] font-mono text-indigo-300 mt-0.5 tabular-nums">
                        {activeDetailTask.earnedPoints}/{activeDetailTask.maxPoints} балл. · учтено {activeDetailTask.applicableCount} из {activeDetailTask.criteria?.length || activeDetailTask.applicableCount}
                      </div>
                    )}
                </div>
                <button
                  onClick={() => setActiveDetailTask(null)}
                  className="p-2 hover:bg-white/10 rounded-xl text-indigo-300 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Контент модалки */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              {/* Критические нарушения (если зафиксированы) */}
              {Array.isArray(activeDetailTask.criticalViolations) && activeDetailTask.criticalViolations.length > 0 && (
                <div className="p-4 bg-rose-500/15 border border-rose-500/50 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-rose-300 font-bold text-xs uppercase tracking-wider">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>Зафиксированы критические нарушения ({activeDetailTask.criticalViolations.length})</span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-rose-100">
                    {activeDetailTask.criticalViolations.map((cv: string, idx: number) => (
                      <li key={idx} className="p-2.5 bg-[#14102C]/80 rounded-xl border border-rose-500/30">
                        {cv}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Данные встречи из Контур.Толка */}
              {activeDetailTask.talkMetadata && (
                <div className="bg-[#14102C] border border-[#38BDF8]/40 rounded-2xl p-4 space-y-3 shadow-md">
                  <div className="flex items-center justify-between border-b border-indigo-900/50 pb-2">
                    <div className="flex items-center gap-2 text-[#38BDF8] font-bold text-xs uppercase tracking-wider">
                      <Video className="w-4 h-4 text-[#38BDF8]" />
                      <span>Данные встречи в Контур.Толке</span>
                    </div>
                    <span className="text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800 px-2 py-0.5 rounded">
                      Контур.Толк
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-indigo-400 block text-[10px]">Название встречи:</span>
                      <strong className="text-white">{activeDetailTask.talkMetadata.title || 'Онлайн-занятие'}</strong>
                    </div>
                    <div>
                      <span className="text-indigo-400 block text-[10px]">Дата и время в КТалк:</span>
                      <span className="text-indigo-200 font-mono">{activeDetailTask.talkMetadata.date || activeDetailTask.date}</span>
                    </div>
                    <div>
                      <span className="text-indigo-400 block text-[10px]">Длительность:</span>
                      <span className="text-emerald-400 font-semibold">{activeDetailTask.talkMetadata.duration || 'Полноформатное занятие'}</span>
                    </div>
                    <div>
                      <span className="text-indigo-400 block text-[10px]">Организатор / Спикер:</span>
                      <span className="text-white font-medium">{activeDetailTask.talkMetadata.author || activeDetailTask.teacherName}</span>
                    </div>
                    <div>
                      <span className="text-indigo-400 block text-[10px]">Логин в КТалк:</span>
                      <span className="text-indigo-300 font-mono">{activeDetailTask.talkMetadata.login || '—'}</span>
                    </div>
                    <div>
                      <span className="text-indigo-400 block text-[10px]">Ключ записи:</span>
                      <span className="text-cyan-300 font-mono text-[11px] truncate block" title={activeDetailTask.talkMetadata.recordingKey}>
                        {activeDetailTask.talkMetadata.recordingKey || '—'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Учёт ресурсов проверки (ТОЛЬКО ДЛЯ СТАРШЕГО КУРАТОРА) */}
              {isSenior && (activeDetailTask.tokenUsage || typeof activeDetailTask.framesUploaded === 'number' || activeDetailTask.aiModel) && (
                <div className="bg-[#14102C] border border-indigo-800/60 rounded-2xl p-4 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-900/50 pb-2">
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-[#38BDF8]" />
                      <span>Расход ресурсов на проверку (видно только старшему куратору)</span>
                    </span>
                    <span className="text-[11px] font-mono text-indigo-300">
                      Модель отчёта: <strong className="text-white">{activeDetailTask.aiModel || activeDetailTask.talkMetadata?.aiModel || '—'}</strong>
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-indigo-400 block text-[10px]">Потрачено токенов</span>
                      <span className="font-mono tabular-nums font-bold text-[#38BDF8]">
                        {activeDetailTask.tokenUsage?.totalTokens
                          ? `${Number(activeDetailTask.tokenUsage.totalTokens).toLocaleString('ru-RU')} ток.`
                          : 'Без учёта токенов'}
                      </span>
                      {activeDetailTask.tokenUsage?.totalTokens ? (
                        <div className="text-[10px] font-mono tabular-nums text-indigo-300/80 mt-0.5">
                          вход {Number(activeDetailTask.tokenUsage.promptTokens || 0).toLocaleString('ru-RU')} + ответ {Number(activeDetailTask.tokenUsage.completionTokens || 0).toLocaleString('ru-RU')}
                        </div>
                      ) : null}
                    </div>
                    <div>
                      <span className="text-indigo-400 block text-[10px]">Просмотрено кадров экрана</span>
                      <span className="font-mono tabular-nums font-bold text-white">
                        {typeof activeDetailTask.framesUploaded === 'number'
                          ? `${activeDetailTask.framesUploaded}${typeof activeDetailTask.framesPlanned === 'number' ? ` из ${activeDetailTask.framesPlanned}` : ''} кадр.`
                          : '—'}
                      </span>
                      <div className="text-[10px] text-indigo-300/80 mt-0.5">
                        Аудиодорожка передана целиком
                      </div>
                    </div>
                    <div>
                      <span className="text-indigo-400 block text-[10px]">Текст речи и лимит</span>
                      <span className="font-mono tabular-nums text-white font-semibold">
                        {activeDetailTask.tokenUsage
                          ? activeDetailTask.tokenUsage.transcriptTrimmed
                            ? `Сокращён (${Number(activeDetailTask.tokenUsage.transcriptSentChars || 0).toLocaleString('ru-RU')}/${Number(activeDetailTask.tokenUsage.transcriptOriginalChars || 0).toLocaleString('ru-RU')} симв.)`
                            : 'Передан полностью'
                          : '—'}
                      </span>
                      {activeDetailTask.tokenUsage?.configuredBudgetTokens ? (
                        <div className="text-[10px] font-mono tabular-nums text-indigo-300/80 mt-0.5">
                          Лимит: {Number(activeDetailTask.tokenUsage.configuredBudgetTokens).toLocaleString('ru-RU')} ток.
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {Array.isArray(activeDetailTask.modelAttempts) && activeDetailTask.modelAttempts.length > 1 && (
                    <div className="pt-2 border-t border-indigo-900/40 text-[11px] text-indigo-300 font-mono">
                      Пробовали модели: {activeDetailTask.modelAttempts.map((a: any) => `${a.model} (${a.status})`).join(' → ')}
                    </div>
                  )}
                </div>
              )}

              {/* Ссылка на КТалк */}
              <div className="p-3 bg-[#14102C] border border-indigo-900/60 rounded-xl flex items-center justify-between text-xs">
                <span className="text-indigo-300 font-medium">Запись вебинара:</span>
                <a
                  href={activeDetailTask.lectureUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#38BDF8] hover:underline flex items-center gap-1 font-mono"
                >
                  <Video className="w-3.5 h-3.5" />
                  <span>Открыть видеозапись КТалк</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* Позитивные моменты */}
              {activeDetailTask.positiveHighlights && activeDetailTask.positiveHighlights.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    Положительные моменты и методические успехи:
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-200">
                    {activeDetailTask.positiveHighlights.map((pos: string, idx: number) => (
                      <li key={idx} className="p-2.5 bg-[#14102C] rounded-xl border border-emerald-900/40">
                        {pos}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Рекомендации методиста */}
              {activeDetailTask.recommendations && activeDetailTask.recommendations.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    Рекомендации по улучшению:
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-200">
                    {activeDetailTask.recommendations.map((rec: string, idx: number) => (
                      <li key={idx} className="p-2.5 bg-[#14102C] rounded-xl border border-amber-900/40">
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Детализация по критериям (поддержка Н/П без искажения суммы) */}
              {activeDetailTask.criteria && activeDetailTask.criteria.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-[#38BDF8]" />
                    Оценки по критериям качества:
                  </h4>
                  <div className="space-y-2">
                    {activeDetailTask.criteria.map((c: any) => {
                      const isNA = Boolean(c.notApplicable) || c.score === null || c.score === undefined;
                      const penaltyVal =
                        typeof c.penaltyScore === 'number'
                          ? c.penaltyScore
                          : c.score === 5
                          ? 0
                          : c.score === 3
                          ? 1
                          : 2;

                      let badgeLabel = '';
                      if (isNA) {
                        badgeLabel = reportSettings.naBadgeText || 'Н/П';
                      } else if (reportSettings.displayMode === 'penalty') {
                        badgeLabel = penaltyVal === 0 ? 'Штраф: 0' : `Штраф: -${penaltyVal}`;
                      } else if (reportSettings.displayMode === 'status_only') {
                        badgeLabel =
                          penaltyVal === 0
                            ? 'Выполнено'
                            : penaltyVal === 1
                            ? 'Частичное нарушение'
                            : 'Грубое нарушение';
                      } else {
                        badgeLabel = `${c.score} / 5`;
                      }

                      return (
                      <div
                        key={c.id}
                        className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                          isNA
                            ? 'bg-[#120E27] border-indigo-700/30 opacity-90'
                            : c.passed
                            ? 'bg-[#14102C] border-indigo-900/60'
                            : 'bg-amber-950/20 border-amber-500/40'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-bold text-white flex items-center gap-2">
                            <span className="text-[10px] font-mono bg-indigo-800/40 text-indigo-200 px-1.5 py-0.5 rounded shrink-0">
                              #{c.id}
                            </span>
                            <span>{c.text}</span>
                          </span>
                          <span
                            className={`font-mono font-bold px-2 py-0.5 rounded shrink-0 ${
                              isNA
                                ? 'text-indigo-200 bg-indigo-500/20 border border-indigo-400/30'
                                : c.passed
                                ? 'text-emerald-300 bg-emerald-500/20'
                                : 'text-amber-300 bg-amber-500/20'
                            }`}
                          >
                            {badgeLabel}
                          </span>
                        </div>

                        {isNA && (
                          <div className="text-[11px] text-indigo-300/90 italic">
                            {c.comment || reportSettings.naDescription}
                          </div>
                        )}

                        {/* Таймкоды нарушений (только при снятии баллов) или подтверждений */}
                        {c.timecodes && c.timecodes.length > 0 && (() => {
                          const hasViolation = !isNA && (!c.passed || penaltyVal > 0);
                          return (
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              <span
                                className={`text-[10px] font-semibold flex items-center gap-1 ${
                                  hasViolation ? 'text-amber-300' : 'text-sky-300'
                                }`}
                              >
                                <Clock
                                  className={`w-3.5 h-3.5 ${
                                    hasViolation ? 'text-amber-400' : 'text-sky-400'
                                  }`}
                                />
                                {hasViolation ? 'Таймкоды нарушений:' : 'Таймкоды подтверждения (без штрафа):'}
                              </span>
                              {c.timecodes.map((tc: string, tcIdx: number) => (
                                <span
                                  key={tcIdx}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-bold border ${
                                    hasViolation
                                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                      : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                                  }`}
                                >
                                  🕒 {tc}
                                </span>
                              ))}
                            </div>
                          );
                        })()}

                        {/* Цитата из речи */}
                        {c.quote && (
                          <div className="text-[11px] italic text-indigo-200/90 pl-3 py-1 border-l-2 border-[#38BDF8] bg-indigo-950/40 rounded-r-lg">
                            {c.quote}
                          </div>
                        )}

                        {/* Разбор и комментарий методиста */}
                        {!isNA && c.comment && (
                          <div className="text-[11px] text-slate-300 leading-relaxed pt-0.5">
                            {c.comment}
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Подвал модалки */}
            <div className="p-4 border-t border-indigo-900/60 bg-[#14102C]/60 flex flex-wrap items-center justify-between gap-3">
              {!['pending', 'downloading', 'extracting', 'uploading', 'analyzing'].includes(activeDetailTask.status) ? (
                <button
                  type="button"
                  onClick={(e) => handleRetryTask(e, activeDetailTask.id)}
                  disabled={retryingTaskId === activeDetailTask.id}
                  className="px-4 py-2 bg-[#1B153B] hover:bg-[#241E4F] border border-indigo-700/70 text-indigo-100 hover:text-white disabled:opacity-50 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className={`w-3.5 h-3.5 text-[#38BDF8] ${retryingTaskId === activeDetailTask.id ? 'animate-spin' : ''}`} />
                  <span>{retryingTaskId === activeDetailTask.id ? 'Постановка в очередь...' : 'Отправить на перепроверку'}</span>
                </button>
              ) : (
                <div />
              )}
              <button
                type="button"
                onClick={() => setActiveDetailTask(null)}
                className="px-5 py-2 bg-[#FF5252] hover:bg-[#ff3b3b] text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-[#FF5252]/30 cursor-pointer"
              >
                Закрыть отчет
              </button>
            </div>
          </div>
        </div>
      )}

      {/* МОДАЛЬНОЕ ОКНО СЫРОГО ОТВЕТА / ОШИБКИ ПРОВЕРКИ */}
      {rawJsonModalTask && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1B153B] border border-amber-500/50 rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl animate-fade-in overflow-hidden">
            {/* Шапка модалки */}
            <div className="p-5 border-b border-indigo-900/60 flex items-center justify-between bg-[#14102C]/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full">
                      {rawJsonModalTask.isCorrupted ? 'Не удалось разобрать отчёт' : 'Ошибка проверки'}
                    </span>
                    <span className="text-xs text-indigo-400 font-mono">#{rawJsonModalTask.id}</span>
                  </div>
                  <h3 className="text-base font-black text-white mt-0.5">
                    {rawJsonModalTask.teacherName} • {rawJsonModalTask.subject}
                  </h3>
                </div>
              </div>
              <button
                onClick={() => setRawJsonModalTask(null)}
                className="p-2 hover:bg-white/10 rounded-xl text-indigo-300 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Контент модалки */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
              {rawJsonModalTask.errorMessage && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-200 leading-relaxed space-y-1">
                  <div className="font-bold text-rose-300">Причина остановки проверки:</div>
                  <p className="text-xs text-rose-100">{rawJsonModalTask.errorMessage}</p>
                </div>
              )}

              {rawJsonModalTask.isCorrupted && (
                <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-200 leading-relaxed space-y-1">
                  <div className="font-bold text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>Отчёт пришёл с ошибкой формата</span>
                  </div>
                  <p className="text-[11px] text-indigo-200">
                    Во время разбора ответа возникла ошибка формата или сработало ограничение безопасности. Нажмите «Повторить проверку», чтобы отправить запись заново.
                  </p>
                </div>
              )}

              {rawJsonModalTask.rawBrokenResponse ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-indigo-300">
                      Технический текст ответа:
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(rawJsonModalTask.rawBrokenResponse || '');
                        setCopiedRawJson(true);
                        setTimeout(() => setCopiedRawJson(false), 2000);
                      }}
                      className="px-3 py-1 bg-[#14102C] hover:bg-indigo-900/60 border border-indigo-700/50 text-[#38BDF8] rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedRawJson ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Скопировано!</span>
                        </>
                      ) : (
                        <>
                          <FileText className="w-3.5 h-3.5" />
                          <span>Скопировать текст</span>
                        </>
                      )}
                    </button>
                  </div>

                  <pre className="bg-[#100D24] text-emerald-300 border border-indigo-950 p-4 rounded-2xl font-mono text-xs overflow-x-auto max-h-[50vh] whitespace-pre-wrap select-all leading-relaxed shadow-inner">
                    {rawJsonModalTask.rawBrokenResponse}
                  </pre>
                </div>
              ) : (
                <div className="p-3.5 bg-[#14102C] border border-indigo-900/60 rounded-2xl space-y-1.5 text-[11px] text-indigo-200">
                  <div className="font-semibold text-indigo-300">Ссылка на запись:</div>
                  <div className="font-mono text-[#38BDF8] break-all">{rawJsonModalTask.lectureUrl || 'Не указана'}</div>
                </div>
              )}
            </div>

            {/* Подвал модалки */}
            <div className="p-4 border-t border-indigo-900/60 bg-[#14102C]/60 flex items-center justify-between gap-3">
              <span className="text-[10px] text-indigo-400 font-mono">
                Дата создания задачи: {rawJsonModalTask.date}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => handleRetryTask(e, rawJsonModalTask.id)}
                  disabled={retryingTaskId === rawJsonModalTask.id}
                  className="px-4 py-2 bg-[#FF5252] hover:bg-[#ff3b3b] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${retryingTaskId === rawJsonModalTask.id ? 'animate-spin' : ''}`} />
                  <span>Повторить проверку</span>
                </button>
                <button
                  onClick={() => setRawJsonModalTask(null)}
                  className="px-5 py-2 bg-indigo-800 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* МОДАЛЬНОЕ ОКНО ДЛЯ ПРОВЕРКИ ЛЕКЦИИ (ПО КЛИКУ НА КАРТОЧКУ КТАЛК ИЛИ РУЧНОМУ ВВОДУ) */}
      {isCheckModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setIsCheckModalOpen(false)}
        >
          <div
            className="bg-[#1B153B] border border-indigo-700/60 rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl animate-fade-in overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Шапка модалки */}
            <div className="p-5 sm:p-6 border-b border-indigo-900/60 flex items-start justify-between gap-3 bg-[#14102C]/70">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#38BDF8]">
                  {selectedKtalkRecording ? 'Отправка выбранной встречи КТалк' : 'Ручная отправка встречи КТалк'}
                </div>
                <h3 className="text-lg font-black text-white mt-0.5">
                  {selectedKtalkRecording?.title || 'Отправка занятия на проверку'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCheckModalOpen(false)}
                className="p-2 hover:bg-white/10 rounded-xl text-indigo-300 hover:text-white transition-colors cursor-pointer"
                title="Закрыть окно"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Контент модалки */}
            <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
              {selectedKtalkRecording && (
                <div className="bg-[#14102C] border border-[#38BDF8]/40 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 border-b border-indigo-900/50 pb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#38BDF8]">
                      Данные встречи из Контур.Толка
                    </span>
                    <a
                      href={selectedKtalkRecording.lectureUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-[#38BDF8] hover:underline font-semibold inline-flex items-center gap-1"
                    >
                      <Link2 className="w-3 h-3" />
                      <span>Открыть запись в КТалк</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="space-y-0.5">
                      <div className="text-[11px] text-indigo-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>Дата и время</span>
                      </div>
                      <div className="font-mono tabular-nums text-white font-semibold">
                        {formatKtalkDateTime(selectedKtalkRecording.createdDate)}
                      </div>
                    </div>

                    <div className="space-y-0.5">
                      <div className="text-[11px] text-indigo-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>Длительность</span>
                      </div>
                      <div className="font-mono tabular-nums text-white font-semibold">
                        {selectedKtalkRecording.duration || 'Не указана'}
                      </div>
                    </div>

                    <div className="space-y-0.5">
                      <div className="text-[11px] text-indigo-400 flex items-center gap-1">
                        <User className="w-3 h-3" />
                        <span>Ведущий / Организатор</span>
                      </div>
                      <div className="text-white font-semibold">
                        {selectedKtalkRecording.authorName || 'Не указан'}
                      </div>
                      {(selectedKtalkRecording.authorEmail || selectedKtalkRecording.authorLogin) && (
                        <div className="font-mono text-[11px] text-indigo-300">
                          {[selectedKtalkRecording.authorLogin, selectedKtalkRecording.authorEmail]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      )}
                    </div>

                    <div className="space-y-0.5">
                      <div className="text-[11px] text-indigo-400">Комната и ключ записи</div>
                      <div className="text-white font-semibold">
                        {selectedKtalkRecording.roomName || 'Общее пространство'}
                      </div>
                      <div className="font-mono text-[11px] text-indigo-300 truncate" title={selectedKtalkRecording.recordingKey}>
                        ID: {selectedKtalkRecording.recordingKey}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {submitError && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-xs text-amber-200 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
                    <div className="space-y-1">
                      <div className="font-bold text-amber-300 text-sm">
                        {duplicateErrorTask ? 'Ссылка уже проверялась ранее!' : 'Ошибка отправки формы'}
                      </div>
                      <p className="text-xs text-indigo-200/90 leading-relaxed">{submitError}</p>
                    </div>
                  </div>

                  {duplicateErrorTask && (
                    <div className="bg-[#14102C] border border-amber-500/30 rounded-xl p-3.5 space-y-2.5 mt-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <span className="text-indigo-400">Преподаватель: </span>
                          <strong className="text-white">{duplicateErrorTask.teacherName}</strong>
                        </div>
                        <div>
                          <span className="text-indigo-400">Дата проверки: </span>
                          <span className="text-indigo-200 font-mono">{duplicateErrorTask.date}</span>
                        </div>
                        <div>
                          <span className="text-indigo-400">Предмет: </span>
                          <span className="text-indigo-200">{duplicateErrorTask.subject}</span>
                        </div>
                        <div>
                          <span className="text-indigo-400">Оценка: </span>
                          <strong className="text-emerald-400 font-mono">
                            {typeof duplicateErrorTask.totalScore === 'number'
                              ? `${duplicateErrorTask.totalScore} / 100`
                              : 'В обработке'}
                          </strong>
                        </div>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setIsCheckModalOpen(false);
                            setActiveTab('dashboard');
                            setActiveDetailTask(duplicateErrorTask);
                          }}
                          className="flex-1 py-2 px-3 bg-[#1B153B] hover:bg-[#241E4F] border border-indigo-700/60 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                        >
                          <Search className="w-3.5 h-3.5 text-[#38BDF8]" />
                          <span>Открыть существующий отчёт</span>
                        </button>
                        {!['pending', 'downloading', 'extracting', 'uploading', 'analyzing'].includes(duplicateErrorTask.status) && (
                          <button
                            type="button"
                            onClick={(e) => handleRetryTask(e, duplicateErrorTask.id)}
                            disabled={retryingTaskId === duplicateErrorTask.id}
                            className="flex-1 py-2 px-3 bg-[#FF5252] hover:bg-[#ff3b3b] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                          >
                            <RotateCcw className={`w-3.5 h-3.5 ${retryingTaskId === duplicateErrorTask.id ? 'animate-spin' : ''}`} />
                            <span>{retryingTaskId === duplicateErrorTask.id ? 'Запуск...' : 'Отправить на перепроверку'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {submitSuccessTask ? (
                <div className="p-5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl space-y-4">
                  <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <span>Занятие поставлено в очередь!</span>
                  </div>
                  <p className="text-xs text-indigo-200 leading-relaxed">
                    {submitSuccessMessage || 'Проверка поставлена в очередь и будет выполнена по порядку. Встреча убрана из списка непроверенных.'}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsCheckModalOpen(false);
                        setActiveTab('dashboard');
                        if (submitSuccessTask.status === 'completed' && !submitSuccessTask.isCorrupted) {
                          setActiveDetailTask(submitSuccessTask);
                        }
                      }}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Перейти в дашборд</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsCheckModalOpen(false)}
                      className="px-4 py-2.5 bg-indigo-900/60 hover:bg-indigo-800 text-indigo-200 hover:text-white rounded-xl text-xs font-semibold transition-all cursor-pointer"
                    >
                      Остаться в списке встреч
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmitLecture} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-white mb-1.5">
                      1. Ссылка на запись встречи КТалк:
                    </label>
                    <input
                      type="url"
                      value={lectureUrl}
                      onChange={(e) => {
                        setLectureUrl(e.target.value);
                        if (selectedKtalkRecording && e.target.value.trim() !== selectedKtalkRecording.lectureUrl.trim()) {
                          setSelectedKtalkRecording(null);
                        }
                      }}
                      placeholder="https://company.ktalk.ru/recordings/abc-123-xyz"
                      required
                      className="w-full bg-[#14102C] border border-indigo-800/60 rounded-xl px-4 py-3 text-xs text-white placeholder-indigo-400/50 focus:outline-none focus:border-[#FF5252] transition-colors font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-white mb-1.5 flex items-center gap-1.5">
                        <GraduationCap className="w-3.5 h-3.5 text-[#FF5252]" />
                        <span>2. Преподаватель:</span>
                      </label>
                      <div className="relative">
                        <select
                          value={selectedTeacher}
                          onChange={(e) => {
                            setSelectedTeacher(e.target.value);
                            if (e.target.value !== '__new__') {
                              setNewTeacherName('');
                            }
                          }}
                          required
                          className="w-full bg-[#14102C] border border-indigo-700/60 hover:border-indigo-500 rounded-xl px-3.5 py-3 text-xs text-white focus:outline-none focus:border-[#FF5252] transition-colors appearance-none cursor-pointer pr-8 shadow-inner"
                        >
                          <option value="" disabled className="bg-[#14102C] text-indigo-400">
                            Выберите преподавателя...
                          </option>
                          {teachersList.map((t) => (
                            <option key={t} value={t} className="bg-[#14102C] text-white py-1">
                              {t}
                            </option>
                          ))}
                          <option value="__new__" className="bg-[#1B153B] text-[#FF5252] font-bold py-1">
                            + Добавить нового преподавателя...
                          </option>
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-400">
                          ▼
                        </div>
                      </div>
                    </div>

                    {selectedTeacher === '__new__' && (
                      <div className="animate-fade-in">
                        <label className="block text-xs font-bold text-white mb-1.5 flex items-center gap-1.5">
                          <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
                          <span>ФИО нового преподавателя:</span>
                        </label>
                        <input
                          type="text"
                          value={newTeacherName}
                          onChange={(e) => setNewTeacherName(e.target.value)}
                          placeholder="Например: Иван Петров"
                          required
                          className="w-full bg-[#14102C] border border-emerald-500/50 rounded-xl px-4 py-3 text-xs text-white placeholder-indigo-400/50 focus:outline-none focus:border-[#FF5252] shadow-inner"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-white mb-1.5">
                        3. Дисциплина / Предмет:
                      </label>
                      <input
                        type="text"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="Например: Олимпиадная математика"
                        required
                        className="w-full bg-[#14102C] border border-indigo-800/60 rounded-xl px-4 py-2.5 text-xs text-white placeholder-indigo-400/50 focus:outline-none focus:border-[#FF5252]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-white mb-1.5">
                        4. Группа / Параллель:
                      </label>
                      <input
                        type="text"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        placeholder="Например: 10-11 класс (Всеросс)"
                        required
                        className="w-full bg-[#14102C] border border-indigo-800/60 rounded-xl px-4 py-2.5 text-xs text-white placeholder-indigo-400/50 focus:outline-none focus:border-[#FF5252]"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex flex-col-reverse sm:flex-row items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setIsCheckModalOpen(false)}
                      className="w-full sm:w-auto px-5 py-3 bg-[#14102C] hover:bg-indigo-900/50 border border-indigo-800/60 text-indigo-200 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingTask}
                      className="w-full sm:flex-1 py-3.5 bg-[#FF5252] hover:bg-[#ff3b3b] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-[#FF5252]/30 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isSubmittingTask ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4 fill-white" />
                      )}
                      <span>Отправить на проверку</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ВНУТРИПРОГРАММНОЕ МОДАЛЬНОЕ ОКНО ПОДТВЕРЖДЕНИЯ УДАЛЕНИЯ КУРАТОРА */}
      {confirmDeleteCuratorEmail && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1B153B] border border-rose-500/40 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Удаление куратора</h3>
                <p className="text-xs text-indigo-300 mt-0.5 break-all">
                  Удалить <strong className="text-white">{confirmDeleteCuratorEmail}</strong> из белого списка системы?
                </p>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteCuratorEmail(null)}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={confirmAndDeleteCurator}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
