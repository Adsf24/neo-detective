import type { CompletionRequest, LlmProvider } from "./provider";

// Meta Model API through its OpenAI-compatible endpoint. Base URL and model
// ids come from the environment so they can be changed without a code change.
// The Muse models reason before answering; reasoning tokens count against
// max_tokens, so the budget leaves room for both and the effort stays minimal.
export class LlamaProvider implements LlmProvider {
  readonly name = "meta";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = process.env.LLAMA_BASE_URL ?? "https://api.meta.ai/v1",
    private readonly models = {
      fast: process.env.LLAMA_MODEL_FAST ?? "muse-spark-1.1",
      strong: process.env.LLAMA_MODEL_STRONG ?? "muse-spark-1.3",
    },
    private readonly effort = process.env.LLAMA_REASONING_EFFORT ?? "minimal",
  ) {}

  async complete(req: CompletionRequest): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.models[req.tier],
        messages: req.messages,
        max_tokens: (req.maxTokens ?? 300) + 700,
        reasoning_effort: this.effort,
        temperature: req.temperature ?? (req.tier === "fast" ? 0 : 0.7),
        ...(req.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) throw new Error(`Llama API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Llama API returned no content");
    return content;
  }
}
