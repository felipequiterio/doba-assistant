# Doba — Personal AI Assistant

Doba is a JARVIS-style personal AI assistant with a pluggable LLM backend. It supports both **Ollama** (fully local, free) and **OpenRouter** (cloud, pay-per-use). Ask it to manage your todos, write notes, or answer questions. A smart router classifies every query and picks the most efficient execution path — from a direct answer to a coordinated multi-agent plan.

## Architecture

```mermaid
flowchart TD
    User["Browser / WebSocket client"]

    subgraph Backend["Backend — Bun / Hono / TypeScript"]
        WS["Hono WebSocket\n/chat/ws"]
        REST["Hono REST\n/v1/*"]

        subgraph Context["Context Assembly"]
            AssemblePrompt["assembleRouterPrompt()"]
            Tier2["Tier 2 — Warm\nchats.summary (LLM-compacted)"]
            Tier1["Tier 1 — Hot\nlast 12 messages verbatim"]
        end

        subgraph Orchestra["Orchestra Layer"]
            Router["Smart Router\n(pi-agent-core Agent)\nclassifies → picks mode"]

            Mode1["direct\nGeneral knowledge / greetings\n1 LLM call"]
            Mode2["single\nOne agent, autonomous task\n2 LLM calls"]
            Mode3["multi\nIndependent multi-agent plan\nN+2 LLM calls + synthesis"]
            Mode4["observe\ncallAgentAndObserve\nrouter reasons between agent calls"]

            Runner["OrchestraRunner\nsequential + parallel steps\nshared ToolCache"]
            Synthesis["Synthesizer\ncombines multi-step results\nuses THINKING_MODEL when steps required reasoning"]
            EventBus["EventBus\npub/sub lifecycle events\n→ streamed to client + persisted to DB"]
            EventBridge["event-bridge.ts\nbridgeAgentEvent()\nrunAgentWithGuards()\n10-turn cap + 60s timeout"]
        end

        subgraph Safety["Safety Layer"]
            ToolGuard["withCallGuard()\nper-tool call counter\ninjects stop message on repeat"]
            IterCap["runAgentWithGuards()\n10-turn hard cap\n60s wall-clock timeout"]
        end

        subgraph Agents["Sub-Agents (pi-agent-core)"]
            TodoAgent["TodoAgent\nWORKER_MODEL or THINKING_MODEL\nbased on router thinking_level"]
            NotesAgent["NotesAgent\nWORKER_MODEL or THINKING_MODEL\nbased on router thinking_level"]
        end

        subgraph Tools["Tools (TypeBox-validated)"]
            TodoTools["createTodo / listTodos\nupdateTodo / deleteTodo"]
            NotesTools["createNote / listNotes\nupdateNote / deleteNote"]
            ToolCache["ToolCache\ncaches read-only results\nwithin a single plan execution"]
        end

        subgraph LLM["LLM Layer (pi-ai / pi-agent-core)"]
            Models["models.ts\nROUTER_MODEL\nWORKER_MODEL\nTHINKING_MODEL\nresolveApiKey()"]
        end

        subgraph DB["Database"]
            Drizzle["Drizzle ORM"]
            PG["PostgreSQL\ntodos, notes, chats,\nmessages, events"]
        end

        LLMBackend["Ollama (local)\nor OpenRouter (cloud)\nselected via LLM_PROVIDER env var"]
    end

    User -->|"JSON over WebSocket"| WS
    WS --> AssemblePrompt
    PG -->|"history + summary"| AssemblePrompt
    Tier2 & Tier1 --> AssemblePrompt
    AssemblePrompt --> Router

    Router --> Mode1 & Mode2 & Mode3 & Mode4

    Mode2 -->|"thinking_level from router"| TodoAgent & NotesAgent
    Mode3 --> Runner
    Runner -->|"thinking_level per step"| TodoAgent & NotesAgent
    Runner --> Synthesis
    Mode4 -->|"inline agent calls"| TodoAgent & NotesAgent

    TodoAgent --> TodoTools
    NotesAgent --> NotesTools
    TodoTools & NotesTools --> ToolCache
    ToolCache --> Drizzle
    Drizzle --> PG

    EventBridge --> EventBus
    EventBus -->|"streamed events"| WS
    EventBus -->|"bulk insert on response end"| PG

    Models --> LLMBackend
    ToolGuard --> TodoTools & NotesTools
    IterCap --> TodoAgent & NotesAgent
```

### Routing Modes

| Mode | Tool | When used | Agents called |
|---|---|---|---|
| `direct` | `respondDirectly` | Greetings, general knowledge, no personal data needed | None |
| `single` | `dispatchToAgent` | One agent, one task | 1 |
| `multi` | `planMultiStep` | Multiple independent tasks | 2+ in parallel or sequence |
| `observe` | `callAgentAndObserve` + `respondDirectly` | Conditional logic, result-dependent decisions | 1–N (inline in router loop) |

### Dynamic Thinking Levels

The router assigns a `thinking_level` per task (`"off"` / `"low"` / `"high"`). Agents and synthesis use `THINKING_MODEL` when the level is not `"off"`, `WORKER_MODEL` otherwise. Simple CRUD never touches the thinking model — you pay for deep reasoning only when the query genuinely needs it.

| Level | When | Model used |
|---|---|---|
| `off` | CRUD, lookups, formatting | WORKER_MODEL |
| `low` | Cross-referencing, moderate analysis | THINKING_MODEL |
| `high` | Deep planning, creative synthesis, trend analysis | THINKING_MODEL |

### Safety Guarantees

- **10-turn hard cap** — `runAgentWithGuards()` aborts an agent after 10 LLM turns
- **60-second wall-clock timeout** — rejects with an error if the agent takes too long
- **`withCallGuard()`** — per-tool repeat counter; injects a forced stop message after 2 calls on the same tool
- **`callAgentAndObserve` guard** — router's inline agent tool is capped at 5 calls per request
- **Compaction chaining** — successive context compactions extend the existing summary rather than overwriting it, preventing early history loss

---

## Quick Start

### Option A — OpenRouter (cloud)

No local GPU required. Get an API key at [openrouter.ai](https://openrouter.ai).

```bash
# 1. Clone and set up
git clone <repo-url> doba-assistant
cd doba-assistant
make setup

# 2. Configure
cp backend-ts/.env.example backend-ts/.env
# Edit .env:
#   LLM_PROVIDER=openrouter
#   OPENROUTER_API_KEY=sk-or-...
#   OPENROUTER_ROUTER_MODEL=qwen/qwen3-235b-a22b-2507
#   OPENROUTER_WORKER_MODEL=qwen/qwen3-30b-a3b
#   OPENROUTER_THINKING_MODEL=qwen/qwq-32b

# 3. Start
make dev
```

### Option B — Ollama (local, free)

Requires a machine with enough VRAM (or CPU RAM for smaller models).

```bash
# Install Ollama and pull models
ollama pull qwen3:8b
ollama pull qwen3:8b   # or any OpenAI-compat model

# Configure .env
#   LLM_PROVIDER=ollama
#   OLLAMA_BASE_URL=http://localhost:11434/v1

make setup && make dev
```

The server starts at **http://localhost:3001**.

| URL | What |
|-----|------|
| [/playground](http://localhost:3001/playground) | Chat UI + live event bus viewer |
| [/swagger](http://localhost:3001/swagger) | Swagger UI for all REST endpoints |
| [/health](http://localhost:3001/health) | Health check |

---

## Project Structure

```
doba-assistant/
├── Makefile
├── docker-compose.yml          # PostgreSQL 16
└── backend-ts/
    ├── .env                    # Environment config (provider, API keys, model IDs)
    └── src/
        ├── server.ts           # Hono app, middleware, route mounting
        ├── routes/
        │   ├── chat.ts         # WebSocket handler + REST chat CRUD + event retrieval
        │   ├── todos.ts        # REST todo CRUD
        │   ├── notes.ts        # REST notes CRUD
        │   ├── ollama.ts       # Provider info, active models, OpenRouter credits
        │   ├── swagger.ts      # OpenAPI spec + Swagger UI
        │   └── playground.ts   # Browser playground (chat + event bus viewer)
        ├── orchestra/
        │   ├── index.ts        # run() — main orchestration entry point
        │   ├── router.ts       # Smart 4-mode router with thinking_level + call guard
        │   ├── runner.ts       # Plan executor (sequential + parallel, ToolCache)
        │   ├── synthesis.ts    # Multi-agent result synthesis (THINKING_MODEL-aware)
        │   ├── context.ts      # Context assembly + compaction chaining
        │   ├── event-bridge.ts # bridgeAgentEvent() + runAgentWithGuards()
        │   ├── events.ts       # EventBus + EventType definitions
        │   ├── usage.ts        # CallUsage type + token/cost aggregation helpers
        │   └── tool-cache.ts   # Read-only tool result cache (per plan execution)
        ├── agents/
        │   ├── registry.ts     # Agent registry (name → factory)
        │   ├── tool-guard.ts   # withCallGuard() — per-tool repeat limiter
        │   └── personal/
        │       ├── todo-agent.ts   # TodoAgent (WORKER or THINKING model)
        │       └── notes-agent.ts  # NotesAgent (WORKER or THINKING model)
        ├── tools/
        │   └── personal/
        │       ├── todo-tools.ts   # createTodo, listTodos, updateTodo, deleteTodo
        │       └── notes-tools.ts  # createNote, listNotes, updateNote, deleteNote
        ├── llm/
        │   ├── models.ts       # ROUTER/WORKER/THINKING_MODEL, resolveApiKey(), ThinkingLevel
        │   └── preload.ts      # Ollama VRAM warm-up (skipped for OpenRouter)
        ├── db/
        │   ├── schema.ts       # Drizzle schema (todos, notes, chats, messages, events)
        │   └── client.ts       # DB connection
        └── test/
            └── smoke.test.ts   # EventBus, DB, and pi-ai integration tests
```

---

## Configuration

All environment variables in `backend-ts/.env`:

```bash
# Database
DATABASE_URL=postgres://doba:doba@localhost:5432/doba

# Provider — "ollama" or "openrouter"
LLM_PROVIDER=openrouter

# Ollama (used when LLM_PROVIDER=ollama)
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_API_KEY=ollama

# OpenRouter (used when LLM_PROVIDER=openrouter)
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_ROUTER_MODEL=qwen/qwen3-235b-a22b-2507   # intent classification
OPENROUTER_WORKER_MODEL=qwen/qwen3-30b-a3b          # CRUD agents + synthesis
OPENROUTER_THINKING_MODEL=qwen/qwq-32b              # deep reasoning (on demand)

PORT=3001
```

### Model Roles

| Role | Purpose | Default (OpenRouter) |
|---|---|---|
| `ROUTER_MODEL` | Query classification, mode selection | `qwen/qwen3-235b-a22b-2507` |
| `WORKER_MODEL` | Agent execution, simple synthesis | `qwen/qwen3-30b-a3b` |
| `THINKING_MODEL` | Deep analysis, planning, synthesis over complex results | `qwen/qwq-32b` |

---

## API

### WebSocket — `/chat/ws`

Send a JSON message, receive a stream of typed events:

```json
// Send
{ "message": "add buy milk to my todos", "chat_id": 1 }

// Receive — stream of events
{ "type": "orchestra_start",    "source": "orchestra",  "data": { "query": "..." } }
{ "type": "task_generation_end","source": "orchestra",  "data": { "mode": "single", "agent": "todo_agent" } }
{ "type": "agent_start",        "source": "todo_agent", "data": { "task": "..." } }
{ "type": "tool_selection",     "source": "todo_agent", "data": { "tool": "createTodo", "args": {...} } }
{ "type": "tool_end",           "source": "todo_agent", "data": { "tool": "createTodo", "result": "..." } }
{ "type": "llm_call",           "source": "todo_agent", "data": { "model": "...", "input": 412, "output": 88, "cost": 0.00003 } }
{ "type": "orchestra_end",      "source": "orchestra",  "data": { "final_answer": "Done!", "mode": "single", "usage": {...} } }
```

### REST Endpoints

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
| GET | `/v1/chats/:id/events` | Get persisted event log for a chat |
| GET | `/v1/ollama/active-models` | Active model IDs (provider-agnostic) |
| GET | `/v1/ollama/credits` | OpenRouter credit balance (OpenRouter only) |
| GET | `/v1/ollama/stats` | Ollama running models + VRAM (Ollama only) |
| GET | `/v1/ollama/models` | Available Ollama models (Ollama only) |

---

## Make Targets

```
make setup            # Start DB + install deps + run migrations
make dev              # Start the backend dev server
make test             # Run smoke tests
make build            # Type-check (tsc --noEmit)
make db               # Start PostgreSQL container
make db-stop          # Stop PostgreSQL
make db-reset         # Destroy and recreate the DB volume
make migrate          # Apply pending Drizzle migrations
make migrate-generate # Generate a migration from schema changes
```

---

## How a Request Flows

1. User sends a message over WebSocket
2. **Context assembler** builds the router prompt from the conversation summary (Tier 2) and the last 12 messages (Tier 1)
3. **Smart Router** (an LLM-powered agent with 4 tools) classifies the query and picks a mode:
   - **direct** — answers from general knowledge; 1 LLM call
   - **single** — dispatches to one agent with an optional `thinking_level`; agent runs its loop
   - **multi** — builds a step plan; runner executes steps (sequential or parallel) with a shared `ToolCache`; synthesizer combines results
   - **observe** — calls agents inline one at a time, observes results, reasons, calls again if needed, then delivers a final synthesized answer
4. **Agents** (pi-agent-core) run: LLM → tool call → observe result → loop until done or guard fires
5. **Safety guards** run alongside: 10-turn cap, 60s timeout, per-tool repeat limiter
6. **EventBus** streams every lifecycle event to the client in real time
7. After the response, all events are bulk-persisted to the `events` table for debugging
8. If token usage exceeds 70% of the context window, compaction runs fire-and-forget, extending the existing summary rather than replacing it

---

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
