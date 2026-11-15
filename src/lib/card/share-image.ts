/**
 * The card as a small JPEG (540 px wide, tens of kilobytes) for sending in a chat:
 * nick, every visible contact with its service icon, and a QR code to the card page.
 * Browser only (canvas).
 */
import { encode } from "uqr";
import type { CardTheme, PublicContact } from "./visibility.ts";
import { CARD_PALETTE } from "./palette.ts";
import { SERVICE } from "../../components/contact-icons.tsx";

const W = 540;
const PAD = 28;
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
  name: (c: PublicContact) => string;
  detail: (c: PublicContact) => string;
};

export async function renderCardImage(input: ShareImageInput, quality = 0.8): Promise<Blob> {
  const p = CARD_PALETTE[input.theme] ?? CARD_PALETTE.graphite;
  const rows = input.contacts.filter((c) => c.href);
  const QR = 168;
  const H = PAD + 84 + 14 + 40 + 6 + 22 + 22 + rows.length * (ROW + GAP) + 12 + QR + 24 + 22 + PAD;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, W, H);

  // Avatar with the first letter
  let y = PAD;
  ctx.fillStyle = p.accent;
  ctx.beginPath();
  ctx.arc(W / 2, y + 42, 42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = p.onAccent;
  ctx.font = `700 40px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText((input.nick.replace(/^@/, "")[0] ?? "A").toUpperCase(), W / 2, y + 44);
  y += 84 + 14;

  ctx.fillStyle = p.text;
  ctx.font = `800 34px ${FONT}`;
  ctx.textBaseline = "top";
  ctx.fillText(fit(ctx, input.nick, W - PAD * 2), W / 2, y);
  y += 40 + 6;
  ctx.fillStyle = p.muted;
  ctx.font = `600 17px ${FONT}`;
  ctx.fillText("AMR ID", W / 2, y);
  y += 22 + 22;

  // Contact rows
  ctx.textAlign = "left";
  for (const c of rows) {
    ctx.fillStyle = p.card;
    rr(ctx, PAD, y, W - PAD * 2, ROW, 16);
    ctx.fill();
    const s = SERVICE[c.kind] ?? SERVICE.other;
    const ix = PAD + 12;
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
    const tx = ix + 40 + 14;
    const maxW = W - PAD * 2 - (tx - PAD) - 14;
    ctx.fillStyle = p.text;
    ctx.font = `700 18px ${FONT}`;
    ctx.textBaseline = "top";
    ctx.fillText(fit(ctx, input.name(c), maxW), tx, y + 12);
    ctx.fillStyle = p.muted;
    ctx.font = `500 15px ${FONT}`;
    ctx.fillText(fit(ctx, input.detail(c), maxW), tx, y + 36);
    y += ROW + GAP;
  }
  y += 12;

  // QR code on white so any camera reads it
  const { data, size } = encode(input.url, { ecc: "M" });
  const qx = (W - QR) / 2;
  ctx.fillStyle = "#FFFFFF";
  rr(ctx, qx, y, QR, QR, 14);
  ctx.fill();
  const inner = QR - 20;
  const cell = inner / size;
  ctx.fillStyle = "#000000";
  for (let r = 0; r < size; r++) {
    for (let q = 0; q < size; q++) {
      if (data[r]![q]) ctx.fillRect(qx + 10 + q * cell, y + 10 + r * cell, Math.ceil(cell), Math.ceil(cell));
    }
  }
  y += QR + 24;
  ctx.fillStyle = p.muted;
  ctx.font = `500 15px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(fit(ctx, input.url.replace(/^https?:\/\//, ""), W - PAD * 2), W / 2, y);

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("image"))), "image/jpeg", quality),
  );
}
