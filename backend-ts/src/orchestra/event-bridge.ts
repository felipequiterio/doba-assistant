import type { Agent, AgentEvent } from "@mariozechner/pi-agent-core";
import { eventBus, EventType } from "./events";

/**
 * Maximum LLM-tool turns an agent is allowed before being forcibly aborted.
 * One "turn" = one LLM call + all resulting tool executions.
 * Prevents runaway loops when the tool guard's prompting fails to stop the model.
 */
const MAX_AGENT_TURNS = 10;

/**
 * Wall-clock deadline for a single agent.prompt() call.
 * Catches LLM API hangs, extremely slow model calls, and any scenario where
 * the turn counter alone wouldn't fire (e.g. one very slow turn).
 */
const AGENT_TIMEOUT_MS = 60_000;

/**
 * Translates pi-agent-core AgentEvent variants into OrchestraEvent bus emissions
 * so the frontend receives real-time tool/LLM call updates over WebSocket.
 * Extracted here to avoid copy-pasting across index.ts, runner.ts, and router.ts.
 */
export function bridgeAgentEvent(event: AgentEvent, agentName: string): void {
  switch (event.type) {
    case "tool_execution_start":
      eventBus.emit(EventType.TOOL_SELECTION, agentName, {
        tool: event.toolName,
        args: event.args,
      });
      eventBus.emit(EventType.TOOL_START, agentName, {
        tool: event.toolName,
        args: event.args,
      });
      break;

    case "tool_execution_end":
      if (event.isError) {
        eventBus.emit(EventType.TOOL_ERROR, agentName, {
          tool: event.toolName,
          error: event.result,
        });
      } else {
        eventBus.emit(EventType.TOOL_END, agentName, {
          tool: event.toolName,
          result: event.result,
        });
      }
      break;

    case "message_update": {
      const ame = (event as any).assistantMessageEvent;
      if (ame?.type === "text_delta") {
        eventBus.emit(EventType.TEXT_DELTA, agentName, { delta: ame.delta });
      } else if (ame?.type === "thinking_delta") {
        eventBus.emit(EventType.THINKING_DELTA, agentName, {
          delta: ame.delta,
        });
      } else if (ame?.type === "thinking_end") {
        eventBus.emit(EventType.THINKING_DONE, agentName, {});
      } else if (ame?.type === "text_end") {
        eventBus.emit(EventType.TEXT_DONE, agentName, {});
      }
      break;
    }

    case "turn_end": {
      const msg = event.message as any;
      const toolCalls = Array.isArray(msg.content)
        ? msg.content
            .filter((c: any) => c.type === "toolCall")
            .map((c: any) => c.name)
        : [];
      eventBus.emit(EventType.LLM_CALL, agentName, {
        model: msg.model ?? "unknown",
        provider: msg.provider ?? "unknown",
        input: msg.usage?.input ?? 0,
        output: msg.usage?.output ?? 0,
        cache_read: msg.usage?.cacheRead ?? 0,
        cost: msg.usage?.cost?.total ?? 0,
        tool_calls: toolCalls,
      });
      break;
    }

    default:
      break;
  }
}

/**
 * Scans an agent's message history in reverse and returns the last assistant
 * text response. Falls back to a safe string if no text was produced.
 */
export function extractFinalAnswer(messages: any[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      const textParts = msg.content
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text);
      if (textParts.length > 0) return textParts.join("\n");
    }
  }
  return "I completed the task but have no text response.";
}

/**
 * Runs agent.prompt(task) with two hard safety guards:
 *
 *  1. Turn cap (MAX_AGENT_TURNS): subscribes to turn_end events and calls
 *     agent.abort() if the loop exceeds the maximum. The abort signal causes
 *     pi-agent-core to exit cleanly, so agent.prompt() resolves normally.
 *
 *  2. Wall-clock timeout (AGENT_TIMEOUT_MS): rejects the returned promise if
 *     the agent takes too long, also calling agent.abort() first. Callers
 *     catch this as a regular thrown error.
 *
 * The bridgeAgentEvent subscription should be set up by the caller before
 * invoking this function — this helper only manages the safety guards.
 */
export async function runAgentWithGuards(
  agent: Agent,
  task: string,
  agentName: string
): Promise<void> {
  let turns = 0;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const turnUnsub = agent.subscribe((event: AgentEvent) => {
    if (event.type === "turn_end") {
      turns++;
      if (turns >= MAX_AGENT_TURNS) {
        eventBus.emit(EventType.LOG, agentName, {
          message: `[agent-guard] Max turns (${MAX_AGENT_TURNS}) reached, aborting`,
          turns,
        });
        agent.abort();
      }
    }
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      eventBus.emit(EventType.LOG, agentName, {
        message: `[agent-guard] Timeout after ${AGENT_TIMEOUT_MS}ms, aborting`,
      });
      agent.abort();
      reject(
        new Error(`Agent "${agentName}" timed out after ${AGENT_TIMEOUT_MS}ms`)
      );
    }, AGENT_TIMEOUT_MS);
  });

  try {
    await Promise.race([agent.prompt(task), timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle);
    turnUnsub();
  }
}
