# AMR ID Privacy Policy

**Version 1.0, 17.11.2026**

The Russian text is the primary version (`privacy-policy.ru.md`). If a translation differs from the Russian text, the Russian text prevails. English and Arabic versions are in `privacy-policy.en.md` and `privacy-policy.ar.md`. Uzbek and Tajik translations will come later.

---

## 1. Who we are

This policy explains what data the AMR ID service processes and why.

The data controller (the party that decides how your data is processed) is a private individual, **Muradulla (AMR ecosystem)**. There is no legal entity.

Contact: email [amrsys.dev@gmail.com](mailto:amrsys.dev@gmail.com), Telegram [@amr_ecosystems](https://t.me/amr_ecosystems).

Send requests about your data only to this email or this Telegram. There is no postal address for requests.
If the law requires registration in the SDAIA controller register, we will register and say so here.

The service website is [self.amrsys.net](https://self.amrsys.net).

## 2. What this service is

AMR ID version 1 is a separate web app (PWA) on Vercel. It is your nickname and a digital card with a QR code. The card may show contacts you added yourself. You decide which contacts are public and which are hidden. A photo, if you upload one, is visible to everyone.

Sign-in uses a nickname and a password. If you linked Telegram, you also enter a one-time code from the official Telegram bot after the password. See section 3.1.

Version 1 has **no password vault**. We do not store your documents, messenger passwords, or secrets from other services. There is a separate finances and tasks file: it is encrypted on your device, and the key stays only with you (see section 3.5). Email is not used for sign-in in this version - that comes later.

## 3. What data we collect

We only collect what is needed for sign-in, the card, and syncing your encrypted finances and tasks file.

### 3.1. Account and sign-in

- Your nick, which you choose yourself: 3 to 24 characters - Latin letters and digits, with a single dot, hyphen, or underscore allowed between them. The nick is stored in lowercase with the ending `.amr`, for example `name.amr`. Service words (admin, support, api, and similar) cannot be taken. Old nicks like @AMR-123-456 keep working.
- Your password - stored only as a hash. We do not store or see the password itself.
- Ways to sign in: nickname and password; Google sign-in works only when it is turned on in the service and you linked Google to your account beforehand. You create an account with a nickname and a password; Telegram is not needed for that.
- Your Telegram ID - only if you linked Telegram. Then, when you sign in (with the password or with Google), a one-time code comes to Telegram after the first step.
- You can link or change Telegram on the sign-in screen with «I lost Telegram»: you need the password and one recovery code. You enter your Telegram ID, the official bot [@amr_id_bot](https://t.me/amr_id_bot) sends a code, and you enter it in the app.
- Besides the Telegram ID, we store only your public Telegram username (@username), if you have one. We do not take your name, phone number, or profile photo from Telegram.
- The one-time sign-in code is created by our server, and a Cloudflare Worker delivers it to Telegram through the bot. We keep the code only as a hash: it is single-use and works for 5 minutes.
- Ten one-time recovery codes. They are created on your device and shown once on the screen when you register. Write them down and keep them safe: we cannot show them again. Recovery codes are not sent through Telegram. Only verification hashes and wraps go to the server, not the codes themselves. After a password reset with a code, a new set of 10 codes is likewise created on the device and shown once on the screen; the old codes no longer work. Version 1 has no other way to get access back: if you lose the password and all the codes, access cannot be restored. If you lose access to Telegram, your password plus one recovery code let you link a new Telegram account. All open sessions are then closed, and the code you used is consumed.

Email is not used for sign-in or for codes in version 1. That comes later.

### 3.2. The card

- Contacts you add yourself: Telegram, a WhatsApp number, and any others you enter. You may also put an email address on the card as an ordinary contact, without a “confirmed” mark: email is not confirmed by a code in this version.
- We do not verify contacts on the card: the card has no “confirmed” mark. The WhatsApp number is not printed on the card - it shows “listed by the owner” instead, and the number itself is only inside the chat link. Telegram does not become public on the card just because we store a Telegram ID to deliver codes: it appears on the card only if you add it yourself as a public contact.
- Visibility for each contact: “open to everyone” or “hidden”. There are no other modes. A new contact is public right away, except the WhatsApp number, which is hidden by default.
- A photo and card design, if you upload or choose them. An uploaded photo is visible to everyone on the public card: the photo has no visibility setting, you can only delete it. After you delete the photo, cached copies disappear within a few minutes.
- We do not store a separate copy of the card: the server builds the guest page from your record each time it is opened, and the Cloudflare network keeps a cached copy for a few minutes.

LinkedIn is not connected in version 1. If it is added later, it will only be through official LinkedIn sign-in.

### 3.3. Technical data

- Technical records of sign-in and of service protection (rate limits, blocked suspicious requests). We do not write the password, the Telegram code, or recovery codes into logs.
- We do not keep a separate visit log. To stop guessing attacks, the server keeps the IP address, the nick (if you typed one), and the time of attempts for about 15 minutes, then the record deletes itself. We do not save device type or page addresses. We keep any of our technical records for no more than 30 days.
- On your device the app keeps: the sign-in cookie `amrid_session` (up to 14 days, page scripts cannot read it); for Google sign-in, two more short cookies for 5-10 minutes; in localStorage, your language, theme, currency and exchange rates, and the order of finance blocks; in IndexedDB, an encrypted copy of your file and a device key, so you do not type the password at every start. Signing out wipes the IndexedDB data. The app cache keeps only site files and pages for offline use; server replies with your data are not stored there.
- On the device and in the browser we use only what the service needs in order to work (sign-in, language, security). We do not set advertising cookies and we do not send data to advertising networks.

### 3.4. What we do not collect in this version

- Iqama numbers, passport numbers, or other ID documents.
- Location data “just in case”.
- Passwords, codes, or backup keys for WhatsApp, Telegram, Google, or other third-party services. We store the AMR ID password and recovery codes only as a hash.
- A log of “who opened your card” and view statistics.
- Password-vault contents: there is no password vault in version 1. The encrypted finances and tasks file is described in section 3.5: it is encrypted on the device with a key that is not sent to the server.

We do not issue SIMs or virtual numbers, we do not ask for messenger passwords, and we do not sign in to other people’s accounts for you.

### 3.5. The finances and tasks file

In version 1 you may keep your finances and tasks in a separate file.

- The file holds your finances, tasks, plans, diary, visa notes, sport, health (water, weight, food, workouts), and car upkeep. The file is compressed and encrypted on your device, and only then sent to the server.
- Entries in the Health section (water, weight, food and calories, workouts, dates and your notes) are sensitive data. Before your first entry the app shows a one-time consent screen: what is saved, why, and that it is not shared with anyone. Until you tap “Allow”, no health entries are saved. Your consent and its date are kept in the same encrypted file.
- You can withdraw consent at any time: “Withdraw consent” at the bottom of the Health section. Once you confirm, all health entries are deleted from the file - at once on the device, and on the server at the next sync. The file keeps only technical markers with no content (entry number and deletion time), so another of your devices cannot bring the entries back. Older encrypted versions of the file on the server (the last 5) are replaced by new ones as you keep saving. You can log health again only after a new “Allow”.
- If the file already has health entries made earlier, the app shows the consent screen by itself when it opens, with three buttons: “Allow”, “Not now” and “Delete old entries”. Until you consent, health entries are not sent to the server: before syncing, the app takes them out of the file, and they stay only on this device; without consent, health entries are not downloaded from the server either - a new device will not get them. If the server copy still has such entries from earlier app versions, the app replaces it at the next sync; older copies (up to 5 versions) are replaced by later saves. “Delete old entries” deletes these entries without consent. When you restore from a backup without consent, health entries from it are not brought back.
- The file is encrypted on the device with a key that is not sent to the server. The server stores only the encrypted file.
- The server can see only the file size, the sync time, and which account the file belongs to. The server keeps the last 5 versions of the encrypted file.
- The Telegram second factor does not affect the file key: losing Telegram affects sign-in, not the data in the file.
- The encrypted file is stored with Cloudflare, in the European Union (Europe). From the device it is synced to the server from time to time, about every 3 minutes.
- We do not use this file for financial advice, for scoring a person, or for advertising.
- If you forget the password and lose all recovery codes, the data in the file is gone for good. AMR cannot restore it.
- When you delete your account (“Delete my data” in your profile), the file is deleted together with your other data. Provider backups follow the same deletion periods as other data (see section 7).

### 3.6. Sign-in with Google

If you sign in with Google:
- We store only your Google ID: the permanent account number Google gives (the `sub` field). We use it to recognise you next time you sign in.
- We do not take or store your email address, emails, contacts, photos, files, or any other Google data.
- Google can see that you signed in to AMR ID. How Google handles this is described in Google's own policy.
- Your Google ID is deleted together with your AMR ID account.
- Signing in with Google does not open your encrypted file. The file needs your AMR ID password.

## 4. Why we use the data, and on what basis

Processing follows Saudi Arabia’s Personal Data Protection Law (PDPL). The authority is SDAIA.

- Creating an account, keeping your nickname, letting you sign in, and showing the card as you set it - performance of our agreement with you: you chose to use the service.
- Showing guests your public contacts and uploaded photo - your consent. You can hide a contact, delete the photo, or withdraw consent at any time.
- Storing your Telegram ID and sending a sign-in code to Telegram - performance of the agreement and protection of sign-in.
- Storing your Google ID, if you chose to sign in with Google - performance of the agreement.
- Storing your encrypted finances and tasks file and the technical facts about it (size, sync time, account), so the file can be synced - performance of the agreement. The key is not sent to the server. We do not use this file for advice, scoring, or advertising. Health entries in this file are kept only with your consent (next point).
- Storing Health section entries - your explicit consent. You give it on a separate screen with “Allow” before the first entry; the date of consent is saved. Without consent new health entries are not saved, and old ones are not sent to the server and stay only on the device until you choose “Allow” or “Delete old entries”. If you withdraw consent (“Withdraw consent”), the section is cleared: all health entries are deleted (see section 3.5).
- Reviewing messages about impersonation or abuse that people send to our email or Telegram, and stopping abuse - legitimate interest: protecting people from impersonation and abuse. There is no in-app complaint button.

We do not sell contact lists, and we do not build a hidden profile of a person beyond what the card and sign-in need.

## 5. Who can see what

A guest (anyone with the link or QR code) sees only the nickname, the design, the photo (if you uploaded one), and the contacts you marked as public. The “message” button opens a chat only for a public contact.

Hidden contacts are shown to no one except you after you sign in. They do not appear:

- on the card page;
- in server responses for guests;
- in the public card cache;
- in link previews (when a messenger or website shows a title, text, and image for the card address).

The Telegram ID used to deliver the code is not shown to guests.

The AMR team does not use hidden contacts for mailing and does not show them to other people. Staff access is only to fix the service or review a message about impersonation or abuse sent to our email or Telegram, and only as much as needed.  
Only authorised people on the AMR team have that access.

The card page does not show a sign-in form to guests and does not ask them for codes.

## 6. Where data is stored and who receives it

Processors and recipients in version 1:

- **Vercel** - the site and application server (PWA).
- **Cloudflare** - KV, Durable Objects, and R2 storage (account records, card photos, and the encrypted file) and the Worker that delivers one-time codes to Telegram and caches the public card. Only our server can reach the storage, not the browser and not a direct public link; card photos are served only through our site. The encrypted file is stored with Cloudflare in the European Union (Europe).
- **Telegram** - the delivery channel for the second-factor (login) code. Telegram receives your Telegram ID and a message with the login code. Recovery codes are never sent through Telegram.
- **Google** - sign-in with a Google account. Google learns that you signed in to AMR ID and gives us only your Google ID. Google's servers are outside Saudi Arabia.
- **AMR Market** (bazar.amrsys.net) - only if you yourself signed in to Market with AMR ID and tapped “Allow”. Market receives your internal account number, your nick, and a display name - the same nick without the .amr ending (your real name is not shared). Phone, email, and hidden contacts are not shared.

Account records (nick, password hash, Telegram ID and @username, Google ID, sessions) are stored in Cloudflare KV and Durable Objects - on Cloudflare’s global network, not tied to one country; the main storage is outside Saudi Arabia. The encrypted finances and tasks file and card photos are stored in Cloudflare R2 in the European Union. All of this is a transfer of data outside Saudi Arabia. The app server on Vercel runs in the USA (region iad1, Washington, D.C.): requests pass through it, while account data is kept at Cloudflare, not at Vercel. Telegram delivers the code on its servers, generally outside Saudi Arabia. We do not claim that the data is kept in Saudi Arabia.

Basis for the transfer: it is necessary to provide the service you asked for; providers protect data under their published rules (links below). The transfer follows the SDAIA rules on transferring personal data outside the Kingdom. We give providers only what the service cannot work without.

Vercel, Cloudflare, Telegram, and Google keep their own technical logs under their own rules: [Vercel](https://vercel.com/legal/privacy-policy), [Cloudflare](https://www.cloudflare.com/privacypolicy/), [Telegram](https://telegram.org/privacy), [Google](https://policies.google.com/privacy). Our periods are in section 7.

They process data so we can provide the service (the site, storage, and code delivery), not for our own unrelated mailing.

## 7. How long we keep data

- Account and card data - for as long as the account exists, or until you delete it sooner.
- When you delete your account (“Delete my data” in your profile, the “Delete account” screen), we erase at once the record, photos, the linked Telegram ID and Google ID, and the encrypted file with all its versions. Cached copies of the card and photo disappear within a few minutes. Provider backups may remain for up to 30 days.
- You may change the nick once. The old nick is reserved and is never given to anyone else, including after the account is deleted.
- Our technical sign-in and protection records are kept for 30 days, then deleted or made anonymous.
- The password hash is kept while the account exists and is erased with it. Hashes of the current set of recovery codes are kept while that set is in force; after a new set of 10 codes is issued, hashes of the old set are erased. We keep hashes of codes already used for 30 more days so a code cannot be used twice.

## 8. Security

- The service is reached over a protected connection (HTTPS).
- The password is stored only as a hash. Recovery codes on the server are stored only as verification hashes and wraps, not as the codes themselves.
- The one-time sign-in code is created by our server; the server keeps it only as a hash, and it works for 5 minutes. A Cloudflare Worker delivers it to Telegram.
- To change the second-factor channel, you need the password and a one-time code from the old channel. If you lose access to Telegram, your password plus one recovery code let you link a new Telegram account: all open sessions are closed, and the code you used is consumed.
- Only our server has the secret for Cloudflare storage. The browser cannot reach the storage directly.
- The file is encrypted on the device with a key that is not sent to the server. If you forget the password and lose all recovery codes, we cannot restore that file.
- Hidden contacts do not go into the guest page, the card cache, or link previews.
- Rate limits reduce guessing of nicknames, passwords, and codes.

The second-factor code arrives in Telegram. Anyone who can read your Telegram messages can see that code. Keep your Telegram account safe.

We take reasonable security measures, but no service can promise complete protection. If a breach may cause harm, we will notify the competent authority within the time the law requires (currently 72 hours) and will tell affected people without undue delay.  
If you notice a leak or a break-in, write to us right away - contacts are in section 13.

## 9. Your rights

Under the PDPL you may:

- find out what data we hold about you and get a copy;
- correct inaccurate data (you can change contacts and settings yourself in your profile);
- have data deleted when it is no longer needed for the purpose, or when you withdraw consent, unless the law requires us to keep some records;
- withdraw consent to publish public contacts and a photo - after that we stop showing them to guests;
- ask us to restrict processing if you believe it is unlawful;
- complain to SDAIA, the KSA authority for personal data protection.

You can complain to SDAIA through its official website: [sdaia.gov.sa](https://sdaia.gov.sa).  
We answer a request about your data within 30 days.

To use these rights, write to [amrsys.dev@gmail.com](mailto:amrsys.dev@gmail.com) or Telegram [@amr_ecosystems](https://t.me/amr_ecosystems).

## 10. How to delete your account

While the account exists, your card is open to everyone at self.amrsys.net/u/your-nick (for example, self.amrsys.net/u/name.amr): it shows your nick, design, photo (if you uploaded one), and only the contacts you made public. You can hide each contact and delete the photo. After the account is deleted, the card stops opening; cached copies disappear within a few minutes. To delete the account, confirm it the way you sign in: with your password, a Telegram code, or by signing in to Google again. We immediately erase your record, photos, the card cache, the linked Telegram ID, the linked Google ID, and the encrypted finances and tasks file. Provider backups may remain for up to 30 days. After that, the nickname and card stop working.

After deletion, that nick is never given to anyone else, including back to you automatically. The old account and its data cannot be restored after deletion. To use the service again, create a new account with a new nick. We keep the deleted nick itself with no time limit (only the nick and the date), so it is never given to anyone.

## 11. Children

The service is only for people aged 18 and over. We do not knowingly collect children’s data. If you learn that a child created an account, write to us and we will delete it.

## 12. Changes to this policy

If this policy changes, we will show the new version on the service website. If the changes are material, we will ask for consent where the law requires it. The date and version number are always at the top of this document.

## 13. Contact

Muradulla (AMR ecosystem)  
Email: [amrsys.dev@gmail.com](mailto:amrsys.dev@gmail.com)  
Telegram: [@amr_ecosystems](https://t.me/amr_ecosystems)

Version 1.0, 17.11.2026
