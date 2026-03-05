import type { AgentTool } from "@mariozechner/pi-agent-core";

/**
 * Wraps a set of agent tools with a per-session repeat-call counter.
 *
 * When the same tool is called more than `maxRepeat` times in a single
 * agent session, subsequent calls return a hard stop instruction instead
 * of executing the tool. This prevents infinite tool-call loops caused by
 * models that fail to synthesise an answer after receiving tool results.
 */
export function withCallGuard(
  tools: AgentTool<any>[],
  maxRepeat = 2
): AgentTool<any>[] {
  const callCounts = new Map<string, number>();

  return tools.map((tool) => ({
    ...tool,
    async execute(toolCallId: string, params: any) {
      const count = (callCounts.get(tool.name) ?? 0) + 1;
      callCounts.set(tool.name, count);

      if (count > maxRepeat) {
        const stopMsg =
          `[GUARD] You have already called "${tool.name}" ${count - 1} time(s) ` +
          `and received its results. Do NOT call any more tools. ` +
          `You MUST now write your final answer to the user using the data you already have.`;
        return {
          content: [{ type: "text" as const, text: stopMsg }],
          details: { guarded: true, tool: tool.name, callCount: count },
        };
      }

      return tool.execute(toolCallId, params);
    },
  }));
}
