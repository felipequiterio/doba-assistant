import { describe, test, expect, afterAll } from "bun:test";
import { EventBus, EventType } from "../orchestra/events";
import type { OrchestraEvent } from "../orchestra/events";

// --- EventBus tests (no external deps) ---

describe("EventBus", () => {
  test("emit delivers event to subscriber with correct shape", () => {
    const bus = new EventBus();
    const received: OrchestraEvent[] = [];

    bus.subscribe((event) => received.push(event));
    bus.emit(EventType.LOG, "test", { message: "hello" });

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe("log");
    expect(received[0].source).toBe("test");
    expect(received[0].data).toEqual({ message: "hello" });
    expect(received[0].timestamp).toBeTruthy();
    // Timestamp should be a valid ISO string
    expect(new Date(received[0].timestamp).toISOString()).toBe(
      received[0].timestamp
    );
  });

  test("unsubscribe stops delivery", () => {
    const bus = new EventBus();
    const received: OrchestraEvent[] = [];

    const unsub = bus.subscribe((event) => received.push(event));
    bus.emit(EventType.LOG, "test", {});
    unsub();
    bus.emit(EventType.LOG, "test", {});

    expect(received).toHaveLength(1);
  });

  test("subscribeToType filters by event type", () => {
    const bus = new EventBus();
    const logEvents: OrchestraEvent[] = [];
    const allEvents: OrchestraEvent[] = [];

    bus.subscribe((event) => allEvents.push(event));
    bus.subscribeToType(EventType.LOG, (event) => logEvents.push(event));

    bus.emit(EventType.LOG, "test", { n: 1 });
    bus.emit(EventType.ORCHESTRA_START, "test", { n: 2 });
    bus.emit(EventType.LOG, "test", { n: 3 });

    expect(allEvents).toHaveLength(3);
    expect(logEvents).toHaveLength(2);
    expect(logEvents.every((e) => e.type === "log")).toBe(true);
  });

  test("emit returns the constructed event", () => {
    const bus = new EventBus();
    const event = bus.emit(EventType.TOOL_START, "todo_agent", {
      tool: "createTodo",
    });

    expect(event.type).toBe("tool_start");
    expect(event.source).toBe("todo_agent");
    expect(event.data.tool).toBe("createTodo");
  });

  test("all EventType values are lowercase snake_case strings", () => {
    for (const [key, value] of Object.entries(EventType)) {
      expect(typeof value).toBe("string");
      expect(value).toMatch(/^[a-z_]+$/);
    }
  });

  test("listener errors do not prevent other listeners from receiving events", () => {
    const bus = new EventBus();
    const received: OrchestraEvent[] = [];

    bus.subscribe(() => {
      throw new Error("listener crash");
    });
    bus.subscribe((event) => received.push(event));

    bus.emit(EventType.LOG, "test", {});
    expect(received).toHaveLength(1);
  });
});

// --- Database tests (require PostgreSQL) ---

describe("Database", () => {
  // Dynamic import to avoid connection at module load if DB is not available
  let db: any;
  let schema: any;

  test("can connect and insert/query a todo", async () => {
    const dbModule = await import("../db/client");
    const schemaModule = await import("../db/schema");
    db = dbModule.db;
    schema = schemaModule;

    const [inserted] = await db
      .insert(schema.todos)
      .values({ title: "smoke test todo", description: "testing DB" })
      .returning();

    expect(inserted.id).toBeGreaterThan(0);
    expect(inserted.title).toBe("smoke test todo");
    expect(inserted.status).toBe("idle");

    // Query back
    const { eq } = await import("drizzle-orm");
    const [found] = await db
      .select()
      .from(schema.todos)
      .where(eq(schema.todos.id, inserted.id));

    expect(found.title).toBe("smoke test todo");
    expect(found.description).toBe("testing DB");

    // Cleanup
    await db.delete(schema.todos).where(eq(schema.todos.id, inserted.id));
  });

  test("can insert and query a chat with messages", async () => {
    const dbModule = await import("../db/client");
    const schemaModule = await import("../db/schema");
    db = dbModule.db;
    schema = schemaModule;
    const { eq } = await import("drizzle-orm");

    const [chat] = await db
      .insert(schema.chats)
      .values({ title: "smoke test chat" })
      .returning();

    const [msg] = await db
      .insert(schema.messages)
      .values({
        chatId: chat.id,
        role: "user",
        content: "hello from smoke test",
      })
      .returning();

    expect(msg.chatId).toBe(chat.id);
    expect(msg.role).toBe("user");

    // Cleanup
    await db.delete(schema.messages).where(eq(schema.messages.id, msg.id));
    await db.delete(schema.chats).where(eq(schema.chats.id, chat.id));
  });

  test("can insert and query a note with tags", async () => {
    const dbModule = await import("../db/client");
    const schemaModule = await import("../db/schema");
    db = dbModule.db;
    schema = schemaModule;
    const { eq } = await import("drizzle-orm");

    const [note] = await db
      .insert(schema.notes)
      .values({
        title: "smoke test note",
        content: "some content",
        tags: ["test", "smoke"],
      })
      .returning();

    expect(note.title).toBe("smoke test note");
    expect(note.tags).toEqual(["test", "smoke"]);

    // Cleanup
    await db.delete(schema.notes).where(eq(schema.notes.id, note.id));
  });
});

// --- pi-ai LLM test (requires Ollama running) ---

describe("pi-ai + LLM", () => {
  test(
    "completeSimple returns a response from the configured provider",
    async () => {
      const { completeSimple } = await import("@mariozechner/pi-ai");
      const { ROUTER_MODEL, resolveApiKey } = await import("../llm/models");

      const response = await completeSimple(
        ROUTER_MODEL,
        {
          systemPrompt:
            "You are a helpful assistant. Respond in one sentence.",
          messages: [
            {
              role: "user",
              content: "Say hello.",
              timestamp: Date.now(),
            },
          ],
        },
        {
          apiKey: resolveApiKey(ROUTER_MODEL.provider),
        }
      );

      expect(response.role).toBe("assistant");
      expect(response.stopReason).toBe("stop");
      expect(response.content.length).toBeGreaterThan(0);

      const textBlock = response.content.find((c) => c.type === "text");
      expect(textBlock).toBeTruthy();
      expect((textBlock as any).text.length).toBeGreaterThan(0);

      expect(response.usage.input).toBeGreaterThan(0);
      expect(response.usage.output).toBeGreaterThan(0);
      expect(response.usage.totalTokens).toBeGreaterThan(0);

      console.log("[pi-ai test] Response:", (textBlock as any).text);
      console.log("[pi-ai test] Tokens:", response.usage.totalTokens);
    },
    60_000
  );
});
