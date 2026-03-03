import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import type { ServerWebSocket } from "bun";
import { db } from "../db/client";
import { chats, messages, events as eventsTable } from "../db/schema";
import { eq, desc, asc } from "drizzle-orm";
import { run, type ChatContext } from "../orchestra/index";
import { eventBus, type OrchestraEvent } from "../orchestra/events";

const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket>();

export { websocket };

// --- WebSocket app (mounted at root) ---

export const wsApp = new Hono();

wsApp.get(
  "/chat/ws",
  upgradeWebSocket((_c) => {
    let unsubscribe: (() => void) | null = null;

    return {
      onOpen(_event, ws) {
        console.log("[ws] Client connected");
        ws.send(
          JSON.stringify({
            type: "connected",
            source: "server",
            data: { message: "Connected to Doba backend" },
            timestamp: new Date().toISOString(),
          })
        );
      },

      async onMessage(event, ws) {
        let payload: { message: string; chat_id?: number };
        try {
          payload = JSON.parse(
            typeof event.data === "string"
              ? event.data
              : new TextDecoder().decode(event.data as ArrayBuffer)
          );
        } catch {
          ws.send(
            JSON.stringify({
              type: "error",
              source: "server",
              data: { error: "Invalid JSON" },
              timestamp: new Date().toISOString(),
            })
          );
          return;
        }

        const { message: userMessage, chat_id } = payload;
        if (!userMessage) return;

        let chatId = chat_id;

        if (!chatId) {
          const title =
            userMessage.length > 50
              ? userMessage.slice(0, 50) + "..."
              : userMessage;
          const [chat] = await db
            .insert(chats)
            .values({ title })
            .returning();
          chatId = chat.id;
        }

        await db.insert(messages).values({
          chatId,
          role: "user",
          content: userMessage,
        });

        // Load chat history and summary for context
        const chatHistory = await db
          .select({
            role: messages.role,
            content: messages.content,
            createdAt: messages.createdAt,
          })
          .from(messages)
          .where(eq(messages.chatId, chatId))
          .orderBy(asc(messages.createdAt));

        const [currentChat] = await db
          .select()
          .from(chats)
          .where(eq(chats.id, chatId));

        const context: ChatContext = {
          chatId,
          history: chatHistory,
          summary: currentChat?.summary ?? undefined,
        };

        console.log(
          `[ws] Chat ${chatId}: ${chatHistory.length} messages in history${currentChat?.summary ? ", has summary" : ""}`
        );

        ws.send(
          JSON.stringify({
            type: "chat_info",
            source: "server",
            data: { chat_id: chatId },
            timestamp: new Date().toISOString(),
          })
        );

        unsubscribe = eventBus.subscribe((orchestraEvent: OrchestraEvent) => {
          try {
            ws.send(JSON.stringify(orchestraEvent));
          } catch {
            // Client may have disconnected
          }
        });

        try {
          const result = await run(userMessage, context);

          await db.insert(messages).values({
            chatId,
            role: "assistant",
            content: result.finalAnswer,
          });

          await db.insert(eventsTable).values({
            chatId,
            type: "orchestra_end",
            source: result.agentName,
            data: { final_answer: result.finalAnswer },
          });
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : "Unknown error";
          ws.send(
            JSON.stringify({
              type: "error",
              source: "orchestra",
              data: { error: errorMsg },
              timestamp: new Date().toISOString(),
            })
          );
        } finally {
          if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
          }
        }
      },

      onClose() {
        console.log("[ws] Client disconnected");
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
      },
    };
  })
);

// --- REST chat endpoints (mounted at /v1/chats) ---

export const chatsRestApp = new Hono();

chatsRestApp.get("/", async (c) => {
  const result = await db
    .select()
    .from(chats)
    .orderBy(desc(chats.updatedAt));
  return c.json(result);
});

chatsRestApp.post("/", async (c) => {
  const body = await c.req.json<{ title?: string }>();
  const [chat] = await db
    .insert(chats)
    .values({ title: body.title || "New Chat" })
    .returning();
  return c.json(chat, 201);
});

chatsRestApp.get("/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const [chat] = await db.select().from(chats).where(eq(chats.id, id));
  if (!chat) return c.json({ error: "Chat not found" }, 404);

  const chatMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.chatId, id))
    .orderBy(messages.createdAt);

  return c.json({ ...chat, messages: chatMessages });
});

chatsRestApp.delete("/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const [deleted] = await db
    .delete(chats)
    .where(eq(chats.id, id))
    .returning();
  if (!deleted) return c.json({ error: "Chat not found" }, 404);
  return c.json({ success: true });
});

chatsRestApp.put("/:id/title", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const body = await c.req.json<{ title: string }>();
  const [updated] = await db
    .update(chats)
    .set({ title: body.title, updatedAt: new Date() })
    .where(eq(chats.id, id))
    .returning();
  if (!updated) return c.json({ error: "Chat not found" }, 404);
  return c.json(updated);
});
