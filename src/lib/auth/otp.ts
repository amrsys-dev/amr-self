import { randomBytes } from "node:crypto";
import { hashOpaque, safeEqual } from "./password.ts";
import type { OtpChannel } from "../user.ts";

export function generateOtpDigits(): string {
  const n = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return String(n).padStart(6, "0");
}

export type OtpRecord = {
  nick: string;
  purpose: "login" | "signup" | "contact" | "otp-channel" | "delete" | "rebind";
  channel: OtpChannel;
  hash: string;
  exp: number;
  attempts: number;
};

export function hashOtp(code: string): string {
  return hashOpaque(code.replace(/\s+/g, ""));
}

export function otpMatches(code: string, record: OtpRecord): boolean {
  if (Date.now() > record.exp) return false;
  return safeEqual(hashOtp(code), record.hash);
}

export const OTP_TTL_MS = 5 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
