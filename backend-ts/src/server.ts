import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { HTTPException } from "hono/http-exception";

import { eventBus, EventType } from "./orchestra/events";
import { preloadModels } from "./llm/preload";
import { wsApp, chatsRestApp, websocket } from "./routes/chat";
import todosApp from "./routes/todos";
import swaggerApp from "./routes/swagger";
import playgroundApp from "./routes/playground";

const app = new Hono();

// --- Middleware ---

app.use("*", logger());

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

// --- Mount routes ---

app.route("/", wsApp);
app.route("/v1/chats", chatsRestApp);
app.route("/v1/todos", todosApp);
app.route("/", swaggerApp);
app.route("/", playgroundApp);

// --- Startup ---

const port = parseInt(process.env.PORT || "3001", 10);

console.log(`[server] Starting Doba backend on port ${port}...`);

preloadModels().then(() => {
  eventBus.emit(EventType.LOG, "server", {
    message: "Model preload complete",
  });
});

eventBus.emit(EventType.LOG, "server", {
  message: `Server started on port ${port}`,
});

export default {
  port,
  fetch: app.fetch,
  websocket,
};
