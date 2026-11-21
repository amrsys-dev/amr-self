/** One-time consent screen for the Health section and «Отозвать согласие». */
import type { Lang } from "@/lib/i18n.ts";

type Copy = {
  /** One line shown before the user starts the section. */
  short: string;
  title: string;
  lead: string;
  points: [string, string, string, string];
  allow: string;
  notNow: string;
  withdraw: string;
  given: string;
  confirmTitle: string;
  confirmText: string;
  confirmYes: string;
  cancel: string;
  /** Shown when the file already has health entries from before consent. */
  old: string;
  discard: string;
};

export const HEALTH_CONSENT_COPY: Partial<Record<Lang, Copy>> & { en: Copy } = {
  ru: {
    short: "Вода, вес, еда и тренировки. Всё шифруется на вашем телефоне и никому не передаётся.",
    title: "Здоровье - только для вас",
    lead: "Чтобы вести этот раздел, нужно ваше согласие. Что сохраним: воду, вес, еду и калории, тренировки (минуты), даты и ваши заметки.",
    points: [
      "Хранится в вашем файле и шифруется на телефоне. Ключ только у вас.",
      "Нужно только чтобы показать вам вашу статистику.",
      "Никому не передаём. Не для рекламы и не для советов.",
      "Согласие можно отозвать в любой момент - записи удалятся.",
    ],
    allow: "Начать",
    notNow: "Не сейчас",
    withdraw: "Удалить данные фитнеса",
    given: "Согласие дано {d}",
    confirmTitle: "Отозвать согласие?",
    confirmText: "Все записи здоровья удалятся из вашего файла и с этого устройства. Вернуть их нельзя.",
    confirmYes: "Отозвать и удалить",
    cancel: "Отмена",
    old: "У вас уже есть записи здоровья. Пока нет согласия, они лежат только на этом устройстве и не уходят на сервер.",
    discard: "Удалить старые записи",
  },
  en: {
    short: "Water, weight, food and workouts. Everything is encrypted on your phone and shared with no one.",
    title: "Health - just for you",
    lead: "To use this section we need your consent. What we save: water, weight, food and calories, workouts (minutes), dates and your notes.",
    points: [
      "Kept in your file, encrypted on your phone. Only you have the key.",
      "Used only to show you your own stats.",
      "Never shared. Not for ads or advice.",
      "You can withdraw any time - your entries will be deleted.",
    ],
    allow: "Start",
    notNow: "Not now",
    withdraw: "Delete fitness data",
    given: "Consent given {d}",
    confirmTitle: "Withdraw consent?",
    confirmText: "All health entries will be deleted from your file and this device. They can't be restored.",
    confirmYes: "Withdraw and delete",
    cancel: "Cancel",
    old: "You already have health entries. Until you agree, they stay only on this device and are not sent to the server.",
    discard: "Delete old entries",
  },
  ar: {
    short: "الماء والوزن والطعام والتمارين. كل شيء مشفّر على هاتفك ولا يُشارك مع أحد.",
    title: "الصحة - لك أنت بس",
    lead: "عشان تستخدم هذا القسم نحتاج موافقتك. نحفظ: الماء، الوزن، الأكل والسعرات، التمارين بالدقائق، التاريخ وملاحظاتك.",
    points: [
      "تنحفظ في ملفك ومشفّرة على جوالك. المفتاح عندك أنت بس.",
      "نستخدمها بس عشان نعرض لك إحصائياتك.",
      "ما نشاركها مع أحد، ولا للإعلانات ولا للنصائح.",
      "تقدر تسحب موافقتك أي وقت، وتنحذف كل السجلات.",
    ],
    allow: "ابدأ",
    notNow: "مو الحين",
    withdraw: "حذف بيانات اللياقة",
    given: "وافقت بتاريخ {d}",
    confirmTitle: "تسحب الموافقة؟",
    confirmText: "كل سجلات الصحة بتنحذف من ملفك ومن هذا الجهاز، وما تقدر ترجعها.",
    confirmYes: "اسحب واحذف",
    cancel: "إلغاء",
    old: "عندك سجلات صحة من قبل. لين توافق، تبقى على هذا الجهاز بس وما تنرسل للخادم.",
    discard: "احذف السجلات القديمة",
  },
  uz: {
    short: "Suv, vazn, ovqat va mashg‘ulotlar. Hammasi telefoningizda shifrlanadi va hech kimga berilmaydi.",
    title: "Salomatlik - faqat siz uchun",
    lead: "Bu bo‘limdan foydalanish uchun roziligingiz kerak. Nima saqlanadi: suv, vazn, ovqat va kaloriya, mashg‘ulotlar (daqiqa), sana va izohlaringiz.",
    points: [
      "Faylingizda, telefoningizda shifrlangan holda saqlanadi. Kalit faqat sizda.",
      "Faqat o‘z statistikangizni ko‘rsatish uchun.",
      "Hech kimga berilmaydi. Reklama va maslahat uchun emas.",
      "Rozilikni istalgan payt qaytarib olasiz - yozuvlar o‘chadi.",
    ],
    allow: "Boshlash",
    notNow: "Hozir emas",
    withdraw: "Fitnes ma’lumotlarini o‘chirish",
    given: "Rozilik berilgan: {d}",
    confirmTitle: "Rozilik qaytarib olinsinmi?",
    confirmText: "Barcha salomatlik yozuvlari faylingizdan va shu qurilmadan o‘chadi. Ularni qaytarib bo‘lmaydi.",
    confirmYes: "Qaytarib olish va o‘chirish",
    cancel: "Bekor qilish",
    old: "Sizda salomatlik yozuvlari bor. Rozilik bermaguningizcha ular faqat shu qurilmada turadi va serverga yuborilmaydi.",
    discard: "Eski yozuvlarni o‘chirish",
  },
  tj: {
    short: "Об, вазн, хӯрок ва машқҳо. Ҳама дар телефони шумо рамзгузорӣ мешавад ва ба касе дода намешавад.",
    title: "Саломатӣ - танҳо барои шумо",
    lead: "Барои ин бахш розигии шумо лозим аст. Чӣ нигоҳ дошта мешавад: об, вазн, хӯрок ва калория, машқҳо (дақиқа), сана ва қайдҳои шумо.",
    points: [
      "Дар файли шумо, дар телефон рамзгузорӣ шуда нигоҳ дошта мешавад. Калид танҳо дар шумост.",
      "Танҳо барои нишон додани омори худатон.",
      "Ба касе дода намешавад. На барои реклама ва на барои маслиҳат.",
      "Розигиро ҳар вақт бозпас гирифтан мумкин - сабтҳо нест мешаванд.",
    ],
    allow: "Оғоз",
    notNow: "Ҳоло не",
    withdraw: "Нест кардани маълумоти фитнес",
    given: "Розигӣ дода шуд: {d}",
    confirmTitle: "Розигиро бозпас мегиред?",
    confirmText: "Ҳамаи сабтҳои саломатӣ аз файли шумо ва аз ин дастгоҳ нест мешаванд. Баргардонданашон мумкин нест.",
    confirmYes: "Бозпас гирифтан ва нест кардан",
    cancel: "Бекор кардан",
    old: "Шумо аллакай сабтҳои саломатӣ доред. То розигӣ надиҳед, онҳо танҳо дар ин дастгоҳ мемонанд ва ба сервер фиристода намешаванд.",
    discard: "Нест кардани сабтҳои кӯҳна",
  },
};

export function healthConsentCopy(lang: Lang): Copy {
  return HEALTH_CONSENT_COPY[lang] ?? HEALTH_CONSENT_COPY.en;
}

export function HealthConsentCard({ lang, busy, hasOld, onAllow, onLater, onDiscard }: { lang: Lang; busy?: boolean; hasOld?: boolean; onAllow: () => void; onLater: () => void; onDiscard?: () => void }) {
  const c = healthConsentCopy(lang);
  return (
    <section className="self-card self-consent" aria-labelledby="health-consent-title">
      <h2 id="health-consent-title">{c.title}</h2>
      <p>{c.short}</p>
      {hasOld ? <p className="self-consent-old">{c.old}</p> : null}
      <button type="button" className="self-primary self-consent-go" disabled={busy} onClick={onAllow}>{c.allow}</button>
      {hasOld ? <button type="button" className="self-secondary" onClick={onLater}>{c.notNow}</button> : null}
      {hasOld && onDiscard ? <button type="button" className="self-link-danger self-consent-discard" disabled={busy} onClick={onDiscard}>{c.discard}</button> : null}
    </section>
  );
}

/** Shown once per app start when old health entries exist without consent. */
export function HealthConsentPrompt(props: { lang: Lang; busy?: boolean; onAllow: () => void; onLater: () => void; onDiscard: () => void }) {
  return (
    <div className="self-modal-backdrop" role="presentation">
      <div className="self-modal self-consent-modal" role="dialog" aria-modal="true" aria-labelledby="health-consent-title">
        <HealthConsentCard {...props} hasOld />
      </div>
    </div>
  );
}

export function HealthWithdrawDialog({ lang, busy, onConfirm, onClose }: { lang: Lang; busy?: boolean; onConfirm: () => void; onClose: () => void }) {
  const c = healthConsentCopy(lang);
  return (
    <div className="self-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="self-modal" role="alertdialog" aria-modal="true" aria-labelledby="health-withdraw-title">
        <div className="self-modal-head"><h3 id="health-withdraw-title">{c.confirmTitle}</h3><button type="button" aria-label={c.cancel} onClick={onClose}>×</button></div>
        <p className="self-consent-text">{c.confirmText}</p>
        <div className="self-modal-actions">
          <button type="button" className="self-secondary" onClick={onClose}>{c.cancel}</button>
          <button type="button" className="self-primary self-danger" disabled={busy} onClick={onConfirm}>{c.confirmYes}</button>
        </div>
      </section>
    </div>
  );
}
