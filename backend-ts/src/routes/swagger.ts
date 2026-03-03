import { Hono } from "hono";
import { swaggerUI } from "@hono/swagger-ui";

const swaggerApp = new Hono();

const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Doba Backend API",
    version: "0.1.0",
    description:
      "TypeScript backend for the Doba personal AI assistant. REST endpoints for todos and chats. The AI agent pipeline runs over WebSocket at /chat/ws.",
  },
  servers: [{ url: "http://localhost:3001" }],
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "Health check",
        responses: {
          "200": {
            description: "Server is healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
        },
      },
    },

    "/v1/todos": {
      get: {
        tags: ["Todos"],
        summary: "List all todos",
        responses: {
          "200": {
            description: "Array of todo items",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Todo" } },
              },
            },
          },
        },
      },
      post: {
        tags: ["Todos"],
        summary: "Create a todo",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title"],
                properties: {
                  title: { type: "string", example: "Buy milk" },
                  description: { type: "string", example: "From the grocery store" },
                  status: { type: "string", enum: ["idle", "in_progress", "completed"], default: "idle" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created todo",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Todo" } } },
          },
        },
      },
    },

    "/v1/todos/{id}": {
      patch: {
        tags: ["Todos"],
        summary: "Update a todo",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  status: { type: "string", enum: ["idle", "in_progress", "completed"] },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Updated todo", content: { "application/json": { schema: { $ref: "#/components/schemas/Todo" } } } },
          "404": { description: "Todo not found" },
        },
      },
      delete: {
        tags: ["Todos"],
        summary: "Delete a todo",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Deleted successfully" },
          "404": { description: "Todo not found" },
        },
      },
    },

    "/v1/chats": {
      get: {
        tags: ["Chats"],
        summary: "List all chats",
        responses: {
          "200": {
            description: "Array of chats (most recent first)",
            content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Chat" } } } },
          },
        },
      },
      post: {
        tags: ["Chats"],
        summary: "Create a new chat",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { title: { type: "string", example: "My Chat", default: "New Chat" } },
              },
            },
          },
        },
        responses: {
          "201": { description: "Created chat", content: { "application/json": { schema: { $ref: "#/components/schemas/Chat" } } } },
        },
      },
    },

    "/v1/chats/{id}": {
      get: {
        tags: ["Chats"],
        summary: "Get chat with messages",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": {
            description: "Chat with messages array",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/Chat" },
                    {
                      type: "object",
                      properties: {
                        messages: { type: "array", items: { $ref: "#/components/schemas/Message" } },
                      },
                    },
                  ],
                },
              },
            },
          },
          "404": { description: "Chat not found" },
        },
      },
      delete: {
        tags: ["Chats"],
        summary: "Delete a chat",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Deleted successfully" },
          "404": { description: "Chat not found" },
        },
      },
    },

    "/v1/chats/{id}/title": {
      put: {
        tags: ["Chats"],
        summary: "Rename a chat",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title"],
                properties: { title: { type: "string" } },
              },
            },
          },
        },
        responses: {
          "200": { description: "Updated chat", content: { "application/json": { schema: { $ref: "#/components/schemas/Chat" } } } },
          "404": { description: "Chat not found" },
        },
      },
    },

    "/chat/ws": {
      get: {
        tags: ["WebSocket"],
        summary: "AI chat WebSocket (upgrade)",
        description: `Connect via WebSocket. Send \`{ "message": "your text", "chat_id": 1 }\`. Receives a stream of JSON events (orchestra_start, tool_start, tool_end, orchestra_end, etc.). The \`orchestra_end\` event contains \`data.final_answer\`.`,
        responses: { "101": { description: "WebSocket upgrade" } },
      },
    },
  },

  components: {
    schemas: {
      Todo: {
        type: "object",
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          description: { type: "string", nullable: true },
          status: { type: "string", enum: ["idle", "in_progress", "completed"] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Chat: {
        type: "object",
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Message: {
        type: "object",
        properties: {
          id: { type: "integer" },
          chatId: { type: "integer" },
          role: { type: "string", enum: ["user", "assistant", "system"] },
          content: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
};

swaggerApp.get("/doc", (c) => c.json(openApiSpec));

swaggerApp.get("/swagger", swaggerUI({ url: "/doc" }));

export default swaggerApp;
