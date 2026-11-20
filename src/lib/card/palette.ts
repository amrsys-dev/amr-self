/** Colours of each card theme, shared by the card page and the shared image. */
import type { CardTheme } from "./visibility.ts";

export type CardPalette = { bg: string; card: string; text: string; muted: string; accent: string; onAccent: string };

export const CARD_PALETTE: Record<CardTheme, CardPalette> = {
  own: { bg: "#0B0E11", card: "#171C21", text: "#EEF2F3", muted: "#9AA4AB", accent: "#68D5DF", onAccent: "#072125" },
  business: { bg: "#0C1220", card: "#182236", text: "#F4F6FA", muted: "#9AA6BC", accent: "#C9A55A", onAccent: "#0C1220" },
  owner: { bg: "#0C0A07", card: "#1C170E", text: "#F6EBD0", muted: "#BBA77A", accent: "#E6C266", onAccent: "#1A1408" },
  taxi: { bg: "#151515", card: "#222", text: "#FFFFFF", muted: "#C9C9C9", accent: "#FFD23F", onAccent: "#111111" },
  gamer: { bg: "#0A0614", card: "#1A1030", text: "#F0E8FF", muted: "#A898C8", accent: "#00E5FF", onAccent: "#0A0614" },
  blogger: { bg: "#1A0A14", card: "#2C1224", text: "#FFF0F5", muted: "#D4A0B8", accent: "#FF6B9D", onAccent: "#1A0A14" },
  craft: { bg: "#1C1410", card: "#30241C", text: "#F5EDE4", muted: "#C4B0A0", accent: "#D4A574", onAccent: "#1C1410" },
  sew: { bg: "#1E1218", card: "#321E28", text: "#FFF0F6", muted: "#E0B4C8", accent: "#E88AAE", onAccent: "#1E1218" },
  bakery: { bg: "#1A1210", card: "#2E201C", text: "#FFF5F0", muted: "#E0C0B0", accent: "#E8A090", onAccent: "#1A1210" },
};
