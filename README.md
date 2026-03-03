# Doba — Local AI Personal Assistant

Doba is a fully local, JARVIS-style personal AI system. It runs on your machine using [Ollama](https://ollama.com) for inference — no cloud APIs, no telemetry, no subscriptions.

Ask it to manage your todos, take notes, or answer questions. The AI agent picks the right tool, executes it, and streams every step back to you in real time.

## Architecture

```
Browser ──WebSocket──► Hono server ──► Orchestra ──► Agent ──► Tools ──► PostgreSQL
   ▲                                      │
   └──── streamed JSON events ◄────── EventBus
```

- **Hono** on **Bun** handles HTTP and WebSocket
- **pi-agent-core** runs the agentic loop (LLM → tool call → observe → loop)
- **pi-ai** provides a unified streaming API over Ollama's OpenAI-compatible endpoint
- **Drizzle ORM** manages PostgreSQL with type-safe queries
- **EventBus** streams lifecycle events (task start, tool selection, tool result, etc.) to the client in real time

## Prerequisites

- [Bun](https://bun.sh) (v1.1+)
- [Docker](https://docs.docker.com/get-docker/) (for PostgreSQL)
- [Ollama](https://ollama.com) running locally with a model pulled:
  ```bash
  ollama pull qwen3.5:4b
  ollama pull qwen3.5:9b
  ```

## Quick Start

```bash
# 1. Clone and enter the project
git clone <repo-url> doba-assistant
cd doba-assistant

# 2. Full setup: start DB, install deps, run migrations
make setup

# 3. Start the dev server
make dev
```

The server starts at **http://localhost:3001**. Open these in your browser:

| URL | What |
|-----|------|
| [localhost:3001/playground](http://localhost:3001/playground) | Interactive chat + event bus viewer |
| [localhost:3001/swagger](http://localhost:3001/swagger) | Swagger UI for all REST endpoints |
| [localhost:3001/health](http://localhost:3001/health) | Health check |

## Project Structure

```
doba-assistant/
├── Makefile                  # Dev commands (make dev, make test, etc.)
├── docker-compose.yml        # PostgreSQL 16
├── REFACTOR.md               # Full architecture document
└── backend-ts/
    ├── package.json
    ├── drizzle.config.ts
    └── src/
        ├── server.ts                    # Hono app, middleware, route mounting
        ├── routes/
        │   ├── chat.ts                  # WebSocket handler + REST chat CRUD
        │   ├── todos.ts                 # REST todo CRUD
        │   ├── swagger.ts               # OpenAPI spec + Swagger UI
        │   └── playground.ts            # Browser test page
        ├── orchestra/
        │   ├── index.ts                 # run() — main orchestration entry point
        │   ├── router.ts               # Query → agent routing
        │   └── events.ts               # EventBus + event type definitions
        ├── agents/
        │   ├── registry.ts             # Agent registry (name → factory)
        │   └── personal/
        │       └── todo-agent.ts       # TodoAgent definition
        ├── tools/
        │   └── personal/
        │       └── todo-tools.ts       # createTodo, listTodos, updateTodo, deleteTodo
        ├── llm/
        │   ├── models.ts              # Ollama model definitions (ROUTER, WORKER, THINKING)
        │   └── preload.ts             # Warm models into VRAM at startup
        ├── db/
        │   ├── schema.ts              # Drizzle schema (todos, chats, messages, events)
        │   └── client.ts              # Database connection
        └── test/
            └── smoke.test.ts          # EventBus, DB, and pi-ai integration tests
```

## Make Targets

```
make setup           # Start DB + install deps + run migrations
make dev             # Start the backend dev server
make test            # Run tests
make build           # Type-check (tsc --noEmit)
make db              # Start PostgreSQL container
make db-stop         # Stop PostgreSQL
make db-reset        # Destroy and recreate DB volume
make migrate         # Apply Drizzle migrations
make migrate-generate # Generate migration from schema changes
```

## API

### WebSocket — `/chat/ws`

Connect via WebSocket. Send a JSON message, receive a stream of events:

```json
// Send
{ "message": "add buy milk to my todo list", "chat_id": 1 }

// Receive (stream of events)
{ "type": "orchestra_start", "source": "orchestra", "data": { "query": "..." }, "timestamp": "..." }
{ "type": "tool_start", "source": "todo_agent", "data": { "tool": "createTodo", "args": { "title": "buy milk" } }, "timestamp": "..." }
{ "type": "tool_end", "source": "todo_agent", "data": { "tool": "createTodo", "result": "..." }, "timestamp": "..." }
{ "type": "orchestra_end", "source": "orchestra", "data": { "final_answer": "Done! I added 'buy milk' to your todo list." }, "timestamp": "..." }
```

### REST

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/todos` | List all todos |
| POST | `/v1/todos` | Create a todo |
| PATCH | `/v1/todos/:id` | Update a todo |
| DELETE | `/v1/todos/:id` | Delete a todo |
| GET | `/v1/chats` | List all chats |
| POST | `/v1/chats` | Create a chat |
| GET | `/v1/chats/:id` | Get chat with messages |
| DELETE | `/v1/chats/:id` | Delete a chat |
| PUT | `/v1/chats/:id/title` | Rename a chat |

## How It Works

1. **User sends a message** over WebSocket
2. **Orchestra** emits `orchestra_start`, creates a fresh agent instance
3. **Router** picks which agent handles the query (currently hardcoded to TodoAgent; smart 3-mode routing comes in Phase 3)
4. **Agent** runs its agentic loop via pi-agent-core: calls the LLM, the LLM picks a tool, the tool executes, the result feeds back to the LLM
5. **Tools** execute Drizzle queries against PostgreSQL
6. **EventBus** streams every lifecycle event to the WebSocket client in real time
7. **Orchestra** extracts the final answer and emits `orchestra_end`
8. Messages are persisted to the database

## Configuration

Environment variables in `backend-ts/.env`:

```
DATABASE_URL=postgres://doba:doba@localhost:5432/doba
OLLAMA_BASE_URL=http://localhost:11434/v1
PORT=3001
```

## Roadmap

See [REFACTOR.md](REFACTOR.md) for the full architecture document. Current progress:

- [x] **Phase 1** — Project skeleton, database, EventBus, Ollama integration
- [x] **Phase 2** — First agent end-to-end (TodoAgent + WebSocket + REST)
- [ ] **Phase 3** — Smart 3-mode router + NotesAgent + all REST routes
- [ ] **Phase 4** — Context management + compaction
- [ ] **Phase 5** — Semantic memory (pgvector)
- [ ] **Phase 6** — Knowledge graph
- [ ] **Phase 7** — New agents (calendar, web search, IoT, RAG)

## License

Private project.
