import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export type CuratorRole = 'curator' | 'senior_curator';

export interface CuratorRecord {
  id: string;
  email: string;
  fullName: string;
  role: CuratorRole;
  status: 'active' | 'blocked';
  addedBy: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface OTPRecord {
  email: string;
  code: string;
  expiresAt: number;
  attempts: number;
  purpose: 'login' | 'prompt_save';
  actionData?: any;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const CURATORS_FILE = path.join(DATA_DIR, 'curators.json');

// Начальный старший куратор (пользователь из окружения)
const INITIAL_SENIOR_CURATORS: Array<{ email: string; fullName: string }> = [
  { email: 'shurygin.egor2009@gmail.com', fullName: 'Егор Шурыгин (Главный администратор)' }
];

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadCurators(): CuratorRecord[] {
  ensureDataDir();
  if (!fs.existsSync(CURATORS_FILE)) {
    const initial: CuratorRecord[] = INITIAL_SENIOR_CURATORS.map((c, idx) => ({
      id: `cur_${idx + 1}`,
      email: c.email.toLowerCase().trim(),
      fullName: c.fullName,
      role: 'senior_curator',
      status: 'active',
      addedBy: 'Система (Стартовый администратор)',
      createdAt: new Date().toISOString(),
      lastLoginAt: null
    }));
    fs.writeFileSync(CURATORS_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }

  try {
    const raw = fs.readFileSync(CURATORS_FILE, 'utf-8');
    const list: CuratorRecord[] = JSON.parse(raw);
    
    // Гарантируем, что начальный старший куратор всегда присутствует в списке
    let modified = false;
    for (const init of INITIAL_SENIOR_CURATORS) {
      const exists = list.some(c => c.email.toLowerCase() === init.email.toLowerCase());
      if (!exists) {
        list.push({
          id: `cur_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          email: init.email.toLowerCase().trim(),
          fullName: init.fullName,
          role: 'senior_curator',
          status: 'active',
          addedBy: 'Система',
          createdAt: new Date().toISOString(),
          lastLoginAt: null
        });
        modified = true;
      }
    }
    if (modified) {
      saveCurators(list);
    }
    return list;
  } catch (err) {
    console.error('Ошибка чтения curators.json:', err);
    return [];
  }
}

export function saveCurators(list: CuratorRecord[]) {
  ensureDataDir();
  fs.writeFileSync(CURATORS_FILE, JSON.stringify(list, null, 2), 'utf-8');
}

export function findCuratorByEmail(email: string): CuratorRecord | undefined {
  const normalized = email.toLowerCase().trim();
  const list = loadCurators();
  return list.find(c => c.email.toLowerCase() === normalized);
}

export function addCurator(email: string, fullName: string, role: CuratorRole, addedBy: string): { success: boolean; message: string; curator?: CuratorRecord } {
  const normalized = email.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { success: false, message: 'Некорректный формат адреса электронной почты.' };
  }

  const list = loadCurators();
  const existing = list.find(c => c.email.toLowerCase() === normalized);
  if (existing) {
    return { success: false, message: `Куратор с email ${normalized} уже зарегистрирован в системе.` };
  }

  const newCurator: CuratorRecord = {
    id: `cur_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    email: normalized,
    fullName: fullName.trim() || normalized.split('@')[0],
    role: role || 'curator',
    status: 'active',
    addedBy,
    createdAt: new Date().toISOString(),
    lastLoginAt: null
  };

  list.push(newCurator);
  saveCurators(list);
  return { success: true, message: `Куратор ${normalized} успешно добавлен в систему.`, curator: newCurator };
}

export function updateCuratorRole(email: string, newRole: CuratorRole, updatedBy: string): { success: boolean; message: string } {
  const normalized = email.toLowerCase().trim();
  const list = loadCurators();
  const index = list.findIndex(c => c.email.toLowerCase() === normalized);

  if (index === -1) {
    return { success: false, message: 'Куратор не найден.' };
  }

  list[index].role = newRole;
  saveCurators(list);
  return {
    success: true,
    message: `Роль куратора ${normalized} успешно изменена на "${newRole === 'senior_curator' ? 'Старший куратор' : 'Обычный куратор'}".`
  };
}

export function toggleCuratorStatus(email: string, status: 'active' | 'blocked'): { success: boolean; message: string } {
  const normalized = email.toLowerCase().trim();
  const list = loadCurators();
  const index = list.findIndex(c => c.email.toLowerCase() === normalized);

  if (index === -1) {
    return { success: false, message: 'Куратор не найден.' };
  }

  list[index].status = status;
  saveCurators(list);
  return {
    success: true,
    message: `Статус куратора ${normalized} изменен на "${status === 'active' ? 'Активен' : 'Заблокирован'}".`
  };
}

// In-Memory Хранилище OTP-кодов
const otpStore = new Map<string, OTPRecord>();

export function generateOTP(email: string, purpose: 'login' | 'prompt_save' = 'login', actionData?: any): string {
  const normalized = email.toLowerCase().trim();
  // 6-значный криптографически стойкий код
  const code = crypto.randomInt(100000, 999999).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 минут

  otpStore.set(`${purpose}:${normalized}`, {
    email: normalized,
    code,
    expiresAt,
    attempts: 0,
    purpose,
    actionData
  });

  return code;
}

export function verifyOTP(email: string, inputCode: string, purpose: 'login' | 'prompt_save' = 'login'): { valid: boolean; message: string; actionData?: any } {
  const normalized = email.toLowerCase().trim();
  const key = `${purpose}:${normalized}`;
  const record = otpStore.get(key);

  if (!record) {
    return { valid: false, message: 'Код подтверждения не найден или истек. Запросите новый код.' };
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(key);
    return { valid: false, message: 'Срок действия кода истек (5 минут). Запросите новый код.' };
  }

  record.attempts++;
  if (record.attempts > 5) {
    otpStore.delete(key);
    return { valid: false, message: 'Превышено количество попыток ввода. Запросите код повторно.' };
  }

  if (record.code !== inputCode.trim()) {
    return { valid: false, message: 'Неверный код подтверждения. Проверьте цифры и попробуйте снова.' };
  }

  // Успешная валидация - удаляем использованный код
  const actionData = record.actionData;
  otpStore.delete(key);

  // Обновляем время последнего входа
  if (purpose === 'login') {
    const list = loadCurators();
    const cur = list.find(c => c.email.toLowerCase() === normalized);
    if (cur) {
      cur.lastLoginAt = new Date().toISOString();
      saveCurators(list);
    }
  }

  return { valid: true, message: 'Код успешно подтвержден.', actionData };
}
