import { Hono } from "hono";
import { db } from "../db/client";
import { notes } from "../db/schema";
import { eq } from "drizzle-orm";

const notesApp = new Hono();

notesApp.get("/", async (c) => {
  const result = await db.select().from(notes).orderBy(notes.createdAt);
  return c.json(result);
});

notesApp.post("/", async (c) => {
  const body = await c.req.json<{
    title: string;
    content?: string;
    tags?: string[];
  }>();

  const [note] = await db
    .insert(notes)
    .values({
      title: body.title,
      content: body.content ?? null,
      tags: body.tags ?? [],
    })
    .returning();

  return c.json(note, 201);
});

notesApp.patch("/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const body = await c.req.json<{
    title?: string;
    content?: string;
    tags?: string[];
  }>();

  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) values.title = body.title;
  if (body.content !== undefined) values.content = body.content;
  if (body.tags !== undefined) values.tags = body.tags;

  const [updated] = await db
    .update(notes)
    .set(values)
    .where(eq(notes.id, id))
    .returning();

  if (!updated) return c.json({ error: "Note not found" }, 404);
  return c.json(updated);
});

notesApp.delete("/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const [deleted] = await db
    .delete(notes)
    .where(eq(notes.id, id))
    .returning();

  if (!deleted) return c.json({ error: "Note not found" }, 404);
  return c.json({ success: true });
});

export default notesApp;
