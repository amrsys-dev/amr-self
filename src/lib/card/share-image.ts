/**
 * The card as a small JPEG (540 px wide, tens of kilobytes) for sending in a chat:
 * nick, every visible contact with its service icon, and a QR code to the card page.
 * Browser only (canvas).
 */
import { encode } from "uqr";
import type { CardTheme, PublicContact } from "./visibility.ts";
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
  url: string;
  theme: CardTheme;
  contacts: readonly PublicContact[];
  /** Service name, e.g. "Telegram". */
  name: (c: PublicContact) => string;
  /** The username, number or address itself, e.g. "@amr_userb" or "+966 57…". */
  value: (c: PublicContact) => string;
  photo?: string | null;
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
  const p = CARD_PALETTE[input.theme] ?? CARD_PALETTE.graphite;
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

  // Header: round photo or first letter, nick, "AMR ID"
  const ax = PAD + 38;
  const ay = PAD + 38;
  const photo = input.photo ? await loadImage(input.photo) : null;
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
  ctx.fillStyle = p.text;
  ctx.font = `800 34px ${FONT}`;
  ctx.fillText(fit(ctx, input.nick, W - PAD * 2 - 96), PAD + 96, PAD + 8);
  ctx.fillStyle = p.muted;
  ctx.font = `600 17px ${FONT}`;
  ctx.fillText("AMR ID", PAD + 96, PAD + 50);

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
    const s = SERVICE[c.kind] ?? SERVICE.other;
    const ix = lx + 12;
    const iy = y + 12;
    ctx.fillStyle = s.bg;
    rr(ctx, ix, iy, 40, 40, 11);
    ctx.fill();
    ctx.save();
    ctx.translate(ix + 8, iy + 8);
    ctx.lineWidth = 1.9;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = s.fg;
    ctx.fillStyle = s.fg;
    for (const path of s.paths) {
      const p2 = new Path2D(path.d);
      if (path.fill) ctx.fill(p2);
      else ctx.stroke(p2);
    }
    ctx.restore();
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

  ctx.fillStyle = p.muted;
  ctx.font = `500 16px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(fit(ctx, input.url.replace(/^https?:\/\//, ""), W - PAD * 2), W / 2, top + bodyH + 26);

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("image"))), "image/jpeg", quality),
  );
}
