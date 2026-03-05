# Doba — Personal AI Assistant

Doba is a JARVIS-style personal AI assistant with a pluggable LLM backend. It supports both **Ollama** (fully local, free) and **OpenRouter** (cloud, pay-per-use). Ask it to manage your todos, write notes, or answer questions. A smart router classifies every query and picks the most efficient execution path — from a direct answer to a coordinated multi-agent plan.

## Architecture

### Request Flow

```mermaid
flowchart TD
    User["Browser"] --> WS
    User --> REST

    subgraph API["API Layer · Bun / Hono"]
        WS["chat.ts\nWebSocket /chat/ws"]
        REST["REST /v1/*\ntodos · notes · chats · events"]
    end

    REST --> Drizzle

    WS --> ChatHandler["chat.ts handler\nloads history + summary from DB\ncollects events during request\npersists messages + events after response"]
    ChatHandler --> Context

    subgraph Context["Context Assembly · context.ts"]
        direction LR
        Summary["chats.summary\nwarm · LLM-compacted"]
        Recent["last 12 messages\nhot · verbatim"]
        Query["current query"]
    end

    Context --> Orch

    subgraph Orch["Orchestra · index.ts run()"]
        Router["Smart Router\nROUTER_MODEL · thinkingLevel off\nclassifies query · calls one of 4 tools"]

        Router --> Direct["direct\nrespondDirectly\ngeneral knowledge answer"]
        Router --> Single["single\ndispatchToAgent + thinking_level\none agent, one task"]
        Router --> Multi["multi\nplanMultiStep + thinking_level per step\nindependent parallel/sequential steps"]
        Router --> Observe["observe\ncallAgentAndObserve x N\nagents run inside router loop\nthen respondDirectly with synthesis"]
    end

    Single --> AgentExec
    Multi --> Runner["Runner · runner.ts\nshared ToolCache\nsequential + parallel"]
    Runner --> AgentExec
    Runner --> Synth["Synthesizer · synthesis.ts\nWORKER or THINKING_MODEL\nselected by usedThinking flag"]

    subgraph AgentExec["Agent Execution · pi-agent-core loop"]
        direction TB
        Agent["Agent\noff → WORKER_MODEL · low/high → THINKING_MODEL\n10-turn cap · 60s timeout"]
        Agent --> Tools
        Tools --> Agent

        subgraph Tools["Tools · TypeBox-validated · withCallGuard max 2 repeats"]
            direction LR
            TodoTools["createTodo · listTodos\nupdateTodo · deleteTodo"]
            NotesTools["createNote · listNotes\nupdateNote · deleteNote"]
        end
    end

    Observe --> AgentExec2["Agent runs inline\ninside router agent loop\nsame guards apply"]

    Tools --> Cache["ToolCache\ndeduplicates reads within one request"]
    Cache --> Drizzle["Drizzle ORM"]
    Drizzle --> PG[("PostgreSQL\ntodos · notes · chats\nmessages · events")]

    subgraph LLM["LLM Provider · models.ts"]
        direction LR
        Models["ROUTER_MODEL\nWORKER_MODEL\nTHINKING_MODEL"]
        Models --> Provider["Ollama local\nor OpenRouter cloud"]
    end

    Router -.-> Provider
    Agent -.-> Provider
    Synth -.-> Provider

    subgraph Events["Event System · events.ts"]
        EB["EventBus singleton\nstreams events in real-time"]
    end

    EB --> WS
    Agent -.-> EB
    Router -.-> EB

    Direct --> Orch
    Single --> Orch
    Synth --> Orch
    Observe --> Orch

    Orch --> ChatHandler
    ChatHandler --> PG

    Orch --> Compact["Compaction · fire-and-forget\nif tokens > 70% context window\nLLM summarizes old messages\nchains with existing summary"]
    Compact -.-> Provider
    Compact --> PG

    PG --> ChatHandler
```

### How the four modes differ

```mermaid
flowchart LR
    subgraph direct["direct · 1 LLM call"]
        R1["Router"] --> Out1["respondDirectly\nanswer → user"]
    end

    subgraph single["single · 2+ LLM calls"]
        R2["Router"] --> A2["dispatchToAgent\nAgent loop: LLM → tool → LLM"]
        A2 --> Out2["answer → user"]
    end

    subgraph multi["multi · N+2 LLM calls"]
        R3["Router"] --> Run3["planMultiStep\nRunner"]
        Run3 --> A3a["Agent A"]
        Run3 --> A3b["Agent B"]
        A3a --> Syn3["Synthesizer"]
        A3b --> Syn3
        Syn3 --> Out3["answer → user"]
    end

    subgraph observe["observe · variable LLM calls"]
        R4["Router loop"] --> A4["callAgentAndObserve\nAgent runs inside router"]
        A4 --> R4b["Router reasons\ncall again or done?"]
        R4b --> A4
        R4b --> Out4["respondDirectly\nanswer → user"]
    end
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
