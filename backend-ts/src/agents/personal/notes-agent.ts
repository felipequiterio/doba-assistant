import { Agent } from "@mariozechner/pi-agent-core";
import { WORKER_MODEL } from "../../llm/models";
import {
  createNoteTool,
  listNotesTool,
  updateNoteTool,
  deleteNoteTool,
} from "../../tools/personal/notes-tools";
import {
  type ToolCache,
  wrapToolsWithCache,
} from "../../orchestra/tool-cache";

const SYSTEM_PROMPT = `You are a notes management assistant. You help users create, list, update, and delete notes.

When the user asks you to create or write a note, use the createNote tool.
When the user asks to see, show, or list notes, use the listNotes tool. You can filter by tag.
When the user asks to update, edit, or change a note, use the updateNote tool.
When the user asks to remove or delete a note, use the deleteNote tool.

After executing a tool, provide a brief natural language confirmation of what you did.`;

export function createNotesAgent(cache?: ToolCache): Agent {
  const tools = [createNoteTool, listNotesTool, updateNoteTool, deleteNoteTool];
  return new Agent({
    initialState: {
      systemPrompt: SYSTEM_PROMPT,
      model: WORKER_MODEL,
      tools: cache ? wrapToolsWithCache(tools, cache) : tools,
      thinkingLevel: "off",
    },
    getApiKey: () => "ollama",
  });
}

export const NOTES_AGENT_NAME = "notes_agent";
export const NOTES_AGENT_DESCRIPTION =
  "Manages notes. Can create, list, update, and delete notes with optional tags. Use for any note-taking or information recording requests.";
