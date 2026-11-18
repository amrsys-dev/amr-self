/**
 * Card backgrounds: one light vector tile per card theme (a few hundred bytes each),
 * drawn in the theme's accent at low opacity. No images to download, sharp on any screen.
 */
import type { CardTheme } from "./visibility.ts";

type Tile = { size: number; color: string; opacity: number; body: string };

const T: Record<CardTheme, Tile | null> = {
  // Graphite: fine engineering grid with node points
  graphite: { size: 48, color: "#68D5DF", opacity: 0.09, body: `<path d="M0 .5H48M.5 0V48" stroke-width="1"/><circle cx=".5" cy=".5" r="1.6" fill="C"/>` },
  minimal: null,
  // Orbit: orbits, planets and stars
  orbit: { size: 180, color: "#9EC5FF", opacity: 0.12, body: `<ellipse cx="90" cy="90" rx="70" ry="26" transform="rotate(-24 90 90)"/><ellipse cx="90" cy="90" rx="44" ry="16" transform="rotate(-24 90 90)"/><circle cx="90" cy="90" r="7" fill="C"/><circle cx="148" cy="62" r="3.5" fill="C"/><circle cx="38" cy="114" r="2.5" fill="C"/><path d="M24 24l2 5 5 2-5 2-2 5-2-5-5-2 5-2zM156 150l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z" fill="C" stroke="none"/><circle cx="120" cy="20" r="1.2" fill="C"/><circle cx="20" cy="160" r="1.2" fill="C"/>` },
  // Business: pinstripes and a gold monogram corner like premium paper
  business: { size: 120, color: "#C9A44C", opacity: 0.12, body: `<path d="M0 120L120 0M-30 30L30 -30M90 150L150 90" stroke-width=".8"/><path d="M60 52l8 8-8 8-8-8z" stroke-width="1.2"/><path d="M60 56l4 4-4 4-4-4z" fill="C" stroke="none"/>` },
  // Malachite: banded green stone
  malachite: { size: 160, color: "#7FE3B0", opacity: 0.13, body: `<path d="M0 36Q40 6 80 36T160 36"/><path d="M0 52Q40 22 80 52T160 52"/><path d="M0 70Q40 40 80 70T160 70" stroke-width="2.2"/><path d="M0 112Q40 86 80 112T160 112"/><path d="M0 128Q40 102 80 128T160 128"/>` },
  // Blogger: play, like, live dot, comment, camera, sparkle
  blogger: { size: 168, color: "#FF6B9D", opacity: 0.15, body: `<rect x="14" y="16" width="34" height="24" rx="7"/><path d="M28 23l9 5-9 5z" fill="C" stroke="none"/><path d="M118 30c-4-6-14-4-14 4 0 7 14 14 14 14s14-7 14-14c0-8-10-10-14-4z"/><circle cx="76" cy="84" r="4" fill="C" stroke="none"/><path d="M84 84h22"/><path d="M20 112h40a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6H40l-10 8v-8h-10a6 6 0 0 1-6-6v-14a6 6 0 0 1 6-6z"/><rect x="108" y="116" width="40" height="28" rx="6"/><circle cx="128" cy="130" r="8"/><path d="M114 116l4-6h12l4 6"/><path d="M150 70l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="C" stroke="none"/>` },
  // Gamer: crosshair (shooters), d-pad (fighting), hex tiles (strategy), action buttons
  gamer: { size: 176, color: "#00E5FF", opacity: 0.14, body: `<circle cx="36" cy="36" r="16"/><path d="M36 14v10M36 48v10M14 36h10M48 36h10"/><circle cx="36" cy="36" r="2.5" fill="C" stroke="none"/><path d="M112 22h12v12h12v12h-12v12h-12V46h-12V34h12z"/><path d="M38 100l14 8v16l-14 8-14-8v-16zM66 100l14 8v16l-14 8-14-8v-16z"/><path d="M128 112l8 13h-16z"/><circle cx="148" cy="118" r="7"/><path d="M118 136l10 10M128 136l-10 10"/><rect x="141" y="136" width="13" height="13"/><path d="M88 160h4v-4h4v-4h4v4h4v4h4" stroke-width="2"/>` },
  // Craft: wood grain and tools
  craft: { size: 160, color: "#D4A574", opacity: 0.13, body: `<path d="M0 30C40 24 80 40 160 30M0 46C50 40 90 56 160 46"/><path d="M110 92l26 26M128 86l14 14-8 8-14-14z"/><path d="M24 98h46v10H24zM70 100l12 3-12 3"/><path d="M0 140C50 132 100 150 160 140"/><circle cx="60" cy="40" r="5"/>` },
  // Bakery: wheat ears, croissant, crumbs
  bakery: { size: 160, color: "#E8A090", opacity: 0.15, body: `<path d="M30 120V40"/><path d="M30 52c-8-4-10-12-8-18 6 2 10 8 8 18zM30 52c8-4 10-12 8-18-6 2-10 8-8 18zM30 72c-8-4-10-12-8-18 6 2 10 8 8 18zM30 72c8-4 10-12 8-18-6 2-10 8-8 18zM30 92c-8-4-10-12-8-18 6 2 10 8 8 18zM30 92c8-4 10-12 8-18-6 2-10 8-8 18z"/><path d="M90 110c10-26 50-26 60 0-8-6-14-6-20-2-6-6-14-6-20 0-6-4-12-4-20 2z"/><path d="M110 92l4 12M126 90v14"/><circle cx="100" cy="40" r="2" fill="C" stroke="none"/><circle cx="130" cy="30" r="1.5" fill="C" stroke="none"/><circle cx="70" cy="140" r="2" fill="C" stroke="none"/>` },
  // Soft: petals and dots
  soft: { size: 140, color: "#C070A0", opacity: 0.13, body: `<path d="M40 40c0-12 16-12 16 0 12 0 12 16 0 16 0 12-16 12-16 0-12 0-12-16 0-16z" transform="translate(-8 -8)"/><circle cx="40" cy="40" r="3" fill="C" stroke="none"/><circle cx="104" cy="96" r="12"/><circle cx="104" cy="96" r="4" fill="C" stroke="none"/><circle cx="110" cy="30" r="2" fill="C" stroke="none"/><circle cx="30" cy="110" r="2" fill="C" stroke="none"/>` },
  // Gothic: arches and stars
  gothic: { size: 120, color: "#C9A227", opacity: 0.12, body: `<path d="M20 110V60c0-24 40-24 40 0v50"/><path d="M30 110V64c0-14 20-14 20 0v46"/><path d="M90 24l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="C" stroke="none"/><path d="M90 70v30M75 85h30"/>` },
  // Tactic: topographic lines and target marks
  tactic: { size: 180, color: "#E0892F", opacity: 0.13, body: `<path d="M-10 50C30 20 70 70 110 40S170 30 190 50"/><path d="M-10 70C30 40 70 90 110 60S170 50 190 70"/><path d="M-10 130C40 110 80 150 120 125S170 115 190 130"/><circle cx="140" cy="100" r="12"/><path d="M140 82v8M140 110v8M122 100h8M150 100h8"/><path d="M30 150l6-10 6 10z" fill="C" stroke="none"/>` },
};

export function cardPatternUrl(theme: CardTheme): string | null {
  const t = T[theme];
  if (!t) return null;
  const body = t.body.replace(/"C"/g, `"${t.color}"`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${t.size}" height="${t.size}" viewBox="0 0 ${t.size} ${t.size}" fill="none" stroke="${t.color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity="${t.opacity}">${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function cardPatternSize(theme: CardTheme): number {
  return T[theme]?.size ?? 0;
}
