import { Agent } from "@mariozechner/pi-agent-core";
import { WORKER_MODEL, resolveApiKey } from "../../llm/models";
import {
  createTodoTool,
  listTodosTool,
  updateTodoTool,
  deleteTodoTool,
} from "../../tools/personal/todo-tools";
import {
  type ToolCache,
  wrapToolsWithCache,
} from "../../orchestra/tool-cache";

const SYSTEM_PROMPT = `You are a todo management assistant. You help users create, list, update, and delete todo items.

When the user asks you to add or create a todo, use the createTodo tool.
When the user asks to see, show, or list todos, use the listTodos tool.
When the user asks to update, change, or mark a todo, use the updateTodo tool.
When the user asks to remove or delete a todo, use the deleteTodo tool.

After executing a tool, provide a brief natural language confirmation of what you did.`;

export function createTodoAgent(cache?: ToolCache): Agent {
  const tools = [createTodoTool, listTodosTool, updateTodoTool, deleteTodoTool];
  return new Agent({
    initialState: {
      systemPrompt: SYSTEM_PROMPT,
      model: WORKER_MODEL,
      tools: cache ? wrapToolsWithCache(tools, cache) : tools,
      thinkingLevel: "off",
    },
    getApiKey: resolveApiKey,
  });
}

export const TODO_AGENT_NAME = "todo_agent";
export const TODO_AGENT_DESCRIPTION =
  "Manages todo items. Can create, list, update, and delete todos. Use for any task management requests.";
