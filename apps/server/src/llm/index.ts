import { LlamaProvider } from "./llama";
import type { LlmProvider } from "./provider";
import { ScriptedProvider } from "./scripted";

export function createProvider(): LlmProvider {
  const key = process.env.LLAMA_API_KEY?.trim();
  if (key && process.env.LLM_PROVIDER !== "scripted") return new LlamaProvider(key);
  return new ScriptedProvider();
}

export type { CompletionRequest, LlmProvider, ModelTier } from "./provider";
export { LlamaProvider, ScriptedProvider };
