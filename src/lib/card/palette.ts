/** Colours of each card theme, shared by the card page and the shared image. */
import type { CardTheme } from "./visibility.ts";

export type CardPalette = { bg: string; card: string; text: string; muted: string; accent: string; onAccent: string };

export const CARD_PALETTE: Record<CardTheme, CardPalette> = {
  graphite: { bg: "#0B0E11", card: "#171C21", text: "#EEF2F3", muted: "#9AA4AB", accent: "#68D5DF", onAccent: "#072125" },
  gothic: { bg: "#0A0708", card: "#1A1012", text: "#F3E6C8", muted: "#B89A7A", accent: "#C9A227", onAccent: "#140C0E" },
  tactic: { bg: "#16180F", card: "#222616", text: "#E7EDD8", muted: "#A3AD8C", accent: "#E0892F", onAccent: "#16180F" },
  minimal: { bg: "#F6F5F2", card: "#FFFFFF", text: "#1C1C1A", muted: "#5E5E58", accent: "#1C1C1A", onAccent: "#FFFFFF" },
  orbit: { bg: "#05060A", card: "#0E1118", text: "#F4F7FA", muted: "#9AA2B2", accent: "#E8EEF6", onAccent: "#05060A" },
  malachite: { bg: "#07140F", card: "#0E241C", text: "#F0E4C4", muted: "#B0A27E", accent: "#C4A56A", onAccent: "#07140F" },
};
