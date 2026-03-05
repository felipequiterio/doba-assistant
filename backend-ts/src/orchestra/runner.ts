import type { AgentEvent } from "@mariozechner/pi-agent-core";
import { agentRegistry } from "../agents/registry";
import { eventBus, EventType } from "./events";
import type { PlanStep } from "./router";
import { ToolCache } from "./tool-cache";
import {
  type CallUsage,
  zeroUsage,
  addUsage,
  extractUsageFromMessages,
} from "./usage";
import { bridgeAgentEvent, runAgentWithGuards } from "./event-bridge";

export interface StepResult {
  stepIndex: number;
  agentName: string;
  task: string;
  result: string;
  success: boolean;
  usage: CallUsage;
}

export interface PlanResult {
  results: StepResult[];
  usage: CallUsage;
  /** True if any step in the plan requested thinking_level != "off". */
  usedThinking: boolean;
}

async function executeStep(
  step: PlanStep,
  stepIndex: number,
  cache: ToolCache,
  previousResults?: StepResult[]
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
      usage: zeroUsage(),
    };
  }

  // Enrich the task with results from previous sequential steps
  let enrichedTask = step.task;
  if (previousResults && previousResults.length > 0) {
    const successfulContext = previousResults
      .filter((r) => r.success)
      .map((r) => `[${r.agentName}]: ${r.result}`)
      .join("\n");
    if (successfulContext) {
      enrichedTask = `${step.task}\n\nContext from previous steps:\n${successfulContext}`;
    }
  }

  eventBus.emit(EventType.TASK_START, step.agent_name, {
    step: stepIndex + 1,
    task: step.task,
    expected_output: step.expected_output,
  });

  const thinkingLevel = step.thinking_level ?? "off";
  const agent = definition.createAgent(cache, thinkingLevel);
  const unsub = agent.subscribe((event: AgentEvent) => {
    bridgeAgentEvent(event, step.agent_name);
  });

  try {
    eventBus.emit(EventType.AGENT_START, step.agent_name, {
      task: enrichedTask,
    });

    await runAgentWithGuards(agent, enrichedTask, step.agent_name);

    const result = extractFinalAnswer(agent.state.messages);
    const usage = extractUsageFromMessages(agent.state.messages);

    eventBus.emit(EventType.AGENT_END, step.agent_name, { result });
    eventBus.emit(EventType.TASK_COMPLETE, step.agent_name, {
      step: stepIndex + 1,
      result,
    });

    return { stepIndex, agentName: step.agent_name, task: step.task, result, success: true, usage };
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
      usage: zeroUsage(),
    };
  } finally {
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
      if (textParts.length > 0) return textParts.join("\n");
    }
  }
  return "Task completed but no text response was produced.";
}

/**
 * Dispatches a list of plan steps to their respective agents.
 * Sequential steps run in order; steps with is_async=true are batched
 * and run in parallel via Promise.allSettled.
 * A shared ToolCache avoids redundant DB reads for read-only tools
 * across steps within the same plan execution.
 */
export async function runPlan(steps: PlanStep[]): Promise<PlanResult> {
  const cache = new ToolCache();
  const results: StepResult[] = [];
  let i = 0;

  try {
    while (i < steps.length) {
      if (steps[i].is_async) {
        const asyncBatch: { step: PlanStep; index: number }[] = [];
        while (i < steps.length && steps[i].is_async) {
          asyncBatch.push({ step: steps[i], index: i });
          i++;
        }

        const settled = await Promise.allSettled(
          asyncBatch.map(({ step, index }) => executeStep(step, index, cache))
        );

        // Track batch index explicitly so rejected entries map to the correct step.
        // The previous code used `asyncBatch[results.length - ...]` which always
        // resolved to asyncBatch[0] due to the cancelling arithmetic.
        let batchIdx = 0;
        for (const outcome of settled) {
          if (outcome.status === "fulfilled") {
            results.push(outcome.value);
          } else {
            const failedEntry = asyncBatch[batchIdx];
            results.push({
              stepIndex: failedEntry?.index ?? -1,
              agentName: failedEntry?.step.agent_name ?? "unknown",
              task: failedEntry?.step.task ?? "",
              result: `Error: ${outcome.reason}`,
              success: false,
              usage: zeroUsage(),
            });
          }
          batchIdx++;
        }
      } else {
        const result = await executeStep(steps[i], i, cache, results);
        results.push(result);
        i++;
      }
    }
  } finally {
    cache.clear();
  }

  results.sort((a, b) => a.stepIndex - b.stepIndex);

  const usage = results.reduce(
    (acc, r) => addUsage(acc, r.usage),
    zeroUsage()
  );

  const usedThinking = steps.some(
    (s) => s.thinking_level && s.thinking_level !== "off"
  );

  return { results, usage, usedThinking };
}
