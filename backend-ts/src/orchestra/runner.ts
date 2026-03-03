import type { AgentEvent } from "@mariozechner/pi-agent-core";
import { agentRegistry } from "../agents/registry";
import { eventBus, EventType } from "./events";
import type { PlanStep } from "./router";

export interface StepResult {
  stepIndex: number;
  agentName: string;
  task: string;
  result: string;
  success: boolean;
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
  return "Task completed but no text response was produced.";
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

    default:
      break;
  }
}

async function executeStep(
  step: PlanStep,
  stepIndex: number
): Promise<StepResult> {
  const definition = agentRegistry.get(step.agent_name);
  if (!definition) {
    const error = `Agent "${step.agent_name}" not found in registry`;
    eventBus.emit(EventType.TASK_ERROR, step.agent_name, { error });
    return {
      stepIndex,
      agentName: step.agent_name,
      task: step.task,
      result: error,
      success: false,
    };
  }

  eventBus.emit(EventType.TASK_START, step.agent_name, {
    step: stepIndex + 1,
    task: step.task,
    expected_output: step.expected_output,
  });

  const agent = definition.createAgent();
  const unsub = agent.subscribe((event: AgentEvent) => {
    bridgeAgentEvent(event, step.agent_name);
  });

  try {
    eventBus.emit(EventType.AGENT_START, step.agent_name, {
      task: step.task,
    });

    await agent.prompt(step.task);
    const result = extractFinalAnswer(agent.state.messages);

    eventBus.emit(EventType.AGENT_END, step.agent_name, { result });
    eventBus.emit(EventType.TASK_COMPLETE, step.agent_name, {
      step: stepIndex + 1,
      result,
    });

    return {
      stepIndex,
      agentName: step.agent_name,
      task: step.task,
      result,
      success: true,
    };
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Unknown agent error";
    eventBus.emit(EventType.TASK_ERROR, step.agent_name, {
      step: stepIndex + 1,
      error: errorMsg,
    });
    return {
      stepIndex,
      agentName: step.agent_name,
      task: step.task,
      result: `Error: ${errorMsg}`,
      success: false,
    };
  } finally {
    unsub();
  }
}

/**
 * Dispatches a list of plan steps to their respective agents.
 * Sequential steps run in order; steps with is_async=true are batched
 * and run in parallel via Promise.allSettled.
 */
export async function runPlan(steps: PlanStep[]): Promise<StepResult[]> {
  const results: StepResult[] = [];
  let i = 0;

  while (i < steps.length) {
    // Collect consecutive async steps into a batch
    if (steps[i].is_async) {
      const asyncBatch: { step: PlanStep; index: number }[] = [];
      while (i < steps.length && steps[i].is_async) {
        asyncBatch.push({ step: steps[i], index: i });
        i++;
      }

      const settled = await Promise.allSettled(
        asyncBatch.map(({ step, index }) => executeStep(step, index))
      );

      for (const outcome of settled) {
        if (outcome.status === "fulfilled") {
          results.push(outcome.value);
        } else {
          const batch = asyncBatch[results.length - (results.length - asyncBatch.length)];
          results.push({
            stepIndex: batch?.index ?? -1,
            agentName: batch?.step.agent_name ?? "unknown",
            task: batch?.step.task ?? "",
            result: `Error: ${outcome.reason}`,
            success: false,
          });
        }
      }
    } else {
      const result = await executeStep(steps[i], i);
      results.push(result);
      i++;
    }
  }

  // Sort by original step index to maintain order
  results.sort((a, b) => a.stepIndex - b.stepIndex);
  return results;
}
