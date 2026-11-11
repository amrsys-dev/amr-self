import type { CardTheme } from "@/lib/card/visibility.ts";

function ticks(count: number, r0: number, r1fn: (i: number) => number, cx = 124, cy = 124) {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2;
    const r1 = r1fn(i);
    return (
      <line
        key={i}
        x1={+(cx + Math.cos(a) * r0).toFixed(2)}
        y1={+(cy + Math.sin(a) * r0).toFixed(2)}
        x2={+(cx + Math.cos(a) * r1).toFixed(2)}
        y2={+(cy + Math.sin(a) * r1).toFixed(2)}
      />
    );
  });
}

function Graphite() {
  return (
    <svg className="orn" viewBox="0 0 248 248" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="gWood" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#D4B89E" />
          <stop offset="1" stopColor="#8A6A4E" />
        </linearGradient>
        <linearGradient id="gSteel" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#C5CED4" />
          <stop offset="1" stopColor="#6D7B85" />
        </linearGradient>
        <linearGradient id="gCyan" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#68D5DF" />
          <stop offset="1" stopColor="#1E8A96" />
        </linearGradient>
      </defs>
      <g className="spin" stroke="url(#gSteel)" strokeWidth="1.2" opacity=".85">
        {ticks(24, 116, (i) => (i % 3 === 0 ? 124 : 121))}
      </g>
      <circle className="spinr" cx="124" cy="124" r="110" stroke="url(#gWood)" strokeWidth="1.35" strokeDasharray="3.5 9" opacity=".9" />
      <g className="spinr" stroke="url(#gCyan)" strokeWidth="1.8" strokeLinecap="round">
        <path d="M124 6 A118 118 0 0 1 226 90" opacity=".95" />
        <path d="M226 158 A118 118 0 0 1 124 242" opacity=".95" />
        <path d="M22 158 A118 118 0 0 1 22 90" opacity=".95" />
      </g>
      <g stroke="url(#gSteel)" strokeWidth="1.6" strokeLinecap="square" opacity=".9">
        <path d="M28 50 V28 H50" />
        <path d="M220 50 V28 H198" />
        <path d="M28 198 V220 H50" />
        <path d="M220 198 V220 H198" />
      </g>
    </svg>
  );
}

function Gothic() {
  return (
    <svg className="orn" viewBox="0 0 248 248" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="gOld" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F0D48A" />
          <stop offset="1" stopColor="#8A6414" />
        </linearGradient>
        <linearGradient id="gRed" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#8B1E1E" />
          <stop offset="1" stopColor="#C45A3A" />
        </linearGradient>
      </defs>
      <path d="M124 10 C124 10 28 86 28 150 C28 200 70 230 124 230 C178 230 220 200 220 150 C220 86 124 10 124 10 Z" stroke="url(#gOld)" strokeWidth="1.7" />
      <path d="M124 22 C124 22 40 90 40 150 C40 192 76 218 124 218 C172 218 208 192 208 150 C208 90 124 22 124 22 Z" stroke="url(#gRed)" strokeWidth="1.1" opacity=".9" />
      <g className="spin" stroke="url(#gOld)" strokeWidth="1" opacity=".75">
        {ticks(16, 118, (i) => (i % 2 === 0 ? 125 : 121))}
      </g>
      <g stroke="url(#gOld)" strokeWidth="1.4" strokeLinecap="square">
        <path d="M36 64 L36 36 L64 36" />
        <path d="M212 64 L212 36 L184 36" />
        <path d="M36 184 L36 212 L64 212" />
        <path d="M212 184 L212 212 L184 212" />
      </g>
    </svg>
  );
}

function Tactic() {
  return (
    <svg className="orn" viewBox="0 0 248 248" fill="none" aria-hidden="true">
      <rect x="18" y="18" width="212" height="212" stroke="#6B7A4A" strokeWidth="1" strokeDasharray="3 5" opacity=".85" />
      <g stroke="#E0892F" strokeWidth="1.6" strokeLinecap="square">
        <path d="M18 48 V18 H48" />
        <path d="M230 48 V18 H200" />
        <path d="M18 200 V230 H48" />
        <path d="M230 200 V230 H200" />
      </g>
      <circle cx="124" cy="124" r="116" stroke="#8A9A5A" strokeWidth="0.8" opacity=".55" />
      <g stroke="#E0892F" strokeWidth="1.1" opacity=".9">
        <path d="M124 6 V22" />
        <path d="M124 226 V242" />
        <path d="M6 124 H22" />
        <path d="M226 124 H242" />
      </g>
      <g className="spin" stroke="#A3AD8C" strokeWidth="1" opacity=".7">
        {ticks(12, 112, () => 117)}
      </g>
    </svg>
  );
}

function Minimal() {
  return (
    <svg className="orn" viewBox="0 0 248 248" fill="none" aria-hidden="true">
      <rect x="28" y="28" width="192" height="192" stroke="#1C1C1A" strokeWidth="1" />
      <g stroke="#1C1C1A" strokeWidth="1" strokeLinecap="square">
        <path d="M20 28 H36 M28 20 V36" />
        <path d="M220 20 V36 M212 28 H228" />
        <path d="M20 220 H36 M28 212 V228" />
        <path d="M220 212 V228 M212 220 H228" />
      </g>
    </svg>
  );
}

function Orbit() {
  return (
    <svg className="orn" viewBox="0 0 248 248" fill="none" aria-hidden="true">
      <ellipse className="spinr" cx="124" cy="124" rx="118" ry="52" stroke="#E8EEF6" strokeWidth="1" opacity=".85" transform="rotate(-18 124 124)" />
      <ellipse className="spin" cx="124" cy="124" rx="118" ry="70" stroke="#A8B4C8" strokeWidth="0.9" opacity=".7" transform="rotate(32 124 124)" />
      <ellipse className="spinr" cx="124" cy="124" rx="110" ry="110" stroke="#F4F7FA" strokeWidth="0.7" strokeDasharray="2 8" opacity=".8" />
      <circle cx="124" cy="14" r="2.2" fill="#F4F7FA" stroke="none" />
      <circle cx="214" cy="86" r="1.6" fill="#C5CDD8" stroke="none" />
      <circle cx="40" cy="168" r="1.4" fill="#E8EEF6" stroke="none" />
    </svg>
  );
}

function Malachite() {
  return (
    <svg className="orn" viewBox="0 0 248 248" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="gBrz" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E8D5A8" />
          <stop offset="1" stopColor="#8C6A3C" />
        </linearGradient>
      </defs>
      <rect x="22" y="22" width="204" height="204" rx="10" stroke="url(#gBrz)" strokeWidth="1.7" />
      <rect x="30" y="30" width="188" height="188" rx="6" stroke="#8C6A3C" strokeWidth="0.9" opacity=".85" />
      <g className="spinr" stroke="url(#gBrz)" strokeWidth="1.1" strokeDasharray="4 8" opacity=".8">
        <rect x="14" y="14" width="220" height="220" rx="14" />
      </g>
      <g stroke="url(#gBrz)" strokeWidth="1.4" strokeLinecap="square">
        <path d="M22 52 V22 H52" />
        <path d="M226 52 V22 H196" />
        <path d="M22 196 V226 H52" />
        <path d="M226 196 V226 H196" />
      </g>
    </svg>
  );
}

export function Ornament({ theme }: { theme: CardTheme }) {
  if (theme === "gothic") return <Gothic />;
  if (theme === "tactic") return <Tactic />;
  if (theme === "minimal") return <Minimal />;
  if (theme === "orbit") return <Orbit />;
  if (theme === "malachite") return <Malachite />;
  return <Graphite />;
}
