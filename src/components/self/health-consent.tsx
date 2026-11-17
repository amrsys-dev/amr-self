/** One-time consent screen for the Health section and «Отозвать согласие». */
import type { Lang } from "@/lib/i18n.ts";

type Copy = {
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
};

export const HEALTH_CONSENT_COPY: Record<Lang, Copy> = {
  ru: {
    title: "Здоровье — только для вас",
    lead: "Чтобы вести этот раздел, нужно ваше согласие. Что сохраним: воду, вес, еду и калории, тренировки (минуты), даты и ваши заметки.",
    points: [
      "Хранится в вашем файле и шифруется на телефоне. Ключ только у вас.",
      "Нужно только чтобы показать вам вашу статистику.",
      "Никому не передаём. Не для рекламы и не для советов.",
      "Согласие можно отозвать в любой момент — записи удалятся.",
    ],
    allow: "Разрешить",
    notNow: "Не сейчас",
    withdraw: "Отозвать согласие",
    given: "Согласие дано {d}",
    confirmTitle: "Отозвать согласие?",
    confirmText: "Все записи здоровья удалятся из вашего файла и с этого устройства. Вернуть их нельзя.",
    confirmYes: "Отозвать и удалить",
    cancel: "Отмена",
  },
  en: {
    title: "Health — just for you",
    lead: "To use this section we need your consent. What we save: water, weight, food and calories, workouts (minutes), dates and your notes.",
    points: [
      "Kept in your file, encrypted on your phone. Only you have the key.",
      "Used only to show you your own stats.",
      "Never shared. Not for ads or advice.",
      "You can withdraw any time — your entries will be deleted.",
    ],
    allow: "Allow",
    notNow: "Not now",
    withdraw: "Withdraw consent",
    given: "Consent given {d}",
    confirmTitle: "Withdraw consent?",
    confirmText: "All health entries will be deleted from your file and this device. They can't be restored.",
    confirmYes: "Withdraw and delete",
    cancel: "Cancel",
  },
  ar: {
    title: "الصحة — لك أنت بس",
    lead: "عشان تستخدم هذا القسم نحتاج موافقتك. نحفظ: الماء، الوزن، الأكل والسعرات، التمارين بالدقائق، التاريخ وملاحظاتك.",
    points: [
      "تنحفظ في ملفك ومشفّرة على جوالك. المفتاح عندك أنت بس.",
      "نستخدمها بس عشان نعرض لك إحصائياتك.",
      "ما نشاركها مع أحد، ولا للإعلانات ولا للنصائح.",
      "تقدر تسحب موافقتك أي وقت، وتنحذف كل السجلات.",
    ],
    allow: "أسمح",
    notNow: "مو الحين",
    withdraw: "سحب الموافقة",
    given: "وافقت بتاريخ {d}",
    confirmTitle: "تسحب الموافقة؟",
    confirmText: "كل سجلات الصحة بتنحذف من ملفك ومن هذا الجهاز، وما تقدر ترجعها.",
    confirmYes: "اسحب واحذف",
    cancel: "إلغاء",
  },
  uz: {
    title: "Salomatlik — faqat siz uchun",
    lead: "Bu bo‘limdan foydalanish uchun roziligingiz kerak. Nima saqlanadi: suv, vazn, ovqat va kaloriya, mashg‘ulotlar (daqiqa), sana va izohlaringiz.",
    points: [
      "Faylingizda, telefoningizda shifrlangan holda saqlanadi. Kalit faqat sizda.",
      "Faqat o‘z statistikangizni ko‘rsatish uchun.",
      "Hech kimga berilmaydi. Reklama va maslahat uchun emas.",
      "Rozilikni istalgan payt qaytarib olasiz — yozuvlar o‘chadi.",
    ],
    allow: "Ruxsat berish",
    notNow: "Hozir emas",
    withdraw: "Rozilikni qaytarib olish",
    given: "Rozilik berilgan: {d}",
    confirmTitle: "Rozilik qaytarib olinsinmi?",
    confirmText: "Barcha salomatlik yozuvlari faylingizdan va shu qurilmadan o‘chadi. Ularni qaytarib bo‘lmaydi.",
    confirmYes: "Qaytarib olish va o‘chirish",
    cancel: "Bekor qilish",
  },
  tj: {
    title: "Саломатӣ — танҳо барои шумо",
    lead: "Барои ин бахш розигии шумо лозим аст. Чӣ нигоҳ дошта мешавад: об, вазн, хӯрок ва калория, машқҳо (дақиқа), сана ва қайдҳои шумо.",
    points: [
      "Дар файли шумо, дар телефон рамзгузорӣ шуда нигоҳ дошта мешавад. Калид танҳо дар шумост.",
      "Танҳо барои нишон додани омори худатон.",
      "Ба касе дода намешавад. На барои реклама ва на барои маслиҳат.",
      "Розигиро ҳар вақт бозпас гирифтан мумкин — сабтҳо нест мешаванд.",
    ],
    allow: "Иҷозат додан",
    notNow: "Ҳоло не",
    withdraw: "Бозпас гирифтани розигӣ",
    given: "Розигӣ дода шуд: {d}",
    confirmTitle: "Розигиро бозпас мегиред?",
    confirmText: "Ҳамаи сабтҳои саломатӣ аз файли шумо ва аз ин дастгоҳ нест мешаванд. Баргардонданашон мумкин нест.",
    confirmYes: "Бозпас гирифтан ва нест кардан",
    cancel: "Бекор кардан",
  },
};

export function healthConsentCopy(lang: Lang): Copy {
  return HEALTH_CONSENT_COPY[lang] ?? HEALTH_CONSENT_COPY.en;
}

export function HealthConsentCard({ lang, busy, onAllow, onLater }: { lang: Lang; busy?: boolean; onAllow: () => void; onLater: () => void }) {
  const c = healthConsentCopy(lang);
  return (
    <section className="self-card self-consent" aria-labelledby="health-consent-title">
      <h2 id="health-consent-title">{c.title}</h2>
      <p>{c.lead}</p>
      <ul>{c.points.map((p) => <li key={p}>{p}</li>)}</ul>
      <div className="self-modal-actions">
        <button type="button" className="self-secondary" onClick={onLater}>{c.notNow}</button>
        <button type="button" className="self-primary" disabled={busy} onClick={onAllow}>{c.allow}</button>
      </div>
    </section>
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
