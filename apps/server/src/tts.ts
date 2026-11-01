// Synthesized speech for witness replies. ElevenLabs is the voice actor; the
// role-play model already chose the delivery. Only lines that were actually
// said in a room are ever voiced, so this cannot be used as an open TTS proxy.

export interface TtsProvider {
  readonly name: string;
  // Returns an MP3 stream.
  synthesize(text: string, voiceId: string): Promise<ReadableStream<Uint8Array>>;
}

export class ElevenLabsTts implements TtsProvider {
  readonly name = "elevenlabs";

  constructor(
    private readonly apiKey: string,
    private readonly model = process.env.ELEVENLABS_MODEL ?? "eleven_v4_turbo",
  ) {}

  async synthesize(text: string, voiceId: string): Promise<ReadableStream<Uint8Array>> {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "content-type": "application/json", "xi-api-key": this.apiKey },
      body: JSON.stringify({ text, model_id: this.model }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok || !res.body) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.body;
  }
}

export function createTts(): TtsProvider | undefined {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key || process.env.TTS_PROVIDER === "off") return undefined;
  return new ElevenLabsTts(key);
}

// The text the actor performs: one stage direction, then the exact subtitle.
export function performance(reply: string, delivery?: string): string {
  return delivery ? `[${delivery}] ${reply}` : reply;
}
