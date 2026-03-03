import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { HTTPException } from "hono/http-exception";
import { websocket } from "hono/bun";

import { eventBus, EventType } from "./orchestra/events";
import { preloadModels } from "./llm/preload";

const app = new Hono();

// --- Middleware ---

app.use("*", logger());

// CORS for REST routes only (not WebSocket -- see Hono docs)
app.use("/v1/*", cors({ origin: "*" }));

// --- Global error handler ---

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  console.error("[server] Unhandled error:", err);
  return c.json({ error: "Internal Server Error" }, 500);
});

// --- Health check ---

app.get("/health", (c) =>
  c.json({ status: "ok", timestamp: new Date().toISOString() })
);

// --- Startup ---

const port = parseInt(process.env.PORT || "3001", 10);

console.log(`[server] Starting Doba backend on port ${port}...`);

// Preload Ollama models in the background (non-blocking)
preloadModels().then(() => {
  eventBus.emit(EventType.LOG, "server", { message: "Model preload complete" });
});

eventBus.emit(EventType.LOG, "server", {
  message: `Server started on port ${port}`,
});

export default {
  port,
  fetch: app.fetch,
  websocket,
};
