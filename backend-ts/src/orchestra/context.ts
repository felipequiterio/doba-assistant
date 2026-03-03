import { completeSimple } from "@mariozechner/pi-ai";
import { WORKER_MODEL, ROUTER_MODEL } from "../llm/models";
import { db } from "../db/client";
import { chats } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { eventBus, EventType } from "./events";

export interface DbMessage {
  role: string;
  content: string;
  createdAt: Date;
}

const HOT_MESSAGE_COUNT = 12;
const COMPACTION_THRESHOLD = 0.7;

const COMPACTION_SYSTEM_PROMPT =
  "You are a conversation summarizer. Produce concise, factual summaries.";

const COMPACTION_USER_PROMPT = `Summarize the following conversation history into 2-3 concise paragraphs, preserving all important facts, decisions made, and action items. Focus on what would be useful for continuing the conversation.

Conversation:
`;

/**
 * Rough token estimate: ~4 characters per token for English text.
 * Sufficient for triggering compaction decisions.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Formats DB message rows into a readable conversation block.
 */
export function formatChatHistory(messages: DbMessage[]): string {
  return messages
    .map((m) => {
      const role = m.role === "user" ? "User" : "Assistant";
      return `${role}: ${m.content}`;
    })
    .join("\n");
}

/**
 * Builds the full prompt string for the router, assembling:
 *  - Tier 2 (warm): conversation summary if available
 *  - Tier 1 (hot): last N messages verbatim
 *  - Current query
 *
 * Returns the assembled prompt and whether compaction should be triggered.
 */
export function assembleRouterPrompt(
  query: string,
  history: DbMessage[],
  summary: string | undefined,
  contextWindow: number
): { prompt: string; shouldCompact: boolean } {
  const parts: string[] = [];

  if (summary) {
    parts.push(`[CONVERSATION SUMMARY]\n${summary}`);
  }

  const recentMessages = history.slice(-HOT_MESSAGE_COUNT);
  if (recentMessages.length > 0) {
    parts.push(`[RECENT CONVERSATION]\n${formatChatHistory(recentMessages)}`);
  }

  parts.push(`[CURRENT QUERY]\n${query}`);

  const prompt = parts.join("\n\n");

  const totalText = prompt + (ROUTER_MODEL.contextWindow ? "" : "");
  const estimatedTokens = estimateTokens(totalText);
  const threshold = Math.floor(contextWindow * COMPACTION_THRESHOLD);
  const shouldCompact =
    history.length > HOT_MESSAGE_COUNT && estimatedTokens > threshold;

  return { prompt, shouldCompact };
}

/**
 * Summarizes old messages into 2-3 paragraphs using the worker model.
 */
export async function compactMessages(
  oldMessages: DbMessage[]
): Promise<string> {
  const conversationText = formatChatHistory(oldMessages);

  const response = await completeSimple(
    WORKER_MODEL,
    {
      systemPrompt: COMPACTION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user" as const,
          content: [
            {
              type: "text" as const,
              text: `${COMPACTION_USER_PROMPT}${conversationText}`,
            },
          ],
          timestamp: Date.now(),
        },
      ],
    },
    { apiKey: "ollama" }
  );

  const textParts = response.content
    .filter((c) => c.type === "text")
    .map((c) => (c as { type: "text"; text: string }).text);

  return textParts.join("\n") || "No summary could be generated.";
}

/**
 * Runs compaction for a chat: summarizes old messages and stores the summary.
 * Fire-and-forget — should be called without awaiting in the main flow.
 */
export async function triggerCompaction(
  chatId: number,
  history: DbMessage[]
): Promise<void> {
  if (history.length <= HOT_MESSAGE_COUNT) return;

  const oldMessages = history.slice(0, -HOT_MESSAGE_COUNT);

  eventBus.emit(EventType.LOG, "context", {
    message: `Compacting ${oldMessages.length} old messages for chat ${chatId}`,
  });

  const summary = await compactMessages(oldMessages);

  await db
    .update(chats)
    .set({
      summary,
      compactedAt: new Date(),
      compactionCount: sql`${chats.compactionCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(chats.id, chatId));

  eventBus.emit(EventType.LOG, "context", {
    message: `Compaction complete for chat ${chatId} (${oldMessages.length} messages summarized)`,
  });
}
