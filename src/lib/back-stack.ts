/**
 * One standard for the phone's Back gesture across SELF:
 * every open layer (sub-screen, sheet, menu, modal, non-home tab) adds one history step;
 * Back closes the top layer only. Closing a layer by a button removes its step quietly.
 */
import { useEffect, useRef } from "react";

type Layer = { close: () => void };
const stack: Layer[] = [];
let pendingBacks = 0;
let queuedPushes = 0;
let listening = false;

function push() {
  if (pendingBacks > 0) {
    queuedPushes++;
    return;
  }
  try {
    history.pushState({ ...(history.state ?? {}), amrLayer: stack.length }, "");
  } catch {
    /* ignore */
  }
}

function onPop() {
  if (pendingBacks > 0) {
    pendingBacks--;
    if (pendingBacks === 0) {
      const n = queuedPushes;
      queuedPushes = 0;
      for (let i = 0; i < n; i++) push();
    }
    return;
  }
  const top = stack.pop();
  if (top) top.close();
}

function ensureListener() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("popstate", onPop);
}

/** While `open` is true, the Back gesture calls `close`. */
export function useBackLayer(open: boolean, close: () => void): void {
  const ref = useRef(close);
  ref.current = close;
  useEffect(() => {
    if (!open) return undefined;
    ensureListener();
    const layer: Layer = { close: () => ref.current() };
    stack.push(layer);
    push();
    return () => {
      const i = stack.lastIndexOf(layer);
      if (i < 0) return; // already closed by Back
      stack.splice(i, 1);
      if (queuedPushes > 0) {
        queuedPushes--; // its step was never added
        return;
      }
      pendingBacks++;
      try {
        history.back();
      } catch {
        pendingBacks--;
      }
    };
  }, [open]);
}
