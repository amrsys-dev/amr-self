/** Texts for categories, monthly bills and the car module, in the app's five languages. */
import type { Lang } from "@/lib/i18n.ts";

const ru = {
  cat_food: "Продукты", cat_fuel: "Топливо", cat_car: "Автомобиль", cat_housing: "Аренда и жильё", cat_utilities: "Свет, вода, газ",
  cat_telecom: "Связь и интернет", cat_health: "Здоровье", cat_sport: "Спорт и БАДы", cat_shopping: "Покупки", cat_family: "Семья",
  cat_transfer: "Переводы", cat_other: "Другое", cat_salary: "Зарплата", cat_freelance: "Подработка", cat_advance: "Аванс", cat_bonus: "Премия",
  byCategory: "Расходы по статьям", bills: "Обязательные платежи", addBill: "Добавить платёж", billTitle: "Название (аренда, свет…)",
  payDay: "День оплаты в месяце", paid: "Оплачено", markPaid: "Оплатить", overdue: "Просрочено", dueToday: "Сегодня",
  dueIn: "через {n} дн.", everyMonth: "каждый месяц, {d}-го", noBills: "Добавьте аренду, свет и связь — приложение покажет, что и когда платить.",
  billsDue: "К оплате в этом месяце",
  car: "Автомобиль", carSubtitle: "Пробег и замены масла", carName: "Название (например, Camry 2019)", odometer: "Пробег",
  km: "км", updateOdometer: "Обновить пробег", currentOdometer: "Текущий пробег, км", maintenance: "Обслуживание",
  addItem: "Добавить замену", itemKind: "Что меняем", intervalKm: "Менять каждые, км", lastKm: "Пробег при последней замене, км",
  left: "осталось", overdueBy: "просрочено на", markDone: "Заменено", cost: "Стоимость, SAR (необязательно)",
  engine_oil: "Масло двигателя", gear_oil: "Масло коробки", oil_filter: "Масляный фильтр", air_filter: "Воздушный фильтр",
  cabin_filter: "Салонный фильтр", brake_pads: "Тормозные колодки", tires: "Шины", custom: "Другое",
  customTitle: "Название", setupCar: "Добавьте автомобиль и текущий пробег — приложение посчитает, сколько осталось до каждой замены.",
  addCar: "Добавить автомобиль", carExpenses: "Расходы на авто в этом месяце", soon: "Скоро", nextService: "Ближайшая замена",
  replaceAt: "замена на {km} км", rollback: "Новый пробег меньше прежнего. Проверьте число.", badNumber: "Введите число без букв.",
  history: "История замен", noItems: "Добавьте масло двигателя, коробки и фильтры.", updated: "обновлено {date}",
};

type Copy = { [K in keyof typeof ru]: string };

const en: Copy = {
  cat_food: "Groceries", cat_fuel: "Fuel", cat_car: "Car", cat_housing: "Rent & home", cat_utilities: "Electricity, water, gas",
  cat_telecom: "Phone & internet", cat_health: "Health", cat_sport: "Sport & supplements", cat_shopping: "Shopping", cat_family: "Family",
  cat_transfer: "Transfers", cat_other: "Other", cat_salary: "Salary", cat_freelance: "Side job", cat_advance: "Advance", cat_bonus: "Bonus",
  byCategory: "Spending by category", bills: "Monthly bills", addBill: "Add a bill", billTitle: "Name (rent, electricity…)",
  payDay: "Day of the month", paid: "Paid", markPaid: "Pay", overdue: "Overdue", dueToday: "Today",
  dueIn: "in {n} days", everyMonth: "every month, day {d}", noBills: "Add rent, electricity and phone — the app shows what to pay and when.",
  billsDue: "Due this month",
  car: "Car", carSubtitle: "Mileage and oil changes", carName: "Name (e.g. Camry 2019)", odometer: "Mileage",
  km: "km", updateOdometer: "Update mileage", currentOdometer: "Current mileage, km", maintenance: "Maintenance",
  addItem: "Add a replacement", itemKind: "What to replace", intervalKm: "Replace every, km", lastKm: "Mileage at last replacement, km",
  left: "left", overdueBy: "overdue by", markDone: "Replaced", cost: "Cost, SAR (optional)",
  engine_oil: "Engine oil", gear_oil: "Gearbox oil", oil_filter: "Oil filter", air_filter: "Air filter",
  cabin_filter: "Cabin filter", brake_pads: "Brake pads", tires: "Tyres", custom: "Other",
  customTitle: "Name", setupCar: "Add your car and its current mileage — the app works out how much is left before each replacement.",
  addCar: "Add a car", carExpenses: "Car costs this month", soon: "Soon", nextService: "Next replacement",
  replaceAt: "replace at {km} km", rollback: "The new mileage is lower than before. Check the number.", badNumber: "Enter a number without letters.",
  history: "Replacement history", noItems: "Add engine oil, gearbox oil and filters.", updated: "updated {date}",
};

const ar: Copy = {
  cat_food: "البقالة", cat_fuel: "الوقود", cat_car: "السيارة", cat_housing: "الإيجار والسكن", cat_utilities: "الكهرباء والماء والغاز",
  cat_telecom: "الاتصالات والإنترنت", cat_health: "الصحة", cat_sport: "الرياضة والمكملات", cat_shopping: "المشتريات", cat_family: "العائلة",
  cat_transfer: "التحويلات", cat_other: "أخرى", cat_salary: "الراتب", cat_freelance: "عمل إضافي", cat_advance: "دفعة مقدمة", cat_bonus: "مكافأة",
  byCategory: "المصروفات حسب البند", bills: "المدفوعات الشهرية", addBill: "إضافة دفعة", billTitle: "الاسم (إيجار، كهرباء…)",
  payDay: "يوم الدفع في الشهر", paid: "مدفوع", markPaid: "ادفع", overdue: "متأخر", dueToday: "اليوم",
  dueIn: "بعد {n} يوم", everyMonth: "كل شهر، يوم {d}", noBills: "أضف الإيجار والكهرباء والاتصالات — يوضح التطبيق ماذا تدفع ومتى.",
  billsDue: "مستحق هذا الشهر",
  car: "السيارة", carSubtitle: "العدّاد وتغيير الزيت", carName: "الاسم (مثل كامري 2019)", odometer: "العدّاد",
  km: "كم", updateOdometer: "تحديث العدّاد", currentOdometer: "قراءة العدّاد الحالية، كم", maintenance: "الصيانة",
  addItem: "إضافة استبدال", itemKind: "ما الذي يُستبدل", intervalKm: "الاستبدال كل، كم", lastKm: "العدّاد عند آخر استبدال، كم",
  left: "متبقٍ", overdueBy: "متأخر بـ", markDone: "تم الاستبدال", cost: "التكلفة، ريال (اختياري)",
  engine_oil: "زيت المحرك", gear_oil: "زيت ناقل الحركة", oil_filter: "فلتر الزيت", air_filter: "فلتر الهواء",
  cabin_filter: "فلتر المكيف", brake_pads: "فحمات الفرامل", tires: "الإطارات", custom: "أخرى",
  customTitle: "الاسم", setupCar: "أضف سيارتك وقراءة العدّاد — يحسب التطبيق ما تبقى حتى كل استبدال.",
  addCar: "إضافة سيارة", carExpenses: "مصاريف السيارة هذا الشهر", soon: "قريبًا", nextService: "الاستبدال القادم",
  replaceAt: "الاستبدال عند {km} كم", rollback: "القراءة الجديدة أقل من السابقة. تحقق من الرقم.", badNumber: "أدخل رقمًا بدون حروف.",
  history: "سجل الاستبدال", noItems: "أضف زيت المحرك وزيت ناقل الحركة والفلاتر.", updated: "حُدّث {date}",
};

const uz: Copy = {
  cat_food: "Oziq-ovqat", cat_fuel: "Yoqilg‘i", cat_car: "Avtomobil", cat_housing: "Ijara va uy", cat_utilities: "Svet, suv, gaz",
  cat_telecom: "Aloqa va internet", cat_health: "Salomatlik", cat_sport: "Sport va qo‘shimchalar", cat_shopping: "Xaridlar", cat_family: "Oila",
  cat_transfer: "O‘tkazmalar", cat_other: "Boshqa", cat_salary: "Maosh", cat_freelance: "Qo‘shimcha ish", cat_advance: "Avans", cat_bonus: "Mukofot",
  byCategory: "Xarajatlar moddalar bo‘yicha", bills: "Majburiy to‘lovlar", addBill: "To‘lov qo‘shish", billTitle: "Nomi (ijara, svet…)",
  payDay: "Oydagi to‘lov kuni", paid: "To‘landi", markPaid: "To‘lash", overdue: "Muddati o‘tgan", dueToday: "Bugun",
  dueIn: "{n} kundan keyin", everyMonth: "har oy, {d}-kuni", noBills: "Ijara, svet va aloqani qo‘shing — ilova nimani qachon to‘lashni ko‘rsatadi.",
  billsDue: "Shu oy to‘lanadi",
  car: "Avtomobil", carSubtitle: "Probeg va moy almashtirish", carName: "Nomi (masalan, Camry 2019)", odometer: "Probeg",
  km: "km", updateOdometer: "Probegni yangilash", currentOdometer: "Joriy probeg, km", maintenance: "Texnik xizmat",
  addItem: "Almashtirish qo‘shish", itemKind: "Nima almashtiriladi", intervalKm: "Har necha km da", lastKm: "Oxirgi almashtirishdagi probeg, km",
  left: "qoldi", overdueBy: "o‘tib ketdi", markDone: "Almashtirildi", cost: "Narxi, SAR (ixtiyoriy)",
  engine_oil: "Dvigatel moyi", gear_oil: "Karobka moyi", oil_filter: "Moy filtri", air_filter: "Havo filtri",
  cabin_filter: "Salon filtri", brake_pads: "Tormoz kolodkalari", tires: "Shinalar", custom: "Boshqa",
  customTitle: "Nomi", setupCar: "Avtomobil va joriy probegni qo‘shing — ilova har bir almashtirishgacha qancha qolganini hisoblaydi.",
  addCar: "Avtomobil qo‘shish", carExpenses: "Shu oy avtomobil xarajatlari", soon: "Tez orada", nextService: "Eng yaqin almashtirish",
  replaceAt: "{km} km da almashtirish", rollback: "Yangi probeg avvalgisidan kam. Raqamni tekshiring.", badNumber: "Harfsiz raqam kiriting.",
  history: "Almashtirishlar tarixi", noItems: "Dvigatel, karobka moyi va filtrlarni qo‘shing.", updated: "yangilandi {date}",
};

const tj: Copy = {
  cat_food: "Озуқа", cat_fuel: "Сӯзишворӣ", cat_car: "Мошин", cat_housing: "Иҷора ва манзил", cat_utilities: "Барқ, об, газ",
  cat_telecom: "Алоқа ва интернет", cat_health: "Саломатӣ", cat_sport: "Варзиш ва иловаҳо", cat_shopping: "Харидҳо", cat_family: "Оила",
  cat_transfer: "Интиқолҳо", cat_other: "Дигар", cat_salary: "Маош", cat_freelance: "Кори иловагӣ", cat_advance: "Пешпардохт", cat_bonus: "Мукофот",
  byCategory: "Хароҷот аз рӯи моддаҳо", bills: "Пардохтҳои ҳатмӣ", addBill: "Иловаи пардохт", billTitle: "Ном (иҷора, барқ…)",
  payDay: "Рӯзи пардохт дар моҳ", paid: "Пардохт шуд", markPaid: "Пардохт", overdue: "Мӯҳлат гузашт", dueToday: "Имрӯз",
  dueIn: "баъд аз {n} рӯз", everyMonth: "ҳар моҳ, рӯзи {d}", noBills: "Иҷора, барқ ва алоқаро илова кунед — барнома нишон медиҳад, ки чиро кай пардохт кардан лозим.",
  billsDue: "Дар ин моҳ пардохт мешавад",
  car: "Мошин", carSubtitle: "Масофа ва ивази равған", carName: "Ном (масалан, Camry 2019)", odometer: "Масофа",
  km: "км", updateOdometer: "Навсозии масофа", currentOdometer: "Масофаи ҷорӣ, км", maintenance: "Хизматрасонӣ",
  addItem: "Иловаи ивазкунӣ", itemKind: "Чӣ иваз мешавад", intervalKm: "Ҳар чанд км иваз шавад", lastKm: "Масофа дар ивази охирин, км",
  left: "боқӣ", overdueBy: "гузашт", markDone: "Иваз шуд", cost: "Нарх, SAR (ихтиёрӣ)",
  engine_oil: "Равғани муҳаррик", gear_oil: "Равғани қуттии суръат", oil_filter: "Филтри равған", air_filter: "Филтри ҳаво",
  cabin_filter: "Филтри салон", brake_pads: "Колодкаҳои тормоз", tires: "Шинаҳо", custom: "Дигар",
  customTitle: "Ном", setupCar: "Мошин ва масофаи ҷориро илова кунед — барнома ҳисоб мекунад, ки то ҳар ивазкунӣ чӣ қадар монд.",
  addCar: "Иловаи мошин", carExpenses: "Хароҷоти мошин дар ин моҳ", soon: "Ба зудӣ", nextService: "Ивазкунии наздиктарин",
  replaceAt: "иваз дар {km} км", rollback: "Масофаи нав аз пештара кам аст. Рақамро санҷед.", badNumber: "Рақамро бе ҳарф ворид кунед.",
  history: "Таърихи ивазкуниҳо", noItems: "Равғани муҳаррик, қуттӣ ва филтрҳоро илова кунед.", updated: "навсозӣ {date}",
};

const COPY: Record<Lang, Copy> = { ru, en, ar, uz, tj };
export type ExtraKey = keyof Copy;

/** Translate, filling {name} placeholders. */
export function tx(lang: Lang, key: ExtraKey, vars?: Record<string, string | number>): string {
  let s = (COPY[lang] ?? en)[key] ?? en[key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

/** Label for a stored category key, including old keys from earlier versions. */
export function categoryLabel(lang: Lang, category: string | undefined): string {
  const legacy: Record<string, string> = { transport: "fuel", workTools: "other" };
  const key = `cat_${legacy[category ?? ""] ?? category ?? "other"}` as ExtraKey;
  return key in en ? tx(lang, key) : category ?? tx(lang, "cat_other");
}

export function formatKm(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
