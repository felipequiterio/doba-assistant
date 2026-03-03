import { Hono } from "hono";
import { db } from "../db/client";
import { todos } from "../db/schema";
import { eq } from "drizzle-orm";

const todosApp = new Hono();

todosApp.get("/", async (c) => {
  const result = await db.select().from(todos).orderBy(todos.createdAt);
  return c.json(result);
});

todosApp.post("/", async (c) => {
  const body = await c.req.json<{
    title: string;
    description?: string;
    status?: "idle" | "in_progress" | "completed";
  }>();

  const [todo] = await db
    .insert(todos)
    .values({
      title: body.title,
      description: body.description ?? null,
      status: body.status ?? "idle",
    })
    .returning();

  return c.json(todo, 201);
});

todosApp.patch("/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const body = await c.req.json<{
    title?: string;
    description?: string;
    status?: "idle" | "in_progress" | "completed";
  }>();

  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) values.title = body.title;
  if (body.description !== undefined) values.description = body.description;
  if (body.status !== undefined) values.status = body.status;

  const [updated] = await db
    .update(todos)
    .set(values)
    .where(eq(todos.id, id))
    .returning();

  if (!updated) return c.json({ error: "Todo not found" }, 404);
  return c.json(updated);
});

todosApp.delete("/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const [deleted] = await db
    .delete(todos)
    .where(eq(todos.id, id))
    .returning();

  if (!deleted) return c.json({ error: "Todo not found" }, 404);
  return c.json({ success: true });
});

export default todosApp;
