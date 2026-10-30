import React, { useState, useEffect, useRef } from 'react';
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
  MessageSquare,
  Users,
  Award,
  Zap,
  Server,
  Terminal,
  ArrowRight,
  ChevronRight,
  PlayCircle,
  Clock,
  ExternalLink,
  Sliders,
  Sparkle,
  Palette,
  Globe,
  BookOpen,
  GraduationCap,
  Loader2,
  Flame,
  UserCheck,
  BarChart3,
  Filter,
  FileCheck
} from 'lucide-react';
import { PromptEditor } from './components/PromptEditor';

// Official Brand Logo component for "Олимпиадные Практики" (olympiadpractices.ru)
// Recreated from official logo: 4 geometric shapes (Purple Stripes, Coral Hexagon, Teal Hourglass, Cyan Cross)
function OlympLogo({ className = "w-8 h-8", bgVariant = "dark" }: { className?: string; bgVariant?: "dark" | "gradient" | "light" | "transparent" }) {
  const getBgFill = () => {
    switch (bgVariant) {
      case "light":
        return "#FFFFFF";
      case "gradient":
        return "url(#olymp_grad_bg)";
      case "transparent":
        return "none";
      case "dark":
      default:
        return "#1B153B";
    }
  };

  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        {/* Diagonal Stripe Pattern for Top-Left Purple Box */}
        <pattern id="purple_stripes_pat" width="10" height="10" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="10" stroke="#6C5CE7" strokeWidth="4.8" />
          <line x1="5" y1="0" x2="5" y2="10" stroke={bgVariant === "light" ? "#FFFFFF" : "#1B153B"} strokeWidth="5.2" />
        </pattern>

        <linearGradient id="olymp_grad_bg" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop stopColor="#35296D" />
          <stop offset="1" stopColor="#151030" />
        </linearGradient>
      </defs>

      {/* Recolored Container Background */}
      {bgVariant !== "transparent" && (
        <rect
          width="100"
          height="100"
          rx="22"
          fill={getBgFill()}
          stroke={bgVariant === "light" ? "#E2E8F0" : "#4F3B9B"}
          strokeWidth="1.5"
        />
      )}

      {/* QUADRANT 1: Top-Left - Purple Diagonal Stripes Square */}
      <g>
        <rect x="16" y="16" width="30" height="30" rx="3" fill="url(#purple_stripes_pat)" />
      </g>

      {/* QUADRANT 2: Top-Right - Coral Red Hollow Hexagon */}
      <path
        d="M 69,16.5 L 82,24 L 82,39 L 69,46.5 L 56,39 L 56,24 Z"
        stroke="#FF5549"
        strokeWidth="5.5"
        strokeLinejoin="round"
        fill="none"
      />

      {/* QUADRANT 3: Bottom-Left - Teal Semicircles (Hourglass Motif) */}
      <g fill="#1FB896">
        {/* Left Semicircle */}
        <path d="M 16,54 A 15,15 0 0,1 16,84 Z" />
        {/* Right Semicircle */}
        <path d="M 46,54 A 15,15 0 0,0 46,84 Z" />
      </g>

      {/* QUADRANT 4: Bottom-Right - Cyan Pixel Cross Grid */}
      <g fill="#29B6F6">
        {/* Center Main Square */}
        <rect x="60" y="60" width="16" height="16" rx="1" />
        {/* Corner Pixel Squares */}
        <rect x="54" y="54" width="6" height="6" rx="0.5" />
        {/* Top-Right Corner */}
        <rect x="76" y="54" width="6" height="6" rx="0.5" />
        {/* Bottom-Left Corner */}
        <rect x="54" y="76" width="6" height="6" rx="0.5" />
        {/* Bottom-Right Corner */}
        <rect x="76" y="76" width="6" height="6" rx="0.5" />
      </g>
    </svg>
  );
}

// Complete Header Brand Logo with official Typography
function OlympHeaderLogo({ showBadge = true }: { showBadge?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <OlympLogo className="w-10 h-10 shadow-lg shadow-indigo-950/60 shrink-0" />
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-black uppercase tracking-[0.12em] text-white leading-none">
            Олимпиадные<span className="text-[#FF5252] ml-1">Практики</span>
          </span>
          {showBadge && (
            <a
              href="https://olympiadpractices.ru/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[9px] bg-[#FF5252]/15 text-[#FF5252] border border-[#FF5252]/30 px-2 py-0.5 rounded-full font-bold hover:bg-[#FF5252]/25 transition-colors"
            >
              <Globe className="w-2.5 h-2.5" />
              olympiadpractices.ru
              <ExternalLink className="w-2 h-2" />
            </a>
          )}
        </div>
        <span className="text-[10px] text-indigo-300/80 font-medium tracking-wide mt-0.5">
          Центр подготовки к Всероссу и Перечневым олимпиадам
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

// Palette colors for Brandbook Inspector
const BRAND_COLORS = [
  { name: "Brand Primary Indigo", hex: "#4F3B9B", rgb: "79, 59, 155", desc: "Основной глубокий цвет брендбука (фон, плашки, градиенты)" },
  { name: "Deep Royal Night", hex: "#1E1744", rgb: "30, 23, 68", desc: "Фоновый темный цвет приложения и контрастных блоков" },
  { name: "Vivid Coral Accent", hex: "#FF5252", rgb: "255, 82, 82", desc: "Акцентный яркий кораллово-красный (критерии, кнопки, важные плашки)" },
  { name: "Electric Cyan", hex: "#38BDF8", rgb: "56, 189, 248", desc: "Технологический голубой (ИИ статусы, бейджи, ссылки)" },
  { name: "Emerald Pass", hex: "#10B981", rgb: "16, 185, 129", desc: "Цвет успешной прохождения контроля и высоких баллов" },
  { name: "Warm Amber Warning", hex: "#F59E0B", rgb: "245, 158, 11", desc: "Внимание, рекомендации, средняя оценка критериев" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'brandbook' | 'criteria' | 'pipeline' | 'sample' | 'auth' | 'stats' | 'admin_responses' | 'prompt_editor'>('overview');
  const [criteriaSearch, setCriteriaSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // One-time link stats state
  const [statsToken, setStatsToken] = useState<string | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState<boolean>(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsData, setStatsData] = useState<{ teacher_name: string; responses: Array<any> } | null>(null);
  const [statsSearch, setStatsSearch] = useState<string>('');

  // Admin one-time link state
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [isLoadingAdmin, setIsLoadingAdmin] = useState<boolean>(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminResponsesData, setAdminResponsesData] = useState<Array<any> | null>(null);
  const [adminSearch, setAdminSearch] = useState<string>('');

  const fetchedTokensRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const admToken = params.get('admin_token');

    if (admToken || (token && token.startsWith('adm_'))) {
      const effectiveToken = admToken || token;
      if (!effectiveToken || fetchedTokensRef.current.has(effectiveToken)) {
        return;
      }
      fetchedTokensRef.current.add(effectiveToken);

      setAdminToken(effectiveToken);
      setIsLoadingAdmin(true);
      setActiveTab('admin_responses');
      fetch(`/api/admin-token/${effectiveToken}`)
        .then(async (res) => {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            return res.json();
          }
          const text = await res.text();
          if (text.includes('cookie_check') || text.includes('accounts.google.com')) {
            throw new Error('Ссылка открыта в ограниченном контуре предпросмотра. Пожалуйста, откройте публичный домен приложения.');
          }
          throw new Error('Сервер вернул не JSON ответ.');
        })
        .then((data) => {
          setIsLoadingAdmin(false);
          if (data && data.success) {
            const responsesList = data.responses || [];
            setAdminResponsesData(responsesList);
          } else {
            setAdminResponsesData(null);
            setAdminError(data?.message || 'Эта одноразовая ссылка для администраторов уже была открыта (или страница была обновлена) и сгорела.');
          }
        })
        .catch((err: any) => {
          setIsLoadingAdmin(false);
          setAdminResponsesData(null);
          setAdminError(err.message || 'Ошибка подключения к серверу при проверке одноразовой админ-ссылки.');
          console.error(err);
        });
    } else if (token) {
      if (fetchedTokensRef.current.has(token)) {
        return;
      }
      fetchedTokensRef.current.add(token);

      setStatsToken(token);
      setIsLoadingStats(true);
      setActiveTab('stats');
      fetch(`/api/stats-token/${token}`)
        .then(async (res) => {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            return res.json();
          }
          const text = await res.text();
          if (text.includes('cookie_check') || text.includes('accounts.google.com')) {
            throw new Error('Ссылка открыта в ограниченном контуре предпросмотра. Пожалуйста, откройте публичный домен приложения.');
          }
          throw new Error('Сервер вернул не JSON ответ.');
        })
        .then((data) => {
          setIsLoadingStats(false);
          if (data && data.success) {
            const statsObj = {
              teacher_name: data.teacher_name,
              responses: data.responses || []
            };
            setStatsData(statsObj);
          } else {
            setStatsData(null);
            setStatsError(data?.message || 'Эта одноразовая ссылка уже была открыта (или страница была обновлена) и сгорела.');
          }
        })
        .catch((err: any) => {
          setIsLoadingStats(false);
          setStatsData(null);
          setStatsError(err.message || 'Ошибка подключения к серверу при проверке одноразовой ссылки.');
          console.error(err);
        });
    }
  }, []);

  const categories = ['all', ...Array.from(new Set(STANDARD_CRITERIA.map(c => c.category)))];

  const filteredCriteria = STANDARD_CRITERIA.filter(c => {
    const matchesSearch = c.text.toLowerCase().includes(criteriaSearch.toLowerCase()) || c.id.toString().includes(criteriaSearch);
    const matchesCategory = selectedCategory === 'all' || c.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-[#14102C] text-slate-100 flex flex-col font-sans antialiased selection:bg-[#FF5252]/30 selection:text-white">
      {/* Top Header - Brandbook Style */}
      <header className="border-b border-indigo-900/40 bg-[#1B153B]/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
          
          {/* Official Logo & Brand Name */}
          <div className="flex items-center gap-4">
            <OlympHeaderLogo showBadge={true} />
            <div className="hidden sm:block h-7 w-[1px] bg-indigo-800/60"></div>
            <h1 className="hidden md:flex text-xs font-semibold text-indigo-200/90 items-center gap-1.5 bg-[#14102C]/60 px-3 py-1.5 rounded-xl border border-indigo-800/40">
              <Sparkles className="w-3.5 h-3.5 text-[#FF5252]" />
              Lecture AI Analyzer Bot
              <span className="text-indigo-400 font-normal">| GigaChat-2-Pro</span>
            </h1>
          </div>

          {/* Right Status Badges */}
          <div className="flex items-center gap-2 text-xs">
            <div className="bg-[#241E4F] border border-indigo-700/40 px-3 py-1.5 rounded-xl flex items-center gap-2 text-slate-200">
              <Sparkles className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span>AI Engine: <strong className="text-white">GigaChat-2-Pro (Сбер)</strong></span>
            </div>
            <div className="bg-[#241E4F] border border-indigo-700/40 px-3 py-1.5 rounded-xl flex items-center gap-2 text-slate-200">
              <Database className="w-3.5 h-3.5 text-[#FF5252]" />
              <span>БД: <strong className="text-white">PostgreSQL (Asyncpg)</strong></span>
            </div>
          </div>
        </div>

        {/* Brand Navigation Bar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-1 border-t border-indigo-900/30 pt-1.5 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all flex items-center gap-2 border-b-2 ${
              activeTab === 'overview'
                ? 'border-[#FF5252] text-white bg-[#2B2363]'
                : 'border-transparent text-indigo-200/70 hover:text-white hover:bg-[#241E4F]/60'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 text-[#FF5252]" />
            Главная и Сервисы
          </button>
          <button
            onClick={() => setActiveTab('brandbook')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all flex items-center gap-2 border-b-2 ${
              activeTab === 'brandbook'
                ? 'border-[#FF5252] text-white bg-[#2B2363]'
                : 'border-transparent text-indigo-200/70 hover:text-white hover:bg-[#241E4F]/60'
            }`}
          >
            <Palette className="w-3.5 h-3.5 text-[#FF5252]" />
            Брендбук & Стиль
          </button>
          <button
            onClick={() => setActiveTab('criteria')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all flex items-center gap-2 border-b-2 ${
              activeTab === 'criteria'
                ? 'border-[#FF5252] text-white bg-[#2B2363]'
                : 'border-transparent text-indigo-200/70 hover:text-white hover:bg-[#241E4F]/60'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#38BDF8]" />
            Критерии оценки (21 + 8)
          </button>
          <button
            onClick={() => setActiveTab('pipeline')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all flex items-center gap-2 border-b-2 ${
              activeTab === 'pipeline'
                ? 'border-[#FF5252] text-white bg-[#2B2363]'
                : 'border-transparent text-indigo-200/70 hover:text-white hover:bg-[#241E4F]/60'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            Пайплайн GigaChat-2-Pro
          </button>
          <button
            onClick={() => setActiveTab('sample')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all flex items-center gap-2 border-b-2 ${
              activeTab === 'sample'
                ? 'border-[#FF5252] text-white bg-[#2B2363]'
                : 'border-transparent text-indigo-200/70 hover:text-white hover:bg-[#241E4F]/60'
            }`}
          >
            <Award className="w-3.5 h-3.5 text-amber-400" />
            Пример отчета ИИ
          </button>
          <button
            onClick={() => setActiveTab('auth')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all flex items-center gap-2 border-b-2 ${
              activeTab === 'auth'
                ? 'border-[#FF5252] text-white bg-[#2B2363]'
                : 'border-transparent text-indigo-200/70 hover:text-white hover:bg-[#241E4F]/60'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-emerald-400" />
            Авторизация & PostgreSQL
          </button>
          <button
            onClick={() => setActiveTab('prompt_editor')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all flex items-center gap-2 border-b-2 ${
              activeTab === 'prompt_editor'
                ? 'border-[#FF5252] text-white bg-[#2B2363]'
                : 'border-transparent text-indigo-200/70 hover:text-white hover:bg-[#241E4F]/60'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Редактор промпта ИИ</span>
            <span className="px-1.5 py-0.5 text-[9px] bg-amber-500/20 text-amber-300 rounded font-bold border border-amber-500/30">2FA</span>
          </button>
          {(statsData || isLoadingStats || statsError || statsToken) && (
            <button
              onClick={() => setActiveTab('stats')}
              className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all flex items-center gap-2 border-b-2 ${
                activeTab === 'stats'
                  ? 'border-[#FF5252] text-white bg-[#2B2363]'
                  : 'border-transparent text-indigo-200/70 hover:text-white hover:bg-[#241E4F]/60'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-[#FF5252]" />
              {statsData ? `📊 Отчет: ${statsData.teacher_name}` : '📊 Статистика Преподавателя'}
              {statsData && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              )}
            </button>
          )}
          {(adminResponsesData || isLoadingAdmin || adminError || adminToken) && (
            <button
              onClick={() => setActiveTab('admin_responses')}
              className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-all flex items-center gap-2 border-b-2 ${
                activeTab === 'admin_responses'
                  ? 'border-[#FF5252] text-white bg-[#2B2363]'
                  : 'border-transparent text-indigo-200/70 hover:text-white hover:bg-[#241E4F]/60'
              }`}
            >
              <Database className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span>📋 Реестр запросов (Responses)</span>
              {adminResponsesData && (
                <span className="w-2 h-2 rounded-full bg-[#38BDF8] animate-pulse"></span>
              )}
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-fade-in">
            
            {/* Main Brand Hero Card */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#2B2363] via-[#3A2E80] to-[#1F1A44] border border-indigo-500/30 p-8 shadow-2xl space-y-4">
              <div className="absolute -right-10 -bottom-10 w-64 h-64 rounded-full bg-gradient-to-br from-[#FF5252]/20 to-[#6366F1]/10 blur-3xl pointer-events-none"></div>
              
              <div className="flex items-center gap-2 flex-wrap">
                <span className="bg-[#FF5252] text-white text-[10px] uppercase font-extrabold tracking-wider px-3 py-1 rounded-full shadow-lg shadow-[#FF5252]/30">
                  Олимпиадные Практики • ИИ Стандарт
                </span>
                <span className="text-xs text-indigo-200/80 font-medium">
                  Финальная система автоматической проверки уроков
                </span>
                <a
                  href="https://olympiadpractices.ru/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#38BDF8] hover:underline flex items-center gap-1 font-semibold ml-auto"
                >
                  <Globe className="w-3.5 h-3.5" />
                  Официальный сайт: olympiadpractices.ru
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight max-w-3xl">
                Автоматическая проверка педагогического качества вебинаров KTalk нейросетью GigaChat-2-Pro
              </h2>

              <p className="text-sm text-indigo-100/90 leading-relaxed max-w-3xl">
                Бот качает видеоуроки KTalk, делает поминутную раскадровку, конвертирует сжатый звук и передает мультимодальные данные в модель <strong>GigaChat-2-Pro</strong> через официальный отечественный API Сбера. Формирует развернутую методическую рецензию с точностью до секунд.
              </p>

              <div className="pt-2 flex flex-wrap gap-4 text-xs font-semibold">
                <div className="bg-[#14102C]/60 border border-indigo-400/30 px-4 py-2.5 rounded-2xl flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Авторизация по <strong>@username</strong> без ID</span>
                </div>
                <div className="bg-[#14102C]/60 border border-indigo-400/30 px-4 py-2.5 rounded-2xl flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[#38BDF8]" />
                  <span>PostgreSQL Pool с авто-восстановлением</span>
                </div>
                <div className="bg-[#14102C]/60 border border-indigo-400/30 px-4 py-2.5 rounded-2xl flex items-center gap-2">
                  <Sparkle className="w-4 h-4 text-amber-400" />
                  <span>Модель GigaChat-2-Pro (Сертификаты Минцифры)</span>
                </div>
              </div>
            </div>

            {/* Top Metric Boxes - Brandbook Palette */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-4 flex items-center gap-4 hover:border-indigo-600/60 transition-colors">
                <div className="w-12 h-12 rounded-xl bg-[#FF5252]/15 border border-[#FF5252]/30 flex items-center justify-center text-[#FF5252] shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-[11px] text-indigo-300 font-medium">Telegram Бот</div>
                  <div className="text-sm font-bold text-white">Aiogram 3.x Polling</div>
                  <div className="text-[10px] text-emerald-400 font-medium">Авторизация @username</div>
                </div>
              </div>

              <div className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-4 flex items-center gap-4 hover:border-indigo-600/60 transition-colors">
                <div className="w-12 h-12 rounded-xl bg-[#6366F1]/15 border border-[#6366F1]/30 flex items-center justify-center text-[#818CF8] shrink-0">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-[11px] text-indigo-300 font-medium">ИИ Модель</div>
                  <div className="text-sm font-bold text-white">GigaChat-2-Pro</div>
                  <div className="text-[10px] text-emerald-400 font-medium">Официальный SDK (Сбер)</div>
                </div>
              </div>

              <div className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-4 flex items-center gap-4 hover:border-indigo-600/60 transition-colors">
                <div className="w-12 h-12 rounded-xl bg-[#38BDF8]/15 border border-[#38BDF8]/30 flex items-center justify-center text-[#38BDF8] shrink-0">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-[11px] text-indigo-300 font-medium">Хранилище Данных</div>
                  <div className="text-sm font-bold text-white">PostgreSQL (Asyncpg Pool)</div>
                  <div className="text-[10px] text-[#38BDF8] font-medium">Сброс idle-соединений</div>
                </div>
              </div>

              <div className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-4 flex items-center gap-4 hover:border-indigo-600/60 transition-colors">
                <div className="w-12 h-12 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300 shrink-0">
                  <Video className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-[11px] text-indigo-300 font-medium">Обработка KTalk</div>
                  <div className="text-sm font-bold text-white">Video & Audio Processing</div>
                  <div className="text-[10px] text-purple-300 font-medium">Раскадровка + 32k MP3</div>
                </div>
              </div>
            </div>

            {/* Link & Direction Banner to Official Website */}
            <div className="bg-gradient-to-r from-[#241E4F] via-[#2B2363] to-[#1F1A44] border border-indigo-600/40 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl">
              <div className="space-y-2 text-center md:text-left">
                <div className="flex items-center gap-2 justify-center md:justify-start">
                  <GraduationCap className="w-5 h-5 text-[#FF5252]" />
                  <span className="text-xs font-black uppercase tracking-wider text-white">
                    Школа Олимпиадной Подготовки «Олимпиадные Практики»
                  </span>
                </div>
                <p className="text-xs text-indigo-200/80 max-w-2xl leading-relaxed">
                  Официальный образовательный портал подготовки школьников к Всероссу и перечневым олимпиадам по математике, экономике, физике, информатике, анализу данных и лингвистике.
                </p>
              </div>

              <a
                href="https://olympiadpractices.ru/"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-[#FF5252] hover:bg-[#ff3b3b] text-white px-6 py-3 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-[#FF5252]/30 shrink-0"
              >
                <span>Перейти на olympiadpractices.ru</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>

            {/* Architecture Highlights & Modules */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Detailed Improvements List */}
              <div className="lg:col-span-2 bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-indigo-900/50 pb-3">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Zap className="w-5 h-5 text-[#FF5252]" />
                    Решенные задачи и архитектурные изменения
                  </h3>
                  <span className="text-xs text-indigo-300 bg-[#2B2363] px-3 py-1 rounded-full border border-indigo-700/40">
                    Все баги исправлены
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-4 bg-[#14102C] rounded-xl border border-indigo-900/60 space-y-2">
                    <div className="font-bold text-white flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">✓</div>
                      Переход на GigaChat API
                    </div>
                    <p className="text-indigo-200/80 leading-relaxed">
                      Все промпты и пайплайны переведены на отечественную флагманскую модель <strong>GigaChat-2-Pro</strong> (Сбер) с полной локализацией обработки данных в РФ.
                    </p>
                  </div>

                  <div className="p-4 bg-[#14102C] rounded-xl border border-indigo-900/60 space-y-2">
                    <div className="font-bold text-white flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">✓</div>
                      Авторизация по Username
                    </div>
                    <p className="text-indigo-200/80 leading-relaxed">
                      Админу нужно указывать только <code className="text-amber-300 bg-[#2B2363] px-1.5 py-0.5 rounded">@username</code> через бота. Telegram ID привязывается автоматически в момент первой активности.
                    </p>
                  </div>

                  <div className="p-4 bg-[#14102C] rounded-xl border border-indigo-900/60 space-y-2">
                    <div className="font-bold text-white flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">✓</div>
                      Чистый пайплайн без in-memory кэша
                    </div>
                    <p className="text-indigo-200/80 leading-relaxed">
                      Убраны промежуточные словари в памяти в пользу надежного модуля <code className="text-indigo-300 bg-[#2B2363] px-1.5 py-0.5 rounded">ai_gigachat.py</code>. Статусы и результаты синхронизируются строго через БД.
                    </p>
                  </div>

                  <div className="p-4 bg-[#14102C] rounded-xl border border-indigo-900/60 space-y-2">
                    <div className="font-bold text-white flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">✓</div>
                      Устойчивость PostgreSQL
                    </div>
                    <p className="text-indigo-200/80 leading-relaxed">
                      Настроен <code className="text-cyan-300 bg-[#2B2363] px-1.5 py-0.5 rounded">asyncpg</code> пул с <code className="text-cyan-300 bg-[#2B2363] px-1.5 py-0.5 rounded">max_inactive_connection_lifetime=300</code> и повторной попыткой при разрывах.
                    </p>
                  </div>
                </div>
              </div>

              {/* Bot Command Cheat-Sheet */}
              <div className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-6 space-y-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-[#38BDF8]" />
                  Команды управления
                </h3>

                <div className="space-y-2.5 text-xs">
                  <div className="p-3 bg-[#14102C] rounded-xl border border-indigo-900/60">
                    <div className="font-mono font-bold text-[#FF5252]">/start</div>
                    <div className="text-indigo-200/70 text-[11px] mt-0.5">Приветствие и автоматическая авторизация юзера</div>
                  </div>

                  <div className="p-3 bg-[#14102C] rounded-xl border border-indigo-900/60">
                    <div className="font-mono font-bold text-[#38BDF8]">📅 Проверить встречу</div>
                    <div className="text-indigo-200/70 text-[11px] mt-0.5">Запуск пошагового мастера проверки записи KTalk</div>
                  </div>

                  <div className="p-3 bg-[#14102C] rounded-xl border border-indigo-900/60">
                    <div className="font-mono font-bold text-emerald-400">/add_user @username</div>
                    <div className="text-indigo-200/70 text-[11px] mt-0.5">Добавить пользователя в белый список (Админ)</div>
                  </div>

                  <div className="p-3 bg-[#14102C] rounded-xl border border-indigo-900/60">
                    <div className="font-mono font-bold text-amber-400">/del_user @username</div>
                    <div className="text-indigo-200/70 text-[11px] mt-0.5">Удалить пользователя из белого списка (Админ)</div>
                  </div>

                  <div className="p-3 bg-[#14102C] rounded-xl border border-indigo-900/60">
                    <div className="font-mono font-bold text-purple-300">/users</div>
                    <div className="text-indigo-200/70 text-[11px] mt-0.5">Показать текущий список разрешенных участников</div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* TAB 2: BRANDBOOK & STYLE GUIDE */}
        {activeTab === 'brandbook' && (
          <div className="space-y-6 animate-fade-in">
            
            {/* Header Banner */}
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
                Брендинг компании сочетает академическую строгость ведущих академических институтов (Центральный Университет, Т-Банк, ВШЭ) и энергичную олимпиадную среду. Цветовая палитра строится на контрасте глубокого королевского индиго, яркого коралла и технического голубого цвета.
              </p>
            </div>

            {/* Official Color Palette Inspector */}
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

            {/* Logo Usage & Typography Rules */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Logo Variants & Geometry Showcase */}
              <div className="bg-[#1B153B] border border-indigo-800/50 rounded-3xl p-6 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-indigo-900/50 pb-3">
                  <Sparkles className="w-4 h-4 text-[#38BDF8]" />
                  Официальный логотип и геометрия 4-х элементов
                </h3>

                <p className="text-xs text-indigo-200/80 leading-relaxed">
                  Официальная эмблема «Олимпиадные Практики» состоит из 4 геометрических модулей: <strong>фиолетовой диагональной штриховки</strong>, <strong>кораллового шестиугольника</strong>, <strong>изумрудных полукругов (песочные часы)</strong> и <strong>голубого пиксельного креста</strong>.
                </p>

                <div className="space-y-3">
                  {/* Dark Theme Variant */}
                  <div className="p-4 bg-[#14102C] rounded-2xl border border-indigo-900/60 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <OlympLogo className="w-12 h-12 shrink-0 shadow-lg shadow-indigo-950/70" bgVariant="dark" />
                      <div>
                        <div className="text-xs font-bold text-white">Основной вариант (Dark Indigo)</div>
                        <div className="text-[11px] text-indigo-200/70">
                          Тёмный королевский фон индиго (#1B153B) для дашбордов и бота.
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono font-bold bg-[#2B2363] text-indigo-300 px-2 py-1 rounded border border-indigo-700/40">
                      bgVariant="dark"
                    </span>
                  </div>

                  {/* Gradient Variant */}
                  <div className="p-4 bg-[#14102C] rounded-2xl border border-indigo-900/60 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <OlympLogo className="w-12 h-12 shrink-0 shadow-lg shadow-indigo-950/70" bgVariant="gradient" />
                      <div>
                        <div className="text-xs font-bold text-white">Градиентный вариант (Royal Gradient)</div>
                        <div className="text-[11px] text-indigo-200/70">
                          Объемный градиент для промо-карточек и презентаций.
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono font-bold bg-[#2B2363] text-indigo-300 px-2 py-1 rounded border border-indigo-700/40">
                      bgVariant="gradient"
                    </span>
                  </div>

                  {/* Light Theme Variant */}
                  <div className="p-4 bg-white text-slate-900 rounded-2xl flex items-center justify-between gap-4 border border-slate-200">
                    <div className="flex items-center gap-3">
                      <OlympLogo className="w-12 h-12 shrink-0 shadow-md" bgVariant="light" />
                      <div>
                        <div className="text-xs font-bold text-slate-900">Светлый вариант (Crisp White)</div>
                        <div className="text-[11px] text-slate-600">
                          Официальный логотип на белом фоне сайта olympiadpractices.ru
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-1 rounded border border-slate-300">
                      bgVariant="light"
                    </span>
                  </div>
                </div>
              </div>

              {/* Educational Directions */}
              <div className="bg-[#1B153B] border border-indigo-800/50 rounded-3xl p-6 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-indigo-900/50 pb-3">
                  <BookOpen className="w-4 h-4 text-emerald-400" />
                  Направления подготовки «Олимпиадные Практики»
                </h3>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-3 bg-[#14102C] rounded-xl border border-indigo-900/60 font-medium text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#FF5252]"></span>
                    Математика
                  </div>
                  <div className="p-3 bg-[#14102C] rounded-xl border border-indigo-900/60 font-medium text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#38BDF8]"></span>
                    Экономика
                  </div>
                  <div className="p-3 bg-[#14102C] rounded-xl border border-indigo-900/60 font-medium text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    Анализ Данных (DS)
                  </div>
                  <div className="p-3 bg-[#14102C] rounded-xl border border-indigo-900/60 font-medium text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                    Информатика
                  </div>
                  <div className="p-3 bg-[#14102C] rounded-xl border border-indigo-900/60 font-medium text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    Физика
                  </div>
                  <div className="p-3 bg-[#14102C] rounded-xl border border-indigo-900/60 font-medium text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                    Лингвистика
                  </div>
                </div>

                <div className="p-3 bg-[#241E4F] rounded-xl border border-indigo-700/40 text-[11px] text-indigo-200 leading-relaxed">
                  Все направления подлежат автоматической проверке данным ботом по 21 методическому критерию.
                </div>
              </div>

            </div>

          </div>
        )}

        {/* TAB 3: CRITERIA INSPECTOR */}
        {activeTab === 'criteria' && (
          <div className="space-y-6 animate-fade-in">
            {/* Header Description */}
            <div className="bg-gradient-to-r from-[#2B2363] to-[#1B153B] border border-indigo-500/30 rounded-2xl p-6 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-[#FF5252]" />
                  Стандарты оценки методического качества уроков
                </h2>
                <div className="flex items-center gap-2 text-xs">
                  <span className="bg-[#FF5252]/20 text-[#FF5252] border border-[#FF5252]/40 px-3 py-1 rounded-full font-bold">
                    21 Стандартный параметр (0–100 б)
                  </span>
                  <span className="bg-[#38BDF8]/20 text-[#38BDF8] border border-[#38BDF8]/40 px-3 py-1 rounded-full font-bold">
                    8 Критических нарушений
                  </span>
                </div>
              </div>
              <p className="text-xs text-indigo-100/90 leading-relaxed max-w-4xl">
                Итоговый балл рассчитывается пропорционально сумме баллов по формуле: <code className="bg-[#14102C] text-amber-300 px-2 py-0.5 rounded font-mono">(сумма_баллов / (2 * кол_во_применимых_критериев)) * 100</code>. Если критерий неприменим к данному типу лекции, ИИ присваивает ему значение <code className="bg-[#14102C] text-slate-300 px-1.5 py-0.5 rounded font-mono">null</code>, исключая его из знаменателя.
              </p>
            </div>

            {/* Search & Category Filter */}
            <div className="flex flex-col sm:flex-row gap-3 justify-between items-center bg-[#1B153B] p-4 rounded-2xl border border-indigo-800/50">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-indigo-300 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Поиск критерия по названию или №..."
                  value={criteriaSearch}
                  onChange={(e) => setCriteriaSearch(e.target.value)}
                  className="w-full bg-[#14102C] border border-indigo-900/80 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-indigo-300/50 focus:outline-none focus:border-[#FF5252] transition-colors"
                />
              </div>

              <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto scrollbar-none">
                <span className="text-xs text-indigo-300 shrink-0 font-medium">Категория:</span>
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-colors shrink-0 capitalize ${
                      selectedCategory === cat
                        ? 'bg-[#FF5252] text-white shadow-md shadow-[#FF5252]/30'
                        : 'bg-[#241E4F] text-indigo-200 hover:text-white hover:bg-[#2B2363]'
                    }`}
                  >
                    {cat === 'all' ? 'Все критерии' : cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Standard Criteria Grid */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Стандартная матрица оценки ({filteredCriteria.length} из 21)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredCriteria.map((c) => (
                  <div key={c.id} className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-4 space-y-3 hover:border-indigo-600 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-white bg-[#FF5252] px-2.5 py-0.5 rounded-lg shadow-sm">
                        Критерий №{c.id}
                      </span>
                      <span className="text-[10px] text-indigo-200 bg-[#2B2363] px-2.5 py-1 rounded-full font-semibold border border-indigo-700/30">
                        {c.category}
                      </span>
                    </div>
                    <p className="text-xs text-white font-medium leading-relaxed">
                      {c.text.replace(/^\d+\.\s*/, '')}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-indigo-200/70 pt-2 border-t border-indigo-900/40">
                      <span className="text-emerald-400 font-bold">2 б</span> (полностью) |
                      <span className="text-amber-400 font-bold ml-1">1 б</span> (частично) |
                      <span className="text-rose-400 font-bold ml-1">0 б</span> (не выполнено) |
                      <span className="text-slate-400 font-bold ml-1">null</span> (пропуск)
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Critical Criteria Red Block */}
            <div className="bg-gradient-to-r from-[#3B1520] to-[#201018] border border-rose-600/40 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-sm font-black text-rose-200 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-400 animate-pulse" />
                  Критические нарушения (Параметр is_critical = true)
                </h3>
                <span className="text-[11px] bg-rose-500/20 text-rose-300 px-3 py-1 rounded-full border border-rose-500/40 font-bold">
                  Обнуление допуска или блокировка
                </span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {CRITICAL_CRITERIA.map((crit) => (
                  <div key={crit.id} className="bg-[#14102C]/90 border border-rose-900/50 rounded-xl p-3.5 space-y-1.5">
                    <div className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                      {crit.id}. {crit.title}
                    </div>
                    <p className="text-[11px] text-indigo-200/70 leading-relaxed">
                      {crit.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* TAB 4: PIPELINE GEMINI 3.5 */}
        {activeTab === 'pipeline' && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-indigo-900/50 pb-4">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-[#38BDF8]" />
                  Архитектурный пайплайн обработки через GigaChat API
                </h2>
                <span className="text-xs text-indigo-200 bg-[#2B2363] px-3 py-1 rounded-full">
                  GigaChat-2-Pro & Files API
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                
                {/* Step 1 Card */}
                <div className="bg-[#14102C] border border-indigo-900/60 rounded-2xl p-5 space-y-3 relative flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 font-bold text-xs">
                      01
                    </div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Video className="w-4 h-4 text-indigo-400" />
                      Загрузка KTalk
                    </div>
                    <p className="text-[11px] text-indigo-200/70 leading-relaxed">
                      <code className="text-indigo-300">fetch_talk.py</code> скачивает видеозапись, текстовый авто-транскрипт и метаданные лекции KTalk.
                    </p>
                  </div>
                  <div className="text-[10px] text-indigo-400 font-mono pt-2 border-t border-indigo-900/40">
                    /artifacts/lecture.mp4
                  </div>
                </div>

                {/* Step 2 Card */}
                <div className="bg-[#14102C] border border-indigo-900/60 rounded-2xl p-5 space-y-3 relative flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="w-8 h-8 rounded-xl bg-[#38BDF8]/20 border border-[#38BDF8]/30 flex items-center justify-center text-[#38BDF8] font-bold text-xs">
                      02
                    </div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-[#38BDF8]" />
                      Раскадровка & MP3
                    </div>
                    <p className="text-[11px] text-indigo-200/70 leading-relaxed">
                      <code className="text-[#38BDF8]">file_processing.py</code> делает нарезку кадров каждые 60 сек и извлекает сжатое MP3 аудио.
                    </p>
                  </div>
                  <div className="text-[10px] text-[#38BDF8] font-mono pt-2 border-t border-indigo-900/40">
                    Frame 00:00, 01:00...
                  </div>
                </div>

                {/* Step 3 Card */}
                <div className="bg-[#14102C] border border-indigo-900/60 rounded-2xl p-5 space-y-3 relative flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="w-8 h-8 rounded-xl bg-[#FF5252]/20 border border-[#FF5252]/30 flex items-center justify-center text-[#FF5252] font-bold text-xs">
                      03
                    </div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-[#FF5252]" />
                      GigaChat-2-Pro
                    </div>
                    <p className="text-[11px] text-indigo-200/70 leading-relaxed">
                      <code className="text-[#FF5252]">ai_gigachat.py</code> загружает аудио и кадры через Files API и получает рецензию от <strong>GigaChat-2-Pro</strong>.
                    </p>
                  </div>
                  <div className="text-[10px] text-[#FF5252] font-mono pt-2 border-t border-indigo-900/40">
                    GigaChat Files API
                  </div>
                </div>

                {/* Step 4 Card */}
                <div className="bg-[#14102C] border border-indigo-900/60 rounded-2xl p-5 space-y-3 relative flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-xs">
                      04
                    </div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <MessageSquare className="w-4 h-4 text-emerald-400" />
                      Сохранение & Telegram
                    </div>
                    <p className="text-[11px] text-indigo-200/70 leading-relaxed">
                      <code className="text-emerald-400">ai_common.py</code> парсит JSON, записывает ответ в БД и шлет форматированный отчет в Telegram.
                    </p>
                  </div>
                  <div className="text-[10px] text-emerald-400 font-mono pt-2 border-t border-indigo-900/40">
                    UPDATE ai_checks SET point
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* TAB 5: SAMPLE REPORT */}
        {activeTab === 'sample' && (
          <div className="space-y-6 animate-fade-in">
            {/* Styled Telegram Message Mockup */}
            <div className="max-w-3xl mx-auto bg-[#1B153B] border border-indigo-700/50 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
              
              <div className="flex items-center justify-between pb-4 border-b border-indigo-900/60 flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <OlympLogo className="w-10 h-10" />
                  <div>
                    <div className="text-[10px] uppercase font-bold text-[#FF5252]">Telegram Bot Response (GigaChat-2-Pro)</div>
                    <h3 className="text-base font-extrabold text-white">Рецензия методиста на зафиксированную лекцию</h3>
                  </div>
                </div>
                
                <div className="bg-[#2B2363] border border-indigo-500/30 px-4 py-2 rounded-2xl flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-xl font-black text-emerald-400">88 <span className="text-xs text-indigo-300">/ 100</span></div>
                    <div className="text-[9px] text-indigo-300 uppercase font-semibold">Итоговый балл</div>
                  </div>
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                </div>
              </div>

              {/* Telegram Message Formatting Sample */}
              <div className="bg-[#14102C] p-5 rounded-2xl border border-indigo-900/60 space-y-4 text-xs leading-relaxed text-indigo-100">
                <div className="font-bold text-white text-sm border-b border-indigo-900/40 pb-2 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#FF5252]" />
                  Результат проверки лекции: "Теория Графов и Комбинаторика"
                </div>

                <div className="space-y-2">
                  <p><strong className="text-white">📌 Общий комментарий:</strong> Преподаватель продемонстрировал высокий уровень методической подготовки и владения предметом. Структура урока выдержана логично.</p>
                  
                  <p><strong className="text-white">⏱ Разбор ключевых моментов по таймкодам:</strong></p>
                  <ul className="list-disc pl-5 space-y-1.5 text-indigo-200">
                    <li><strong className="text-[#38BDF8]">[00:00–02:30]</strong> Приветствие, чёткое формулирование темы и порядка работы на уроке.</li>
                    <li><strong className="text-[#38BDF8]">[11:15–16:40]</strong> Эффективный разбор первой задачи: преподаватель выделил основные вершины графа на доске.</li>
                    <li><strong className="text-amber-300">[24:00–28:30]</strong> Замечена пауза при ответе слабой группы. Рекомендуется задать наводящий вопрос (Критерий №8 — 1 балл).</li>
                    <li><strong className="text-[#38BDF8]">[41:10]</strong> Быстрая обратная связь у доски, ошибочный ответ ученика проанализирован без негатива.</li>
                  </ul>
                </div>

                <div className="pt-2 border-t border-indigo-900/40">
                  <p><strong className="text-[#FF5252]">💡 Рекомендации преподавателю:</strong></p>
                  <ol className="list-decimal pl-5 space-y-1 text-indigo-200 mt-1">
                    <li>Вовлекайте менее активных участников группы через адресные вопросы.</li>
                    <li>Используйте разный цвет маркера для параллельных ветвей доказательства.</li>
                    <li>Сохраняйте паузу 30 секунд после вывода условия сложной задачи.</li>
                  </ol>
                </div>

                <div className="bg-[#2B2363]/60 p-3 rounded-xl border border-indigo-700/30 flex items-center justify-between text-[11px] text-indigo-300 font-medium">
                  <span>Стандартных параметров задействовано: 21 / 21</span>
                  <span className="text-emerald-400 font-bold">Критических ошибок: 0</span>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* TAB 6: AUTH & DATABASE */}
        {activeTab === 'auth' && (
          <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Access Control Box */}
              <div className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-indigo-900/50 pb-3">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Users className="w-5 h-5 text-[#FF5252]" />
                    Авторизация по Username
                  </h3>
                  <span className="text-xs bg-[#FF5252]/20 text-[#FF5252] px-2.5 py-0.5 rounded-full font-bold">
                    Без ввода ID
                  </span>
                </div>

                <p className="text-xs text-indigo-200/80 leading-relaxed">
                  Администратору достаточно добавить никнейм пользователя через <code className="text-amber-300 bg-[#14102C] px-1.5 py-0.5 rounded font-mono">/add_user @username</code>. Бот автоматически разрешит доступ и привяжет <code className="text-[#38BDF8] bg-[#14102C] px-1.5 py-0.5 rounded font-mono">telegram_id</code> при первой команде.
                </p>

                <div className="bg-[#14102C] p-4 rounded-xl border border-indigo-900/60 space-y-2 text-xs">
                  <div className="text-indigo-300 font-semibold mb-1">Начальные администраторы:</div>
                  <div className="flex items-center justify-between p-2.5 bg-[#1B153B] rounded-lg border border-indigo-800/40">
                    <span className="text-white font-mono">@shurygin_egor</span>
                    <span className="text-emerald-400 text-[10px] font-bold">Administrator</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 bg-[#1B153B] rounded-lg border border-indigo-800/40">
                    <span className="text-white font-mono">@aemss72</span>
                    <span className="text-emerald-400 text-[10px] font-bold">Administrator</span>
                  </div>
                </div>
              </div>

              {/* PostgreSQL Pool Box */}
              <div className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-indigo-900/50 pb-3">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Database className="w-5 h-5 text-[#38BDF8]" />
                    Настройки PostgreSQL Asyncpg
                  </h3>
                  <span className="text-xs bg-[#38BDF8]/20 text-[#38BDF8] px-2.5 py-0.5 rounded-full font-bold">
                    Auto-reconnect Pool
                  </span>
                </div>

                <p className="text-xs text-indigo-200/80 leading-relaxed">
                  Решена проблема с обрывами сетевых сокетов PostgreSQL при отсутствии активности со стороны пользователя.
                </p>

                <div className="bg-[#14102C] p-4 rounded-xl border border-indigo-900/60 font-mono text-xs text-indigo-200 space-y-1">
                  <div className="text-indigo-400 text-[10px]"># Конфигурация пула в database.py</div>
                  <div>min_size = 1</div>
                  <div>max_size = 10</div>
                  <div>command_timeout = 60.0</div>
                  <div>max_inactive_connection_lifetime = 300.0</div>
                </div>

                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 font-medium">
                  ✓ Автоматический перехват ошибок соединения с прозрачным ретраем запроса.
                </div>
              </div>

            </div>
          </div>
        )}

        {/* TAB 7: ONE-TIME STATS VIEW FOR TEACHERS */}
        {activeTab === 'stats' && (
          <div className="space-y-6 animate-fade-in">
            
            {/* Loading State */}
            {isLoadingStats && (
              <div className="bg-[#1B153B] border border-indigo-700/50 rounded-3xl p-12 text-center space-y-4 max-w-2xl mx-auto shadow-2xl">
                <Loader2 className="w-12 h-12 text-[#FF5252] animate-spin mx-auto" />
                <h3 className="text-lg font-bold text-white">
                  Проверка одноразовой ссылки и загрузка отчета...
                </h3>
                <p className="text-xs text-indigo-200/70">
                  Пожалуйста, подождите. Мы сжигаем одноразовый токен доступа и фиксируем данные статистики в текущей сессии браузера.
                </p>
              </div>
            )}

            {/* Error / Expired Token State */}
            {statsError && !isLoadingStats && (
              <div className="bg-[#1B153B] border border-red-500/40 rounded-3xl p-8 max-w-2xl mx-auto space-y-6 shadow-2xl">
                <div className="flex items-center gap-4 text-red-400 border-b border-red-500/30 pb-4">
                  <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-6 h-6 text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Ссылка недействительна или срок истек</h3>
                    <span className="text-xs text-red-300 font-medium">Срок действия ссылки: 3 часа</span>
                  </div>
                </div>

                <div className="p-4 bg-[#14102C] rounded-2xl border border-red-500/20 space-y-2 text-xs leading-relaxed text-indigo-100">
                  <p className="font-semibold text-white">
                    ⚠️ {statsError}
                  </p>
                  <p className="text-indigo-200/80">
                    Каждая веб-ссылка на статистику преподавателя действительна в течение 3 часов с момента создания. В пределах этого времени страницу можно открывать повторно и обновлять. Если прошло более 3 часов, запросите новую ссылку в Telegram-боте.
                  </p>
                </div>

                <div className="bg-[#241E4F] p-4 rounded-2xl border border-indigo-700/40 space-y-2 text-xs">
                  <div className="font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#FF5252]" />
                    Как получить новую ссылку?
                  </div>
                  <p className="text-indigo-200/80 leading-relaxed">
                    1. Откройте Telegram-бота «Олимпиадные Практики».<br />
                    2. Нажмите кнопку <strong>📊 Статистика преподавателя</strong>.<br />
                    3. Выберите нужного преподавателя из списка.<br />
                    4. Перейдите по новой сгенерированной веб-ссылке.
                  </p>
                </div>
              </div>
            )}

            {/* Success Loaded Data State */}
            {statsData && !isLoadingStats && (
              <div className="space-y-6">
                
                {/* Notice Banner */}
                <div className="bg-gradient-to-r from-indigo-950/60 via-[#1B153B] to-[#241E4F] border border-indigo-500/40 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-300 shrink-0">
                      <GraduationCap className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/20 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                          Активная ссылка (3 часа)
                        </span>
                        <span className="text-xs text-indigo-200 font-semibold">
                          Доступно обновление страницы и повторный переход
                        </span>
                      </div>
                      <h2 className="text-xl font-extrabold text-white">
                        Веб-отчет: {statsData.teacher_name}
                      </h2>
                    </div>
                  </div>

                  <div className="text-right text-xs text-indigo-200/80 bg-[#14102C]/60 px-4 py-2.5 rounded-2xl border border-indigo-800/40 shrink-0">
                    <div>Срок действия: <strong className="text-emerald-400">3 часа</strong></div>
                    <div className="text-[10px] text-indigo-300/70 mt-0.5">Можно обновлять страницу</div>
                  </div>
                </div>

                {/* Summary Metric Cards */}
                {(() => {
                  const responses = statsData.responses || [];
                  const total = responses.length;
                  
                  // Расчет метрик качества
                  const scores = responses.map((r: any) => {
                    if (r.score_percent !== undefined && r.score_percent !== null) {
                      return Number(r.score_percent);
                    }
                    const penalty = Number(r.point ?? 0);
                    return Math.max(0, 100 - penalty * 2.5);
                  });
                  
                  const avgScore = scores.length > 0 ? (scores.reduce((a: number, b: number) => a + b, 0) / scores.length).toFixed(1) : "0";
                  const criticals = responses.filter((r: any) => r.critical).length;
                  const passCount = responses.filter((r: any) => !r.critical && (r.score_percent ? r.score_percent >= 70 : (r.point ?? 0) <= 25)).length;
                  const passPercent = total > 0 ? Math.round((passCount / total) * 100) : 0;

                  const filteredResponses = responses.filter((resp: any) => {
                    if (!statsSearch.trim()) return true;
                    const q = statsSearch.toLowerCase();
                    return (
                      (resp.link || '').toLowerCase().includes(q) ||
                      (resp.additional_info || '').toLowerCase().includes(q) ||
                      (resp.comment || '').toLowerCase().includes(q)
                    );
                  });

                  return (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-4 flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-[#FF5252]/15 border border-[#FF5252]/30 flex items-center justify-center text-[#FF5252] shrink-0 font-bold text-lg">
                            {total}
                          </div>
                          <div>
                            <div className="text-[11px] text-indigo-300 font-medium">Проверено лекций</div>
                            <div className="text-base font-bold text-white">{total} проведенных встреч</div>
                          </div>
                        </div>

                        <div className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-4 flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 font-bold text-lg">
                            {avgScore}%
                          </div>
                          <div>
                            <div className="text-[11px] text-indigo-300 font-medium">Индекс качества</div>
                            <div className="text-base font-bold text-white">{avgScore} / 100% соответствия</div>
                          </div>
                        </div>

                        <div className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-4 flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-xl border flex items-center justify-center shrink-0 font-bold text-lg ${
                            criticals > 0
                              ? 'bg-red-500/15 border-red-500/30 text-red-400'
                              : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                          }`}>
                            {criticals}
                          </div>
                          <div>
                            <div className="text-[11px] text-indigo-300 font-medium">Критических ошибок</div>
                            <div className="text-base font-bold text-white">{criticals} зафиксировано</div>
                          </div>
                        </div>

                        <div className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-4 flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-[#38BDF8]/15 border border-[#38BDF8]/30 flex items-center justify-center text-[#38BDF8] shrink-0 font-bold text-lg">
                            {passPercent}%
                          </div>
                          <div>
                            <div className="text-[11px] text-indigo-300 font-medium">Качество уроков</div>
                            <div className="text-base font-bold text-white">{passCount} из {total} сдали норматив</div>
                          </div>
                        </div>
                      </div>

                      {/* Filter / Search Bar */}
                      <div className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap">
                        <div className="relative flex-1 min-w-[240px]">
                          <Search className="w-4 h-4 text-indigo-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={statsSearch}
                            onChange={(e) => setStatsSearch(e.target.value)}
                            placeholder="Поиск по теме, ссылке или тексту замечания ИИ..."
                            className="w-full bg-[#14102C] border border-indigo-800/60 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-indigo-300/50 focus:outline-none focus:border-[#FF5252]"
                          />
                        </div>
                        <div className="text-xs text-indigo-300 font-medium">
                          Отображено встреч: <strong>{filteredResponses.length}</strong> из {total}
                        </div>
                      </div>

                      {/* List of Meeting Cards */}
                      {filteredResponses.length === 0 ? (
                        <div className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-8 text-center text-indigo-300 text-xs">
                          По вашему запросу не найдено ни одной встречи.
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {filteredResponses.map((resp: any, idx: number) => {
                            const penaltyPoint = resp.point ?? 0;
                            const scorePercent = resp.score_percent !== undefined && resp.score_percent !== null
                              ? Number(resp.score_percent)
                              : Math.max(0, 100 - penaltyPoint * 2.5);
                            const isCrit = Boolean(resp.critical);
                            
                            return (
                              <div
                                key={resp.id || idx}
                                className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-6 space-y-4 hover:border-indigo-600/60 transition-all shadow-lg"
                              >
                                {/* Card Header */}
                                <div className="flex items-start justify-between gap-4 flex-wrap border-b border-indigo-900/50 pb-4">
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-black text-white bg-[#2B2363] px-2.5 py-1 rounded-lg border border-indigo-700/40">
                                        Встреча #{filteredResponses.length - idx}
                                      </span>
                                      {resp.link && (
                                        <a
                                          href={resp.link}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-xs text-[#38BDF8] hover:underline flex items-center gap-1 font-medium bg-[#14102C] px-3 py-1 rounded-lg border border-indigo-900/60"
                                        >
                                          <Video className="w-3.5 h-3.5 text-[#38BDF8]" />
                                          <span>Ссылка на запись KTalk</span>
                                          <ExternalLink className="w-3 h-3" />
                                        </a>
                                      )}
                                    </div>
                                    {resp.additional_info && resp.additional_info !== '-' && (
                                      <div className="text-xs text-indigo-200/90 pt-1">
                                        💬 <strong>Дополнительная информация:</strong> {resp.additional_info}
                                      </div>
                                    )}
                                  </div>

                                  {/* Badges */}
                                  <div className="flex items-center gap-2">
                                    <div className={`px-4 py-2 rounded-xl border flex items-center gap-2 ${
                                      isCrit
                                        ? 'bg-red-500/15 border-red-500/30 text-red-400'
                                        : scorePercent >= 80
                                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                                        : scorePercent >= 60
                                        ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                                        : 'bg-red-500/15 border-red-500/30 text-red-400'
                                    }`}>
                                      <div className="flex flex-col items-end">
                                        <div className="flex items-baseline gap-1">
                                          <span className="text-lg font-black">{scorePercent}%</span>
                                          <span className="text-[10px] uppercase font-bold tracking-wider">качество</span>
                                        </div>
                                        <span className="text-[10px] text-indigo-300/80">штраф: {penaltyPoint} б</span>
                                      </div>
                                    </div>

                                    {isCrit && (
                                      <div className="bg-red-500/20 text-red-400 border border-red-500/40 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5">
                                        <AlertTriangle className="w-4 h-4" />
                                        <span>Критическое нарушение</span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* AI Review Content */}
                                <div className="bg-[#14102C] p-4 rounded-xl border border-indigo-900/60 text-xs text-indigo-100/90 leading-relaxed space-y-2 whitespace-pre-wrap font-sans">
                                  <div className="font-bold text-white flex items-center gap-2 text-xs border-b border-indigo-900/40 pb-2">
                                    <Sparkles className="w-3.5 h-3.5 text-[#FF5252]" />
                                    Рецензия ИИ (GigaChat-2-Pro)
                                  </div>
                                  <div>{resp.comment || "Комментарий отсутствует."}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

              </div>
            )}

          </div>
        )}

        {/* TAB 8: ADMIN RESPONSES LOG (ONE-TIME BURNING LINK) */}
        {activeTab === 'admin_responses' && (
          <div className="space-y-6 animate-fade-in">
            {/* Header Title */}
            <div className="bg-[#1B153B] border border-indigo-800/50 rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xl">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="bg-[#FF5252]/10 text-[#FF5252] border border-[#FF5252]/30 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5" />
                    Админ-панель
                  </span>
                  <span className="bg-indigo-950 text-indigo-300 border border-indigo-800/60 px-3 py-1 rounded-full text-xs font-semibold">
                    Таблица responses
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  Реестр запросов кураторов
                </h1>
                <p className="text-indigo-200/80 text-xs sm:text-sm max-w-2xl leading-relaxed">
                  Полный журнал обращений из базы данных: кто из кураторов, когда и по какому преподавателю отправлял запрос на проверку.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
                <div className="bg-[#14102C] px-4 py-3 rounded-2xl border border-indigo-800/50 text-center md:text-right">
                  <div className="text-[10px] text-indigo-300/70 uppercase font-bold tracking-wider">Безопасность</div>
                  <div className="text-xs text-emerald-400 font-bold flex items-center justify-center md:justify-end gap-1 mt-0.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Одноразовый токен
                  </div>
                </div>
              </div>
            </div>

            {/* Loading State */}
            {isLoadingAdmin && (
              <div className="bg-[#1B153B] border border-indigo-800/50 rounded-3xl p-12 text-center space-y-4 shadow-xl">
                <div className="w-12 h-12 border-4 border-[#38BDF8] border-t-transparent rounded-full animate-spin mx-auto"></div>
                <div className="text-white font-bold text-base">Проверка одноразовой ссылки администратора...</div>
                <p className="text-indigo-300/70 text-xs max-w-md mx-auto">
                  Связываемся с сервером для сжигания токена и загрузки лога из таблицы responses...
                </p>
              </div>
            )}

            {/* Error State */}
            {adminError && !isLoadingAdmin && (
              <div className="bg-[#1B153B] border border-red-500/40 rounded-3xl p-8 space-y-6 shadow-2xl">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 shrink-0">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-lg font-bold text-white">Ссылка недействительна или срок истек</h2>
                    <p className="text-red-200/90 text-xs leading-relaxed max-w-2xl">
                      {adminError}
                    </p>
                  </div>
                </div>

                <div className="bg-[#241E4F] p-4 rounded-2xl border border-indigo-700/40 space-y-2 text-xs">
                  <div className="font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#FF5252]" />
                    Как запросить новый реестр?
                  </div>
                  <p className="text-indigo-200/80 leading-relaxed">
                    1. Откройте Telegram-бота «Олимпиадные Практики».<br />
                    2. Нажмите кнопку <strong>📋 Запросы кураторов</strong> или отправьте команду <code>/responses</code>.<br />
                    3. Перейдите по новой сгенерированной веб-ссылке в чате.
                  </p>
                </div>
              </div>
            )}

            {/* Loaded Data State */}
            {adminResponsesData && !isLoadingAdmin && (
              <div className="space-y-6">
                
                {/* Notice Banner */}
                <div className="bg-gradient-to-r from-indigo-950/60 via-[#1B153B] to-[#241E4F] border border-indigo-500/40 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-300 shrink-0">
                      <Shield className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/20 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                          Активная админ-ссылка (3 часа)
                        </span>
                        <span className="text-xs text-indigo-200 font-semibold">
                          Данные загружены из таблицы responses
                        </span>
                      </div>
                      <h2 className="text-xl font-extrabold text-white">
                        Журнал обращений кураторов
                      </h2>
                    </div>
                  </div>

                  <div className="text-right text-xs text-indigo-200/80 bg-[#14102C]/60 px-4 py-2.5 rounded-2xl border border-indigo-800/40 shrink-0">
                    <div>Срок действия: <strong className="text-emerald-400">3 часа</strong></div>
                    <div className="text-[10px] text-indigo-300/70 mt-0.5">Доступно обновление страницы</div>
                  </div>
                </div>

                {/* KPI Metric Cards */}
                {(() => {
                  const items = adminResponsesData || [];
                  const totalCount = items.length;
                  const uniqueCurators = new Set(items.map(r => r.telegram_id)).size;
                  const uniqueTeachers = new Set(items.map(r => r.teacher).filter(Boolean)).size;
                  const checkedByAi = items.filter(r => r.point !== null && r.point >= 0).length;

                  const filteredItems = items.filter((resp: any) => {
                    if (!adminSearch.trim()) return true;
                    const q = adminSearch.toLowerCase();
                    return (
                      String(resp.id || '').toLowerCase().includes(q) ||
                      String(resp.telegram_id || '').toLowerCase().includes(q) ||
                      (resp.teacher || '').toLowerCase().includes(q) ||
                      (resp.link || '').toLowerCase().includes(q) ||
                      (resp.additional_info || '').toLowerCase().includes(q) ||
                      (resp.job_name || '').toLowerCase().includes(q)
                    );
                  });

                  return (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-4 flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-[#38BDF8]/15 border border-[#38BDF8]/30 flex items-center justify-center text-[#38BDF8] shrink-0 font-bold text-lg">
                            {totalCount}
                          </div>
                          <div>
                            <div className="text-[11px] text-indigo-300 font-medium">Всего запросов</div>
                            <div className="text-base font-bold text-white">{totalCount} записей в responses</div>
                          </div>
                        </div>

                        <div className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-4 flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0 font-bold text-lg">
                            {uniqueCurators}
                          </div>
                          <div>
                            <div className="text-[11px] text-indigo-300 font-medium">Активных кураторов</div>
                            <div className="text-base font-bold text-white">{uniqueCurators} уникальных Telegram ID</div>
                          </div>
                        </div>

                        <div className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-4 flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 font-bold text-lg">
                            {uniqueTeachers}
                          </div>
                          <div>
                            <div className="text-[11px] text-indigo-300 font-medium">Преподавателей</div>
                            <div className="text-base font-bold text-white">{uniqueTeachers} указано в запросах</div>
                          </div>
                        </div>

                        <div className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-4 flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-[#FF5252]/15 border border-[#FF5252]/30 flex items-center justify-center text-[#FF5252] shrink-0 font-bold text-lg">
                            {checkedByAi}
                          </div>
                          <div>
                            <div className="text-[11px] text-indigo-300 font-medium">Оценено ИИ</div>
                            <div className="text-base font-bold text-white">{checkedByAi} обработанных задач</div>
                          </div>
                        </div>
                      </div>

                      {/* Filter Search Bar */}
                      <div className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap">
                        <div className="relative flex-1 min-w-[240px]">
                          <Search className="w-4 h-4 text-indigo-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={adminSearch}
                            onChange={(e) => setAdminSearch(e.target.value)}
                            placeholder="Поиск по Telegram ID куратора, преподавателю, ссылке, доп. инфо..."
                            className="w-full bg-[#14102C] border border-indigo-800/60 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-indigo-300/50 focus:outline-none focus:border-[#FF5252]"
                          />
                        </div>
                        <div className="text-xs text-indigo-300 font-medium">
                          Отображено записей: <strong>{filteredItems.length}</strong> из {totalCount}
                        </div>
                      </div>

                      {/* Requests List */}
                      {filteredItems.length === 0 ? (
                        <div className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-8 text-center text-indigo-300 text-xs">
                          Запросы с соответствующими критериями фильтрации не найдены.
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {filteredItems.map((resp: any, idx: number) => {
                            const dateStr = resp.created_at
                              ? new Date(resp.created_at * 1000).toLocaleString('ru-RU', {
                                  year: 'numeric',
                                  month: '2-digit',
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit'
                                })
                              : 'Ранее (без метки)';

                            const point = resp.point;
                            const isCrit = Boolean(resp.critical);

                            return (
                              <div
                                key={resp.id || idx}
                                className="bg-[#1B153B] border border-indigo-800/50 rounded-2xl p-6 space-y-4 hover:border-indigo-600/60 transition-all shadow-lg"
                              >
                                {/* Card Header */}
                                <div className="flex items-start justify-between gap-4 flex-wrap border-b border-indigo-900/50 pb-4">
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs font-black text-white bg-[#2B2363] px-2.5 py-1 rounded-lg border border-indigo-700/40">
                                        Запрос #{resp.id}
                                      </span>
                                      <span className="text-xs font-semibold text-purple-300 bg-purple-950/80 px-2.5 py-1 rounded-lg border border-purple-800/60 flex items-center gap-1.5">
                                        <Users className="w-3 h-3 text-purple-400" />
                                        Куратор Telegram ID: {resp.telegram_id || 'Не указан'}
                                      </span>
                                      <span className="text-xs text-indigo-300 bg-[#14102C] px-2.5 py-1 rounded-lg border border-indigo-900/60 flex items-center gap-1.5">
                                        <Clock className="w-3 h-3 text-indigo-400" />
                                        {dateStr}
                                      </span>
                                    </div>

                                    <div className="text-xs text-white font-bold flex items-center gap-2 pt-1">
                                      <span>👤 Преподаватель:</span>
                                      <span className="text-[#38BDF8] bg-[#14102C] px-2.5 py-0.5 rounded-md border border-indigo-900/60 font-semibold">
                                        {resp.teacher || 'Не указан'}
                                      </span>
                                    </div>
                                  </div>

                                  {/* AI Score Badge if available */}
                                  {point !== undefined && point !== null && point >= 0 && (
                                    <div className="flex items-center gap-2">
                                      <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 ${
                                        isCrit
                                          ? 'bg-red-500/15 border-red-500/30 text-red-400'
                                          : point >= 80
                                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                                          : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                                      }`}>
                                        <span className="text-sm font-black">{point}</span>
                                        <span className="text-[10px] uppercase font-bold tracking-wider">/ 100 б</span>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Link & Additional Info */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                  {resp.link && (
                                    <a
                                      href={resp.link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[#38BDF8] hover:underline flex items-center gap-1.5 font-medium bg-[#14102C] px-3.5 py-2 rounded-xl border border-indigo-900/60 truncate"
                                    >
                                      <Video className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />
                                      <span className="truncate">{resp.link}</span>
                                      <ExternalLink className="w-3 h-3 shrink-0 ml-auto" />
                                    </a>
                                  )}
                                  {resp.additional_info && (
                                    <div className="bg-[#14102C] px-3.5 py-2 rounded-xl border border-indigo-900/60 text-indigo-200/90 truncate">
                                      💬 <strong>Доп. инфо:</strong> {resp.additional_info}
                                    </div>
                                  )}
                                </div>

                                {/* Optional Job Name / AI Comment */}
                                {resp.job_name && (
                                  <div className="text-[11px] text-indigo-300/70 font-mono bg-[#14102C]/60 px-3 py-1.5 rounded-lg border border-indigo-900/40 flex items-center justify-between gap-2">
                                    <span>Идентификатор задачи: {resp.job_name}</span>
                                    {resp.comment && (
                                      <span className="text-emerald-400 text-[10px] uppercase font-bold tracking-wider">Проверено ИИ</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

              </div>
            )}

          </div>
        )}

        {/* TAB 9: PROMPT EDITOR WITH 2FA TELEGRAM AUTH */}
        {activeTab === 'prompt_editor' && (
          <PromptEditor />
        )}

      </main>

      {/* Footer - Olympiad Practices style */}
      <footer className="border-t border-indigo-900/40 bg-[#1B153B]/60 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-indigo-300/70">
          <div className="flex items-center gap-2">
            <OlympLogo className="w-5 h-5" />
            <span className="font-bold text-white">Олимпиадные Практики</span>
            <span>•</span>
            <a
              href="https://olympiadpractices.ru/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#38BDF8] hover:underline flex items-center gap-1"
            >
              olympiadpractices.ru
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div>
            Lecture AI Analyzer Bot v2.0 • Powered by <strong>GigaChat API (Сбер)</strong>
          </div>
        </div>
      </footer>
    </div>
  );
}
