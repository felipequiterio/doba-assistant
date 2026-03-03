import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";

const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  result: AgentToolResult<any>;
  timestamp: number;
}

export class ToolCache {
  private cache = new Map<string, CacheEntry>();

  get(key: string): AgentToolResult<any> | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.result;
  }

  set(key: string, result: AgentToolResult<any>): void {
    this.cache.set(key, { result, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }
}

const READ_ONLY_TOOLS = new Set(["listTodos", "listNotes"]);

/**
 * Wraps a tool's execute method with caching for read-only tools.
 * Mutating tools pass through unchanged.
 */
export function wrapToolWithCache<T extends AgentTool<any>>(
  tool: T,
  cache: ToolCache
): T {
  if (!READ_ONLY_TOOLS.has(tool.name)) return tool;

  return {
    ...tool,
    async execute(toolCallId: string, params: any, signal?: AbortSignal) {
      const key = `${tool.name}:${JSON.stringify(params)}`;
      const cached = cache.get(key);
      if (cached) return cached;
      const result = await tool.execute(toolCallId, params, signal);
      cache.set(key, result);
      return result;
    },
  };
}

/**
 * Wraps all tools in the array, applying caching to read-only ones.
 */
export function wrapToolsWithCache<T extends AgentTool<any>>(
  tools: T[],
  cache: ToolCache
): T[] {
  return tools.map((t) => wrapToolWithCache(t, cache));
}
