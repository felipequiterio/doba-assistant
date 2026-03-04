import type { AgentEvent } from "@mariozechner/pi-agent-core";
import { agentRegistry } from "../agents/registry";
import { routeQuery, type RouteResult } from "./router";
import { runPlan } from "./runner";
import { synthesize } from "./synthesis";
import { eventBus, EventType } from "./events";
import { triggerCompaction, type DbMessage } from "./context";
import {
  type CallUsage,
  zeroUsage,
  addUsage,
  extractUsageFromMessages,
} from "./usage";

export interface ChatContext {
  chatId: number;
  history: DbMessage[];
  summary?: string;
}

export interface OrchestraResult {
  finalAnswer: string;
  agentName: string;
  mode: RouteResult["mode"];
  usage?: CallUsage;
}

function extractFinalAnswer(messages: any[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      const textParts = msg.content
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text);
      if (textParts.length > 0) {
        return textParts.join("\n");
      }
    }
  }
  return "I completed the task but have no text response.";
}

function bridgeAgentEvent(event: AgentEvent, agentName: string): void {
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
 * Mode 2: dispatch a single query to one agent.
 */
async function executeSingleAgent(
  agentName: string,
  task: string
): Promise<{ result: string; usage: CallUsage }> {
  const definition = agentRegistry.get(agentName);
  if (!definition) {
    throw new Error(`Agent "${agentName}" not found in registry`);
  }

  const agent = definition.createAgent();
  const unsub = agent.subscribe((event: AgentEvent) => {
    bridgeAgentEvent(event, agentName);
  });

  try {
    eventBus.emit(EventType.AGENT_START, agentName, { task });
    await agent.prompt(task);
    const result = extractFinalAnswer(agent.state.messages);
    const usage = extractUsageFromMessages(agent.state.messages);
    eventBus.emit(EventType.AGENT_END, agentName, { result });
    return { result, usage };
  } finally {
    unsub();
  }
}

/**
 * Main orchestration entry point.
 * Routes the query through the smart router, then executes
 * the appropriate path (direct / single agent / multi-step plan).
 */
export async function run(
  query: string,
  context?: ChatContext
): Promise<OrchestraResult> {
  eventBus.emit(EventType.ORCHESTRA_START, "orchestra", { query });

  try {
    // Step 1: Route the query (with chat history context)
    eventBus.emit(EventType.TASK_GENERATION_START, "orchestra", { query });
    const { route, usage: routerUsage } = await routeQuery(query, context);
    eventBus.emit(EventType.TASK_GENERATION_END, "orchestra", {
      mode: route.mode,
      ...(route.mode === "single" && { agent: route.agentName }),
      ...(route.mode === "multi" && {
        steps: route.steps.map((s) => ({
          agent: s.agent_name,
          task: s.task,
        })),
      }),
    });

    // Start usage accumulator from router
    let totalUsage: CallUsage = routerUsage
      ? {
          input: routerUsage.input,
          output: routerUsage.output,
          cacheRead: routerUsage.cacheRead,
          cacheWrite: routerUsage.cacheWrite,
          totalTokens: routerUsage.totalTokens,
          costTotal: routerUsage.costTotal,
        }
      : zeroUsage();

    let finalAnswer: string;
    let agentName: string;

    switch (route.mode) {
      // Mode 1: Direct response — no agent needed
      case "direct": {
        finalAnswer = route.content;
        agentName = "router";
        break;
      }

      // Mode 2: Single agent dispatch
      case "single": {
        eventBus.emit(EventType.TASK_START, route.agentName, {
          task: route.task,
        });
        const { result, usage: agentUsage } = await executeSingleAgent(
          route.agentName,
          route.task
        );
        eventBus.emit(EventType.TASK_COMPLETE, route.agentName, {
          result,
        });
        totalUsage = addUsage(totalUsage, agentUsage);
        finalAnswer = result;
        agentName = route.agentName;
        break;
      }

      // Mode 3: Multi-step plan
      case "multi": {
        const { results: stepResults, usage: planUsage } = await runPlan(
          route.steps
        );
        const { answer, usage: synthUsage } = await synthesize(
          query,
          stepResults
        );
        totalUsage = addUsage(addUsage(totalUsage, planUsage), synthUsage);
        finalAnswer = answer;
        agentName = route.steps.map((s) => s.agent_name).join(", ");
        break;
      }
    }

    eventBus.emit(EventType.ORCHESTRA_END, "orchestra", {
      final_answer: finalAnswer,
      mode: route.mode,
      usage: totalUsage,
    });

    // Fire-and-forget: compact old messages if needed
    if (routerUsage?.shouldCompact && context?.chatId) {
      triggerCompaction(context.chatId, context.history).catch((err) =>
        console.error("[context] Compaction failed:", err)
      );
    }

    return {
      finalAnswer,
      agentName,
      mode: route.mode,
      usage: totalUsage,
    };
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Unknown orchestra error";
    eventBus.emit(EventType.TASK_ERROR, "orchestra", { error: errorMsg });
    eventBus.emit(EventType.ORCHESTRA_END, "orchestra", {
      final_answer: `Error: ${errorMsg}`,
      error: true,
    });
    return {
      finalAnswer: `Error: ${errorMsg}`,
      agentName: "orchestra",
      mode: "direct",
    };
  }
}
