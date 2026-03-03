import type { Agent } from "@mariozechner/pi-agent-core";
import {
  createTodoAgent,
  TODO_AGENT_NAME,
  TODO_AGENT_DESCRIPTION,
} from "./personal/todo-agent";

export interface AgentDefinition {
  name: string;
  description: string;
  createAgent: () => Agent;
}

export const agentRegistry = new Map<string, AgentDefinition>();

agentRegistry.set(TODO_AGENT_NAME, {
  name: TODO_AGENT_NAME,
  description: TODO_AGENT_DESCRIPTION,
  createAgent: createTodoAgent,
});
