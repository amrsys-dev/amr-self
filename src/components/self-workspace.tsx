import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  derivePasswordKeys,
  keysFromParams,
  unwrapDataKey,
  type KdfParams,
  type WrappedKey,
} from "@/lib/crypto.ts";
import { emptyUserData, type FinanceRecord, type HealthEntry, type TaskRecord, type UserData } from "@/lib/data/schema.ts";
import { loadUserData, saveLocalData } from "@/lib/data/sync.ts";
import type { Lang } from "@/lib/i18n.ts";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, expenseByCategory } from "@/lib/finance/categories.ts";
import { nextDue } from "@/lib/car/maintenance.ts";
import { categoryLabel, formatKm, tx } from "./self/extra-copy.ts";
import { CategoryIcon, CategoryPicker } from "./self/parts.tsx";
import { BillsCard, dueBillsTotal } from "./self/bills-card.tsx";
import { CarPage, carOf, itemName } from "./self/car-page.tsx";
import { groupByDay, monthFlow, shiftMonth, totalBalance } from "@/lib/finance/ledger.ts";
import { groupTasks } from "@/lib/tasks/groups.ts";
import { weekStreak, weekSummary } from "@/lib/health/week.ts";
import { CurrencySign, useCurrency } from "./self/currency.tsx";
import { parseAmount } from "@/lib/finance/currency.ts";
import "./self-workspace.css";
import { INSTALL_LABEL, installUrl } from "@/lib/pwa-install.ts";

type Section = "today" | "finance" | "work" | "more";
type SubPage = "health" | "car" | null;
type ModalKind = "income" | "expense" | "task" | "weight" | "meal" | "workout" | null;

type Props = {
  section: Section;
  accountId: string;
  wrapPassword?: WrappedKey;
  passwordKdf?: KdfParams;
  dataKey: Uint8Array | null;
  keyVersion: number;
  lang: Lang;
  onUnlock: (key: Uint8Array) => void;
  onOpenCard: () => void;
  /** Switch the bottom-bar section (e.g. Today -> Finance). */
  onNavigate?: (section: Section) => void;
  /** Guest mode: data lives only on this device, no account key or lock screen. */
  guestStore?: { load: () => Promise<UserData>; save: (data: UserData) => Promise<void> };
};

const COPY = {
  ru: {
    welcome: "Ваш день под контролем", overview: "Обзор дня", todayTasks: "Задачи на сегодня",
    health: "Здоровье", finance: "Финансы", work: "Планер", identity: "Цифровая визитка", more: "Сервисы",
    vault: "Сейф", nutrition: "Питание", activity: "Активность", income: "Доходы", expense: "Расходы",
    balance: "Баланс месяца", addIncome: "Добавить доход", addExpense: "Добавить расход",
    all: "Все", saved: "Сохранено на устройстве", syncing: "Ожидает синхронизации", loading: "Загрузка данных…",
    lockedTitle: "Разблокировать SELF", lockedText: "Введите пароль аккаунта, чтобы расшифровать личные данные на этом устройстве.",
    password: "Пароль аккаунта", unlock: "Разблокировать", unlockError: "Не удалось открыть данные. Проверьте пароль.",
    noData: "Пока нет записей", noTasks: "Задач нет",
    addTask: "Новая задача", taskTitle: "Название задачи", dueDate: "Срок", priority: "Приоритет",
    low: "Низкий", medium: "Обычный", high: "Высокий", open: "В работе", completed: "Выполнено",
    done: "Готово", pending: "Осталось", monthIncome: "Доход за месяц", monthExpense: "Расход за месяц",
    amount: "Сумма", category: "Категория", note: "Заметка", date: "Дата", title: "Название",
    save: "Сохранить", cancel: "Отмена", food: "Питание", transport: "Транспорт", housing: "Жильё",
    workTools: "Работа и инструменты", salary: "Зарплата", freelance: "Подработка", other: "Другое",
    add: "Добавить", today: "Сегодня", todayProgress: "Прогресс дня", water: "Вода", waterGoal: "Цель: 2 литра",
    addWater: "+ 250 мл", weight: "Вес", addWeight: "Записать вес", meal: "Приём пищи", addMeal: "Добавить приём пищи",
    calories: "Калории", workout: "Тренировка", addWorkout: "Записать тренировку", minutes: "Минуты",
    healthSnapshot: "Показатели здоровья", recent: "Последние записи", tasksDone: "Задач выполнено",
    viewAll: "Открыть", digitalCardText: "Покажите контакты и ссылки по одной публичной ссылке или QR-коду.",
    vaultSafeText: "Сейф пока закрыт. Сначала реализуем отдельное локальное шифрование, автоблокировку и проверку безопасности. Пароли в этой версии не сохраняются.",
    moduleReady: "Доступно", planned: "В подготовке", filterAll: "Все", noTransactions: "Записей нет",
    noMeals: "Записи о питании появятся здесь.", noActivity: "Добавьте вес, воду или тренировку.",
    delete: "Удалить", waterToday: "Выпито сегодня", priorityLabel: "Важность", errorSave: "Не удалось сохранить. Данные остались в текущем сеансе.",
    lastWeight: "Последний вес", thisMonth: "Текущий месяц", financeSnapshot: "Финансовая сводка",
  },
  en: {
    welcome: "Your day, in control", overview: "Daily overview", todayTasks: "Today's tasks",
    health: "Health", finance: "Finance", work: "Planner", identity: "Digital identity", more: "Services",
    vault: "Vault", nutrition: "Nutrition", activity: "Activity", income: "Income", expense: "Expenses",
    balance: "Monthly balance", addIncome: "Add income", addExpense: "Add expense",
    all: "All", saved: "Saved on this device", syncing: "Waiting to sync", loading: "Loading your data…",
    lockedTitle: "Unlock SELF", lockedText: "Enter your account password to decrypt your personal data on this device.",
    password: "Account password", unlock: "Unlock", unlockError: "Could not unlock data. Check your password.",
    noData: "No records yet", noTasks: "No tasks",
    addTask: "New task", taskTitle: "Task name", dueDate: "Due date", priority: "Priority",
    low: "Low", medium: "Normal", high: "High", open: "Open", completed: "Completed",
    done: "Done", pending: "Left", monthIncome: "Income this month", monthExpense: "Expenses this month",
    amount: "Amount", category: "Category", note: "Note", date: "Date", title: "Title",
    save: "Save", cancel: "Cancel", food: "Food", transport: "Transport", housing: "Housing",
    workTools: "Work & tools", salary: "Salary", freelance: "Freelance", other: "Other",
    add: "Add", today: "Today", todayProgress: "Daily progress", water: "Water", waterGoal: "Goal: 2 litres",
    addWater: "+ 250 ml", weight: "Weight", addWeight: "Log weight", meal: "Meal", addMeal: "Add meal",
    calories: "Calories", workout: "Workout", addWorkout: "Log workout", minutes: "Minutes",
    healthSnapshot: "Health snapshot", recent: "Recent entries", tasksDone: "Tasks completed",
    viewAll: "Open", digitalCardText: "Share your contacts and links through one public link or QR code.",
    vaultSafeText: "Vault is not enabled yet. Local-only encryption, auto-lock, and a security review must be completed first. No passwords are stored in this version.",
    moduleReady: "Available", planned: "Planned", filterAll: "All", noTransactions: "No records",
    noMeals: "Nutrition entries will appear here.", noActivity: "Add weight, water, or a workout.",
    delete: "Delete", waterToday: "Water today", priorityLabel: "Priority", errorSave: "Could not save. Data remains in this session.",
    lastWeight: "Latest weight", thisMonth: "Current month", financeSnapshot: "Financial snapshot",
  },
  ar: {
    welcome: "يومك تحت السيطرة", overview: "ملخص اليوم", todayTasks: "مهام اليوم",
    health: "الصحة", finance: "المالية", work: "المخطط", identity: "الهوية الرقمية", more: "الخدمات",
    vault: "الخزنة", nutrition: "التغذية", activity: "النشاط", income: "الدخل", expense: "المصروفات",
    balance: "رصيد الشهر", addIncome: "إضافة دخل", addExpense: "إضافة مصروف",
    all: "الكل", saved: "حُفظ على هذا الجهاز", syncing: "بانتظار المزامنة", loading: "جارٍ تحميل البيانات…",
    lockedTitle: "فتح SELF", lockedText: "أدخل كلمة مرور حسابك لفك تشفير بياناتك الشخصية على هذا الجهاز.",
    password: "كلمة مرور الحساب", unlock: "فتح", unlockError: "تعذر فتح البيانات. تحقق من كلمة المرور.",
    noData: "لا توجد سجلات بعد", noTasks: "لا مهام",
    addTask: "مهمة جديدة", taskTitle: "اسم المهمة", dueDate: "تاريخ الاستحقاق", priority: "الأولوية",
    low: "منخفض", medium: "عادي", high: "مرتفع", open: "مفتوحة", completed: "مكتملة",
    done: "منجز", pending: "متبقٍ", monthIncome: "دخل هذا الشهر", monthExpense: "مصروف هذا الشهر",
    amount: "المبلغ", category: "الفئة", note: "ملاحظة", date: "التاريخ", title: "العنوان",
    save: "حفظ", cancel: "إلغاء", food: "الطعام", transport: "النقل", housing: "السكن",
    workTools: "العمل والأدوات", salary: "الراتب", freelance: "عمل حر", other: "أخرى",
    add: "إضافة", today: "اليوم", todayProgress: "تقدم اليوم", water: "الماء", waterGoal: "الهدف: لتران",
    addWater: "+ ٢٥٠ مل", weight: "الوزن", addWeight: "تسجيل الوزن", meal: "وجبة", addMeal: "إضافة وجبة",
    calories: "السعرات", workout: "تمرين", addWorkout: "تسجيل تمرين", minutes: "دقائق",
    healthSnapshot: "ملخص الصحة", recent: "أحدث السجلات", tasksDone: "المهام المكتملة",
    viewAll: "فتح", digitalCardText: "شارك جهات الاتصال والروابط عبر رابط عام أو رمز QR.",
    vaultSafeText: "الخزنة غير مفعلة بعد. يجب أولاً تنفيذ تشفير محلي وقفل تلقائي ومراجعة أمنية. لا تُحفظ كلمات مرور في هذه النسخة.",
    moduleReady: "متاح", planned: "قيد التخطيط", filterAll: "الكل", noTransactions: "لا سجلات",
    noMeals: "ستظهر سجلات التغذية هنا.", noActivity: "أضف الوزن أو الماء أو تمريناً.",
    delete: "حذف", waterToday: "الماء اليوم", priorityLabel: "الأهمية", errorSave: "تعذر الحفظ. تبقى البيانات في الجلسة الحالية.",
    lastWeight: "آخر وزن", thisMonth: "الشهر الحالي", financeSnapshot: "الملخص المالي",
  },
  uz: {
    welcome: "Kuningiz nazorat ostida", overview: "Kunlik umumiy holat", todayTasks: "Bugungi vazifalar",
    health: "Salomatlik", finance: "Moliya", work: "Reja", identity: "Raqamli shaxsiyat", more: "Xizmatlar",
    vault: "Seyf", nutrition: "Ovqatlanish", activity: "Faollik", income: "Daromad", expense: "Xarajatlar",
    balance: "Oylik balans", addIncome: "Daromad qo‘shish", addExpense: "Xarajat qo‘shish",
    all: "Barchasi", saved: "Qurilmada saqlandi", syncing: "Sinxronlash kutilmoqda", loading: "Ma’lumotlar yuklanmoqda…",
    lockedTitle: "SELF qulfini ochish", lockedText: "Shaxsiy ma’lumotlarni ochish uchun hisob parolingizni kiriting.",
    password: "Hisob paroli", unlock: "Ochish", unlockError: "Ma’lumotlarni ochib bo‘lmadi. Parolni tekshiring.",
    noData: "Hozircha yozuvlar yo‘q", noTasks: "Vazifa yo‘q",
    addTask: "Yangi vazifa", taskTitle: "Vazifa nomi", dueDate: "Muddat", priority: "Ustuvorlik",
    low: "Past", medium: "Oddiy", high: "Yuqori", open: "Ochiq", completed: "Bajarildi",
    done: "Bajarildi", pending: "Qoldi", monthIncome: "Oylik daromad", monthExpense: "Oylik xarajat",
    amount: "Miqdor", category: "Toifa", note: "Izoh", date: "Sana", title: "Nomi",
    save: "Saqlash", cancel: "Bekor qilish", food: "Oziq-ovqat", transport: "Transport", housing: "Uy-joy",
    workTools: "Ish va asboblar", salary: "Maosh", freelance: "Qo‘shimcha ish", other: "Boshqa",
    add: "Qo‘shish", today: "Bugun", todayProgress: "Kunlik rivojlanish", water: "Suv", waterGoal: "Maqsad: 2 litr",
    addWater: "+ 250 ml", weight: "Vazn", addWeight: "Vaznni yozish", meal: "Ovqat", addMeal: "Ovqat qo‘shish",
    calories: "Kaloriya", workout: "Mashg‘ulot", addWorkout: "Mashg‘ulotni yozish", minutes: "Daqiqa",
    healthSnapshot: "Salomatlik ko‘rsatkichi", recent: "So‘nggi yozuvlar", tasksDone: "Bajarilgan vazifalar",
    viewAll: "Ochish", digitalCardText: "Kontakt va havolalarni bitta ochiq havola yoki QR orqali ulashing.",
    vaultSafeText: "Seyf hali yoqilmagan. Avval alohida lokal shifrlash, avtomatik qulflash va xavfsizlik tekshiruvi kerak. Bu versiyada parollar saqlanmaydi.",
    moduleReady: "Mavjud", planned: "Rejada", filterAll: "Barchasi", noTransactions: "Yozuv yo‘q",
    noMeals: "Ovqatlanish yozuvlari shu yerda ko‘rinadi.", noActivity: "Vazn, suv yoki mashg‘ulot qo‘shing.",
    delete: "O‘chirish", waterToday: "Bugun ichilgan suv", priorityLabel: "Muhimlik", errorSave: "Saqlab bo‘lmadi. Ma’lumotlar joriy seansda qoladi.",
    lastWeight: "So‘nggi vazn", thisMonth: "Joriy oy", financeSnapshot: "Moliyaviy holat",
  },
  tj: {
    welcome: "Рӯзи шумо зери назорат", overview: "Хулосаи рӯз", todayTasks: "Вазифаҳои имрӯз",
    health: "Саломатӣ", finance: "Молия", work: "Нақша", identity: "Шиносномаи рақамӣ", more: "Хидматҳо",
    vault: "Сейф", nutrition: "Ғизо", activity: "Фаъолият", income: "Даромад", expense: "Хароҷот",
    balance: "Тавозуни моҳ", addIncome: "Иловаи даромад", addExpense: "Иловаи хароҷот",
    all: "Ҳама", saved: "Дар дастгоҳ нигоҳ дошта шуд", syncing: "Интизори ҳамоҳангсозӣ", loading: "Маълумот бор мешавад…",
    lockedTitle: "Кушодани SELF", lockedText: "Барои рамзкушоии маълумоти шахсӣ пароли ҳисобро ворид кунед.",
    password: "Пароли ҳисоб", unlock: "Кушодан", unlockError: "Маълумот кушода нашуд. Паролро санҷед.",
    noData: "Ҳоло сабт нест", noTasks: "Вазифа нест",
    addTask: "Вазифаи нав", taskTitle: "Номи вазифа", dueDate: "Муҳлат", priority: "Афзалият",
    low: "Паст", medium: "Оддӣ", high: "Баланд", open: "Кушода", completed: "Иҷро шуд",
    done: "Иҷро шуд", pending: "Боқӣ монд", monthIncome: "Даромади моҳ", monthExpense: "Хароҷоти моҳ",
    amount: "Маблағ", category: "Категория", note: "Эзоҳ", date: "Сана", title: "Ном",
    save: "Нигоҳ доштан", cancel: "Бекор кардан", food: "Ғизо", transport: "Нақлиёт", housing: "Манзил",
    workTools: "Кор ва асбобҳо", salary: "Маош", freelance: "Кори иловагӣ", other: "Дигар",
    add: "Илова кардан", today: "Имрӯз", todayProgress: "Пешрафти рӯз", water: "Об", waterGoal: "Ҳадаф: 2 литр",
    addWater: "+ 250 мл", weight: "Вазн", addWeight: "Сабти вазн", meal: "Хӯрок", addMeal: "Иловаи хӯрок",
    calories: "Калория", workout: "Тамрин", addWorkout: "Сабти тамрин", minutes: "Дақиқа",
    healthSnapshot: "Нишондиҳандаҳои саломатӣ", recent: "Сабтҳои охирин", tasksDone: "Вазифаҳои иҷрошуда",
    viewAll: "Кушодан", digitalCardText: "Тамосҳо ва пайвандҳоро бо як пайванди оммавӣ ё QR мубодила кунед.",
    vaultSafeText: "Сейф ҳоло фаъол нест. Аввал рамзгузории маҳаллӣ, қулфи худкор ва санҷиши амният лозим аст. Дар ин версия паролҳо нигоҳ дошта намешаванд.",
    moduleReady: "Дастрас", planned: "Дар нақша", filterAll: "Ҳама", noTransactions: "Сабт нест",
    noMeals: "Сабтҳои ғизо дар ин ҷо пайдо мешаванд.", noActivity: "Вазн, об ё тамринро илова кунед.",
    delete: "Нест кардан", waterToday: "Оби имрӯз", priorityLabel: "Муҳимият", errorSave: "Нигоҳ доштан муяссар нашуд. Маълумот дар ҷаласаи ҷорӣ мемонад.",
    lastWeight: "Вазни охирин", thisMonth: "Моҳи ҷорӣ", financeSnapshot: "Хулосаи молиявӣ",
  },
} as const;

type CopyKey = keyof typeof COPY.en;
const todayKey = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};
const makeId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const active = <T extends { deleted?: boolean }>(rows: T[]) => rows.filter((r) => !r.deleted);
const amountOf = (r: FinanceRecord) => Number.isFinite(r.amount) ? Number(r.amount) : 0;
type FinanceBlockId = "recent" | "bills" | "categories";
type FinanceBlock = { id: FinanceBlockId; on: boolean };
const DEFAULT_BLOCKS: FinanceBlock[] = [{ id: "recent", on: true }, { id: "bills", on: true }, { id: "categories", on: true }];
const BLOCK_LABEL = { recent: "blockRecent", bills: "bills", categories: "byCategory" } as const;
const BLOCKS_KEY = "self.finance.blocks";
/** Order and visibility of Finance sections, chosen by the user on this device. */
function loadBlocks(): FinanceBlock[] {
  try {
    const raw = JSON.parse(localStorage.getItem(BLOCKS_KEY) ?? "null") as FinanceBlock[] | null;
    if (Array.isArray(raw)) {
      const known = raw.filter((b) => DEFAULT_BLOCKS.some((d) => d.id === b.id));
      for (const d of DEFAULT_BLOCKS) if (!known.some((b) => b.id === d.id)) known.push(d);
      return known;
    }
  } catch { /* storage unavailable */ }
  return DEFAULT_BLOCKS;
}
function saveBlocks(b: FinanceBlock[]) {
  try {
    localStorage.setItem(BLOCKS_KEY, JSON.stringify(b));
  } catch { /* ignore */ }
}
function moveBlock(list: FinanceBlock[], i: number, d: number): FinanceBlock[] {
  const next = list.slice();
  const [x] = next.splice(i, 1);
  next.splice(i + d, 0, x!);
  return next;
}
const localDate = (s?: string) => s ? new Date(s + "T12:00:00").toLocaleDateString() : "";

export function SelfWorkspace({
  section, accountId, wrapPassword, passwordKdf, dataKey, keyVersion, lang, onUnlock, onOpenCard, guestStore, onNavigate,
}: Props) {
  const t = (key: CopyKey) => COPY[lang][key] ?? COPY.en[key];
  const { cur, toCur, money } = useCurrency();
  const [blocks, setBlocks] = useState<FinanceBlock[]>(DEFAULT_BLOCKS);
  useEffect(() => setBlocks(loadBlocks()), []);
  const [data, setData] = useState<UserData>(emptyUserData);
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(!dataKey && !guestStore);
  const [loadError, setLoadError] = useState(false);
  const [password, setPassword] = useState("");
  const [unlockError, setUnlockError] = useState(false);
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [subPage, setSubPage] = useState<SubPage>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [showDone, setShowDone] = useState(false);
  const [customize, setCustomize] = useState(false);
  function updateBlocks(next: FinanceBlock[]) {
    setBlocks(next);
    saveBlocks(next);
  }
  const [financeMonth, setFinanceMonth] = useState(() => todayKey().slice(0, 7));
  const [transactionFilter, setTransactionFilter] = useState<"all" | "income" | "expense">("all");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("other");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayKey());
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");

  useEffect(() => {
    if (!dataKey && !guestStore) {
      setLocked(true);
      return;
    }
    let alive = true;
    setLoading(true);
    setLocked(false);
    setLoadError(false);
    void (guestStore ? guestStore.load() : loadUserData(dataKey!, accountId))
      .then((next) => { if (alive) setData(next); })
      .catch(() => { if (alive) setLoadError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [accountId, dataKey, keyVersion, guestStore]);

  // A sub-page belongs to the tab it was opened from.
  useEffect(() => { setSubPage(null); }, [section]);

  const health = data.health ?? emptyUserData().health!;
  // Amounts in the chosen currency; stored records keep their own currency.
  const finIn = useMemo(() => data.finance.income.map((r) => ({ ...r, amount: toCur(amountOf(r), r.currency) })), [data.finance.income, toCur]);
  const finEx = useMemo(() => data.finance.expense.map((r) => ({ ...r, amount: toCur(amountOf(r), r.currency) })), [data.finance.expense, toCur]);
  const today = todayKey();
  const month = today.slice(0, 7);
  const todayTasks = active(data.work.tasks).filter((r) => !r.completed && (!r.dueDate || r.dueDate <= today));
  const doneTasks = active(data.work.tasks).filter((r) => r.completed);
  const waterToday = active(health.water).filter((r) => r.date === today).reduce((n, r) => n + Number(r.amount ?? 0), 0);
  const lastWeight = active(health.weight).slice().sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0];
  const entries = useMemo(() => [
    ...active(finIn).map((r) => ({ ...r, kind: "income" as const })),
    ...active(finEx).map((r) => ({ ...r, kind: "expense" as const })),
  ].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || b.updatedAt.localeCompare(a.updatedAt)), [finIn, finEx]);
  const taskGroups = groupTasks(data.work.tasks, today);
  const locale = lang === "ru" ? "ru-RU" : lang === "ar" ? "ar-SA" : lang === "uz" ? "uz-UZ" : lang === "tj" ? "tg-TJ" : "en-US";
  // One balance that carries over month to month, plus money in / out per month.
  const balanceAll = totalBalance(finIn, finEx);
  const flowNow = monthFlow(finIn, finEx, month);
  const flowSel = monthFlow(finIn, finEx, financeMonth);
  const monthName = (m: string) => new Date(m + "-15T12:00:00").toLocaleDateString(locale, { month: "long", year: "numeric" });
  const dayGroups = groupByDay(entries.filter((e) => (e.date ?? "").startsWith(financeMonth) && (transactionFilter === "all" || e.kind === transactionFilter)));
  const yesterday = (() => { const d = new Date(today + "T12:00:00"); d.setDate(d.getDate() - 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); })();
  const dayLabel = (d: string) => d === today ? tx(lang, "todayLbl") : d === yesterday ? tx(lang, "yesterday") : new Date(d + "T12:00:00").toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "long" });
  const week = weekSummary(health.workouts, today);
  const streak = weekStreak(health.workouts, today);

  async function persist(next: UserData) {
    setData(next);
    setSaveError(false);
    try {
      if (guestStore) await guestStore.save(next);
      else if (dataKey) await saveLocalData(dataKey, accountId, next);
    }
    catch { setSaveError(true); }
  }

  async function unlock() {
    if (!wrapPassword || !passwordKdf || password.length < 1) return;
    setUnlockBusy(true);
    setUnlockError(false);
    try {
      const { salt, opts } = keysFromParams(passwordKdf);
      const derived = await derivePasswordKeys(password, salt, opts);
      const key = await unwrapDataKey(wrapPassword, derived.wrapKey);
      setPassword("");
      onUnlock(key);
    } catch {
      setUnlockError(true);
    } finally {
      setUnlockBusy(false);
    }
  }

  function openModal(kind: ModalKind) {
    setTitle("");
    setAmount("");
    setCategory(kind === "income" ? "salary" : "food");
    setNote("");
    setDate(today);
    setPriority("medium");
    setModal(kind);
  }

  async function saveModal() {
    const now = new Date().toISOString();
    const recordId = makeId();
    if (modal === "income" || modal === "expense") {
      const value = parseAmount(amount);
      if (!title.trim() || !Number.isFinite(value) || value <= 0) return;
      const record: FinanceRecord = { id: recordId, updatedAt: now, title: title.trim(), amount: value, currency: cur, category, date, note: note.trim() || undefined };
      const field = modal === "income" ? "income" : "expense";
      const next = { ...data, finance: { ...data.finance, [field]: [...data.finance[field], record] } };
      await persist(next);
    } else if (modal === "task") {
      if (!title.trim()) return;
      const record: TaskRecord = { id: recordId, updatedAt: now, title: title.trim(), dueDate: date, priority, completed: false };
      await persist({ ...data, work: { ...data.work, tasks: [...data.work.tasks, record] } });
    } else if (modal === "weight" || modal === "meal" || modal === "workout") {
      const value = Number(amount.replace(",", "."));
      if (!Number.isFinite(value) || value <= 0) return;
      const kind = modal;
      const record: HealthEntry = {
        id: recordId, updatedAt: now, kind, title: title.trim() || (kind === "weight" ? t("weight") : kind === "meal" ? t("meal") : t("workout")),
        date, amount: value, unit: kind === "weight" ? "kg" : kind === "meal" ? "kcal" : "min", calories: kind === "meal" ? value : undefined, note: note.trim() || undefined,
      };
      const field = kind === "weight" ? "weight" : kind === "meal" ? "nutrition" : "workouts";
      await persist({ ...data, health: { ...health, [field]: [...health[field], record] } });
    }
    setModal(null);
  }

  async function addWater() {
    const record: HealthEntry = { id: makeId(), updatedAt: new Date().toISOString(), kind: "water", title: "Water", date: today, amount: 250, unit: "ml" };
    await persist({ ...data, health: { ...health, water: [...health.water, record] } });
  }

  async function toggleTask(task: TaskRecord) {
    const nextTask = { ...task, completed: !task.completed, updatedAt: new Date().toISOString() };
    await persist({ ...data, work: { ...data.work, tasks: data.work.tasks.map((r) => r.id === task.id ? nextTask : r) } });
  }

  async function removeEntry(entry: FinanceRecord & { kind: "income" | "expense" }) {
    const field = entry.kind;
    const now = new Date().toISOString();
    await persist({ ...data, finance: { ...data.finance, [field]: data.finance[field].map((r) => (r.id === entry.id ? { ...r, deleted: true, updatedAt: now } : r)) } });
  }

  async function removeTask(task: TaskRecord) {
    const nextTask = { ...task, deleted: true, updatedAt: new Date().toISOString() };
    await persist({ ...data, work: { ...data.work, tasks: data.work.tasks.map((r) => r.id === task.id ? nextTask : r) } });
  }

  if (locked || (!dataKey && !guestStore)) {
    return (
      <div className="self-lock">
        <img className="self-lock-mark" src="/self-mark.png" alt="" />
        <div className="self-eyebrow">SELF</div>
        <h2>{t("lockedTitle")}</h2>
        <p>{t("lockedText")}</p>
        <div className="self-field">
          <label>{t("password")}</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" onKeyDown={(e) => { if (e.key === "Enter") void unlock(); }} />
        </div>
        {unlockError ? <div className="self-error">{t("unlockError")}</div> : null}
        {!wrapPassword || !passwordKdf ? <div className="self-error">Session key metadata is unavailable. Sign in again to unlock your data.</div> : null}
        <button className="self-primary" type="button" disabled={unlockBusy || !wrapPassword || !passwordKdf} onClick={() => void unlock()}>{unlockBusy ? t("loading") : t("unlock")}</button>
      </div>
    );
  }

  if (loading) return <div className="self-loading">{t("loading")}</div>;
  if (loadError) return <div className="self-lock"><h2>{t("noData")}</h2><p>Could not read local or synchronized data. Your encrypted records have not been deleted.</p></div>;

  const bills = dueBillsTotal(data, toCur);
  const carInfo = carOf(data);
  const carNext = carInfo.vehicle ? nextDue(carInfo.items, carInfo.vehicle.odometer) : null;
  const categories = expenseByCategory(finEx, financeMonth);
  const topCategory = categories[0]?.amount ?? 0;
  const progress = active(data.work.tasks).length ? Math.round(doneTasks.length / active(data.work.tasks).length * 100) : 0;
  const hour = new Date().getHours();
  const greeting = tx(lang, hour < 12 ? "goodMorning" : hour < 18 ? "goodAfternoon" : "goodEvening");
  const dateLine = new Date().toLocaleDateString(lang === "ru" ? "ru-RU" : lang === "ar" ? "ar-SA" : lang === "uz" ? "uz-UZ" : lang === "tj" ? "tg-TJ" : "en-US", { weekday: "long", day: "numeric", month: "long" });
  const modules: { key: "car" | "health" | "identity"; title: string; subtitle: string; icon: string }[] = [
    { key: "car", title: tx(lang, "car"), subtitle: tx(lang, "carSubtitle"), icon: "car" },
    { key: "health", title: t("health"), subtitle: tx(lang, "healthSub"), icon: "health" },
    { key: "identity", title: t("identity"), subtitle: tx(lang, "cardSub"), icon: "id" },
  ];
  const backLabel = section === "today" ? t("today") : t("more");
  const healthRows = [...active(health.weight), ...active(health.workouts), ...active(health.water), ...active(health.nutrition)]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 10);

  return (
    <div className="self-workspace" dir={lang === "ar" ? "rtl" : "ltr"}>
      {section === "today" && !subPage && (
        <>
          <header className="self-large">
            <p>{dateLine}</p>
            <h1>{greeting}</h1>
          </header>

          <div className="self-card self-balance self-hero">
            <span>{tx(lang, "balanceTotal")}</span>
            <strong>{money(balanceAll)}</strong>
            <FlowSplit flow={flowNow} money={money} labelIn={tx(lang, "moneyIn")} labelOut={tx(lang, "moneyOut")} />
            <div className="self-finance-actions"><button type="button" onClick={() => openModal("income")}>+ {t("income")}</button><button type="button" onClick={() => openModal("expense")}>− {t("expense")}</button></div>
          </div>

          <div className="self-grid self-grid-2">
            <button type="button" className="self-metric self-tile" onClick={() => onNavigate?.("work")}>
              <span><CategoryIcon c="freelance" size={16} />{t("tasksDone")}</span>
              <strong>{doneTasks.length}<i> / {active(data.work.tasks).length}</i></strong>
              <div className="self-progress"><i style={{ width: progress + "%" }} /></div>
            </button>
            <button type="button" className="self-metric self-tile" onClick={() => onNavigate?.("finance")}>
              <span><CategoryIcon c="housing" size={16} />{tx(lang, "billsDue")}</span>
              <strong>{bills.count ? money(bills.amount) : "—"}</strong>
              <small>{bills.count ? tx(lang, "toPay", { n: bills.count }) : tx(lang, "allPaid")}</small>
            </button>
            <button type="button" className="self-metric self-tile" onClick={() => setSubPage("car")}>
              <span><CategoryIcon c="car" size={16} />{tx(lang, "car")}</span>
              <strong>{carNext ? formatKm(Math.max(0, carNext.state.leftKm)) : "—"}<i> {carNext ? tx(lang, "km") : ""}</i></strong>
              <small>{carNext ? itemName(lang, carNext.item) : tx(lang, "addCar")}</small>
            </button>
            <button type="button" className="self-metric self-tile" onClick={() => setSubPage("health")}>
              <span><CategoryIcon c="water" size={16} />{t("waterToday")}</span>
              <strong>{waterToday}<i> ml</i></strong>
              <div className="self-progress"><i style={{ width: Math.min(100, waterToday / 2000 * 100) + "%" }} /></div>
            </button>
          </div>

          <div className="self-section-head"><h3>{t("todayTasks")}</h3><button onClick={() => openModal("task")} type="button">+ {t("add")}</button></div>
          <div className="self-card">
            {todayTasks.length === 0 ? <div className="self-empty">{t("noTasks")}</div> : todayTasks.slice(0, 5).map((task) => <TaskRow key={task.id} task={task} today={today} onToggle={() => void toggleTask(task)} onDelete={() => void removeTask(task)} t={t} />)}
          </div>
        </>
      )}

      {section === "finance" && !subPage && (
        <>
          <header className="self-large"><h1>{t("finance")}</h1></header>
          <div className="self-month">
            <button type="button" aria-label={tx(lang, "prevMonth")} onClick={() => setFinanceMonth(shiftMonth(financeMonth, -1))}>‹</button>
            <b>{monthName(financeMonth)}</b>
            <button type="button" aria-label={tx(lang, "nextMonth")} onClick={() => setFinanceMonth(shiftMonth(financeMonth, 1))} disabled={financeMonth >= month}>›</button>
          </div>
          <div className="self-card self-balance self-hero">
            <span>{tx(lang, "balanceTotal")}</span>
            <strong>{money(balanceAll)}</strong>
            <FlowSplit flow={flowSel} money={money} labelIn={tx(lang, "moneyIn")} labelOut={tx(lang, "moneyOut")} />
            <div className="self-finance-actions"><button type="button" onClick={() => openModal("income")}>+ {t("income")}</button><button type="button" onClick={() => openModal("expense")}>− {t("expense")}</button></div>
          </div>
          {blocks.filter((b) => b.on).map((b) => (
            <div key={b.id} className="self-block">
              {b.id === "recent" && (
                <>
          <div className="self-section-head"><h3>{t("recent")}</h3></div>
          <div className="self-filter"><button className={transactionFilter === "all" ? "on" : ""} type="button" onClick={() => setTransactionFilter("all")}>{t("filterAll")}</button><button className={transactionFilter === "income" ? "on" : ""} type="button" onClick={() => setTransactionFilter("income")}>{t("income")}</button><button className={transactionFilter === "expense" ? "on" : ""} type="button" onClick={() => setTransactionFilter("expense")}>{t("expense")}</button></div>
          {dayGroups.length === 0 ? <div className="self-card"><div className="self-empty">{t("noTransactions")}</div></div> : dayGroups.map((g) => (
            <section key={g.date} className="self-day">
              <div className="self-day-head"><span>{dayLabel(g.date)}</span><span className={g.net >= 0 ? "income" : "expense"}>{money(g.net, true)}</span></div>
              <div className="self-card">
                {g.entries.map((entry) => <div className="self-list-row" key={entry.id}><div className={"self-list-mark " + entry.kind}><CategoryIcon c={entry.category} /></div><div className="self-list-copy"><b>{entry.title || categoryLabel(lang, entry.category)}</b><small>{categoryLabel(lang, entry.category)}</small></div><strong className={entry.kind}>{money(entry.kind === "income" ? amountOf(entry) : -amountOf(entry), true)}</strong><button className="self-delete" type="button" onClick={() => void removeEntry(entry)} aria-label={t("delete")}>×</button></div>)}
              </div>
            </section>
          ))}
                </>
              )}
              {b.id === "bills" && (
                <>
          <BillsCard data={data} persist={persist} lang={lang} money={(n, from) => money(toCur(n, from))} cur={cur} amountLabel={<span className="self-label-row">{t("amount")}, <CurrencySign cur={cur} /></span>} labels={{ save: t("save"), cancel: t("cancel"), amount: t("amount"), delete: t("delete") }} />
                </>
              )}
              {b.id === "categories" && (
                <>
          {categories.length > 0 && (
            <>
              <div className="self-section-head"><h3>{tx(lang, "byCategory")}</h3></div>
              <div className="self-card self-catbars">
                {categories.map((c) => (
                  <div className="self-catbar" key={c.category}>
                    <span className="self-catbar-icon"><CategoryIcon c={c.category} size={18} /></span>
                    <div className="self-catbar-body">
                      <div className="self-catbar-top"><b>{categoryLabel(lang, c.category)}</b><strong>{money(c.amount)}</strong></div>
                      <div className="self-progress"><i style={{ width: Math.max(4, Math.round((c.amount / topCategory) * 100)) + "%" }} /></div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
                </>
              )}
            </div>
          ))}
          <button type="button" className="self-customize" onClick={() => setCustomize(true)}>{tx(lang, "customize")}</button>
          {customize && (
            <div className="self-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setCustomize(false); }}>
              <div className="self-modal" role="dialog" aria-modal="true">
                <div className="self-modal-head"><h3>{tx(lang, "customize")}</h3><button type="button" onClick={() => setCustomize(false)} aria-label={t("cancel")}>×</button></div>
                <div className="self-card set-list self-blocks-edit">
                  {blocks.map((b, i) => (
                    <div className="set-row" key={b.id}>
                      <span className="set-label">{tx(lang, BLOCK_LABEL[b.id])}</span>
                      <button type="button" className="self-move" disabled={i === 0} onClick={() => updateBlocks(moveBlock(blocks, i, -1))} aria-label="↑">↑</button>
                      <button type="button" className="self-move" disabled={i === blocks.length - 1} onClick={() => updateBlocks(moveBlock(blocks, i, 1))} aria-label="↓">↓</button>
                      <button type="button" className={`toggle ${b.on ? "on" : ""}`} aria-pressed={b.on} onClick={() => updateBlocks(blocks.map((x) => (x.id === b.id ? { ...x, on: !x.on } : x)))}><i /></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {section === "work" && !subPage && (
        <>
          <header className="self-large"><h1>{t("work")}</h1></header>
          <div className="self-card self-balance self-hero">
            <span>{t("tasksDone")}</span>
            <strong>{doneTasks.length} / {active(data.work.tasks).length}</strong>
            <div className="self-progress"><i style={{ width: progress + "%" }} /></div>
            <div className="self-finance-actions"><button type="button" onClick={() => openModal("task")}>+ {t("addTask")}</button></div>
          </div>
          {active(data.work.tasks).length === 0 && <div className="self-card"><div className="self-empty">{t("noTasks")}</div></div>}
          {([
            ["overdue", tx(lang, "overdue"), taskGroups.overdue],
            ["today", tx(lang, "todayLbl"), taskGroups.today],
            ["upcoming", tx(lang, "upcoming"), taskGroups.upcoming],
            ["someday", tx(lang, "noDate"), taskGroups.someday],
          ] as const).map(([key, label, list]) => list.length === 0 ? null : (
            <section key={key} className={"self-day " + key}>
              <div className="self-day-head"><span>{label}</span><span>{list.length}</span></div>
              <div className="self-card">{list.map((task) => <TaskRow key={task.id} task={task} today={today} onToggle={() => void toggleTask(task)} onDelete={() => void removeTask(task)} t={t} />)}</div>
            </section>
          ))}
          {taskGroups.done.length > 0 && (
            <section className="self-day">
              <button type="button" className="self-day-head self-toggle" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}><span>{tx(lang, "showDone", { n: taskGroups.done.length })}</span><span aria-hidden="true">{showDone ? "⌃" : "⌄"}</span></button>
              {showDone && <div className="self-card">{taskGroups.done.map((task) => <TaskRow key={task.id} task={task} today={today} onToggle={() => void toggleTask(task)} onDelete={() => void removeTask(task)} t={t} />)}</div>}
            </section>
          )}
        </>
      )}

      {section === "more" && !subPage && (
        <>
          <header className="self-large"><h1>{t("more")}</h1></header>
          <div className="self-section-head"><h3>{SVC_GROUPS[lang]?.[0] ?? SVC_GROUPS.en[0]}</h3></div>
          <div className="self-card self-menu">
            {modules.map((m) => (
              <button key={m.key} type="button" className="self-menu-row" onClick={() => (m.key === "identity" ? onOpenCard() : setSubPage(m.key))}>
                <span className={`self-menu-icon ${m.key}`}><CategoryIcon c={m.icon} size={20} /></span>
                <span className="self-menu-copy"><b>{m.title}</b><small>{m.subtitle}</small></span>
                <span className="self-chevron" aria-hidden="true">›</span>
              </button>
            ))}
          </div>
          <div className="self-section-head"><h3>{SVC_GROUPS[lang]?.[1] ?? SVC_GROUPS.en[1]}</h3></div>
          <div className="self-card self-menu">
            <div className="self-menu-row">
              <span className="self-menu-icon bazar" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9h16l-1.2 10.2a2 2 0 0 1-2 1.8H7.2a2 2 0 0 1-2-1.8z" /><path d="M8.5 9V7a3.5 3.5 0 0 1 7 0v2" /></svg>
              </span>
              <span className="self-menu-copy"><b>AMR Bazar</b><small>{BAZAR_SUB[lang] ?? BAZAR_SUB.en}</small></span>
              <span className="self-menu-acts">
                <a className="btn g" href="https://bazar.amrsys.net/" target="_blank" rel="noopener">{OPEN_LABEL[lang] ?? OPEN_LABEL.en}</a>
                <a className="btn p" href={installUrl("https://bazar.amrsys.net/")} target="_blank" rel="noopener">{INSTALL_LABEL[lang] ?? INSTALL_LABEL.en}</a>
              </span>
            </div>
          </div>
        </>
      )}

      {subPage === "health" && (
        <>
          <button className="self-back" type="button" onClick={() => setSubPage(null)}>‹ {backLabel}</button>
          <header className="self-large"><h1>{t("health")}</h1></header>
          <div className="self-card self-week">
            <div className="self-week-head"><b>{tx(lang, "thisWeek")}</b><span>{tx(lang, "weekLine", { n: week.count, m: week.minutes })}</span></div>
            <div className="self-week-days">
              {week.days.map((d) => (
                <div key={d.date} className={"self-week-day" + (d.trained ? " on" : "") + (d.date === today ? " now" : "")}>
                  <i>{new Date(d.date + "T12:00:00").toLocaleDateString(locale, { weekday: "narrow" })}</i>
                  <span>{new Date(d.date + "T12:00:00").getDate()}</span>
                </div>
              ))}
            </div>
            {streak > 0 && <small className="self-streak">{tx(lang, "streak", { n: streak })}</small>}
          </div>
          <div className="self-grid self-grid-2"><div className="self-metric"><span>{t("waterToday")}</span><strong>{waterToday}<i> ml</i></strong><div className="self-progress"><i style={{ width: Math.min(100, waterToday / 2000 * 100) + "%" }} /></div></div><div className="self-metric"><span>{t("lastWeight")}</span><strong>{lastWeight ? Number(lastWeight.amount).toFixed(1) : "—"}<i> kg</i></strong></div></div>
          <div className="self-finance-actions"><button type="button" onClick={() => void addWater()}>{t("addWater")}</button><button type="button" onClick={() => openModal("weight")}>{t("addWeight")}</button><button type="button" onClick={() => openModal("workout")}>{t("addWorkout")}</button><button type="button" onClick={() => openModal("meal")}>{t("addMeal")}</button></div>
          <div className="self-section-head"><h3>{t("recent")}</h3></div>
          <div className="self-card">
            {healthRows.length === 0 ? <div className="self-empty">{t("noActivity")}</div> : healthRows.map((r) => (
              <div className="self-list-row" key={r.id}>
                <div className="self-list-mark"><CategoryIcon c={r.kind === "water" ? "water" : r.kind === "workout" ? "sport" : r.kind === "meal" ? "food" : "health"} /></div>
                <div className="self-list-copy"><b>{r.title}</b><small>{localDate(r.date)}</small></div>
                <strong>{r.kind === "meal" ? (r.calories ?? r.amount) + " kcal" : `${r.amount} ${r.unit}`}</strong>
              </div>
            ))}
          </div>
        </>
      )}

      {subPage === "car" && (
        <CarPage data={data} persist={persist} lang={lang} money={(n, from) => money(toCur(n, from))} toCur={toCur} cur={cur} labels={{ save: t("save"), cancel: t("cancel"), delete: t("delete"), back: backLabel }} onBack={() => setSubPage(null)} />
      )}

      {modal && (
        <div className="self-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setModal(null); }}>
          <section className="self-modal" role="dialog" aria-modal="true">
            <div className="self-modal-head"><h3>{modal === "task" ? t("addTask") : modal === "income" ? t("addIncome") : modal === "expense" ? t("addExpense") : modal === "weight" ? t("addWeight") : modal === "meal" ? t("addMeal") : t("addWorkout")}</h3><button type="button" onClick={() => setModal(null)}>×</button></div>
            {(modal === "income" || modal === "expense" || modal === "task" || modal === "meal" || modal === "workout") && <label>{modal === "task" ? t("taskTitle") : modal === "meal" || modal === "workout" ? t("title") : t("title")}<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("title")} /></label>}
            {modal !== "task" && <label>{modal === "weight" ? t("weight") + " (kg)" : modal === "meal" ? t("calories") + " (kcal)" : modal === "workout" ? t("minutes") : <span className="self-label-row">{t("amount")}, <CurrencySign cur={cur} /></span>}<input type="text" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /></label>}
            {(modal === "income" || modal === "expense") && <CategoryPicker options={modal === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES} value={category} onChange={setCategory} lang={lang} label={t("category")} />}
            {modal === "task" && <label>{t("priority")}<select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}><option value="low">{t("low")}</option><option value="medium">{t("medium")}</option><option value="high">{t("high")}</option></select></label>}
            <label>{modal === "task" ? t("dueDate") : t("date")}<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            {(modal === "income" || modal === "expense" || modal === "meal") && <label>{t("note")}<textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>}
            <div className="self-modal-actions"><button type="button" className="self-secondary" onClick={() => setModal(null)}>{t("cancel")}</button><button type="button" className="self-primary" onClick={() => void saveModal()}>{t("save")}</button></div>
          </section>
        </div>
      )}
      {saveError ? <div className="self-error">{t("errorSave")}</div> : null}
    </div>
  );
}

function TaskRow({ task, today, onToggle, onDelete, t }: {
  task: TaskRecord; today: string; onToggle: () => void; onDelete: () => void; t: (key: CopyKey) => string;
}) {
  const overdue = !task.completed && !!task.dueDate && task.dueDate < today;
  const prio = task.priority ?? "medium";
  return (
    <div className={"self-task-row " + (task.completed ? "is-done" : "") + (overdue ? " is-overdue" : "")}>
      <button className={"self-check prio-" + prio} type="button" onClick={onToggle} aria-label={task.completed ? t("open") : t("done")}>{task.completed ? "✓" : ""}</button>
      <div className="self-task-copy"><b>{task.title}</b><small>{task.dueDate ? <span className="self-due">{localDate(task.dueDate)}</span> : null}{prio !== "medium" ? <span className={"self-prio " + prio}>{t(prio)}</span> : null}</small></div>
      <button className="self-delete" type="button" onClick={onDelete} aria-label={t("delete")}>×</button>
    </div>
  );
}

/** Money in (green, up) and out (red, down) for a month, under the balance. */
function FlowSplit({ flow, money, labelIn, labelOut }: { flow: { in: number; out: number }; money: (n: number, plus?: boolean) => ReactNode; labelIn: string; labelOut: string }) {
  return (
    <div className="self-finance-split self-flow">
      <div><small><span className="self-arrow up" aria-hidden="true">↑</span>{labelIn}</small><b>{money(flow.in, true)}</b></div>
      <div><small><span className="self-arrow down" aria-hidden="true">↓</span>{labelOut}</small><b>{money(-flow.out)}</b></div>
    </div>
  );
}

/** Вкладка «Сервисы»: встроенные разделы SELF и подключённые модули AMR (брендбук §8). */
const SVC_GROUPS: Record<string, [string, string]> = {
  ru: ["Разделы SELF", "Подключённые модули"],
  en: ["SELF sections", "Connected modules"],
  ar: ["أقسام SELF", "الوحدات المتصلة"],
  uz: ["SELF bo‘limlari", "Ulangan modullar"],
  tj: ["Бахшҳои SELF", "Модулҳои пайвастшуда"],
};
const OPEN_LABEL: Record<string, string> = {
  ru: "Открыть",
  en: "Open",
  ar: "فتح",
  uz: "Ochish",
  tj: "Кушодан",
};
const BAZAR_SUB: Record<string, string> = {
  ru: "Мини-маркетплейс: товары продавцов вашего города",
  en: "Mini marketplace: goods from sellers in your city",
  ar: "سوق صغير: منتجات البائعين في مدينتك",
  uz: "Mini-bozor: shahringiz sotuvchilarining mahsulotlari",
  tj: "Мини-бозор: молҳои фурӯшандагони шаҳри шумо",
};
