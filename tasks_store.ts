import fs from 'fs';
import path from 'path';

export interface CriterionResult {
  id: number;
  text: string;
  category: string;
  passed: boolean;
  score: number; // 0..5
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
  totalScore: number; // 0..100
  criticalViolations: string[];
  positiveHighlights: string[];
  recommendations: string[];
  criteria: CriterionResult[];
  status: 'pending' | 'downloading' | 'extracting' | 'analyzing' | 'completed' | 'failed';
  progressPct: number;
  curatorEmail: string;
  createdAt: string;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const TASKS_FILE = path.join(DATA_DIR, 'lecture_tasks.json');

const INITIAL_TEACHERS: string[] = [];

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

export function generateSampleCriteria(seed: number, isHigh: boolean): CriterionResult[] {
  return STANDARD_CRITERIA_LIST.map((c, i) => {
    const passed = isHigh ? (i !== 4 && i !== 7) : (i % 3 !== 0);
    const score = passed ? (isHigh ? 5 : 4) : 2;
    return {
      id: c.id,
      text: c.text,
      category: c.category,
      passed,
      score,
      timecodes: passed ? [] : [`00:${12 + (i * 3)}:20`],
      comment: passed ? 'Критерий соблюден полностью.' : 'Зафиксировано небольшое отклонение по таймингу или вовлечению аудитории.',
      quote: passed ? undefined : '«Так, давайте быстренько перейдем к следующей задаче, потому что времени в обрез...»'
    };
  });
}

const SEED_TASKS: LectureCheck[] = [];

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadTasks(): LectureCheck[] {
  ensureDataDir();
  if (!fs.existsSync(TASKS_FILE)) {
    fs.writeFileSync(TASKS_FILE, JSON.stringify(SEED_TASKS, null, 2), 'utf-8');
    return SEED_TASKS;
  }
  try {
    const raw = fs.readFileSync(TASKS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Ошибка чтения lecture_tasks.json:', err);
    return SEED_TASKS;
  }
}

export function saveTasks(tasks: LectureCheck[]) {
  ensureDataDir();
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
}

export function getTeachersList(): string[] {
  const tasks = loadTasks();
  const teachers = new Set<string>(INITIAL_TEACHERS);
  tasks.forEach(t => {
    if (t.teacherName) teachers.add(t.teacherName);
  });
  return Array.from(teachers);
}

export function createTask(
  lectureUrl: string,
  teacherName: string,
  subject: string,
  groupName: string,
  curatorEmail: string
): LectureCheck {
  const tasks = loadTasks();
  const id = `lec_${Date.now()}`;
  
  const newTask: LectureCheck = {
    id,
    lectureUrl: lectureUrl.trim(),
    teacherName: teacherName.trim(),
    subject: subject.trim() || 'Олимпиадная подготовка',
    groupName: groupName.trim() || 'Основная группа',
    date: new Date().toISOString().replace('T', ' ').slice(0, 16),
    totalScore: 0,
    criticalViolations: [],
    positiveHighlights: [],
    recommendations: [],
    criteria: STANDARD_CRITERIA_LIST.map(c => ({
      id: c.id,
      text: c.text,
      category: c.category,
      passed: true,
      score: 5
    })),
    status: 'downloading',
    progressPct: 15,
    curatorEmail,
    createdAt: new Date().toISOString()
  };

  tasks.unshift(newTask);
  saveTasks(tasks);

  // Симулируем реалистичное продвижение этапов анализа (КТалк -> ffmpeg -> GigaChat)
  simulateTaskProgress(id);

  return newTask;
}

function simulateTaskProgress(taskId: string) {
  const steps = [
    { delay: 3000, status: 'downloading' as const, pct: 35 },
    { delay: 7000, status: 'extracting' as const, pct: 65 },
    { delay: 12000, status: 'analyzing' as const, pct: 85 },
    { delay: 18000, status: 'completed' as const, pct: 100 }
  ];

  steps.forEach(step => {
    setTimeout(() => {
      const tasks = loadTasks();
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      task.status = step.status;
      task.progressPct = step.pct;

      if (step.status === 'completed') {
        const score = Math.floor(84 + Math.random() * 14); // 84..97
        task.totalScore = score;
        task.positiveHighlights = [
          "Высокий темп занятия и отличное владение математическим аппаратом.",
          "Грамотная раскадровка и читаемые формулы на доске.",
          "Активное взаимодействие с аудиторией в чате."
        ];
        task.recommendations = [
          "Рекомендуется в начале занятия четче артикулировать план урока на первые 45 минут."
        ];
        task.criteria = generateSampleCriteria(Date.now(), score >= 90);
      }

      saveTasks(tasks);
    }, step.delay);
  });
}
