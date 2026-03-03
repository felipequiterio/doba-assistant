import type { Agent } from "@mariozechner/pi-agent-core";
import {
  createTodoAgent,
  TODO_AGENT_NAME,
  TODO_AGENT_DESCRIPTION,
} from "./personal/todo-agent";
import {
  createNotesAgent,
  NOTES_AGENT_NAME,
  NOTES_AGENT_DESCRIPTION,
} from "./personal/notes-agent";
import type { ToolCache } from "../orchestra/tool-cache";

export interface AgentDefinition {
  name: string;
  description: string;
  createAgent: (cache?: ToolCache) => Agent;
}

export const agentRegistry = new Map<string, AgentDefinition>();

agentRegistry.set(TODO_AGENT_NAME, {
  name: TODO_AGENT_NAME,
  description: TODO_AGENT_DESCRIPTION,
  createAgent: createTodoAgent,
});

agentRegistry.set(NOTES_AGENT_NAME, {
  name: NOTES_AGENT_NAME,
  description: NOTES_AGENT_DESCRIPTION,
  createAgent: createNotesAgent,
});
