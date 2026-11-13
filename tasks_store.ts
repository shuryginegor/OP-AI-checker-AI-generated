export interface CriterionResult {
  id: number;
  text: string;
  category: string;
  passed: boolean;
  notApplicable?: boolean;
  score: number | null; // 1..5 or null when N/A
  penaltyScore?: number | null; // 0, 1, 2 or null
  timecodes?: string[];
  comment?: string;
  quote?: string;
}

export interface LectureCheck {
  id: string;
  lectureUrl: string;
  teacherName: string;
  subject: string;
  groupName: string;
  date: string;
  totalScore: number | null; // 0..100 or null when pending/failed
  criticalViolations: string[];
  positiveHighlights: string[];
  recommendations: string[];
  criteria: CriterionResult[];
  status: 'pending' | 'downloading' | 'extracting' | 'uploading' | 'analyzing' | 'completed' | 'failed';
  progressPct: number;
  curatorEmail: string;
  createdAt: string;
  errorMessage?: string | null;
  applicableCount?: number | null;
  earnedPoints?: number | null;
  maxPoints?: number | null;
}

export const STANDARD_CRITERIA_LIST = [
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
