// Browser speech for calls: recognition in, synthesis out. Chrome has both;
// elsewhere the call falls back to typing and reading.

interface RecognitionResultEvent {
  results: { 0: { transcript: string }; isFinal: boolean }[] & { length: number };
}

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}

type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export const canListen = () => typeof window !== "undefined" && !!recognitionCtor();
export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

// Push to talk: start on press, stop on release. Interim text streams into
// `onText`; the player still reviews it before sending.
export function listen(onText: (text: string, final: boolean) => void, onEnd: () => void, onError: (msg: string) => void) {
  const Ctor = recognitionCtor();
  if (!Ctor) {
    onError("Voice input isn't supported in this browser. Type instead.");
    return () => {};
  }
  const rec = new Ctor();
  rec.lang = "en-US";
  rec.interimResults = true;
  rec.continuous = true;
  rec.onresult = (e) => {
    let text = "";
    let final = true;
    for (let i = 0; i < e.results.length; i++) {
      text += e.results[i]![0].transcript;
      final = final && e.results[i]!.isFinal;
    }
    onText(text.trim(), final);
  };
  rec.onerror = (e) => {
    if (e.error !== "aborted" && e.error !== "no-speech") onError(`Microphone: ${e.error}`);
  };
  rec.onend = onEnd;
  rec.start();
  return () => rec.stop();
}

// System voice names differ per OS and browser; match the common ones.
const FEMALE = /\b(female|samantha|victoria|karen|moira|tessa|fiona|serena|zira|susan|allison|ava|kathy|nicky|martha|catherine|flo|sandy|shelley|grandma|joelle|zoe|libby|sonia|emma|jenny|aria|google us english)\b/i;
const MALE = /\b(male|daniel|alex|fred|oliver|arthur|rishi|george|david|reed|rocko|eddy|grandpa|ralph|aaron|gordon|lee|tom|junior|guy|ryan|thomas|mark|james)\b/i;

function pickVoice(gender: "female" | "male", seed: string): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
  const own = gender === "female" ? FEMALE : MALE;
  const other = gender === "female" ? MALE : FEMALE;
  // "Female" contains "male": strip it before testing the other gender.
  const matching = voices.filter((v) => own.test(v.name) && !other.test(gender === "male" ? v.name : v.name.replace(/female/i, "")));
  const pool = matching.length ? matching : [];
  if (!pool.length) return undefined;
  const hash = [...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return pool[hash % pool.length];
}

export function speak(text: string, voice: { gender: "female" | "male" }, seed: string) {
  if (!canSpeak()) return;
  const u = new SpeechSynthesisUtterance(text.replace(/\(([^)]*)\)/g, "")); // stage directions stay silent
  const v = pickVoice(voice.gender, seed);
  if (v) u.voice = v;
  u.lang = v?.lang ?? "en-US";
  // Small per-character variation so two voices from the same pool still differ.
  const hash = [...seed].reduce((h, c) => (h * 17 + c.charCodeAt(0)) >>> 0, 3);
  // No gendered voice found: shift the default voice instead of guessing wrong.
  const base = v ? 0.9 : voice.gender === "male" ? 0.62 : 1.15;
  u.pitch = base + (hash % 20) / 100;
  u.rate = 0.95 + (hash % 10) / 100;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (canSpeak()) speechSynthesis.cancel();
}

// ---------- Recording for Muse Voice Transcribe ----------
// Browsers without speech recognition (iPhone Safari, Firefox) record raw PCM
// through Web Audio, downsampled to 16 kHz mono and wrapped as WAV, which is
// what the Meta transcription endpoint accepts.

export const canRecord = () =>
  typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;

export async function recordWav(): Promise<{ stop: () => Promise<Blob> }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor();
  const source = ctx.createMediaStreamSource(stream);
  // ScriptProcessor is deprecated but is the one capture path every browser still has.
  const node = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  source.connect(node);
  node.connect(ctx.destination);

  return {
    async stop() {
      node.disconnect();
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      const rate = ctx.sampleRate;
      await ctx.close();
      return encodeWav(downsample(concat(chunks), rate, 16_000), 16_000);
    },
  };
}

function concat(chunks: Float32Array[]) {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

function downsample(data: Float32Array, from: number, to: number) {
  if (from === to) return data;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(data.length / ratio));
  for (let i = 0; i < out.length; i++) {
    // Average the source samples that fall into this output sample.
    const start = Math.floor(i * ratio);
    const end = Math.min(data.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += data[j]!;
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

function encodeWav(samples: Float32Array, rate: number) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

export async function transcribe(wav: Blob): Promise<string> {
  const res = await fetch("/api/transcribe", { method: "POST", headers: { "content-type": "audio/wav" }, body: wav });
  const data = (await res.json()) as { text?: string; error?: string };
  if (!res.ok || typeof data.text !== "string") throw new Error(data.error ?? "Couldn't hear that.");
  return data.text;
}
