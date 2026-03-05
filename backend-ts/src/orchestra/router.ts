import { Type } from "@sinclair/typebox";
import {
  Agent,
  type AgentTool,
  type AgentEvent,
} from "@mariozechner/pi-agent-core";
import { ROUTER_MODEL, resolveApiKey, type ThinkingLevel } from "../llm/models";
import { agentRegistry, type AgentDefinition } from "../agents/registry";
import { assembleRouterPrompt } from "./context";
import { eventBus, EventType } from "./events";
import { extractUsageFromMessages } from "./usage";
import { bridgeAgentEvent, runAgentWithGuards } from "./event-bridge";
import { withCallGuard } from "../agents/tool-guard";
import type { ChatContext } from "./index";

// --- Routing result types ---

export type RouteMode = "direct" | "single" | "multi" | "observe";

export interface DirectRouteResult {
  mode: "direct";
  content: string;
}

/**
 * Router used callAgentAndObserve one or more times, then synthesized a final
 * answer with respondDirectly. The content is the synthesized answer; agentNames
 * lists which agents were called during observation.
 */
export interface ObserveRouteResult {
  mode: "observe";
  content: string;
  agentNames: string[];
}

export interface SingleAgentRouteResult {
  mode: "single";
  agentName: string;
  task: string;
  /** Requested reasoning depth for the dispatched agent. Defaults to "off". */
  thinkingLevel?: ThinkingLevel;
}

export interface MultiStepRouteResult {
  mode: "multi";
  steps: PlanStep[];
}

export interface PlanStep {
  agent_name: string;
  task: string;
  expected_output: string;
  is_async?: boolean;
  /** Requested reasoning depth for this specific step. Defaults to "off". */
  thinking_level?: ThinkingLevel;
}

export type RouteResult =
  | DirectRouteResult
  | ObserveRouteResult
  | SingleAgentRouteResult
  | MultiStepRouteResult;

// --- Per-request mutable state (avoids module-level shared state) ---

interface RouterState {
  capturedRoute: RouteResult | null;
  agentCallResults: Array<{
    agentName: string;
    task: string;
    result: string;
  }>;
}

// --- Tool parameter schemas (immutable, shared across requests) ---

const thinkingLevelSchema = Type.Optional(
  Type.Union(
    [
      Type.Literal("off"),
      Type.Literal("low"),
      Type.Literal("high"),
    ],
    {
      description:
        'Reasoning depth for this task. Use "off" for simple CRUD and lookups. Use "low" for cross-referencing, conditional logic, or moderate analysis. Use "high" for trend analysis, deep planning, ambiguous intent, or creative synthesis. Defaults to "off".',
    }
  )
);

const respondDirectlyParams = Type.Object({
  content: Type.String({
    description:
      "Your complete answer to the user's question. Use this when you can answer directly without needing any tools or agents.",
  }),
});

const dispatchToAgentParams = Type.Object({
  agent_name: Type.String({
    description: "The exact name of the agent to dispatch to.",
  }),
  task: Type.String({
    description:
      "A clear, specific task description for the agent. Rephrase the user's intent into an actionable instruction.",
  }),
  thinking_level: thinkingLevelSchema,
});

const planStepSchema = Type.Object({
  agent_name: Type.String({ description: "The agent to execute this step." }),
  task: Type.String({ description: "What this agent should do." }),
  expected_output: Type.String({
    description: "What result is expected from this step.",
  }),
  is_async: Type.Optional(
    Type.Boolean({
      description:
        "If true, this step can run in parallel with other async steps. Default false (sequential).",
    })
  ),
  thinking_level: thinkingLevelSchema,
});

const planMultiStepParams = Type.Object({
  steps: Type.Array(planStepSchema, {
    description:
      "Ordered list of steps to execute. Each step is dispatched to an agent.",
    minItems: 2,
  }),
});

const callAgentAndObserveParams = Type.Object({
  agent_name: Type.String({
    description: "The exact name of the agent to call.",
  }),
  task: Type.String({
    description: "A clear, specific task for the agent to execute.",
  }),
});

// --- Helpers ---

function extractAgentFinalAnswer(messages: any[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      const textParts = msg.content
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text);
      if (textParts.length > 0) return textParts.join("\n");
    }
  }
  return "Task completed but no text response.";
}

// --- Tool factory (creates tools bound to a per-request RouterState) ---

function createRouterTools(state: RouterState): AgentTool<any>[] {
  const respondDirectlyTool: AgentTool<typeof respondDirectlyParams> = {
    name: "respondDirectly",
    label: "Respond Directly",
    description:
      "Use this when the query can be answered from general knowledge, is a greeting, conversational small talk, or does not require any agent. Also use this to deliver the final answer AFTER calling callAgentAndObserve one or more times.",
    parameters: respondDirectlyParams,
    async execute(_toolCallId, params) {
      if (state.agentCallResults.length > 0) {
        // callAgentAndObserve was used before this — mark as observe mode so
        // callers can distinguish "router answered directly" from "router observed agents then synthesized"
        state.capturedRoute = {
          mode: "observe",
          content: params.content,
          agentNames: [...new Set(state.agentCallResults.map((r) => r.agentName))],
        };
      } else {
        state.capturedRoute = { mode: "direct", content: params.content };
      }
      return {
        content: [{ type: "text", text: params.content }],
        details: { mode: state.capturedRoute.mode },
      };
    },
  };

  const dispatchToAgentTool: AgentTool<typeof dispatchToAgentParams> = {
    name: "dispatchToAgent",
    label: "Dispatch to Agent",
    description:
      "Use this when the query clearly maps to a single agent with a straightforward task. The agent handles it autonomously. Do NOT use this if you need to see the result before deciding the next action.",
    parameters: dispatchToAgentParams,
    async execute(_toolCallId, params) {
      state.capturedRoute = {
        mode: "single",
        agentName: params.agent_name,
        task: params.task,
        thinkingLevel: params.thinking_level ?? "off",
      };
      return {
        content: [
          {
            type: "text",
            text: `Dispatching to ${params.agent_name}: ${params.task}`,
          },
        ],
        details: { mode: "single", agentName: params.agent_name },
      };
    },
  };

  const planMultiStepTool: AgentTool<typeof planMultiStepParams> = {
    name: "planMultiStep",
    label: "Plan Multi-Step",
    description:
      "Use this when the query requires MULTIPLE agents with INDEPENDENT tasks that do not depend on each other's results. For tasks where the next action depends on a previous result, use callAgentAndObserve instead.",
    parameters: planMultiStepParams,
    async execute(_toolCallId, params) {
      state.capturedRoute = { mode: "multi", steps: params.steps };
      return {
        content: [
          {
            type: "text",
            text: `Planned ${params.steps.length} steps across agents: ${params.steps.map((s) => s.agent_name).join(", ")}`,
          },
        ],
        details: { mode: "multi", stepCount: params.steps.length },
      };
    },
  };

  const callAgentAndObserveToolBase: AgentTool<
    typeof callAgentAndObserveParams
  > = {
    name: "callAgentAndObserve",
    label: "Call Agent and Observe Result",
    description:
      "Execute an agent task and receive the result so you can reason about it before deciding the next action. Use this for conditional logic or when results determine what to do next. You can call this multiple times. After all needed calls, call respondDirectly with the final synthesized answer.",
    parameters: callAgentAndObserveParams,
    async execute(_toolCallId, params) {
      const definition = agentRegistry.get(params.agent_name);
      if (!definition) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Agent "${params.agent_name}" not found in registry.`,
            },
          ],
          details: { error: true },
        };
      }

      eventBus.emit(EventType.AGENT_START, params.agent_name, {
        task: params.task,
      });

      const agent = definition.createAgent();
      const unsub = agent.subscribe((event: AgentEvent) => {
        bridgeAgentEvent(event, params.agent_name);
      });

      try {
        await runAgentWithGuards(agent, params.task, params.agent_name);
        const result = extractAgentFinalAnswer(agent.state.messages);

        eventBus.emit(EventType.AGENT_END, params.agent_name, { result });
        state.agentCallResults.push({
          agentName: params.agent_name,
          task: params.task,
          result,
        });

        return {
          content: [{ type: "text", text: result }],
          details: { agentName: params.agent_name, task: params.task },
        };
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown agent error";
        eventBus.emit(EventType.AGENT_END, params.agent_name, {
          error: errorMsg,
        });
        return {
          content: [{ type: "text", text: `Agent error: ${errorMsg}` }],
          details: { error: true },
        };
      } finally {
        unsub();
      }
    },
  };

  // Guard callAgentAndObserve with maxRepeat=5 to prevent the router from
  // calling agents indefinitely in observe mode.
  const [guardedCallAgentAndObserve] = withCallGuard(
    [callAgentAndObserveToolBase],
    5
  );

  return [
    respondDirectlyTool,
    dispatchToAgentTool,
    planMultiStepTool,
    guardedCallAgentAndObserve,
  ];
}

// --- System prompt builder ---

function buildRouterSystemPrompt(
  agents: Map<string, AgentDefinition>
): string {
  const agentDescriptions = Array.from(agents.values())
    .map((a) => `- "${a.name}": ${a.description}`)
    .join("\n");

  return `You are DOBA, an intelligent query router for a personal AI assistant system. Your job is to analyze the user's query and decide the best execution path.

You have access to the following agents:
${agentDescriptions}

You MUST call exactly ONE tool to begin handling every query. Your four tools are:

1. respondDirectly — ONLY for greetings, chitchat, general knowledge questions, or meta questions about the assistant itself. NEVER use this when the query involves the user's todos or notes, even if you think you already know the answer from previous conversation turns.

2. dispatchToAgent — For queries that clearly map to ONE agent. The agent fetches fresh data and handles the task autonomously. Use this for listing, creating, updating, deleting, or analyzing todos/notes.

3. planMultiStep — For queries needing MULTIPLE agents with INDEPENDENT tasks that do not depend on each other's results.

4. callAgentAndObserve — For queries where the NEXT ACTION DEPENDS ON A PREVIOUS RESULT. This tool executes an agent and returns the result to you so you can reason about it. Use this when:
   - The query has conditional logic ("if X exists then Y, otherwise Z")
   - You need to inspect data before deciding what to do
   - Multiple steps depend on each other's outcomes
   After all needed agent calls, you MUST call respondDirectly with the final synthesized answer.

Thinking level guidance (applies to dispatchToAgent.thinking_level and planMultiStep step thinking_level):
- "off"  — Simple CRUD operations, lookups, formatting. The vast majority of requests. Fast and cheap.
- "low"  — Cross-referencing data, conditional logic, moderate analysis, comparing multiple items.
- "high" — Trend analysis, deep planning, ambiguous or complex intent, creative synthesis across many items.

CRITICAL RULES:
- ALWAYS call a tool. Never respond with plain text.
- NEVER answer questions about the user's todos or notes from conversation history. The data changes between turns. Always dispatch to the agent to fetch the current state.
- Any query containing words like "list", "show", "what", "analyze", "summarize", "check" referring to todos or notes MUST go through dispatchToAgent or callAgentAndObserve — never respondDirectly.
- Prefer dispatchToAgent for the vast majority of requests.
- Use callAgentAndObserve when the query involves conditions, data inspection, or dependent decisions.
- When using callAgentAndObserve: call agents → observe results → reason → call more agents if needed → respondDirectly with the final answer.
- Agent names must exactly match one of the available agents listed above.

Examples:
- "hello" → respondDirectly("Hello! How can I help?")
- "add milk to my todos" → dispatchToAgent("todo_agent", "Add 'milk' to the todo list", thinking_level: "off")
- "what todos do I have?" → dispatchToAgent("todo_agent", "List all todos", thinking_level: "off")  [NOT respondDirectly — must fetch fresh]
- "analyze my todo productivity" → dispatchToAgent("todo_agent", "List all todos with their status", thinking_level: "low")  [NOT respondDirectly — must fetch fresh]
- "list my notes and create todos for action items" → planMultiStep([notes step thinking_level:"off", todo step thinking_level:"off"])
- "check my todos, if there's one about project X mark it done, otherwise create it" → callAgentAndObserve("todo_agent", "list all todos") → observe result → callAgentAndObserve("todo_agent", "mark/create...") → respondDirectly(summary)`;
}

// --- Router usage result ---

export interface RouterUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  costTotal: number;
  shouldCompact: boolean;
}

export interface RouteQueryResult {
  route: RouteResult;
  usage?: RouterUsage;
}

function extractTextFromMessages(messages: any[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as any;
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      const text = msg.content
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("\n");
      if (text) return text;
    }
  }
  return null;
}

function buildRouterUsage(
  messages: any[],
  shouldCompact: boolean
): RouterUsage | undefined {
  const base = extractUsageFromMessages(messages);
  if (base.totalTokens === 0) return undefined;
  return { ...base, shouldCompact };
}

// --- Main routing function ---

export async function routeQuery(
  query: string,
  context?: ChatContext
): Promise<RouteQueryResult> {
  const state: RouterState = { capturedRoute: null, agentCallResults: [] };

  const systemPrompt = buildRouterSystemPrompt(agentRegistry);
  const tools = createRouterTools(state);

  const { prompt, shouldCompact } = assembleRouterPrompt(
    query,
    context?.history ?? [],
    context?.summary,
    ROUTER_MODEL.contextWindow
  );

  const router = new Agent({
    initialState: {
      systemPrompt,
      model: ROUTER_MODEL,
      tools,
      thinkingLevel: "off",
    },
    getApiKey: resolveApiKey,
  });

  await router.prompt(prompt);

  const usage = buildRouterUsage(router.state.messages, shouldCompact);

  if (state.capturedRoute) {
    return { route: state.capturedRoute, usage };
  }

  // Agents were called via callAgentAndObserve but router didn't call respondDirectly
  if (state.agentCallResults.length > 0) {
    const synthesis = state.agentCallResults.map((r) => r.result).join("\n\n");
    return {
      route: {
        mode: "observe",
        content: synthesis,
        agentNames: [...new Set(state.agentCallResults.map((r) => r.agentName))],
      },
      usage,
    };
  }

  // Retry: router didn't call any tool — nudge it once
  eventBus.emit(EventType.LOG, "router", {
    message: "Router did not call any tool, retrying with nudge",
  });

  await router.prompt(
    "You did not call any tool. You MUST call one of your tools (respondDirectly, dispatchToAgent, planMultiStep, or callAgentAndObserve) to handle the user's request. Analyze the query and call the appropriate tool now."
  );

  const retryUsage = buildRouterUsage(router.state.messages, shouldCompact);

  if (state.capturedRoute) {
    return { route: state.capturedRoute, usage: retryUsage ?? usage };
  }

  if (state.agentCallResults.length > 0) {
    const synthesis = state.agentCallResults.map((r) => r.result).join("\n\n");
    return {
      route: {
        mode: "observe",
        content: synthesis,
        agentNames: [...new Set(state.agentCallResults.map((r) => r.agentName))],
      },
      usage: retryUsage ?? usage,
    };
  }

  // Last resort: use any text the router produced
  const fallbackText = extractTextFromMessages(router.state.messages);
  if (fallbackText) {
    return {
      route: { mode: "direct", content: fallbackText },
      usage: retryUsage ?? usage,
    };
  }

  return {
    route: {
      mode: "direct",
      content: "I'm not sure how to help with that. Could you rephrase?",
    },
    usage: retryUsage ?? usage,
  };
}
