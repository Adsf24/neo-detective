import type { CompletionRequest, LlmProvider } from "./provider";

// Llama API through its OpenAI-compatible endpoint. Base URL and model ids
// come from the environment so they can be corrected without a code change.
export class LlamaProvider implements LlmProvider {
  readonly name = "llama";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = process.env.LLAMA_BASE_URL ?? "https://api.llama.com/compat/v1",
    private readonly models = {
      fast: process.env.LLAMA_MODEL_FAST ?? "Llama-3.3-8B-Instruct",
      strong: process.env.LLAMA_MODEL_STRONG ?? "Llama-4-Maverick-17B-128E-Instruct-FP8",
    },
  ) {}

  async complete(req: CompletionRequest): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.models[req.tier],
        messages: req.messages,
        max_tokens: req.maxTokens ?? 300,
        temperature: req.temperature ?? (req.tier === "fast" ? 0 : 0.7),
        ...(req.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Llama API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Llama API returned no content");
    return content;
  }
}
