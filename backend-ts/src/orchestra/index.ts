import type { AgentEvent } from "@mariozechner/pi-agent-core";
import { agentRegistry } from "../agents/registry";
import { routeQuery } from "./router";
import { eventBus, EventType } from "./events";

/**
 * Extracts the final text answer from an agent's accumulated messages.
 * Looks for the last assistant message with text content.
 */
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

export interface OrchestraResult {
  finalAnswer: string;
  agentName: string;
}

/**
 * Main orchestration entry point.
 * Routes the query to an agent, bridges agent events to the EventBus,
 * and returns the final text answer.
 */
export async function run(query: string): Promise<OrchestraResult> {
  eventBus.emit(EventType.ORCHESTRA_START, "orchestra", { query });

  const route = routeQuery(query, agentRegistry);
  if (!route) {
    const answer = "No agents are registered to handle this request.";
    eventBus.emit(EventType.ORCHESTRA_END, "orchestra", {
      final_answer: answer,
    });
    return { finalAnswer: answer, agentName: "none" };
  }

  const definition = agentRegistry.get(route.agentName)!;
  const agent = definition.createAgent();

  eventBus.emit(EventType.TASK_GENERATION_START, "orchestra", {
    query,
    agent: route.agentName,
  });
  eventBus.emit(EventType.TASK_GENERATION_END, "orchestra", {
    agent: route.agentName,
    task: route.task,
  });

  const unsub = agent.subscribe((event: AgentEvent) => {
    bridgeAgentEvent(event, route.agentName);
  });

  try {
    eventBus.emit(EventType.AGENT_START, route.agentName, {
      task: route.task,
    });

    await agent.prompt(route.task);

    const finalAnswer = extractFinalAnswer(agent.state.messages);

    eventBus.emit(EventType.AGENT_END, route.agentName, {
      result: finalAnswer,
    });
    eventBus.emit(EventType.ORCHESTRA_END, "orchestra", {
      final_answer: finalAnswer,
    });

    return { finalAnswer, agentName: route.agentName };
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Unknown agent error";
    eventBus.emit(EventType.TASK_ERROR, route.agentName, { error: errorMsg });
    eventBus.emit(EventType.ORCHESTRA_END, "orchestra", {
      final_answer: `Error: ${errorMsg}`,
      error: true,
    });
    return { finalAnswer: `Error: ${errorMsg}`, agentName: route.agentName };
  } finally {
    unsub();
  }
}

/**
 * Maps pi-agent-core AgentEvents to the EventBus protocol
 * that the frontend expects.
 */
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

    // agent_start/agent_end are emitted by run() directly to control timing
    // turn_start/turn_end/message_* are internal agent lifecycle - not mapped
    default:
      break;
  }
}
