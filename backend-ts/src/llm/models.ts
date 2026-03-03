import "dotenv/config";
import type { Model, OpenAICompletionsCompat } from "@mariozechner/pi-ai";

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

/**
 * Fast model for query classification and task planning.
 * Prioritize tool-calling reliability over raw intelligence.
 * TODO: Switch to qwen3:4b once pulled for faster routing.
 */
export const ROUTER_MODEL: Model<"openai-completions"> = {
  id: "qwen3.5:4b",
  name: "Qwen3.5 4B (Router)",
  api: "openai-completions",
  provider: "ollama",
  baseUrl: OLLAMA_BASE_URL,
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 8192,
  maxTokens: 2048,
  compat: ollamaCompat,
};

/**
 * Balanced quality/speed model for agent execution and tool use.
 */
export const WORKER_MODEL: Model<"openai-completions"> = {
  id: "qwen3.5:9b",
  name: "Qwen3.5 9B (Worker)",
  api: "openai-completions",
  provider: "ollama",
  baseUrl: OLLAMA_BASE_URL,
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 4096,
  maxTokens: 2048,
  compat: ollamaCompat,
};

/**
 * Reasoning-capable model for synthesis and complex tasks.
 * Uses Qwen thinking format (enable_thinking: boolean).
 */
export const THINKING_MODEL: Model<"openai-completions"> = {
  id: "qwen3.5:9b",
  name: "Qwen3.5 9B (Thinking)",
  api: "openai-completions",
  provider: "ollama",
  baseUrl: OLLAMA_BASE_URL,
  reasoning: true,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 16384,
  maxTokens: 4096,
  compat: ollamaThinkingCompat,
};

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
  process.env.OLLAMA_BASE_URL?.replace("/v1", "") ||
  "http://localhost:11434";
