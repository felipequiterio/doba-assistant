import { Agent } from "@mariozechner/pi-agent-core";
import { WORKER_MODEL, resolveApiKey } from "../../llm/models";
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
import { withCallGuard } from "../tool-guard";

const SYSTEM_PROMPT = `You are a notes management assistant. You help users create, list, update, and delete notes.

CRITICAL RULES — follow these exactly:
- Call each tool AT MOST ONCE per response. After you receive a tool result, stop calling tools and write your answer.
- ALWAYS use the actual data returned by tools in your response. NEVER write placeholder text like "[insert results here]" or "[list of notes]".
- If the task asks you to check a condition (e.g. "if note X exists, do Y"), call the relevant tool once to check, then decide and act — do not call it again.

Tool usage:
- createNote: when user wants to create or write a new note.
- listNotes: when user wants to see, show, or list their notes. You can filter by tag.
- updateNote: when user wants to update, edit, or change a note.
- deleteNote: when user wants to remove or delete a note.

After each tool call, respond with a clear, concise confirmation using the REAL data from the tool result.`;

export function createNotesAgent(cache?: ToolCache): Agent {
  const baseTools = [createNoteTool, listNotesTool, updateNoteTool, deleteNoteTool];
  const cachedTools = cache ? wrapToolsWithCache(baseTools, cache) : baseTools;
  return new Agent({
    initialState: {
      systemPrompt: SYSTEM_PROMPT,
      model: WORKER_MODEL,
      tools: withCallGuard(cachedTools),
      thinkingLevel: "off",
    },
    getApiKey: resolveApiKey,
  });
}

export const NOTES_AGENT_NAME = "notes_agent";
export const NOTES_AGENT_DESCRIPTION =
  "Manages notes. Can create, list, update, and delete notes with optional tags. Use for any note-taking or information recording requests.";
