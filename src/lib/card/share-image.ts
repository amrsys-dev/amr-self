/**
 * The card as a small JPEG (540 px wide, tens of kilobytes) for sending in a chat:
 * nick, every visible contact with its service icon, and a QR code to the card page.
 * Browser only (canvas).
 */
import { cardPatternUrl } from "./patterns.ts";
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
  /** Name on the card (any language); the nick goes under it. */
  displayName?: string;
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
  // The theme's background pattern, the same as on the card page
  const pat = cardPatternUrl(input.theme);
  if (pat) {
    try {
      const img = new Image();
      img.src = pat.slice(5, -2); // url("...") -> data URL
      await img.decode();
      // Check on a scratch canvas that the SVG does not block export (some browsers taint it)
      const probe = document.createElement("canvas");
      probe.width = probe.height = 4;
      const pc = probe.getContext("2d")!;
      pc.drawImage(img, 0, 0);
      pc.getImageData(0, 0, 1, 1);
      const fill = ctx.createPattern(img, "repeat");
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fillRect(0, 0, W, H);
      }
    } catch {
      /* plain background */
    }
  }

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
  const title = input.displayName?.trim() || input.nick;
  ctx.direction = /[\u0590-\u08FF]/.test(title) ? "rtl" : "ltr";
  ctx.textAlign = ctx.direction === "rtl" ? "right" : "left";
  const tx0 = ctx.direction === "rtl" ? W - PAD : PAD + 96;
  ctx.fillText(fit(ctx, title, W - PAD * 2 - 96), tx0, PAD + 8);
  ctx.direction = "ltr";
  ctx.textAlign = "left";
  ctx.fillStyle = p.muted;
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
    const s = SERVICE[c.kind] ?? SERVICE.other;
    const ix = lx + 12;
    const iy = y + 12;
    if (s.bg !== "none") {
      if (s.bg.startsWith("radial-gradient")) {
        // Instagram: canvas cannot take a CSS gradient, so draw the same brand gradient
        const g = ctx.createRadialGradient(ix + 12, iy + 43, 2, ix + 12, iy + 43, 52);
        g.addColorStop(0, "#FDF497");
        g.addColorStop(0.05, "#FDF497");
        g.addColorStop(0.45, "#FD5949");
        g.addColorStop(0.6, "#D6249F");
        g.addColorStop(0.9, "#285AEB");
        ctx.fillStyle = g;
      } else ctx.fillStyle = s.bg;
      rr(ctx, ix, iy, 40, 40, 11);
      ctx.fill();
    }
    ctx.save();
    const k = s.full ? 40 / 24 : 25 / 24;
    ctx.translate(ix + (40 - 24 * k) / 2, iy + (40 - 24 * k) / 2);
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
