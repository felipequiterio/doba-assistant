import "dotenv/config";
import { getModel } from "@mariozechner/pi-ai";
import type { Model, OpenAICompletionsCompat } from "@mariozechner/pi-ai";

// --- Provider selection ---

export type LlmProvider = "ollama" | "openrouter";

/**
 * Re-exported from pi-agent-core so callers don't need a direct dependency.
 * Full range: "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
 * Practical values used in this system: "off" (CRUD), "low" (analysis), "high" (deep reasoning)
 */
export type { ThinkingLevel } from "@mariozechner/pi-agent-core";

export const LLM_PROVIDER: LlmProvider =
  (process.env.LLM_PROVIDER as LlmProvider) || "ollama";

// --- API key resolution ---

/**
 * Returns the API key for a given provider by reading {PROVIDER}_API_KEY
 * from the environment. Works as both a direct call and as the `getApiKey`
 * callback expected by pi-agent-core's Agent constructor.
 */
export function resolveApiKey(provider: string): string | undefined {
  const envKey = `${provider.toUpperCase().replace(/-/g, "_")}_API_KEY`;
  return process.env[envKey];
}

// --- Ollama model definitions ---

const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1";

const ollamaCompat: OpenAICompletionsCompat = {
  supportsStore: false,
  supportsDeveloperRole: false,
  supportsReasoningEffort: false,
  supportsUsageInStreaming: true,
  maxTokensField: "max_tokens",
  requiresToolResultName: false,
  requiresAssistantAfterToolResult: false,
  requiresThinkingAsText: false,
  requiresMistralToolIds: false,
  supportsStrictMode: false,
  thinkingFormat: "openai",
};

const ollamaThinkingCompat: OpenAICompletionsCompat = {
  ...ollamaCompat,
  thinkingFormat: "qwen",
};

function buildOllamaModels() {
  const router: Model<"openai-completions"> = {
    id: "qwen3.5:9b",
    name: "Qwen3.5 9B (Router)",
    api: "openai-completions",
    provider: "ollama",
    baseUrl: OLLAMA_BASE_URL,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32768,
    maxTokens: 4096,
    compat: ollamaCompat,
  };

  const worker: Model<"openai-completions"> = {
    id: "qwen3.5:9b",
    name: "Qwen3.5 9B (Worker)",
    api: "openai-completions",
    provider: "ollama",
    baseUrl: OLLAMA_BASE_URL,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32768,
    maxTokens: 8192,
    compat: ollamaCompat,
  };

  const thinking: Model<"openai-completions"> = {
    id: "qwen3.5:9b",
    name: "Qwen3.5 9B (Thinking)",
    api: "openai-completions",
    provider: "ollama",
    baseUrl: OLLAMA_BASE_URL,
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32768,
    maxTokens: 8192,
    compat: ollamaThinkingCompat,
  };

  return { router, worker, thinking };
}

// --- OpenRouter model definitions (loaded from pi-mono catalog) ---

const OPENROUTER_DEFAULTS = {
  router: "qwen/qwen3-30b-a3b",
  worker: "qwen/qwen3-30b-a3b",
  thinking: "qwen/qwq-32b",
} as const;

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

function loadOpenRouterModel(
  envVar: string,
  fallback: string
): Model<"openai-completions"> {
  const modelId = process.env[envVar] || fallback;
  const catalogModel = getModel("openrouter" as any, modelId as any);
  if (catalogModel) {
    return catalogModel as Model<"openai-completions">;
  }

  // Model not in the static catalog -- build a usable fallback.
  // All OpenRouter models share the same API and base URL.
  console.warn(
    `[models] "${modelId}" not in pi-mono catalog, using generic OpenRouter defaults`
  );
  return {
    id: modelId,
    name: modelId,
    api: "openai-completions",
    provider: "openrouter",
    baseUrl: OPENROUTER_BASE_URL,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 16_384,
  };
}

function buildOpenRouterModels() {
  return {
    router: loadOpenRouterModel(
      "OPENROUTER_ROUTER_MODEL",
      OPENROUTER_DEFAULTS.router
    ),
    worker: loadOpenRouterModel(
      "OPENROUTER_WORKER_MODEL",
      OPENROUTER_DEFAULTS.worker
    ),
    thinking: loadOpenRouterModel(
      "OPENROUTER_THINKING_MODEL",
      OPENROUTER_DEFAULTS.thinking
    ),
  };
}

// --- Resolve models based on provider ---

const models =
  LLM_PROVIDER === "openrouter" ? buildOpenRouterModels() : buildOllamaModels();

export const ROUTER_MODEL: Model<"openai-completions"> = models.router;
export const WORKER_MODEL: Model<"openai-completions"> = models.worker;
export const THINKING_MODEL: Model<"openai-completions"> = models.thinking;

/**
 * Embedding model for memory vector generation.
 * Not used with pi-ai directly -- embeddings go through Ollama /api/embeddings.
 */
export const EMBEDDING_MODEL = {
  id: "nomic-embed-text",
  name: "Nomic Embed Text",
  dimensions: 768,
} as const;

/** Ollama native API base (not the OpenAI-compat /v1 endpoint) */
export const OLLAMA_NATIVE_URL =
  process.env.OLLAMA_BASE_URL?.replace("/v1", "") || "http://localhost:11434";
