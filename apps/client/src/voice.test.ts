import { describe, expect, it } from "vitest";
import { phraseDetector } from "./voice";

const RATE = 48_000;
const CHUNK = 4096; // ~85 ms, what the recorder delivers

function chunks(ms: number, level: number): Float32Array[] {
  return Array.from({ length: Math.round(ms / ((CHUNK / RATE) * 1000)) }, () =>
    Float32Array.from({ length: CHUNK }, (_, i) => level * Math.sin(i / 7)),
  );
}

function run(...parts: Float32Array[][]) {
  const detect = phraseDetector(RATE);
  return parts.flat().map(detect);
}

describe("phraseDetector", () => {
  it("waits through room noise without starting a phrase", () => {
    expect(new Set(run(chunks(400, 0.005), chunks(5000, 0.008)))).toEqual(new Set(["waiting"]));
  });

  it("ends a phrase after a short pause, not during it", () => {
    const states = run(chunks(400, 0.005), chunks(1500, 0.2), chunks(500, 0.005), chunks(600, 0.2), chunks(1200, 0.005));
    const first = states.indexOf("ended");
    expect(first).toBeGreaterThan(states.lastIndexOf("speaking") - 1);
    // The half-second breath inside the phrase did not end it.
    expect(states.slice(0, Math.round(2400 / 85.3)).includes("ended")).toBe(false);
    expect(first).toBeGreaterThan(0);
  });

  it("ignores a click shorter than a word", () => {
    const states = run(chunks(400, 0.005), chunks(90, 0.3), chunks(1500, 0.005));
    expect(states.includes("ended")).toBe(false);
  });

  it("cuts a phrase that never pauses", () => {
    expect(run(chunks(400, 0.005), chunks(21_000, 0.2)).includes("ended")).toBe(true);
  });

  it("adapts to a noisy room", () => {
    // Background at 0.05 would count as speech in a quiet room; here it doesn't.
    expect(run(chunks(400, 0.05), chunks(3000, 0.06)).includes("ended")).toBe(false);
    expect(run(chunks(400, 0.05), chunks(1000, 0.4), chunks(1200, 0.06)).includes("ended")).toBe(true);
  });
});
