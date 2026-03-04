import { Hono } from "hono";
import {
  OLLAMA_NATIVE_URL,
  LLM_PROVIDER,
  ROUTER_MODEL,
  WORKER_MODEL,
  resolveApiKey,
} from "../llm/models";

const ollamaApp = new Hono();

/**
 * Returns the active LLM models for the playground status footer.
 * When using Ollama, proxies /api/ps to show VRAM-loaded models.
 * When using another provider, returns the configured model names directly.
 */
ollamaApp.get("/active-models", async (c) => {
  if (LLM_PROVIDER === "ollama") {
    try {
      const res = await fetch(`${OLLAMA_NATIVE_URL}/api/ps`);
      if (!res.ok) return c.json({ provider: "ollama", models: [] });
      const data = (await res.json()) as { models?: any[] };
      return c.json({ provider: "ollama", models: data.models ?? [] });
    } catch {
      return c.json({ provider: "ollama", models: [] });
    }
  }

  // Cloud provider: report the configured model IDs
  const seen = new Set<string>();
  const models: { name: string }[] = [];
  for (const m of [ROUTER_MODEL, WORKER_MODEL]) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      models.push({ name: m.id });
    }
  }
  return c.json({ provider: LLM_PROVIDER, models });
});

/**
 * Returns remaining OpenRouter credits when LLM_PROVIDER=openrouter.
 * OpenRouter response: { data: { total_credits: number, total_usage: number } }
 * Remaining = total_credits - total_usage
 */
ollamaApp.get("/credits", async (c) => {
  if (LLM_PROVIDER !== "openrouter") {
    return c.json({ provider: LLM_PROVIDER, supported: false });
  }

  const apiKey = resolveApiKey("openrouter");
  if (!apiKey) {
    return c.json({ error: "OPENROUTER_API_KEY not set" }, 500);
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/credits", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      return c.json({ error: `OpenRouter returned ${res.status}` }, 502);
    }
    const body = (await res.json()) as {
      data: { total_credits: number; total_usage: number };
    };
    const { total_credits, total_usage } = body.data;
    return c.json({
      provider: "openrouter",
      supported: true,
      total_credits,
      total_usage,
      remaining: total_credits - total_usage,
    });
  } catch {
    return c.json({ error: "Failed to reach OpenRouter" }, 503);
  }
});

ollamaApp.get("/stats", async (c) => {
  try {
    const res = await fetch(`${OLLAMA_NATIVE_URL}/api/ps`);
    if (!res.ok) {
      return c.json({ error: `Ollama returned ${res.status}` }, 502);
    }
    const data = await res.json();
    return c.json(data);
  } catch {
    return c.json({ error: "Ollama is not reachable" }, 503);
  }
});

ollamaApp.get("/models", async (c) => {
  try {
    const res = await fetch(`${OLLAMA_NATIVE_URL}/api/tags`);
    if (!res.ok) {
      return c.json({ error: `Ollama returned ${res.status}` }, 502);
    }
    const data = await res.json();
    return c.json(data);
  } catch {
    return c.json({ error: "Ollama is not reachable" }, 503);
  }
});

ollamaApp.post("/load", async (c) => {
  const body = await c.req.json<{ model: string }>();
  try {
    const res = await fetch(`${OLLAMA_NATIVE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: body.model,
        keep_alive: -1,
      }),
    });
    if (!res.ok) {
      return c.json({ error: `Ollama returned ${res.status}` }, 502);
    }
    return c.json({ success: true, model: body.model, keep_alive: -1 });
  } catch {
    return c.json({ error: "Ollama is not reachable" }, 503);
  }
});

ollamaApp.post("/unload", async (c) => {
  const body = await c.req.json<{ model: string }>();
  try {
    const res = await fetch(`${OLLAMA_NATIVE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: body.model,
        keep_alive: 0,
      }),
    });
    if (!res.ok) {
      return c.json({ error: `Ollama returned ${res.status}` }, 502);
    }
    return c.json({ success: true, model: body.model, unloaded: true });
  } catch {
    return c.json({ error: "Ollama is not reachable" }, 503);
  }
});

export default ollamaApp;
