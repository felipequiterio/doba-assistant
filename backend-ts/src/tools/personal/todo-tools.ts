import { Type, type Static } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { db } from "../../db/client";
import { todos } from "../../db/schema";
import { eq } from "drizzle-orm";

const TodoStatus = StringEnum(["idle", "in_progress", "completed"] as const, {
  description: "The status of the todo item",
});

// --- createTodo ---

const createTodoParams = Type.Object({
  title: Type.String({ description: "Title of the todo item" }),
  description: Type.Optional(
    Type.String({ description: "Optional description for the todo item" })
  ),
});

export const createTodoTool: AgentTool<typeof createTodoParams> = {
  name: "createTodo",
  label: "Create Todo",
  description:
    "Creates a new todo item. Use this when the user wants to add a task or reminder.",
  parameters: createTodoParams,
  async execute(_toolCallId, params) {
    const [inserted] = await db
      .insert(todos)
      .values({
        title: params.title,
        description: params.description ?? null,
      })
      .returning();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(inserted),
        },
      ],
      details: inserted,
    };
  },
};

// --- listTodos ---

const listTodosParams = Type.Object({
  status: Type.Optional(
    TodoStatus
  ),
});

export const listTodosTool: AgentTool<typeof listTodosParams> = {
  name: "listTodos",
  label: "List Todos",
  description:
    "Lists todo items, optionally filtered by status (idle, in_progress, completed). Returns all todos if no status filter is provided.",
  parameters: listTodosParams,
  async execute(_toolCallId, params) {
    let results;
    if (params.status) {
      results = await db
        .select()
        .from(todos)
        .where(eq(todos.status, params.status));
    } else {
      results = await db.select().from(todos);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(results),
        },
      ],
      details: results,
    };
  },
};

// --- updateTodo ---

const updateTodoParams = Type.Object({
  id: Type.Number({ description: "The ID of the todo to update" }),
  title: Type.Optional(Type.String({ description: "New title" })),
  description: Type.Optional(Type.String({ description: "New description" })),
  status: Type.Optional(TodoStatus),
});

export const updateTodoTool: AgentTool<typeof updateTodoParams> = {
  name: "updateTodo",
  label: "Update Todo",
  description:
    "Updates an existing todo item by ID. Can change title, description, and/or status.",
  parameters: updateTodoParams,
  async execute(_toolCallId, params) {
    const { id, ...updates } = params;
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.title !== undefined) values.title = updates.title;
    if (updates.description !== undefined)
      values.description = updates.description;
    if (updates.status !== undefined) values.status = updates.status;

    const [updated] = await db
      .update(todos)
      .set(values)
      .where(eq(todos.id, id))
      .returning();

    if (!updated) {
      return {
        content: [{ type: "text", text: `Todo with id ${id} not found` }],
        details: null,
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(updated) }],
      details: updated,
    };
  },
};

// --- deleteTodo ---

const deleteTodoParams = Type.Object({
  id: Type.Number({ description: "The ID of the todo to delete" }),
});

export const deleteTodoTool: AgentTool<typeof deleteTodoParams> = {
  name: "deleteTodo",
  label: "Delete Todo",
  description: "Deletes a todo item by its ID.",
  parameters: deleteTodoParams,
  async execute(_toolCallId, params) {
    const [deleted] = await db
      .delete(todos)
      .where(eq(todos.id, params.id))
      .returning();

    if (!deleted) {
      return {
        content: [
          { type: "text", text: `Todo with id ${params.id} not found` },
        ],
        details: null,
      };
    }

    return {
      content: [{ type: "text", text: `Deleted todo: ${deleted.title}` }],
      details: deleted,
    };
  },
};
