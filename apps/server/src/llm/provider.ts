import type { ChatMessage } from "@neo/engine";

export type ModelTier = "fast" | "strong";

export interface CompletionRequest {
  tier: ModelTier;
  messages: ChatMessage[];
  json: boolean;
  maxTokens?: number;
  temperature?: number;
}

// The only way the server talks to a model. Swap implementations, not call sites.
export interface LlmProvider {
  readonly name: string;
  complete(req: CompletionRequest): Promise<string>;
  // Speech to text for 16-bit PCM WAV. Undefined when the provider can't.
  transcribe?(wav: Buffer): Promise<string>;
}
