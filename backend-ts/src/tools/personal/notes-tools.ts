import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { db } from "../../db/client";
import { notes } from "../../db/schema";
import { eq, sql } from "drizzle-orm";

// --- createNote ---

const createNoteParams = Type.Object({
  title: Type.String({ description: "Title of the note" }),
  content: Type.Optional(
    Type.String({ description: "Text content of the note" })
  ),
  tags: Type.Optional(
    Type.Array(Type.String(), {
      description: "Tags to categorize the note",
    })
  ),
});

export const createNoteTool: AgentTool<typeof createNoteParams> = {
  name: "createNote",
  label: "Create Note",
  description:
    "Creates a new note. Use this when the user wants to save a note, write something down, or record information.",
  parameters: createNoteParams,
  async execute(_toolCallId, params) {
    const [inserted] = await db
      .insert(notes)
      .values({
        title: params.title,
        content: params.content ?? null,
        tags: params.tags ?? [],
      })
      .returning();

    return {
      content: [{ type: "text", text: JSON.stringify(inserted) }],
      details: inserted,
    };
  },
};

// --- listNotes ---

const listNotesParams = Type.Object({
  tag: Type.Optional(
    Type.String({ description: "Filter notes by this tag" })
  ),
});

export const listNotesTool: AgentTool<typeof listNotesParams> = {
  name: "listNotes",
  label: "List Notes",
  description:
    "Lists notes, optionally filtered by tag. Returns all notes if no tag filter is provided.",
  parameters: listNotesParams,
  async execute(_toolCallId, params) {
    let results;
    if (params.tag) {
      results = await db
        .select()
        .from(notes)
        .where(sql`${notes.tags} @> ${JSON.stringify([params.tag])}::jsonb`);
    } else {
      results = await db.select().from(notes);
    }

    return {
      content: [{ type: "text", text: JSON.stringify(results) }],
      details: results,
    };
  },
};

// --- updateNote ---

const updateNoteParams = Type.Object({
  id: Type.Number({ description: "The ID of the note to update" }),
  title: Type.Optional(Type.String({ description: "New title" })),
  content: Type.Optional(Type.String({ description: "New content" })),
  tags: Type.Optional(
    Type.Array(Type.String(), { description: "New tags array" })
  ),
});

export const updateNoteTool: AgentTool<typeof updateNoteParams> = {
  name: "updateNote",
  label: "Update Note",
  description:
    "Updates an existing note by ID. Can change title, content, and/or tags.",
  parameters: updateNoteParams,
  async execute(_toolCallId, params) {
    const { id, ...updates } = params;
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.title !== undefined) values.title = updates.title;
    if (updates.content !== undefined) values.content = updates.content;
    if (updates.tags !== undefined) values.tags = updates.tags;

    const [updated] = await db
      .update(notes)
      .set(values)
      .where(eq(notes.id, id))
      .returning();

    if (!updated) {
      return {
        content: [{ type: "text", text: `Note with id ${id} not found` }],
        details: null,
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(updated) }],
      details: updated,
    };
  },
};

// --- deleteNote ---

const deleteNoteParams = Type.Object({
  id: Type.Number({ description: "The ID of the note to delete" }),
});

export const deleteNoteTool: AgentTool<typeof deleteNoteParams> = {
  name: "deleteNote",
  label: "Delete Note",
  description: "Deletes a note by its ID.",
  parameters: deleteNoteParams,
  async execute(_toolCallId, params) {
    const [deleted] = await db
      .delete(notes)
      .where(eq(notes.id, params.id))
      .returning();

    if (!deleted) {
      return {
        content: [
          { type: "text", text: `Note with id ${params.id} not found` },
        ],
        details: null,
      };
    }

    return {
      content: [{ type: "text", text: `Deleted note: ${deleted.title}` }],
      details: deleted,
    };
  },
};
