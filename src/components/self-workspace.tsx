import { useEffect, useMemo, useState } from "react";
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
import "./self-workspace.css";

type Section = "today" | "finance" | "work" | "more";
type SubPage = "health" | "nutrition" | "activity" | "vault" | null;
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
};

const COPY = {
  ru: {
    welcome: "Ваш день под контролем", overview: "Обзор дня", todayTasks: "Задачи на сегодня",
    health: "Здоровье", finance: "Финансы", work: "Работа", identity: "Цифровая визитка",
    vault: "Сейф", nutrition: "Питание", activity: "Активность", income: "Доходы", expense: "Расходы",
    balance: "Баланс месяца", addIncome: "Добавить доход", addExpense: "Добавить расход",
    all: "Все", saved: "Сохранено на устройстве", syncing: "Ожидает синхронизации", loading: "Загрузка данных…",
    lockedTitle: "Разблокировать SELF", lockedText: "Введите пароль аккаунта, чтобы расшифровать личные данные на этом устройстве.",
    password: "Пароль аккаунта", unlock: "Разблокировать", unlockError: "Не удалось открыть данные. Проверьте пароль.",
    noData: "Пока нет записей", noTasks: "Добавьте первую задачу, чтобы спланировать день.",
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
    moduleReady: "Доступно", planned: "В подготовке", filterAll: "Все", noTransactions: "Добавьте первую операцию.",
    noMeals: "Записи о питании появятся здесь.", noActivity: "Добавьте вес, воду или тренировку.",
    delete: "Удалить", waterToday: "Выпито сегодня", priorityLabel: "Важность", errorSave: "Не удалось сохранить. Данные остались в текущем сеансе.",
    lastWeight: "Последний вес", thisMonth: "Текущий месяц", financeSnapshot: "Финансовая сводка",
  },
  en: {
    welcome: "Your day, in control", overview: "Daily overview", todayTasks: "Today's tasks",
    health: "Health", finance: "Finance", work: "Work", identity: "Digital identity",
    vault: "Vault", nutrition: "Nutrition", activity: "Activity", income: "Income", expense: "Expenses",
    balance: "Monthly balance", addIncome: "Add income", addExpense: "Add expense",
    all: "All", saved: "Saved on this device", syncing: "Waiting to sync", loading: "Loading your data…",
    lockedTitle: "Unlock SELF", lockedText: "Enter your account password to decrypt your personal data on this device.",
    password: "Account password", unlock: "Unlock", unlockError: "Could not unlock data. Check your password.",
    noData: "No records yet", noTasks: "Add your first task to plan the day.",
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
    moduleReady: "Available", planned: "Planned", filterAll: "All", noTransactions: "Add your first transaction.",
    noMeals: "Nutrition entries will appear here.", noActivity: "Add weight, water, or a workout.",
    delete: "Delete", waterToday: "Water today", priorityLabel: "Priority", errorSave: "Could not save. Data remains in this session.",
    lastWeight: "Latest weight", thisMonth: "Current month", financeSnapshot: "Financial snapshot",
  },
  ar: {
    welcome: "يومك تحت السيطرة", overview: "ملخص اليوم", todayTasks: "مهام اليوم",
    health: "الصحة", finance: "المالية", work: "العمل", identity: "الهوية الرقمية",
    vault: "الخزنة", nutrition: "التغذية", activity: "النشاط", income: "الدخل", expense: "المصروفات",
    balance: "رصيد الشهر", addIncome: "إضافة دخل", addExpense: "إضافة مصروف",
    all: "الكل", saved: "حُفظ على هذا الجهاز", syncing: "بانتظار المزامنة", loading: "جارٍ تحميل البيانات…",
    lockedTitle: "فتح SELF", lockedText: "أدخل كلمة مرور حسابك لفك تشفير بياناتك الشخصية على هذا الجهاز.",
    password: "كلمة مرور الحساب", unlock: "فتح", unlockError: "تعذر فتح البيانات. تحقق من كلمة المرور.",
    noData: "لا توجد سجلات بعد", noTasks: "أضف مهمتك الأولى لتنظيم يومك.",
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
    moduleReady: "متاح", planned: "قيد التخطيط", filterAll: "الكل", noTransactions: "أضف معاملتك الأولى.",
    noMeals: "ستظهر سجلات التغذية هنا.", noActivity: "أضف الوزن أو الماء أو تمريناً.",
    delete: "حذف", waterToday: "الماء اليوم", priorityLabel: "الأهمية", errorSave: "تعذر الحفظ. تبقى البيانات في الجلسة الحالية.",
    lastWeight: "آخر وزن", thisMonth: "الشهر الحالي", financeSnapshot: "الملخص المالي",
  },
  uz: {
    welcome: "Kuningiz nazorat ostida", overview: "Kunlik umumiy holat", todayTasks: "Bugungi vazifalar",
    health: "Salomatlik", finance: "Moliya", work: "Ish", identity: "Raqamli shaxsiyat",
    vault: "Seyf", nutrition: "Ovqatlanish", activity: "Faollik", income: "Daromad", expense: "Xarajatlar",
    balance: "Oylik balans", addIncome: "Daromad qo‘shish", addExpense: "Xarajat qo‘shish",
    all: "Barchasi", saved: "Qurilmada saqlandi", syncing: "Sinxronlash kutilmoqda", loading: "Ma’lumotlar yuklanmoqda…",
    lockedTitle: "SELF qulfini ochish", lockedText: "Shaxsiy ma’lumotlarni ochish uchun hisob parolingizni kiriting.",
    password: "Hisob paroli", unlock: "Ochish", unlockError: "Ma’lumotlarni ochib bo‘lmadi. Parolni tekshiring.",
    noData: "Hozircha yozuvlar yo‘q", noTasks: "Kunni rejalash uchun birinchi vazifani qo‘shing.",
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
    moduleReady: "Mavjud", planned: "Rejada", filterAll: "Barchasi", noTransactions: "Birinchi operatsiyani qo‘shing.",
    noMeals: "Ovqatlanish yozuvlari shu yerda ko‘rinadi.", noActivity: "Vazn, suv yoki mashg‘ulot qo‘shing.",
    delete: "O‘chirish", waterToday: "Bugun ichilgan suv", priorityLabel: "Muhimlik", errorSave: "Saqlab bo‘lmadi. Ma’lumotlar joriy seansda qoladi.",
    lastWeight: "So‘nggi vazn", thisMonth: "Joriy oy", financeSnapshot: "Moliyaviy holat",
  },
  tj: {
    welcome: "Рӯзи шумо зери назорат", overview: "Хулосаи рӯз", todayTasks: "Вазифаҳои имрӯз",
    health: "Саломатӣ", finance: "Молия", work: "Кор", identity: "Шиносномаи рақамӣ",
    vault: "Сейф", nutrition: "Ғизо", activity: "Фаъолият", income: "Даромад", expense: "Хароҷот",
    balance: "Тавозуни моҳ", addIncome: "Иловаи даромад", addExpense: "Иловаи хароҷот",
    all: "Ҳама", saved: "Дар дастгоҳ нигоҳ дошта шуд", syncing: "Интизори ҳамоҳангсозӣ", loading: "Маълумот бор мешавад…",
    lockedTitle: "Кушодани SELF", lockedText: "Барои рамзкушоии маълумоти шахсӣ пароли ҳисобро ворид кунед.",
    password: "Пароли ҳисоб", unlock: "Кушодан", unlockError: "Маълумот кушода нашуд. Паролро санҷед.",
    noData: "Ҳоло сабт нест", noTasks: "Барои банақшагирии рӯз вазифаи аввалро илова кунед.",
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
    moduleReady: "Дастрас", planned: "Дар нақша", filterAll: "Ҳама", noTransactions: "Аввалин амалиётро илова кунед.",
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
const sum = (rows: FinanceRecord[]) => active(rows).reduce((n, r) => n + amountOf(r), 0);
const money = (n: number) => new Intl.NumberFormat("en-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 2 }).format(n);
const localDate = (s?: string) => s ? new Date(s + "T12:00:00").toLocaleDateString() : "";

export function SelfWorkspace({
  section, accountId, wrapPassword, passwordKdf, dataKey, keyVersion, lang, onUnlock, onOpenCard,
}: Props) {
  const t = (key: CopyKey) => COPY[lang][key] ?? COPY.en[key];
  const [data, setData] = useState<UserData>(emptyUserData);
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(!dataKey);
  const [loadError, setLoadError] = useState(false);
  const [password, setPassword] = useState("");
  const [unlockError, setUnlockError] = useState(false);
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [subPage, setSubPage] = useState<SubPage>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [filter, setFilter] = useState<"all" | "open" | "completed">("all");
  const [transactionFilter, setTransactionFilter] = useState<"all" | "income" | "expense">("all");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("other");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayKey());
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");

  useEffect(() => {
    if (!dataKey) {
      setLocked(true);
      return;
    }
    let alive = true;
    setLoading(true);
    setLocked(false);
    setLoadError(false);
    void loadUserData(dataKey, accountId)
      .then((next) => { if (alive) setData(next); })
      .catch(() => { if (alive) setLoadError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [accountId, dataKey, keyVersion]);

  const health = data.health ?? emptyUserData().health!;
  const today = todayKey();
  const month = today.slice(0, 7);
  const monthIncome = useMemo(() => sum(data.finance.income.filter((r) => (r.date ?? "").startsWith(month))), [data.finance.income, month]);
  const monthExpense = useMemo(() => sum(data.finance.expense.filter((r) => (r.date ?? "").startsWith(month))), [data.finance.expense, month]);
  const todayTasks = active(data.work.tasks).filter((r) => !r.completed && (!r.dueDate || r.dueDate <= today));
  const doneTasks = active(data.work.tasks).filter((r) => r.completed);
  const waterToday = active(health.water).filter((r) => r.date === today).reduce((n, r) => n + Number(r.amount ?? 0), 0);
  const lastWeight = active(health.weight).slice().sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0];
  const entries = useMemo(() => [
    ...active(data.finance.income).map((r) => ({ ...r, kind: "income" as const })),
    ...active(data.finance.expense).map((r) => ({ ...r, kind: "expense" as const })),
  ].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || b.updatedAt.localeCompare(a.updatedAt)), [data.finance.income, data.finance.expense]);
  const visibleEntries = entries.filter((r) => transactionFilter === "all" || r.kind === transactionFilter);
  const tasks = active(data.work.tasks).filter((r) => filter === "all" || (filter === "completed" ? r.completed : !r.completed))
    .sort((a, b) => Number(Boolean(a.completed)) - Number(Boolean(b.completed)) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? ""));

  async function persist(next: UserData) {
    setData(next);
    setSaveError(false);
    if (!dataKey) return;
    try { await saveLocalData(dataKey, accountId, next); }
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
    setCategory("other");
    setNote("");
    setDate(today);
    setPriority("medium");
    setModal(kind);
  }

  async function saveModal() {
    const now = new Date().toISOString();
    const recordId = makeId();
    if (modal === "income" || modal === "expense") {
      const value = Number(amount.replace(",", "."));
      if (!title.trim() || !Number.isFinite(value) || value <= 0) return;
      const record: FinanceRecord = { id: recordId, updatedAt: now, title: title.trim(), amount: value, currency: "SAR", category, date, note: note.trim() || undefined };
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

  async function removeTask(task: TaskRecord) {
    const nextTask = { ...task, deleted: true, updatedAt: new Date().toISOString() };
    await persist({ ...data, work: { ...data.work, tasks: data.work.tasks.map((r) => r.id === task.id ? nextTask : r) } });
  }

  if (locked || !dataKey) {
    return (
      <div className="self-lock">
        <div className="self-lock-mark">S</div>
        <div className="self-eyebrow">SELF · PERSONAL SPACE</div>
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

  const progress = active(data.work.tasks).length ? Math.round(doneTasks.length / active(data.work.tasks).length * 100) : 0;
  const quickModules: { key: Exclude<SubPage, null> | "identity"; title: string; subtitle: string; mark: string; status: string }[] = [
    { key: "health", title: t("health"), subtitle: t("healthSnapshot"), mark: "＋", status: t("moduleReady") },
    { key: "nutrition", title: t("nutrition"), subtitle: t("calories") + " · " + t("water"), mark: "◌", status: t("moduleReady") },
    { key: "activity", title: t("activity"), subtitle: t("workout") + " · " + t("weight"), mark: "↗", status: t("moduleReady") },
    { key: "identity", title: t("identity"), subtitle: t("digitalCardText"), mark: "ID", status: t("moduleReady") },
    { key: "vault", title: t("vault"), subtitle: t("vaultSafeText"), mark: "▣", status: t("planned") },
  ];

  return (
    <div className="self-workspace" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="self-status"><span className="self-status-dot" />{t("saved")}</div>

      {section === "today" && !subPage && (
        <>
          <div className="self-intro"><div><div className="self-eyebrow">SELF · PERSONAL SPACE</div><h1>{t("welcome")}</h1><p>{new Date().toLocaleDateString(lang === "ru" ? "ru-RU" : lang === "ar" ? "ar-SA" : lang === "uz" ? "uz-UZ" : lang === "tj" ? "tg-TJ" : "en-US", { weekday: "long", day: "numeric", month: "long" })}</p></div><div className="self-day-mark">S</div></div>
          <div className="self-section-head"><h3>{t("overview")}</h3><span>{t("today")}</span></div>
          <div className="self-grid self-grid-2">
            <div className="self-metric"><span>{t("monthIncome")}</span><strong>{money(monthIncome)}</strong><small>{t("finance")}</small></div>
            <div className="self-metric"><span>{t("monthExpense")}</span><strong>{money(monthExpense)}</strong><small>{t("expense")}</small></div>
            <div className="self-metric"><span>{t("tasksDone")}</span><strong>{doneTasks.length}<i> / {active(data.work.tasks).length}</i></strong><small>{progress}% {t("done")}</small><div className="self-progress"><i style={{ width: progress + "%" }} /></div></div>
            <div className="self-metric"><span>{t("waterToday")}</span><strong>{waterToday}<i> ml</i></strong><small>{t("waterGoal")}</small><div className="self-progress"><i style={{ width: Math.min(100, waterToday / 2000 * 100) + "%" }} /></div></div>
          </div>
          <div className="self-section-head"><h3>{t("todayTasks")}</h3><button onClick={() => { openModal("task"); }} type="button">+ {t("add")}</button></div>
          <div className="self-card">
            {todayTasks.length === 0 ? <div className="self-empty">{t("noTasks")}</div> : todayTasks.slice(0, 4).map((task) => <TaskRow key={task.id} task={task} onToggle={() => void toggleTask(task)} onDelete={() => void removeTask(task)} t={t} />)}
          </div>
          <div className="self-section-head"><h3>{t("financeSnapshot")}</h3><button type="button" onClick={() => openModal("income")}>+ {t("add")}</button></div>
          <div className="self-card self-balance"><div><span>{t("balance")}</span><strong>{money(monthIncome - monthExpense)}</strong></div><div className="self-finance-actions"><button type="button" onClick={() => openModal("income")}>+ {t("income")}</button><button type="button" onClick={() => openModal("expense")}>− {t("expense")}</button></div></div>
          <div className="self-section-head"><h3>{t("healthSnapshot")}</h3><button type="button" onClick={() => setSubPage("health")}>{t("viewAll")}</button></div>
          <div className="self-card self-inline-metrics"><div><span>{t("water")}</span><b>{waterToday} ml</b></div><div><span>{t("lastWeight")}</span><b>{lastWeight ? Number(lastWeight.amount).toFixed(1) + " kg" : "—"}</b></div></div>
        </>
      )}

      {section === "finance" && !subPage && (
        <>
          <div className="self-eyebrow">{t("thisMonth")}</div><h2 className="self-page-title">{t("finance")}</h2>
          <div className="self-card self-balance"><span>{t("balance")}</span><strong>{money(monthIncome - monthExpense)}</strong><div className="self-finance-split"><div><small>{t("income")}</small><b>{money(monthIncome)}</b></div><div><small>{t("expense")}</small><b>{money(monthExpense)}</b></div></div></div>
          <div className="self-finance-actions"><button type="button" onClick={() => openModal("income")}>+ {t("addIncome")}</button><button type="button" onClick={() => openModal("expense")}>+ {t("addExpense")}</button></div>
          <div className="self-section-head"><h3>{t("recent")}</h3></div>
          <div className="self-filter"><button className={transactionFilter === "all" ? "on" : ""} type="button" onClick={() => setTransactionFilter("all")}>{t("filterAll")}</button><button className={transactionFilter === "income" ? "on" : ""} type="button" onClick={() => setTransactionFilter("income")}>{t("income")}</button><button className={transactionFilter === "expense" ? "on" : ""} type="button" onClick={() => setTransactionFilter("expense")}>{t("expense")}</button></div>
          <div className="self-card">{visibleEntries.length === 0 ? <div className="self-empty">{t("noTransactions")}</div> : visibleEntries.map((entry) => <div className="self-list-row" key={entry.id}><div className={"self-list-mark " + entry.kind}>{entry.kind === "income" ? "+" : "−"}</div><div className="self-list-copy"><b>{entry.title || entry.category || t("other")}</b><small>{entry.category ? t(entry.category as CopyKey) || entry.category : ""} · {localDate(entry.date)}</small></div><strong className={entry.kind}>{entry.kind === "income" ? "+" : "−"}{money(amountOf(entry))}</strong></div>)}</div>
        </>
      )}

      {section === "work" && !subPage && (
        <>
          <div className="self-eyebrow">{t("todayProgress")}</div><h2 className="self-page-title">{t("work")}</h2>
          <div className="self-card self-balance"><div><span>{t("tasksDone")}</span><strong>{doneTasks.length} / {active(data.work.tasks).length}</strong></div><div className="self-progress"><i style={{ width: progress + "%" }} /></div></div>
          <div className="self-section-head"><h3>{t("todayTasks")}</h3><button type="button" onClick={() => openModal("task")}>+ {t("addTask")}</button></div>
          <div className="self-filter"><button type="button" className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>{t("all")}</button><button type="button" className={filter === "open" ? "on" : ""} onClick={() => setFilter("open")}>{t("open")}</button><button type="button" className={filter === "completed" ? "on" : ""} onClick={() => setFilter("completed")}>{t("completed")}</button></div>
          <div className="self-card">{tasks.length === 0 ? <div className="self-empty">{t("noTasks")}</div> : tasks.map((task) => <TaskRow key={task.id} task={task} onToggle={() => void toggleTask(task)} onDelete={() => void removeTask(task)} t={t} />)}</div>
        </>
      )}

      {section === "more" && !subPage && (
        <>
          <div className="self-eyebrow">SELF · MODULES</div><h2 className="self-page-title">{t("more")}</h2>
          <div className="self-module-grid">
            {quickModules.map((m) => <button key={m.key} className="self-module" type="button" onClick={() => m.key === "identity" ? onOpenCard() : setSubPage(m.key as SubPage)}><span className="self-module-mark">{m.mark}</span><b>{m.title}</b><small>{m.subtitle}</small><em>{m.status}</em></button>)}
          </div>
        </>
      )}

      {section === "more" && subPage === "health" && (
        <>
          <button className="self-back" type="button" onClick={() => setSubPage(null)}>‹ {t("more")}</button><h2 className="self-page-title">{t("health")}</h2>
          <div className="self-grid self-grid-2"><div className="self-metric"><span>{t("waterToday")}</span><strong>{waterToday}<i> ml</i></strong><div className="self-progress"><i style={{ width: Math.min(100, waterToday / 2000 * 100) + "%" }} /></div></div><div className="self-metric"><span>{t("lastWeight")}</span><strong>{lastWeight ? Number(lastWeight.amount).toFixed(1) : "—"}<i> kg</i></strong></div></div>
          <div className="self-finance-actions"><button type="button" onClick={() => void addWater()}>{t("addWater")}</button><button type="button" onClick={() => openModal("weight")}>{t("addWeight")}</button><button type="button" onClick={() => openModal("workout")}>{t("addWorkout")}</button></div>
          <div className="self-section-head"><h3>{t("recent")}</h3></div><div className="self-card">{[...active(health.weight), ...active(health.workouts), ...active(health.water)].sort((a,b)=>(b.updatedAt).localeCompare(a.updatedAt)).slice(0,8).map((r) => <div className="self-list-row" key={r.id}><div className="self-list-mark">{r.kind === "weight" ? "W" : r.kind === "workout" ? "A" : "H"}</div><div className="self-list-copy"><b>{r.title}</b><small>{localDate(r.date)}</small></div><strong>{r.amount} {r.unit}</strong></div>)}{health.weight.length + health.workouts.length + health.water.length === 0 ? <div className="self-empty">{t("noActivity")}</div> : null}</div>
        </>
      )}

      {section === "more" && subPage === "nutrition" && (
        <>
          <button className="self-back" type="button" onClick={() => setSubPage(null)}>‹ {t("more")}</button><h2 className="self-page-title">{t("nutrition")}</h2>
          <div className="self-card self-balance"><span>{t("calories")}</span><strong>{active(health.nutrition).filter((r) => r.date === today).reduce((n,r)=>n+Number(r.calories ?? r.amount ?? 0),0)} kcal</strong></div>
          <div className="self-finance-actions"><button type="button" onClick={() => openModal("meal")}>+ {t("addMeal")}</button><button type="button" onClick={() => void addWater()}>{t("addWater")}</button></div>
          <div className="self-card">{active(health.nutrition).slice().sort((a,b)=>(b.updatedAt).localeCompare(a.updatedAt)).map((r) => <div className="self-list-row" key={r.id}><div className="self-list-mark">N</div><div className="self-list-copy"><b>{r.title}</b><small>{localDate(r.date)}</small></div><strong>{r.calories ?? r.amount} kcal</strong></div>)}{health.nutrition.length === 0 ? <div className="self-empty">{t("noMeals")}</div> : null}</div>
        </>
      )}

      {section === "more" && subPage === "activity" && (
        <>
          <button className="self-back" type="button" onClick={() => setSubPage(null)}>‹ {t("more")}</button><h2 className="self-page-title">{t("activity")}</h2>
          <div className="self-finance-actions"><button type="button" onClick={() => openModal("weight")}>{t("addWeight")}</button><button type="button" onClick={() => openModal("workout")}>{t("addWorkout")}</button></div>
          <div className="self-card">{[...active(health.weight), ...active(health.workouts)].sort((a,b)=>(b.updatedAt).localeCompare(a.updatedAt)).map((r) => <div className="self-list-row" key={r.id}><div className="self-list-mark">↗</div><div className="self-list-copy"><b>{r.title}</b><small>{localDate(r.date)}</small></div><strong>{r.amount} {r.unit}</strong></div>)}{health.weight.length + health.workouts.length === 0 ? <div className="self-empty">{t("noActivity")}</div> : null}</div>
        </>
      )}

      {section === "more" && subPage === "vault" && (
        <>
          <button className="self-back" type="button" onClick={() => setSubPage(null)}>‹ {t("more")}</button><h2 className="self-page-title">{t("vault")}</h2>
          <div className="self-card self-vault-note"><div className="self-module-mark">▣</div><b>{t("planned")}</b><p>{t("vaultSafeText")}</p></div>
        </>
      )}

      {modal && (
        <div className="self-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setModal(null); }}>
          <section className="self-modal" role="dialog" aria-modal="true">
            <div className="self-modal-head"><h3>{modal === "task" ? t("addTask") : modal === "income" ? t("addIncome") : modal === "expense" ? t("addExpense") : modal === "weight" ? t("addWeight") : modal === "meal" ? t("addMeal") : t("addWorkout")}</h3><button type="button" onClick={() => setModal(null)}>×</button></div>
            {(modal === "income" || modal === "expense" || modal === "task" || modal === "meal" || modal === "workout") && <label>{modal === "task" ? t("taskTitle") : modal === "meal" || modal === "workout" ? t("title") : t("title")}<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("title")} /></label>}
            {modal !== "task" && <label>{modal === "weight" ? t("weight") + " (kg)" : modal === "meal" ? t("calories") + " (kcal)" : modal === "workout" ? t("minutes") : t("amount") + " (SAR)"}<input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /></label>}
            {(modal === "income" || modal === "expense") && <label>{t("category")}<select value={category} onChange={(e) => setCategory(e.target.value)}><option value="salary">{t("salary")}</option><option value="freelance">{t("freelance")}</option><option value="food">{t("food")}</option><option value="transport">{t("transport")}</option><option value="housing">{t("housing")}</option><option value="workTools">{t("workTools")}</option><option value="other">{t("other")}</option></select></label>}
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

function TaskRow({ task, onToggle, onDelete, t }: {
  task: TaskRecord; onToggle: () => void; onDelete: () => void; t: (key: CopyKey) => string;
}) {
  return (
    <div className={"self-task-row " + (task.completed ? "is-done" : "")}>
      <button className="self-check" type="button" onClick={onToggle} aria-label={task.completed ? t("open") : t("done")}>{task.completed ? "✓" : ""}</button>
      <div className="self-task-copy"><b>{task.title}</b><small>{task.dueDate ? localDate(task.dueDate) : t("today")} · {t(task.priority ?? "medium")}</small></div>
      <button className="self-delete" type="button" onClick={onDelete} aria-label={t("delete")}>×</button>
    </div>
  );
}
