import { agentRegistry } from "../agents/registry";
import { routeQuery, type RouteResult } from "./router";
import { runPlan } from "./runner";
import { synthesize } from "./synthesis";
import { eventBus, EventType } from "./events";
import { triggerCompaction, type DbMessage } from "./context";
import { ToolCache } from "./tool-cache";
import {
  type CallUsage,
  zeroUsage,
  addUsage,
  extractUsageFromMessages,
} from "./usage";
import { bridgeAgentEvent, runAgentWithGuards } from "./event-bridge";
import type { AgentEvent } from "@mariozechner/pi-agent-core";
import type { ThinkingLevel } from "../llm/models";

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

/**
 * Mode 2: dispatch a single query to one agent.
 * Creates a per-request ToolCache so repeated reads within the same query
 * (e.g. list-then-update) avoid redundant DB round-trips.
 */
async function executeSingleAgent(
  agentName: string,
  task: string,
  thinkingLevel: ThinkingLevel = "off"
): Promise<{ result: string; usage: CallUsage }> {
  const definition = agentRegistry.get(agentName);
  if (!definition) {
    throw new Error(`Agent "${agentName}" not found in registry`);
  }

  const cache = new ToolCache();
  const agent = definition.createAgent(cache, thinkingLevel);
  const unsub = agent.subscribe((event: AgentEvent) => {
    bridgeAgentEvent(event, agentName);
  });

  try {
    eventBus.emit(EventType.AGENT_START, agentName, { task });
    await runAgentWithGuards(agent, task, agentName);
    const result = extractFinalAnswer(agent.state.messages);
    const usage = extractUsageFromMessages(agent.state.messages);
    eventBus.emit(EventType.AGENT_END, agentName, { result });
    return { result, usage };
  } finally {
    cache.clear();
    unsub();
  }
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
      ...(route.mode === "observe" && { agents: route.agentNames }),
      ...(route.mode === "multi" && {
        steps: route.steps.map((s) => ({
          agent: s.agent_name,
          task: s.task,
        })),
      }),
    });

    // Seed total usage from the router call
    let totalUsage: CallUsage = routerUsage ?? zeroUsage();

    let finalAnswer: string;
    let agentName: string;

    switch (route.mode) {
      // Mode 1: Direct response — no agent needed, router answered from general knowledge
      case "direct": {
        finalAnswer = route.content;
        agentName = "router";
        break;
      }

      // Mode 4: Router called agents via callAgentAndObserve, then synthesized answer
      case "observe": {
        finalAnswer = route.content;
        agentName = route.agentNames.join(", ") || "router";
        break;
      }

      // Mode 2: Single agent dispatch
      case "single": {
        eventBus.emit(EventType.TASK_START, route.agentName, {
          task: route.task,
        });
        const { result, usage: agentUsage } = await executeSingleAgent(
          route.agentName,
          route.task,
          route.thinkingLevel ?? "off"
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
        const {
          results: stepResults,
          usage: planUsage,
          usedThinking,
        } = await runPlan(route.steps);
        const { answer, usage: synthUsage } = await synthesize(
          query,
          stepResults,
          usedThinking
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

    // Fire-and-forget: compact old messages if needed, chaining the existing summary
    if (routerUsage?.shouldCompact && context?.chatId) {
      triggerCompaction(
        context.chatId,
        context.history,
        context.summary
      ).catch((err) =>
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
