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
  Palette,
  Globe,
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
  Trash2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { PromptEditor } from './components/PromptEditor';
import { CriteriaManager } from './components/CriteriaManager';

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
          Система методического аудита вебинаров КТалк • Сбер GigaChat-2-Pro
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

const BRAND_COLORS = [
  { name: "Brand Primary Indigo", hex: "#4F3B9B", rgb: "79, 59, 155", desc: "Основной глубокий цвет брендбука (фон, плашки, градиенты)" },
  { name: "Deep Royal Night", hex: "#14102C", rgb: "20, 16, 44", desc: "Фоновый темный цвет приложения и контрастных блоков" },
  { name: "Vivid Coral Accent", hex: "#FF5252", rgb: "255, 82, 82", desc: "Акцентный яркий кораллово-красный (критерии, кнопки, важные плашки)" },
  { name: "Electric Cyan", hex: "#38BDF8", rgb: "56, 189, 248", desc: "Технологический голубой (ИИ статусы, бейджи, ссылки)" },
  { name: "Emerald Pass", hex: "#10B981", rgb: "16, 185, 129", desc: "Цвет успешной прохождения контроля и высоких баллов" },
  { name: "Warm Amber Warning", hex: "#F59E0B", rgb: "245, 158, 11", desc: "Внимание, рекомендации, средняя оценка критериев" },
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

export default function App() {
  // Аутентификация
  const [authToken, setAuthToken] = useState<string>(() => localStorage.getItem('curator_token') || '');
  const [currentUser, setCurrentUser] = useState<CuratorUser | null>(() => {
    const raw = localStorage.getItem('curator_profile');
    return raw ? JSON.parse(raw) : null;
  });

  // Состояние формы входа (Email OTP)
  const [loginEmail, setLoginEmail] = useState<string>('');
  const [otpCode, setOtpCode] = useState<string>('');
  const [isOtpSent, setIsOtpSent] = useState<boolean>(false);
  const [loginLoading, setLoginLoading] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string>('');
  const [loginMessage, setLoginMessage] = useState<string>('');

  // Вкладки
  const [activeTab, setActiveTab] = useState<'dashboard' | 'submit' | 'curators' | 'audit' | 'criteria' | 'prompt_editor' | 'brandbook' | 'criteria_manager'>('dashboard');

  // Дашборд и задачи
  const [tasks, setTasks] = useState<any[]>([]);
  const [teachersList, setTeachersList] = useState<string[]>([]);
  const [selectedTeacherFilter, setSelectedTeacherFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeDetailTask, setActiveDetailTask] = useState<any | null>(null);
  const [rawJsonModalTask, setRawJsonModalTask] = useState<any | null>(null);
  const [copiedRawJson, setCopiedRawJson] = useState<boolean>(false);

  // Форма отправки встречи КТалк
  const [lectureUrl, setLectureUrl] = useState<string>('');
  const [selectedTeacher, setSelectedTeacher] = useState<string>('');
  const [newTeacherName, setNewTeacherName] = useState<string>('');
  const [subject, setSubject] = useState<string>('Олимпиадная математика');
  const [groupName, setGroupName] = useState<string>('10-11 класс (Всеросс)');
  const [isSubmittingTask, setIsSubmittingTask] = useState<boolean>(false);
  const [submitSuccessTask, setSubmitSuccessTask] = useState<any | null>(null);
  const [submitError, setSubmitError] = useState<string>('');
  const [duplicateErrorTask, setDuplicateErrorTask] = useState<any | null>(null);

  // Управление кураторами (ТОЛЬКО ДЛЯ СТАРШИХ КУРАТОРОВ)
  const [curatorsList, setCuratorsList] = useState<CuratorUser[]>([]);
  const [isLoadingCurators, setIsLoadingCurators] = useState<boolean>(false);
  const [newCuratorEmail, setNewCuratorEmail] = useState<string>('');
  const [newCuratorName, setNewCuratorName] = useState<string>('');
  const [newCuratorRole, setNewCuratorRole] = useState<'curator' | 'senior_curator'>('curator');
  const [curatorActionMessage, setCuratorActionMessage] = useState<string>('');
  const [curatorActionError, setCuratorActionError] = useState<string>('');

  // Журнал аудита базы данных (ТОЛЬКО ДЛЯ СТАРШИХ КУРАТОРОВ)
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState<boolean>(false);
  const [auditSearch, setAuditSearch] = useState<string>('');

  // Динамические критерии оценки
  const [dynamicStandardCriteria, setDynamicStandardCriteria] = useState<any[]>(STANDARD_CRITERIA);
  const [dynamicCriticalCriteria, setDynamicCriticalCriteria] = useState<any[]>(CRITICAL_CRITERIA);
  const [criteriaSearch, setCriteriaSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const isSenior = currentUser?.role === 'senior_curator';

  const fetchCriteriaConfig = async () => {
    try {
      const res = await fetch('/api/criteria/config', {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
      });
      const data = await res.json();
      if (data.success) {
        if (Array.isArray(data.standardCriteria) && data.standardCriteria.length > 0) {
          setDynamicStandardCriteria(data.standardCriteria);
        }
        if (Array.isArray(data.criticalCriteria) && data.criticalCriteria.length > 0) {
          setDynamicCriticalCriteria(data.criticalCriteria);
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
        setTeachersList(dataTeachers.teachers);
        if (dataTeachers.teachers.length > 0 && !selectedTeacher) {
          setSelectedTeacher(dataTeachers.teachers[0]);
        } else if (dataTeachers.teachers.length === 0) {
          setSelectedTeacher('__new__');
        }
      }
    } catch (e) {
      console.error('Ошибка загрузки данных:', e);
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
      if (isSenior) {
        fetchCurators();
        fetchAuditLogs();
      }
    }
  }, [authToken, isSenior]);

  // Повторный запрос при переключении на вкладки "Управление кураторами" и "Аудит действий"
  useEffect(() => {
    if (authToken && isSenior) {
      if (activeTab === 'curators') fetchCurators();
      if (activeTab === 'audit') fetchAuditLogs();
    }
  }, [activeTab, authToken, isSenior]);

  // Опрос статусов активных задач каждые 4 секунды
  useEffect(() => {
    if (!authToken) return;
    const hasPending = tasks.some(t => t.status !== 'completed' && t.status !== 'failed');
    if (!hasPending) return;

    const interval = setInterval(() => {
      fetchTasksAndTeachers();
    }, 4000);
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
    setDuplicateErrorTask(null);

    const teacherToUse = selectedTeacher === '__new__' ? newTeacherName.trim() : selectedTeacher;

    if (!lectureUrl.trim()) {
      setSubmitError('Укажите ссылку на встречу КТалк.');
      return;
    }
    if (!teacherToUse) {
      setSubmitError('Выберите или введите ФИО преподавателя.');
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
          subject,
          groupName
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

      setSubmitSuccessTask(data.task);
      setLectureUrl('');
      setTasks(prev => [data.task, ...prev.filter(t => t.id !== data.task.id)]);
      setActiveTab('dashboard');
      await fetchTasksAndTeachers();
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

  // Удаление куратора из белого списка
  const handleDeleteCurator = async (email: string) => {
    if (!window.confirm(`Вы действительно хотите удалить куратора ${email} из белого списка системы?`)) {
      return;
    }
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

  // 7. Экспорт в Excel (.xlsx) через клиентскую библиотеку xlsx
  const handleClientExportExcel = () => {
    const completedTasks = tasks.filter(t => t.status === 'completed');

    // Сводка преподавателей
    const teacherMap = new Map<string, { count: number; totalScore: number; criticalCount: number }>();
    completedTasks.forEach(t => {
      const cur = teacherMap.get(t.teacherName) || { count: 0, totalScore: 0, criticalCount: 0 };
      cur.count++;
      cur.totalScore += t.totalScore;
      if (t.criticalViolations && t.criticalViolations.length > 0) cur.criticalCount++;
      teacherMap.set(t.teacherName, cur);
    });

    const summaryRows = Array.from(teacherMap.entries()).map(([name, data]) => ({
      "Преподаватель": name,
      "Проверено уроков": data.count,
      "Средний балл": Math.round(data.totalScore / data.count),
      "Критических инцидентов": data.criticalCount,
      "Статус": Math.round(data.totalScore / data.count) >= 90 ? "Эталон" : "Стандарт"
    }));

    // Реестр проверок
    const detailRows = completedTasks.map(t => ({
      "ID": t.id,
      "Дата": t.date,
      "Преподаватель": t.teacherName,
      "Предмет": t.subject,
      "Группа": t.groupName,
      "Ссылка на запись КТалк": t.lectureUrl,
      "Итоговый балл (из 100)": t.totalScore,
      "Критические нарушения": t.criticalViolations?.join('; ') || 'Нет',
      "Сильные стороны": t.positiveHighlights?.join('; ') || 'Соответствует стандартам',
      "Рекомендации методиста": t.recommendations?.join('; ') || 'Замечаний нет',
      "Проверил куратор": t.curatorEmail
    }));

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    const wsDetails = XLSX.utils.json_to_sheet(detailRows);

    XLSX.utils.book_append_sheet(wb, wsSummary, "Сводка преподавателей");
    XLSX.utils.book_append_sheet(wb, wsDetails, "Реестр всех проверок");

    XLSX.writeFile(wb, "Olympiad_Practices_Analytics_2026.xlsx");
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
            Проверить встречу КТалк
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
              <span>Аудит действий (БД)</span>
              <span className="text-[9px] bg-cyan-500/20 text-[#38BDF8] px-1.5 py-0.2 rounded font-bold border border-cyan-500/30">
                Senior
              </span>
            </button>
          )}

          {isSenior && (
            <button
              onClick={() => setActiveTab('prompt_editor')}
              className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all flex items-center gap-2 border-b-2 ${
                activeTab === 'prompt_editor'
                  ? 'border-amber-400 text-white bg-[#2B2363]'
                  : 'border-transparent text-amber-200/80 hover:text-white hover:bg-[#241E4F]/60'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Редактор промпта ИИ</span>
              <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-bold border border-amber-500/30">
                Senior
              </span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('brandbook')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all flex items-center gap-2 border-b-2 ${
              activeTab === 'brandbook'
                ? 'border-[#FF5252] text-white bg-[#2B2363]'
                : 'border-transparent text-indigo-200/70 hover:text-white hover:bg-[#241E4F]/60'
            }`}
          >
            <Palette className="w-3.5 h-3.5 text-indigo-400" />
            Брендбук & Стиль
          </button>
        </div>
      </header>

      {/* Основное рабочее пространство */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* ======================================================== */}
        {/* ВКЛАДКА 1: ДАШБОРД ПРЕПОДАВАТЕЛЕЙ + ЭКСПОРТ В EXCEL       */}
        {/* ======================================================== */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6 animate-fade-in">
            {/* KPI карточки */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-4">
                <div className="text-[11px] text-indigo-300 font-medium">Проверено занятий</div>
                <div className="text-2xl font-black text-white mt-1 tabular-nums">
                  {tasks.filter(t => t.status === 'completed').length}
                </div>
                <div className="text-[10px] text-emerald-400 mt-1">Оцифровано нейросетью</div>
              </div>

              <div className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-4">
                <div className="text-[11px] text-indigo-300 font-medium">Средний балл школы</div>
                <div className="text-2xl font-black text-[#FF5252] mt-1 tabular-nums">
                  {tasks.filter(t => t.status === 'completed').length > 0
                    ? Math.round(
                        tasks
                          .filter(t => t.status === 'completed')
                          .reduce((acc, t) => acc + t.totalScore, 0) /
                          tasks.filter(t => t.status === 'completed').length
                      )
                    : 0}{' '}
                  <span className="text-sm font-normal text-indigo-300">/ 100</span>
                </div>
                <div className="text-[10px] text-indigo-300 mt-1">Педагогический стандарт</div>
              </div>

              <div className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-4">
                <div className="text-[11px] text-indigo-300 font-medium">Эталонных занятий (90+)</div>
                <div className="text-2xl font-black text-emerald-400 mt-1 tabular-nums">
                  {tasks.filter(t => t.status === 'completed' && t.totalScore >= 90).length}
                </div>
                <div className="text-[10px] text-emerald-400/80 mt-1">Высокий методический уровень</div>
              </div>

              <div className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-4">
                <div className="text-[11px] text-indigo-300 font-medium">Критических замечаний</div>
                <div className="text-2xl font-black text-amber-400 mt-1 tabular-nums">
                  {tasks.filter(t => t.criticalViolations && t.criticalViolations.length > 0).length}
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
                  onClick={handleClientExportExcel}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-900/40 flex items-center gap-2 shrink-0"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Выгрузить в Excel (.xlsx)</span>
                </button>
              </div>
            </div>

            {/* Таблица проверенных уроков */}
            <div className="bg-[#1B153B] border border-indigo-800/50 rounded-3xl overflow-hidden shadow-xl">
              <div className="px-6 py-4 border-b border-indigo-900/50 flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#FF5252]" />
                  <span>Реестр проверенных занятий ({filteredTasks.length})</span>
                </h3>
                <span className="text-xs text-indigo-300">
                  Кликните по строке для детального отчета с таймкодами
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
                      <th className="px-6 py-3 text-center">Балл ИИ</th>
                      <th className="px-6 py-3">Статус обработки</th>
                      <th className="px-6 py-3 text-right">Действие</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-indigo-900/30">
                    {filteredTasks.map((t) => (
                      <tr
                        key={t.id}
                        onClick={() => {
                          if (t.status === 'completed') {
                            setActiveDetailTask(t);
                          } else if (t.isCorrupted) {
                            setRawJsonModalTask(t);
                          }
                        }}
                        className={`transition-colors group ${
                          t.status === 'completed' || t.isCorrupted
                            ? 'hover:bg-[#241E4F]/50 cursor-pointer'
                            : 'opacity-80 cursor-default'
                        }`}
                      >
                        <td className="px-6 py-4 font-mono text-indigo-200/80 whitespace-nowrap">
                          {t.date}
                        </td>
                        <td className="px-6 py-4 font-bold text-white">
                          {t.teacherName}
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
                              Сбой JSON
                            </span>
                          ) : t.status === 'completed' ? (
                            <span
                              className={`inline-block px-2.5 py-1 rounded-lg font-mono font-bold text-xs ${
                                t.totalScore >= 90
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : t.totalScore >= 80
                                  ? 'bg-[#38BDF8]/20 text-[#38BDF8] border border-[#38BDF8]/30'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              }`}
                            >
                              {t.totalScore} / 100
                            </span>
                          ) : (
                            <span className="text-indigo-400 font-mono">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {t.isCorrupted ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-300 font-semibold bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-lg">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              Разбор поврежден
                            </span>
                          ) : t.status === 'completed' ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Проверено GigaChat
                            </span>
                          ) : (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1.5 text-[11px] text-[#38BDF8] font-medium">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                {t.status === 'downloading'
                                  ? 'Загрузка видео (КТалк)...'
                                  : t.status === 'extracting'
                                  ? 'Нарезка ffmpeg...'
                                  : 'Анализ нейросетью...'}
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
                        <td className="px-6 py-4 text-right">
                          {t.status !== 'completed' && !t.isCorrupted ? (
                            <button
                              disabled
                              className="px-2.5 py-1.5 bg-indigo-950/30 border border-indigo-800/20 text-indigo-400/40 rounded-xl text-xs font-medium cursor-not-allowed ml-auto flex items-center gap-1.5"
                              title="Проверка лекции еще выполняется"
                            >
                              <span>В процессе...</span>
                            </button>
                          ) : t.isCorrupted ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRawJsonModalTask(t);
                              }}
                              className="px-2.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ml-auto shadow-sm"
                              title="Открыть сырой поломанный JSON от нейросети"
                            >
                              <FileText className="w-3.5 h-3.5 text-amber-400" />
                              <span>Сырой ответ ИИ</span>
                            </button>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveDetailTask(t);
                              }}
                              className="text-[#FF5252] group-hover:text-white font-semibold text-xs flex items-center gap-1 ml-auto"
                            >
                              <span>Подробнее</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
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
                                ? 'В системе пока нет загруженных занятий. Перейдите во вкладку «Отправить встречу КТалк», чтобы запустить первый методический аудит.'
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
        )}

        {/* ======================================================== */}
        {/* ВКЛАДКА 2: ОТПРАВКА ВСТРЕЧИ КТАЛК НА АНАЛИЗ               */}
        {/* ======================================================== */}
        {activeTab === 'submit' && (
          <div className="space-y-6 max-w-3xl mx-auto animate-fade-in">
            <div className="bg-gradient-to-r from-[#241E4F] via-[#2B2363] to-[#1F1A44] border border-indigo-500/30 rounded-3xl p-6 shadow-xl space-y-2">
              <span className="bg-[#38BDF8]/20 text-[#38BDF8] border border-[#38BDF8]/30 text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full tracking-wider">
                КТалк API • Прямой аудит
              </span>
              <h2 className="text-xl font-black text-white">
                Отправить запись вебинара на проверку
              </h2>
              <p className="text-xs text-indigo-200/80 leading-relaxed">
                Вставьте ссылку на запись встречи КТалк. Сервер в РФ автоматически скачает видео, извлечет звук, нарежет ключевые кадры через <code className="text-white bg-[#14102C] px-1.5 py-0.5 rounded">ffmpeg</code> и передаст данные в <strong className="text-white">Сбер GigaChat-2-Pro</strong>.
              </p>
            </div>

            {submitError && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-xs text-amber-200 space-y-3 shadow-lg">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-bold text-amber-300 text-sm">
                      {duplicateErrorTask ? '⚠️ Ссылка уже проверялась ранее!' : 'Ошибка отправки формы'}
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
                        <span className="text-indigo-400">Оценка ИИ: </span>
                        <strong className="text-emerald-400 font-mono">{duplicateErrorTask.totalScore} / 100</strong>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('dashboard');
                        setActiveDetailTask(duplicateErrorTask);
                      }}
                      className="mt-1 w-full py-2 bg-[#FF5252] hover:bg-[#ff3b3b] text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Search className="w-3.5 h-3.5" />
                      <span>Открыть существующий результат проверки</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {submitSuccessTask && (
              <div className="p-5 bg-emerald-500/10 border border-emerald-500/30 rounded-3xl space-y-3">
                <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span>Заявка #{submitSuccessTask.id} успешно зарегистрирована!</span>
                </div>
                <p className="text-xs text-indigo-200">
                  Анализ запущен в фоновом режиме. Вы можете отслеживать прогресс во вкладке «Дашборд преподавателей».
                </p>
                <button
                  onClick={() => {
                    setActiveTab('dashboard');
                    setActiveDetailTask(submitSuccessTask);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5"
                >
                  <span>Перейти к карточке проверки</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <form onSubmit={handleSubmitLecture} className="bg-[#1B153B] border border-indigo-800/50 rounded-3xl p-6 space-y-5 shadow-xl">
              <div>
                <label className="block text-xs font-bold text-white mb-1.5">
                  1. Ссылка на запись встречи КТалк:
                </label>
                <input
                  type="url"
                  value={lectureUrl}
                  onChange={(e) => setLectureUrl(e.target.value)}
                  placeholder="https://company.ktalk.ru/recordings/abc-123-xyz"
                  required
                  className="w-full bg-[#14102C] border border-indigo-800/60 rounded-xl px-4 py-3 text-xs text-white placeholder-indigo-400/50 focus:outline-none focus:border-[#FF5252] transition-colors"
                />
                <span className="text-[10px] text-indigo-400 mt-1 block">
                  Поддерживаются ссылки формата /recordings/ и /records/
                </span>
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
                      className="w-full bg-[#14102C] border border-indigo-700/60 hover:border-indigo-500 rounded-xl px-3.5 py-3 text-xs text-white focus:outline-none focus:border-[#FF5252] transition-colors appearance-none cursor-pointer pr-8 shadow-inner"
                    >
                      {teachersList.length === 0 && (
                        <option value="" disabled>Загрузка списка преподавателей...</option>
                      )}
                      {teachersList.map((t) => (
                        <option key={t} value={t} className="bg-[#14102C] text-white py-1">
                          👨‍🏫 {t}
                        </option>
                      ))}
                      <option value="__new__" className="bg-[#1B153B] text-[#FF5252] font-bold py-1">
                        ✨ + Добавить нового преподавателя...
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
                      <span>ФИО нового преподавателя и предмет:</span>
                    </label>
                    <input
                      type="text"
                      value={newTeacherName}
                      onChange={(e) => setNewTeacherName(e.target.value)}
                      placeholder="Иван Петров (Математика)"
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
                    placeholder="Олимпиадная математика"
                    className="w-full bg-[#14102C] border border-indigo-800/60 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#FF5252]"
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
                    placeholder="10-11 класс (Всеросс)"
                    className="w-full bg-[#14102C] border border-indigo-800/60 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#FF5252]"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmittingTask}
                  className="w-full py-3.5 bg-[#FF5252] hover:bg-[#ff3b3b] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-[#FF5252]/30 flex items-center justify-center gap-2"
                >
                  {isSubmittingTask ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 fill-white" />
                  )}
                  <span>Запустить автоматический аудит ИИ</span>
                </button>
              </div>
            </form>

            {/* Недавние проверки прямо под формой */}
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
                        setActiveDetailTask(t);
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
                        {t.status === 'completed' ? (
                          <span className="px-3 py-1 rounded-xl font-mono font-bold text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            {t.totalScore} / 100
                          </span>
                        ) : (
                          <div className="space-y-1 w-32">
                            <div className="flex items-center gap-1.5 text-[10px] text-[#38BDF8]">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>{t.progressPct}% • {t.status === 'downloading' ? 'Загрузка...' : t.status === 'extracting' ? 'Нарезка...' : 'ИИ-анализ...'}</span>
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
                          <span>Карточка</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

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
                Здесь вы можете добавить email нового сотрудника, по которому тот сможет авторизоваться в системе. Также вы можете переводить обычных кураторов в статус «Старший куратор», открывая им доступ к редактированию системного промпта нейросети.
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
                            <button
                              onClick={() => handleDeleteCurator(c.email)}
                              className="px-2.5 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/30 text-rose-300 hover:text-rose-100 rounded-lg text-xs transition-colors inline-flex items-center gap-1"
                              title="Удалить из белого списка"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Удалить</span>
                            </button>
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
                        Реляционная база данных (PostgreSQL / SQLite)
                      </span>
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-mono border border-emerald-500/30">
                        152-ФЗ активен
                      </span>
                    </div>
                    <h2 className="text-lg font-black text-white">
                      Журнал аудита действий (Audit Trail в БД)
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
                    <span>Обновить из БД</span>
                  </button>
                </div>
              </div>

              <p className="text-xs text-indigo-200/80 leading-relaxed">
                Каждое действие в системе немедленно и неизменяемо фиксируется в реляционной таблице <code className="text-cyan-300 font-mono">audit_logs</code> (PostgreSQL 16 с сохранением в persistent volume <code className="text-cyan-300 font-mono">/data</code>): авторизации, выдача ролей, добавление email в белый список, отправка записей КТалк, экспорт отчетов и изменение системных промптов нейросети.
              </p>

              {/* Мини-статистика аудита */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-indigo-900/40">
                <div className="p-3 bg-[#14102C] rounded-xl border border-indigo-900/60">
                  <div className="text-[10px] text-indigo-400 font-medium">Всего записей в audit_logs</div>
                  <div className="text-lg font-black font-mono text-cyan-400 mt-0.5">
                    {auditLogs.length} событий
                  </div>
                </div>
                <div className="p-3 bg-[#14102C] rounded-xl border border-indigo-900/60">
                  <div className="text-[10px] text-indigo-400 font-medium">Хранилище транзакций</div>
                  <div className="text-lg font-black font-mono text-emerald-400 mt-0.5">
                    PostgreSQL 16 / WAL
                  </div>
                </div>
                <div className="p-3 bg-[#14102C] rounded-xl border border-indigo-900/60">
                  <div className="text-[10px] text-indigo-400 font-medium">Срок хранения логов</div>
                  <div className="text-lg font-black font-mono text-indigo-200 mt-0.5">
                    Бессрочно (Архив)
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
                  placeholder="Поиск по актору, типу действия, объекту или IP..."
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
                      <th className="px-5 py-3">Время (UTC/МСК)</th>
                      <th className="px-5 py-3">Куратор / Актор</th>
                      <th className="px-5 py-3">Действие в системе</th>
                      <th className="px-5 py-3">Целевой объект</th>
                      <th className="px-5 py-3">Подробности транзакции</th>
                      <th className="px-5 py-3 text-right">IP адрес</th>
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
                  <span>{dynamicCriticalCriteria.length} критических нарушений (Обнуление оценки урока)</span>
                </h3>
                <p className="text-xs text-rose-200/80 mt-0.5">
                  При выявлении хотя бы одного из этих пунктов оценка за всё занятие снижается до 0 баллов
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

        {/* ======================================================== */}
        {/* ВКЛАДКА 6: БРЕНДБУК И СТИЛЬ                              */}
        {/* ======================================================== */}
        {activeTab === 'brandbook' && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-gradient-to-r from-[#2B2363] via-[#3A2E80] to-[#1F1A44] border border-indigo-500/30 rounded-3xl p-8 space-y-4 shadow-xl">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <OlympLogo className="w-12 h-12 shadow-lg shadow-indigo-900/50" />
                  <div>
                    <div className="text-xs font-black uppercase tracking-widest text-[#FF5252]">
                      Брендбук и Фирменный Стиль
                    </div>
                    <h2 className="text-xl font-black text-white">
                      «Олимпиадные Практики» (olympiadpractices.ru)
                    </h2>
                  </div>
                </div>

                <a
                  href="https://olympiadpractices.ru/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#241E4F] border border-indigo-500/40 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-[#2B2363] transition-colors flex items-center gap-2"
                >
                  <Globe className="w-4 h-4 text-[#38BDF8]" />
                  <span>Перейти на сайт olympiadpractices.ru</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              <p className="text-xs text-indigo-100/90 leading-relaxed max-w-4xl">
                Брендинг компании сочетает академическую строгость ведущих олимпиадных институтов и технологическую платформу. Цветовая палитра строится на контрасте глубокого королевского индиго, яркого коралла и технического голубого цвета.
              </p>
            </div>

            <div className="bg-[#1B153B] border border-indigo-800/50 rounded-3xl p-6 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-indigo-900/50 pb-3">
                <Palette className="w-4 h-4 text-[#FF5252]" />
                Фирменная палитра цветов (Brand Palette)
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {BRAND_COLORS.map((col) => (
                  <div key={col.hex} className="bg-[#14102C] border border-indigo-900/60 rounded-2xl p-4 space-y-3">
                    <div
                      className="w-full h-16 rounded-xl border border-white/10 shadow-inner flex items-end justify-end p-2"
                      style={{ backgroundColor: col.hex }}
                    >
                      <span className="text-[10px] font-mono font-bold bg-black/60 text-white px-2 py-0.5 rounded backdrop-blur-sm">
                        {col.hex}
                      </span>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">{col.name}</div>
                      <div className="text-[10px] font-mono text-indigo-300">RGB: {col.rgb}</div>
                      <p className="text-[11px] text-indigo-200/70 mt-1 leading-relaxed">
                        {col.desc}
                      </p>
                    </div>
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
                <span className="text-[10px] font-mono font-bold bg-[#FF5252]/20 text-[#FF5252] border border-[#FF5252]/30 px-2 py-0.5 rounded-full">
                  #{activeDetailTask.id} • {activeDetailTask.date}
                </span>
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
                  <div className="text-2xl font-black font-mono text-emerald-400">
                    {activeDetailTask.totalScore} <span className="text-xs text-indigo-300">/ 100</span>
                  </div>
                </div>
                <button
                  onClick={() => setActiveDetailTask(null)}
                  className="p-2 hover:bg-white/10 rounded-xl text-indigo-300 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Контент модалки */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              {/* Метаданные встречи КТалк (извлеченные через KTalk API) */}
              {activeDetailTask.talkMetadata && (
                <div className="bg-[#14102C] border border-[#38BDF8]/40 rounded-2xl p-4 space-y-3 shadow-md">
                  <div className="flex items-center justify-between border-b border-indigo-900/50 pb-2">
                    <div className="flex items-center gap-2 text-[#38BDF8] font-bold text-xs uppercase tracking-wider">
                      <Video className="w-4 h-4 text-[#38BDF8]" />
                      <span>Метаданные встречи КТалк</span>
                    </div>
                    <span className="text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800 px-2 py-0.5 rounded">
                      KTalk API
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
                      <span className="text-indigo-400 block text-[10px]">ID записи (recordingKey):</span>
                      <span className="text-cyan-300 font-mono text-[11px] truncate block" title={activeDetailTask.talkMetadata.recordingKey}>
                        {activeDetailTask.talkMetadata.recordingKey || '—'}
                      </span>
                    </div>
                  </div>
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

              {/* Детализация по критериям */}
              {activeDetailTask.criteria && activeDetailTask.criteria.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-[#38BDF8]" />
                    Оценки по критериям качества:
                  </h4>
                  <div className="space-y-2">
                    {activeDetailTask.criteria.map((c: any) => (
                      <div
                        key={c.id}
                        className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                          c.passed
                            ? 'bg-[#14102C] border-indigo-900/60'
                            : 'bg-amber-950/20 border-amber-500/40'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white flex items-center gap-2">
                            <span className="text-[10px] font-mono bg-indigo-800/40 text-indigo-200 px-1.5 py-0.5 rounded">
                              #{c.id}
                            </span>
                            <span>{c.text}</span>
                          </span>
                          <span
                            className={`font-mono font-bold px-2 py-0.5 rounded ${
                              c.passed ? 'text-emerald-300 bg-emerald-500/20' : 'text-amber-300 bg-amber-500/20'
                            }`}
                          >
                            {c.score} / 5
                          </span>
                        </div>

                        {/* Таймкоды нарушений */}
                        {c.timecodes && c.timecodes.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            <span className="text-[10px] text-amber-300 font-semibold flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-amber-400" />
                              Таймкоды нарушений:
                            </span>
                            {c.timecodes.map((tc: string, tcIdx: number) => (
                              <span
                                key={tcIdx}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40"
                              >
                                🕒 {tc}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Цитата из речи */}
                        {c.quote && (
                          <div className="text-[11px] italic text-indigo-200/90 pl-3 py-1 border-l-2 border-[#38BDF8] bg-indigo-950/40 rounded-r-lg">
                            {c.quote}
                          </div>
                        )}

                        {/* Разбор и комментарий методиста */}
                        {c.comment && (
                          <div className="text-[11px] text-slate-300 leading-relaxed pt-0.5">
                            {c.comment}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Подвал модалки */}
            <div className="p-4 border-t border-indigo-900/60 bg-[#14102C]/60 flex justify-end">
              <button
                onClick={() => setActiveDetailTask(null)}
                className="px-5 py-2 bg-[#FF5252] hover:bg-[#ff3b3b] text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-[#FF5252]/30"
              >
                Закрыть отчет
              </button>
            </div>
          </div>
        </div>
      )}

      {/* МОДАЛЬНОЕ ОКНО СЫРОГО ПОЛОМАННОГО JSON ОТ ИИ */}
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
                      Разбор поврежден • Сбой JSON
                    </span>
                    <span className="text-xs text-indigo-400 font-mono">#{rawJsonModalTask.id}</span>
                  </div>
                  <h3 className="text-base font-black text-white mt-0.5">
                    Сырой ответ нейросети GigaChat ({rawJsonModalTask.teacherName})
                  </h3>
                </div>
              </div>
              <button
                onClick={() => setRawJsonModalTask(null)}
                className="p-2 hover:bg-white/10 rounded-xl text-indigo-300 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Контент модалки */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-200 leading-relaxed space-y-1">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>Автоматическое восстановление JSON структуры не удалось</span>
                </div>
                <p className="text-[11px] text-indigo-200">
                  Модель GigaChat вернула ответ, содержащий синтаксические повреждения или отказ безопасности, который встроенный парсер не смог привести к валидной схеме. Вы можете просмотреть или скопировать полный оригинальный ответ ниже:
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-indigo-300">Оригинальный сырой текст ответа модели:</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(rawJsonModalTask.rawBrokenResponse || 'Пустой ответ');
                      setCopiedRawJson(true);
                      setTimeout(() => setCopiedRawJson(false), 2000);
                    }}
                    className="px-3 py-1 bg-[#14102C] hover:bg-indigo-900/60 border border-indigo-700/50 text-[#38BDF8] rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1.5"
                  >
                    {copiedRawJson ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Скопировано!</span>
                      </>
                    ) : (
                      <>
                        <FileText className="w-3.5 h-3.5" />
                        <span>Скопировать сырой ответ</span>
                      </>
                    )}
                  </button>
                </div>

                <pre className="bg-[#100D24] text-emerald-300 border border-indigo-950 p-4 rounded-2xl font-mono text-xs overflow-x-auto max-h-[50vh] whitespace-pre-wrap select-all leading-relaxed shadow-inner">
                  {rawJsonModalTask.rawBrokenResponse || 'Ответ пуст или не был получен от сервиса.'}
                </pre>
              </div>
            </div>

            {/* Подвал модалки */}
            <div className="p-4 border-t border-indigo-900/60 bg-[#14102C]/60 flex items-center justify-between">
              <span className="text-[10px] text-indigo-400 font-mono">
                Дата создания задачи: {rawJsonModalTask.date}
              </span>
              <button
                onClick={() => setRawJsonModalTask(null)}
                className="px-5 py-2 bg-indigo-800 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
