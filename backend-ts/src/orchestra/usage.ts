/**
 * Normalised usage from a single LLM call or an aggregation of calls.
 * cost.* fields are in USD; 0 for free/local models (Ollama).
 */
export interface CallUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  costTotal: number;
}

export function zeroUsage(): CallUsage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, costTotal: 0 };
}

export function addUsage(a: CallUsage, b: CallUsage): CallUsage {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    totalTokens: a.totalTokens + b.totalTokens,
    costTotal: a.costTotal + b.costTotal,
  };
}

/**
 * Sums usage across all assistant messages in a pi-agent-core message array.
 */
export function extractUsageFromMessages(messages: any[]): CallUsage {
  const acc = zeroUsage();
  for (const msg of messages) {
    if (msg.role === "assistant" && msg.usage) {
      acc.input += msg.usage.input ?? 0;
      acc.output += msg.usage.output ?? 0;
      acc.cacheRead += msg.usage.cacheRead ?? 0;
      acc.cacheWrite += msg.usage.cacheWrite ?? 0;
      acc.totalTokens += msg.usage.totalTokens ?? 0;
      acc.costTotal += msg.usage.cost?.total ?? 0;
    }
  }
  return acc;
}
