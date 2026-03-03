import { Hono } from "hono";
import { OLLAMA_NATIVE_URL } from "../llm/models";

const ollamaApp = new Hono();

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
