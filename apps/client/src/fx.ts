// Tactile layer: tiny synthesized sounds, haptics, press ripples and
// particle bursts. Everything is decoration — it must never block input,
// so every element it adds is pointer-events: none.

type Sound = "click" | "unlock" | "rattle" | "pin" | "seal" | "bell" | "reveal" | "sparkle" | "stamp";

let ctx: AudioContext | null = null;
let muted = (() => {
  try {
    return localStorage.getItem("neo.muted") === "1";
  } catch {
    return false;
  }
})();

export const isMuted = () => muted;
export function setMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem("neo.muted", value ? "1" : "0");
  } catch {
    // Storage may be blocked; the preference just won't persist.
  }
}

function audio(): AudioContext | null {
  if (muted || typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(a: AudioContext, freq: number, at: number, dur: number, type: OscillatorType, gain: number, slideTo?: number) {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime + at);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + at + dur);
  g.gain.setValueAtTime(0.0001, a.currentTime + at);
  g.gain.exponentialRampToValueAtTime(gain, a.currentTime + at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + at + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + at);
  o.stop(a.currentTime + at + dur + 0.02);
}

function noise(a: AudioContext, at: number, dur: number, gain: number, freq: number) {
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(a.destination);
  src.start(a.currentTime + at);
}

export function play(sound: Sound) {
  const a = audio();
  if (!a) return;
  switch (sound) {
    case "click":
      noise(a, 0, 0.03, 0.35, 2400);
      tone(a, 1800, 0, 0.025, "square", 0.02);
      return;
    case "rattle":
      for (let i = 0; i < 4; i++) noise(a, i * 0.05, 0.04, 0.4, 1500 + i * 200);
      return;
    case "unlock":
      noise(a, 0, 0.05, 0.5, 900);
      tone(a, 660, 0.08, 0.12, "triangle", 0.08);
      tone(a, 990, 0.16, 0.25, "triangle", 0.07);
      noise(a, 0.18, 0.06, 0.4, 1200);
      return;
    case "pin":
      tone(a, 180, 0, 0.12, "sine", 0.18, 90);
      noise(a, 0, 0.04, 0.3, 700);
      return;
    case "seal":
      for (let i = 0; i < 6; i++) noise(a, i * 0.025, 0.05, 0.35, 500 + Math.random() * 1500);
      return;
    case "bell":
      tone(a, 1318, 0, 0.6, "sine", 0.06);
      tone(a, 1976, 0, 0.4, "sine", 0.03);
      tone(a, 1318, 0.18, 0.5, "sine", 0.04);
      return;
    case "reveal":
      [523, 659, 784, 1047].forEach((f, i) => tone(a, f, i * 0.07, 0.5, "triangle", 0.05));
      return;
    case "sparkle":
      [1568, 2093, 2637].forEach((f, i) => tone(a, f, i * 0.05, 0.18, "sine", 0.035));
      return;
    case "stamp":
      tone(a, 120, 0, 0.18, "sine", 0.25, 60);
      noise(a, 0, 0.08, 0.6, 400);
      return;
  }
}

export function buzz(pattern: number | number[] = 8) {
  try {
    if (!muted) navigator.vibrate?.(pattern);
  } catch {
    // Not supported (iOS Safari) — fine.
  }
}

// A ring that spreads from the press point inside the pressed button.
function ripple(button: HTMLElement, x: number, y: number) {
  const r = button.getBoundingClientRect();
  const dot = document.createElement("span");
  dot.className = "fx-ripple";
  const size = Math.max(r.width, r.height) * 1.6;
  dot.style.width = dot.style.height = `${size}px`;
  dot.style.left = `${x - r.left - size / 2}px`;
  dot.style.top = `${y - r.top - size / 2}px`;
  button.appendChild(dot);
  dot.addEventListener("animationend", () => dot.remove());
}

export function installPressFeedback() {
  document.addEventListener(
    "pointerdown",
    (e) => {
      const button = (e.target as HTMLElement | null)?.closest?.("button, .button-link") as HTMLElement | null;
      if (!button || (button as HTMLButtonElement).disabled) return;
      ripple(button, e.clientX, e.clientY);
      play("click");
      buzz(6);
    },
    { passive: true },
  );
}

// Particles that fly out from a point: sparks for findings, gold dust for victory.
export function burst(x: number, y: number, kind: "spark" | "gold" | "ember" = "spark", count = 14) {
  const layer = document.createElement("div");
  layer.className = "fx-layer";
  document.body.appendChild(layer);
  for (let i = 0; i < count; i++) {
    const p = document.createElement("span");
    p.className = `fx-particle fx-${kind}`;
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const dist = 40 + Math.random() * (kind === "gold" ? 160 : 70);
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    p.style.setProperty("--dy", `${Math.sin(angle) * dist + (kind === "gold" ? 80 : 0)}px`);
    p.style.animationDelay = `${Math.random() * 120}ms`;
    layer.appendChild(p);
  }
  setTimeout(() => layer.remove(), 1600);
}

// A ghost card that flies from an element to a target (the Board tab).
export function flyTo(from: Element, toSelector: string, label: string) {
  const target = document.querySelector(toSelector);
  if (!target) return;
  const a = from.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const ghost = document.createElement("div");
  ghost.className = "fx-ghost";
  ghost.textContent = label;
  ghost.style.left = `${a.left + a.width / 2}px`;
  ghost.style.top = `${a.top + a.height / 2}px`;
  ghost.style.setProperty("--tx", `${b.left + b.width / 2 - (a.left + a.width / 2)}px`);
  ghost.style.setProperty("--ty", `${b.top + b.height / 2 - (a.top + a.height / 2)}px`);
  document.body.appendChild(ghost);
  ghost.addEventListener("animationend", () => ghost.remove());
}

// A full-screen flash for big moments (a witness gives something away).
export function flash(kind: "gold" | "wax" = "gold") {
  const f = document.createElement("div");
  f.className = `fx-flash fx-flash-${kind}`;
  document.body.appendChild(f);
  f.addEventListener("animationend", () => f.remove());
}
