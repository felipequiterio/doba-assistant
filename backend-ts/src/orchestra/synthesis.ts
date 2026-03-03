import { completeSimple } from "@mariozechner/pi-ai";
import { WORKER_MODEL } from "../llm/models";
import type { StepResult } from "./runner";

const SYNTHESIS_SYSTEM_PROMPT = `You are JARVIS, a personal AI assistant. Your task is to synthesize the results from multiple sub-tasks into a single coherent response for the user.

Rules:
- Combine all results into natural, conversational language.
- If any step failed, acknowledge the failure and present whatever succeeded.
- Be concise but complete. Do not repeat the original question back.
- Do not mention internal step numbers, agent names, or system details.`;

/**
 * Takes the original user query and the results from multiple agent steps,
 * produces a single coherent natural language answer.
 */
export async function synthesize(
  originalQuery: string,
  stepResults: StepResult[]
): Promise<string> {
  const resultsBlock = stepResults
    .map(
      (r, i) =>
        `Step ${i + 1} (${r.agentName}): ${r.success ? "SUCCESS" : "FAILED"}\nTask: ${r.task}\nResult: ${r.result}`
    )
    .join("\n\n");

  const response = await completeSimple(
    WORKER_MODEL,
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
      apiKey: "ollama",
    }
  );

  const textParts = response.content
    .filter((c) => c.type === "text")
    .map((c) => (c as any).text);

  return textParts.join("\n") || "I completed the tasks but couldn't generate a summary.";
}
