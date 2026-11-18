/** Colours of each card theme, shared by the card page and the shared image. */
import type { CardTheme } from "./visibility.ts";

export type CardPalette = { bg: string; card: string; text: string; muted: string; accent: string; onAccent: string };

export const CARD_PALETTE: Record<CardTheme, CardPalette> = {
  business: { bg: "#0C1220", card: "#182236", text: "#F4F6FA", muted: "#9AA6BC", accent: "#4A90D9", onAccent: "#0C1220" },
  blogger: { bg: "#1A0A14", card: "#2C1224", text: "#FFF0F5", muted: "#D4A0B8", accent: "#FF6B9D", onAccent: "#1A0A14" },
  gamer: { bg: "#0A0E14", card: "#161E2A", text: "#E8F0FF", muted: "#88A0C0", accent: "#00E5FF", onAccent: "#0A0E14" },
  craft: { bg: "#1C1410", card: "#30241C", text: "#F5EDE4", muted: "#C4B0A0", accent: "#D4A574", onAccent: "#1C1410" },
  bakery: { bg: "#1A1210", card: "#2E201C", text: "#FFF5F0", muted: "#E0C0B0", accent: "#E8A090", onAccent: "#1A1210" },
  soft: { bg: "#F8F4F8", card: "#FFFFFF", text: "#2A2030", muted: "#8A7080", accent: "#C070A0", onAccent: "#FFFFFF" },
  graphite: { bg: "#0B0E11", card: "#171C21", text: "#EEF2F3", muted: "#9AA4AB", accent: "#68D5DF", onAccent: "#072125" },
  gothic: { bg: "#0A0708", card: "#1A1012", text: "#F3E6C8", muted: "#B89A7A", accent: "#C9A227", onAccent: "#140C0E" },
  tactic: { bg: "#16180F", card: "#222616", text: "#E7EDD8", muted: "#A3AD8C", accent: "#E0892F", onAccent: "#16180F" },
  minimal: { bg: "#F6F5F2", card: "#FFFFFF", text: "#1C1C1A", muted: "#5E5E58", accent: "#1C1C1A", onAccent: "#FFFFFF" },
  orbit: { bg: "#05060A", card: "#0E1118", text: "#F4F7FA", muted: "#9AA2B2", accent: "#E8EEF6", onAccent: "#05060A" },
  malachite: { bg: "#07140F", card: "#0E241C", text: "#F0E4C4", muted: "#B0A27E", accent: "#C4A56A", onAccent: "#07140F" },
};
