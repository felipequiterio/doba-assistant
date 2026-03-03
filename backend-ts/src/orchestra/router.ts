import type { AgentDefinition } from "../agents/registry";

/**
 * Phase 2 simplified router: always dispatches to the first registered agent.
 * Phase 3 will replace this with an LLM-based three-mode classifier
 * (respondDirectly / dispatchToAgent / planMultiStep).
 */
export function routeQuery(
  _query: string,
  agents: Map<string, AgentDefinition>
): { agentName: string; task: string } | null {
  const first = agents.values().next();
  if (first.done) return null;

  const agent = first.value;
  return {
    agentName: agent.name,
    task: _query,
  };
}
