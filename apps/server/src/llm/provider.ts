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
}
