import {
  ROUTER_MODEL,
  WORKER_MODEL,
  OLLAMA_NATIVE_URL,
  LLM_PROVIDER,
} from "./models";

interface OllamaGenerateRequest {
  model: string;
  keep_alive: number;
  prompt: string;
}

async function loadModel(modelId: string): Promise<void> {
  const url = `${OLLAMA_NATIVE_URL}/api/generate`;
  const body: OllamaGenerateRequest = {
    model: modelId,
    keep_alive: -1,
    prompt: "",
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to preload ${modelId}: ${response.status} ${response.statusText}`
    );
  }

  // Consume the response body (Ollama streams NDJSON even for empty prompts)
  await response.text();
}

/**
 * Preload LLM models into Ollama VRAM with infinite keep-alive.
 * Ensures the first user message doesn't pay the cold-start penalty.
 * Gracefully handles Ollama not being available.
 */
export async function preloadModels(): Promise<void> {
  if (LLM_PROVIDER !== "ollama") {
    console.log(`[preload] Skipping Ollama preload (LLM_PROVIDER=${LLM_PROVIDER})`);
    return;
  }

  const models = [
    { name: ROUTER_MODEL.name, id: ROUTER_MODEL.id },
    { name: WORKER_MODEL.name, id: WORKER_MODEL.id },
  ];

  for (const model of models) {
    try {
      await loadModel(model.id);
      console.log(`[preload] ${model.name} (${model.id}) loaded with keep_alive=-1`);
    } catch (error) {
      console.warn(
        `[preload] Failed to load ${model.name} (${model.id}):`,
        error instanceof Error ? error.message : error
      );
    }
  }
}
