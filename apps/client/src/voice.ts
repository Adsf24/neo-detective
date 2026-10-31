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

const FEMALE = /(female|samantha|victoria|karen|moira|tessa|fiona|serena|zira|susan|google uk english female|google us english)/i;
const MALE = /(male|daniel|alex|fred|oliver|arthur|rishi|george|david|google uk english male)/i;

function pickVoice(gender: "female" | "male", seed: string): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
  const pattern = gender === "female" ? FEMALE : MALE;
  const matching = voices.filter((v) => pattern.test(v.name) && !(gender === "female" ? MALE : FEMALE).test(v.name.replace(/female/i, "")));
  const pool = matching.length ? matching : voices;
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
  u.pitch = 0.9 + (hash % 20) / 100;
  u.rate = 0.95 + (hash % 10) / 100;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (canSpeak()) speechSynthesis.cancel();
}
