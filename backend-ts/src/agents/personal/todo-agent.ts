import { Agent } from "@mariozechner/pi-agent-core";
import {
  WORKER_MODEL,
  THINKING_MODEL,
  resolveApiKey,
  type ThinkingLevel,
} from "../../llm/models";
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
import { withCallGuard } from "../tool-guard";

const SYSTEM_PROMPT = `You are a todo management assistant. You help users create, list, update, and delete todo items.

CRITICAL RULES — follow these exactly:
- Call each tool AT MOST ONCE per response. After you receive a tool result, stop calling tools and write your answer.
- ALWAYS use the actual data returned by tools in your response. NEVER write placeholder text like "[insert results here]" or "[list of todos]".
- If the task asks you to check a condition (e.g. "if todo X exists, do Y"), call the relevant tool once to check, then decide and act — do not call it again.

Tool usage:
- createTodo: when user wants to add or create a new todo item.
- listTodos: when user wants to see, show, or list their todos. You can filter by status.
- updateTodo: when user wants to update, change, mark, or complete a todo.
- deleteTodo: when user wants to remove or delete a todo.

After each tool call, respond with a clear, concise confirmation using the REAL data from the tool result.`;

export function createTodoAgent(
  cache?: ToolCache,
  thinkingLevel: ThinkingLevel = "off"
): Agent {
  const usesThinking = thinkingLevel !== "off";
  const model = usesThinking ? THINKING_MODEL : WORKER_MODEL;
  const baseTools = [createTodoTool, listTodosTool, updateTodoTool, deleteTodoTool];
  const cachedTools = cache ? wrapToolsWithCache(baseTools, cache) : baseTools;
  return new Agent({
    initialState: {
      systemPrompt: SYSTEM_PROMPT,
      model,
      tools: withCallGuard(cachedTools),
      thinkingLevel,
    },
    getApiKey: resolveApiKey,
  });
}

export const TODO_AGENT_NAME = "todo_agent";
export const TODO_AGENT_DESCRIPTION =
  "Manages todo items. Can create, list, update, and delete todos. Use for any task management requests.";
