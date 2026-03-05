import { completeSimple } from "@mariozechner/pi-ai";
import { WORKER_MODEL, THINKING_MODEL, resolveApiKey } from "../llm/models";
import type { StepResult } from "./runner";
import type { CallUsage } from "./usage";
import { eventBus, EventType } from "./events";

const SYNTHESIS_SYSTEM_PROMPT = `You are JARVIS, a personal AI assistant. Your task is to synthesize the results from multiple sub-tasks into a single coherent response for the user.

Rules:
- Combine all results into natural, conversational language.
- If any step failed, acknowledge the failure and present whatever succeeded.
- Be concise but complete. Do not repeat the original question back.
- Do not mention internal step numbers, agent names, or system details.`;

export interface SynthesisResult {
  answer: string;
  usage: CallUsage;
}

/**
 * Takes the original user query and the results from multiple agent steps,
 * produces a single coherent natural language answer.
 *
 * When useThinking is true (any plan step requested thinking), synthesis uses
 * THINKING_MODEL with "min" effort so the combinator has enough reasoning depth
 * to correctly merge complex or contradictory results.
 */
export async function synthesize(
  originalQuery: string,
  stepResults: StepResult[],
  useThinking = false
): Promise<SynthesisResult> {
  const model = useThinking ? THINKING_MODEL : WORKER_MODEL;

  const resultsBlock = stepResults
    .map(
      (r, i) =>
        `Step ${i + 1} (${r.agentName}): ${r.success ? "SUCCESS" : "FAILED"}\nTask: ${r.task}\nResult: ${r.result}`
    )
    .join("\n\n");

  const response = await completeSimple(
    model,
    {
      systemPrompt: SYNTHESIS_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Original user request: "${originalQuery}"\n\nResults from executing the plan:\n\n${resultsBlock}\n\nSynthesize these results into a single helpful response.`,
            },
          ],
          timestamp: Date.now(),
        },
      ],
    },
    {
      apiKey: resolveApiKey(model.provider),
      ...(useThinking && { reasoning: "low" as const }),
    }
  );

  const textParts = response.content
    .filter((c) => c.type === "text")
    .map((c) => (c as any).text);

  const usage: CallUsage = {
    input: response.usage.input,
    output: response.usage.output,
    cacheRead: response.usage.cacheRead,
    cacheWrite: response.usage.cacheWrite,
    totalTokens: response.usage.totalTokens,
    costTotal: response.usage.cost?.total ?? 0,
  };

  eventBus.emit(EventType.LLM_CALL, "synthesis", {
    model: (response as any).model ?? model.id,
    provider: model.provider,
    input: usage.input,
    output: usage.output,
    cache_read: usage.cacheRead,
    cost: usage.costTotal,
    tool_calls: [],
  });

  return {
    answer: textParts.join("\n") || "I completed the tasks but couldn't generate a summary.",
    usage,
  };
}
