# Doba — Local AI Personal Assistant

Doba is a fully local, JARVIS-style personal AI system. It runs on your machine using [Ollama](https://ollama.com) for inference — no cloud APIs, no telemetry, no subscriptions.

Ask it to manage your todos, take notes, or answer questions. The AI agent picks the right tool, executes it, and streams every step back to you in real time.

## Architecture

```mermaid
flowchart TD
    User["Browser"]

    subgraph Backend["Backend — Bun / Hono / TypeScript"]
        WS["Hono WebSocket\n/chat/ws"]
        REST["Hono REST\n/v1/todos, /notes, /chats, /ollama"]

        subgraph Context["Context Assembly (before each router call)"]
            AssemblePrompt["assembleRouterPrompt()"]
            Tier2["Tier 2 — Warm Context\nchats.summary\n(compacted older messages)"]
            Tier1["Tier 1 — Hot Context\nlast 12 messages verbatim"]
            Query["Current user query"]
        end

        subgraph Orchestra["Orchestra Layer"]
            Router["OrchestraRouter\n(pi-agent-core Agent)\nclassifies query → picks mode"]

            Mode1["Mode 1: respondDirectly\ngeneral knowledge, greetings\n1 LLM call"]
            Mode2["Mode 2: dispatchToAgent\nsingle agent, straightforward task\n2 LLM calls"]
            Mode3["Mode 3: planMultiStep\nindependent multi-agent tasks\nN+2 LLM calls"]
            Mode4["Mode 4: callAgentAndObserve\nconditional / dependent logic\nrouter reasons between calls"]

            Runner["OrchestraRunner\ndispatches plan steps\nparallel support"]
            Synthesis["Synthesizer\ncombines multi-agent results"]
            EventBus["EventBus\npub/sub lifecycle events"]
        end

        subgraph Compaction["Context Compaction (fire-and-forget, post-response)"]
            TokenCheck{"tokens > 70%\nof context window?"}
            Compact["compactMessages()\nLLM summarizes old messages\n→ stores summary in chats.summary"]
        end

        subgraph Agents["Sub-Agents (pi-agent-core)"]
            TodoAgent["TodoAgent"]
            NotesAgent["NotesAgent"]
        end

        subgraph Tools["Tools (TypeBox-validated)"]
            TodoTools["createTodo / listTodos\nupdateTodo / deleteTodo"]
            NotesTools["createNote / listNotes\nupdateNote / deleteNote"]
        end

        subgraph LLM["LLM Layer (pi-ai)"]
            PiAI["completeSimple()\nOpenAI-compat streaming"]
        end

        subgraph DB["Database"]
            Drizzle["Drizzle ORM"]
            PG["PostgreSQL\ntodos, notes, chats,\nmessages, events"]
        end

        Ollama["Ollama\nlocal inference\n/v1 OpenAI-compat"]
    end

    User -->|"JSON over WebSocket"| WS

    WS --> AssemblePrompt
    PG -->|"chat history + summary"| AssemblePrompt
    Tier2 --> AssemblePrompt
    Tier1 --> AssemblePrompt
    Query --> AssemblePrompt
    AssemblePrompt -->|"assembled prompt\n+ shouldCompact flag"| Router

    Router --> Mode1
    Router --> Mode2
    Router --> Mode3
    Router --> Mode4

    Mode2 --> TodoAgent
    Mode2 --> NotesAgent
    Mode3 --> Runner
    Runner --> TodoAgent
    Runner --> NotesAgent
    Runner --> Synthesis

    Mode4 -->|"call agent"| TodoAgent
    Mode4 -->|"call agent"| NotesAgent
    TodoAgent -->|"result"| Mode4
    NotesAgent -->|"result"| Mode4
    Mode4 -->|"reason → call again\nor respondDirectly"| Mode4

    TodoAgent --> TodoTools
    NotesAgent --> NotesTools
    TodoTools --> Drizzle
    NotesTools --> Drizzle
    Drizzle --> PG

    Router --> PiAI
    TodoAgent --> PiAI
    NotesAgent --> PiAI
    Synthesis --> PiAI
    Compact --> PiAI
    PiAI --> Ollama

    Mode1 -->|"answer"| WS
    Mode2 -->|"result"| WS
    Synthesis -->|"final answer"| WS
    Mode4 -->|"final answer via\nrespondDirectly"| WS

    WS -->|"after response"| TokenCheck
    TokenCheck -->|"yes"| Compact
    Compact -->|"summary saved"| PG

    EventBus -->|"streamed JSON events"| WS
    WS -->|"events + answers"| User

    User -->|"REST"| REST
    REST --> Drizzle
```

- **Hono** on **Bun** handles HTTP and WebSocket
- **pi-agent-core** runs the agentic loop (LLM → tool call → observe → loop)
- **pi-ai** provides a unified streaming API over Ollama's OpenAI-compatible endpoint
- **Drizzle ORM** manages PostgreSQL with type-safe queries
- **EventBus** streams lifecycle events (task start, tool selection, tool result, etc.) to the client in real time
- **Three-tier context model** manages the router's context window:
  - **Tier 1 (Hot)**: last 12 messages kept verbatim
  - **Tier 2 (Warm)**: older messages compacted into a rolling summary via LLM
  - Compaction triggers automatically (fire-and-forget) when token usage exceeds 70% of the context window

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
        │   ├── notes.ts                 # REST notes CRUD
        │   ├── ollama.ts               # Ollama model management (stats, load, unload)
        │   ├── swagger.ts               # OpenAPI spec + Swagger UI
        │   └── playground.ts            # Browser test page
        ├── orchestra/
        │   ├── index.ts                 # run() — main orchestration entry point
        │   ├── router.ts               # Smart 4-mode router (respondDirectly / dispatchToAgent / planMultiStep / callAgentAndObserve)
        │   ├── runner.ts               # Multi-step plan executor (sequential + parallel)
        │   ├── synthesis.ts            # Final answer synthesis for multi-agent results
        │   └── events.ts               # EventBus + event type definitions
        ├── agents/
        │   ├── registry.ts             # Agent registry (name → factory)
        │   └── personal/
        │       ├── todo-agent.ts       # TodoAgent definition
        │       └── notes-agent.ts      # NotesAgent definition
        ├── tools/
        │   └── personal/
        │       ├── todo-tools.ts       # createTodo, listTodos, updateTodo, deleteTodo
        │       └── notes-tools.ts      # createNote, listNotes, updateNote, deleteNote
        ├── llm/
        │   ├── models.ts              # Ollama model definitions (ROUTER, WORKER, THINKING)
        │   └── preload.ts             # Warm models into VRAM at startup
        ├── db/
        │   ├── schema.ts              # Drizzle schema (todos, chats, messages, events, notes)
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
| GET | `/v1/notes` | List all notes |
| POST | `/v1/notes` | Create a note |
| PATCH | `/v1/notes/:id` | Update a note |
| DELETE | `/v1/notes/:id` | Delete a note |
| GET | `/v1/chats` | List all chats |
| POST | `/v1/chats` | Create a chat |
| GET | `/v1/chats/:id` | Get chat with messages |
| DELETE | `/v1/chats/:id` | Delete a chat |
| PUT | `/v1/chats/:id/title` | Rename a chat |
| GET | `/v1/ollama/stats` | Running models and VRAM usage |
| GET | `/v1/ollama/models` | List available Ollama models |
| POST | `/v1/ollama/load` | Load a model into VRAM |
| POST | `/v1/ollama/unload` | Unload a model from VRAM |

## How It Works

1. **User sends a message** over WebSocket
2. **Orchestra** emits `orchestra_start`
3. **Smart Router** (an LLM-powered Agent with four tools) classifies the query into one of four modes:
   - **Mode 1 — Direct Response**: general knowledge, greetings, conversational queries. The router answers directly (1 LLM call).
   - **Mode 2 — Single Agent Dispatch**: the query maps to one agent (e.g. "add milk to my todos" → TodoAgent). The router dispatches and the agent runs its agentic loop (2 LLM calls).
   - **Mode 3 — Multi-Step Plan**: the query requires multiple agents with independent tasks (e.g. "summarize my notes and create todos for action items"). The router builds a plan, the runner dispatches each step, and a synthesis LLM call combines the results.
   - **Mode 4 — Adaptive Orchestration**: the query involves conditional logic or result-dependent decisions (e.g. "check my todos, if there's one about project X mark it done, otherwise create it"). The router calls agents one at a time, observes results, reasons about them, and decides the next action — all within its own agentic loop. After all needed calls, the router delivers a final synthesized answer.
4. **Agents** run their agentic loop via pi-agent-core: LLM → tool call → observe → loop until done
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
- [x] **Phase 3** — Smart 4-mode router + NotesAgent + all REST routes
- [x] **Phase 4** — Context management + compaction
- [ ] **Phase 5** — Semantic memory (pgvector)
- [ ] **Phase 6** — Knowledge graph
- [ ] **Phase 7** — New agents (calendar, web search, IoT, RAG)

## License

Private project.
