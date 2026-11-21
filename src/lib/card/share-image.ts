/**
 * The card as a small JPEG (540 px wide, tens of kilobytes) for sending in a chat:
 * nick, every visible contact with its service icon, and a QR code to the card page.
 * Browser only (canvas).
 */
import { encode } from "uqr";
import { cardBackground, type CardTheme, type PublicContact } from "./visibility.ts";
import { CARD_PALETTE } from "./palette.ts";
import { SERVICE } from "../../components/contact-icons.tsx";

const W = 720;
const PAD = 32;
const ROW = 64;
const GAP = 10;
const FONT = "-apple-system, 'SF Pro Text', Roboto, 'Noto Sans', 'Segoe UI', sans-serif";

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + "…").width > max) s = s.slice(0, -1);
  return s + "…";
}

export type ShareImageInput = {
  nick: string;
  /** Name on the card (any language); the nick goes under it. */
  displayName?: string;
  url: string;
  theme: CardTheme;
  contacts: readonly PublicContact[];
  /** Service name, e.g. "Telegram". */
  name: (c: PublicContact) => string;
  /** The username, number or address itself, e.g. "@amr_userb" or "+966 57…". */
  value: (c: PublicContact) => string;
  /** Cover: drawn as the background of the whole picture (when the background is "own"). */
  photo?: string | null;
  /** Cover position, 0 (top) … 100 (bottom). */
  coverY?: number;
  /** Round face photo next to the name. */
  avatar?: string | null;
};

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Layout: header (photo or letter, nick), then a big QR code on the left and the
 * contacts with their actual usernames and numbers on the right.
 */
export async function renderCardImage(input: ShareImageInput, quality = 0.8): Promise<Blob> {
  const p = CARD_PALETTE[input.theme] ?? CARD_PALETTE.own;
  const rows = input.contacts.filter((c) => c.href || input.value(c));
  const QR = 300;
  const listH = rows.length * (ROW + GAP) - GAP;
  const bodyH = Math.max(QR, listH);
  const H = PAD + 76 + 28 + bodyH + 26 + 20 + PAD;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, W, H);
  // Cover photo fills the background, darkened so text and contacts stay readable.
  const preset = cardBackground(input.theme);
  const src = preset ?? input.photo ?? null;
  const cover = src ? await loadImage(src) : null;
  if (cover) {
    const k = Math.max(W / (cover.naturalWidth || W), H / (cover.naturalHeight || H));
    const cw = (cover.naturalWidth || W) * k;
    const ch = (cover.naturalHeight || H) * k;
    const fy = preset ? 0.5 : Math.min(100, Math.max(0, input.coverY ?? 50)) / 100;
    ctx.drawImage(cover, (W - cw) / 2, (H - ch) * fy, cw, ch);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "rgba(0,0,0,.35)");
    g.addColorStop(0.35, "rgba(0,0,0,.6)");
    g.addColorStop(1, "rgba(0,0,0,.72)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  const textC = cover ? "#FFFFFF" : p.text;
  const mutedC = cover ? "rgba(255,255,255,.78)" : p.muted;

  // Header: round photo or first letter, nick, "AMR ID"
  const ax = PAD + 38;
  const ay = PAD + 38;
  const photo = input.avatar ? await loadImage(input.avatar) : null;
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax, ay, 38, 0, Math.PI * 2);
  ctx.closePath();
  if (photo) {
    ctx.clip();
    const k = Math.max(76 / photo.naturalWidth, 76 / photo.naturalHeight);
    const w = photo.naturalWidth * k;
    const h = photo.naturalHeight * k;
    ctx.drawImage(photo, ax - w / 2, ay - h / 2, w, h);
  } else {
    ctx.fillStyle = p.accent;
    ctx.fill();
    ctx.fillStyle = p.onAccent;
    ctx.font = `700 36px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((input.nick.replace(/^@/, "")[0] ?? "A").toUpperCase(), ax, ay + 2);
  }
  ctx.restore();
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = textC;
  ctx.font = `800 34px ${FONT}`;
  const title = input.displayName?.trim() || input.nick;
  ctx.direction = /[\u0590-\u08FF]/.test(title) ? "rtl" : "ltr";
  ctx.textAlign = ctx.direction === "rtl" ? "right" : "left";
  const tx0 = ctx.direction === "rtl" ? W - PAD : PAD + 96;
  ctx.fillText(fit(ctx, title, W - PAD * 2 - 96), tx0, PAD + 8);
  ctx.direction = "ltr";
  ctx.textAlign = "left";
  ctx.fillStyle = mutedC;
  ctx.font = `600 17px ${FONT}`;
  ctx.fillText(input.displayName?.trim() ? `${input.nick} · AMR ID` : "AMR ID", PAD + 96, PAD + 50);

  // Big QR on white, so any camera reads it
  const top = PAD + 76 + 28;
  const { data, size } = encode(input.url, { ecc: "M" });
  ctx.fillStyle = "#FFFFFF";
  rr(ctx, PAD, top, QR, QR, 18);
  ctx.fill();
  const inner = QR - 28;
  const cell = inner / size;
  ctx.fillStyle = "#000000";
  for (let r = 0; r < size; r++) {
    for (let q = 0; q < size; q++) {
      if (data[r]![q]) ctx.fillRect(PAD + 14 + q * cell, top + 14 + r * cell, Math.ceil(cell), Math.ceil(cell));
    }
  }

  // Contacts: icon, the actual username or number, service name under it
  const lx = PAD + QR + 24;
  const lw = W - lx - PAD;
  let y = top;
  for (const c of rows) {
    ctx.fillStyle = p.card;
    rr(ctx, lx, y, lw, ROW, 16);
    ctx.fill();
    const ix = lx + 12;
    const iy = y + 12;
    drawServiceIcon(ctx, c.kind, ix, iy, 40);
    const tx = ix + 52;
    const maxW = lx + lw - tx - 12;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = p.text;
    ctx.font = `700 18px ${FONT}`;
    ctx.fillText(fit(ctx, input.value(c) || input.name(c), maxW), tx, y + 12);
    ctx.fillStyle = p.muted;
    ctx.font = `500 14px ${FONT}`;
    ctx.fillText(fit(ctx, input.name(c), maxW), tx, y + 37);
    y += ROW + GAP;
  }

  ctx.fillStyle = mutedC;
  ctx.font = `500 16px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(fit(ctx, input.url.replace(/^https?:\/\//, ""), W - PAD * 2), W / 2, top + bodyH + 26);

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("image"))), "image/jpeg", quality),
  );
}

/** Service icon (Telegram, WhatsApp…) as on the card, size×size at x, y. */
function drawServiceIcon(ctx: CanvasRenderingContext2D, kind: string, ix: number, iy: number, size: number) {
  const s = SERVICE[kind as keyof typeof SERVICE] ?? SERVICE.other;
  const u = size / 40;
  if (s.bg !== "none") {
    if (s.bg.startsWith("radial-gradient")) {
      // Instagram: canvas cannot take a CSS gradient, so draw the same brand gradient
      const g = ctx.createRadialGradient(ix + 12 * u, iy + 43 * u, 2 * u, ix + 12 * u, iy + 43 * u, 52 * u);
      g.addColorStop(0, "#FDF497");
      g.addColorStop(0.05, "#FDF497");
      g.addColorStop(0.45, "#FD5949");
      g.addColorStop(0.6, "#D6249F");
      g.addColorStop(0.9, "#285AEB");
      ctx.fillStyle = g;
    } else ctx.fillStyle = s.bg;
    rr(ctx, ix, iy, size, size, 11 * u);
    ctx.fill();
  }
  ctx.save();
  const k = (s.full ? 40 / 24 : 25 / 24) * u;
  ctx.translate(ix + (size - 24 * k) / 2, iy + (size - 24 * k) / 2);
  ctx.scale(k, k);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const layer of s.layers) {
    const p2 = new Path2D(layer.d);
    ctx.save();
    if (layer.dx || layer.dy) ctx.translate(layer.dx ?? 0, layer.dy ?? 0);
    if (layer.stroke) {
      ctx.lineWidth = 1.9;
      ctx.strokeStyle = layer.color;
      ctx.stroke(p2);
    } else {
      if (layer.outline) {
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = layer.outline;
        ctx.stroke(p2);
      }
      ctx.fillStyle = layer.color;
      ctx.fill(p2, layer.evenodd ? "evenodd" : "nonzero");
    }
    ctx.restore();
  }
  ctx.restore();
}

/**
 * Link preview for chats (Telegram, WhatsApp…): 1200×630, like the top of the card -
 * cover behind, round face photo, name, nick, «AMR ID · digital business card», service icons.
 */
export async function renderLinkPreview(
  input: Pick<ShareImageInput, "nick" | "displayName" | "theme" | "contacts" | "photo" | "coverY" | "avatar" | "url"> & {
    tag: string;
    /** Line under the name: the phone number, else a username, else the nick. */
    sub?: string;
  },
  quality = 0.82,
): Promise<Blob> {
  const PW = 1200;
  const PH = 630;
  const p = CARD_PALETTE[input.theme] ?? CARD_PALETTE.own;
  const canvas = document.createElement("canvas");
  canvas.width = PW;
  canvas.height = PH;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, PW, PH);
  const preset = cardBackground(input.theme);
  const src = preset ?? input.photo ?? null;
  const cover = src ? await loadImage(src) : null;
  if (cover) {
    const k = Math.max(PW / (cover.naturalWidth || PW), PH / (cover.naturalHeight || PH));
    const cw = (cover.naturalWidth || PW) * k;
    const ch = (cover.naturalHeight || PH) * k;
    const fy = preset ? 0.5 : Math.min(100, Math.max(0, input.coverY ?? 50)) / 100;
    ctx.drawImage(cover, (PW - cw) / 2, (PH - ch) * fy, cw, ch);
  }
  // dark veil, stronger on the text side, so the name always reads
  const g = ctx.createLinearGradient(0, 0, PW, 0);
  g.addColorStop(0, cover ? "rgba(0,0,0,.55)" : "rgba(0,0,0,.15)");
  g.addColorStop(0.45, cover ? "rgba(0,0,0,.72)" : "rgba(0,0,0,.25)");
  g.addColorStop(1, cover ? "rgba(0,0,0,.82)" : "rgba(0,0,0,.35)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PW, PH);

  // round face photo (or the first letter)
  const R = 150;
  const cx = 70 + R;
  const cy = PH / 2;
  const face = input.avatar ? await loadImage(input.avatar) : null;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R + 8, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,.92)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.closePath();
  if (face) {
    ctx.clip();
    const k = Math.max((R * 2) / face.naturalWidth, (R * 2) / face.naturalHeight);
    ctx.drawImage(face, cx - (face.naturalWidth * k) / 2, cy - (face.naturalHeight * k) / 2, face.naturalWidth * k, face.naturalHeight * k);
  } else {
    ctx.fillStyle = p.accent;
    ctx.fill();
    ctx.fillStyle = p.onAccent;
    ctx.font = `800 140px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((input.displayName?.trim() || input.nick.replace(/^@/, ""))[0]?.toUpperCase() ?? "A", cx, cy + 6);
  }
  ctx.restore();

  const tx = cx + R + 60;
  const maxW = PW - tx - 60;
  const name = input.displayName?.trim() || input.nick;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#FFFFFF";
  let fs = 72;
  ctx.font = `800 ${fs}px ${FONT}`;
  while (fs > 40 && ctx.measureText(name).width > maxW) {
    fs -= 4;
    ctx.font = `800 ${fs}px ${FONT}`;
  }
  const rtl = /[\u0590-\u08FF]/.test(name);
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.textAlign = rtl ? "right" : "left";
  ctx.fillText(fit(ctx, name, maxW), rtl ? tx + maxW : tx, 230);
  ctx.direction = "ltr";
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,.82)";
  ctx.font = `600 36px ${FONT}`;
  ctx.fillText(fit(ctx, input.sub || input.nick, maxW), tx, 290);

  // «AMR ID · digital business card» badge
  ctx.font = `700 28px ${FONT}`;
  const badge = `AMR ID · ${input.tag}`;
  const bw = Math.min(maxW, ctx.measureText(badge).width + 40);
  ctx.fillStyle = "#00D4FF";
  rr(ctx, tx, 322, bw, 52, 26);
  ctx.fill();
  ctx.fillStyle = "#0B0E11";
  ctx.textBaseline = "middle";
  ctx.fillText(fit(ctx, badge, bw - 40), tx + 20, 349);

  // services
  const kinds: string[] = [];
  for (const c of input.contacts) if (!kinds.includes(c.kind)) kinds.push(c.kind);
  const size = 64;
  const gap = 16;
  const fitN = Math.max(1, Math.floor((maxW + gap) / (size + gap)));
  kinds.slice(0, fitN).forEach((kind, i) => {
    drawServiceIcon(ctx, kind, tx + i * (size + gap), 410, size);
  });

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,255,255,.7)";
  ctx.font = `500 26px ${FONT}`;
  ctx.fillText(fit(ctx, input.url.replace(/^https?:\/\//, ""), maxW), tx, 548);

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("image"))), "image/jpeg", quality),
  );
}
