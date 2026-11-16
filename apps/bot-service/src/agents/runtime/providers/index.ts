import { BadRequestException } from "@nestjs/common";
import { modelAccessProblem, requireProviderKey, type AgentModel } from "../models";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { OllamaProvider } from "./ollama";
import { OpenAIProvider } from "./openai";
import type { ModelProvider } from "./types";

/**
 * The provider for a model, with the right key: the business's own from
 * Settings → AI Models, else Suuper's. Throws a readable 400 when neither exists.
 * Create one per run: OpenAI and Gemini keep per-run state (reasoning items, signatures).
 */
export async function createProvider(businessId: string, model: AgentModel): Promise<ModelProvider> {
  // Disabled, or locked to the Pro plan / an own key, but still set on an older
  // bot, agent or workflow step: say so instead of the provider's error.
  const problem = await modelAccessProblem(businessId, model);
  if (problem) throw new BadRequestException(problem);
  if (model.provider === "ollama") return new OllamaProvider();
  const { apiKey, ownKey } = await requireProviderKey(businessId, model.provider);
  switch (model.provider) {
    case "anthropic":
      return new AnthropicProvider(apiKey, model, ownKey);
    case "openai":
      return new OpenAIProvider(apiKey, model, ownKey);
    case "gemini":
      return new GeminiProvider(apiKey, ownKey);
  }
}
