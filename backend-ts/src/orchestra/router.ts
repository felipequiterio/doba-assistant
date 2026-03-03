import { Type } from "@sinclair/typebox";
import { Agent, type AgentTool } from "@mariozechner/pi-agent-core";
import { ROUTER_MODEL } from "../llm/models";
import { agentRegistry, type AgentDefinition } from "../agents/registry";
import { assembleRouterPrompt } from "./context";
import type { ChatContext } from "./index";

// --- Routing result types ---

export type RouteMode = "direct" | "single" | "multi";

export interface DirectRouteResult {
  mode: "direct";
  content: string;
}

export interface SingleAgentRouteResult {
  mode: "single";
  agentName: string;
  task: string;
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
}

export type RouteResult =
  | DirectRouteResult
  | SingleAgentRouteResult
  | MultiStepRouteResult;

// --- Shared state to capture routing decision ---

let capturedRoute: RouteResult | null = null;

// --- Router tools ---

const respondDirectlyParams = Type.Object({
  content: Type.String({
    description:
      "Your complete answer to the user's question. Use this when you can answer directly without needing any tools or agents.",
  }),
});

const respondDirectlyTool: AgentTool<typeof respondDirectlyParams> = {
  name: "respondDirectly",
  label: "Respond Directly",
  description:
    "Use this when the query can be answered from general knowledge, is a greeting, conversational small talk, or does not require any agent. Provide the full answer in the content parameter.",
  parameters: respondDirectlyParams,
  async execute(_toolCallId, params) {
    capturedRoute = { mode: "direct", content: params.content };
    return {
      content: [{ type: "text", text: params.content }],
      details: { mode: "direct" },
    };
  },
};

const dispatchToAgentParams = Type.Object({
  agent_name: Type.String({
    description: "The exact name of the agent to dispatch to.",
  }),
  task: Type.String({
    description:
      "A clear, specific task description for the agent. Rephrase the user's intent into an actionable instruction.",
  }),
});

const dispatchToAgentTool: AgentTool<typeof dispatchToAgentParams> = {
  name: "dispatchToAgent",
  label: "Dispatch to Agent",
  description:
    "Use this when the query clearly maps to a single agent. The agent will handle the task autonomously using its own tools.",
  parameters: dispatchToAgentParams,
  async execute(_toolCallId, params) {
    capturedRoute = {
      mode: "single",
      agentName: params.agent_name,
      task: params.task,
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
});

const planMultiStepParams = Type.Object({
  steps: Type.Array(planStepSchema, {
    description:
      "Ordered list of steps to execute. Each step is dispatched to an agent.",
    minItems: 2,
  }),
});

const planMultiStepTool: AgentTool<typeof planMultiStepParams> = {
  name: "planMultiStep",
  label: "Plan Multi-Step",
  description:
    "Use this when the query requires coordination between multiple agents, sequential dependent steps, or the intent spans more than one capability. Define the ordered steps.",
  parameters: planMultiStepParams,
  async execute(_toolCallId, params) {
    capturedRoute = { mode: "multi", steps: params.steps };
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

You MUST call exactly ONE of your three tools for every query:

1. respondDirectly — Use when no agent is needed. For greetings ("hello", "hi"), general knowledge questions ("what's the capital of France?"), conversational messages, questions about your capabilities, or anything you can answer without tools.

2. dispatchToAgent — Use when the query clearly maps to exactly ONE agent. Most user requests fall here. Examples: "add milk to my todos", "show my notes", "create a note about today's meeting".

3. planMultiStep — Use when the query requires MULTIPLE agents working together or sequential steps across different capabilities. Examples: "summarize my notes and create todos for action items", "list my todos and create a note summarizing them".

Rules:
- ALWAYS call a tool. Never respond with just text.
- Prefer dispatchToAgent over planMultiStep when only one agent is needed.
- When using dispatchToAgent, rephrase the user's intent into a clear task for the agent.
- When using planMultiStep, order steps logically (earlier steps may produce data needed by later steps).
- Agent names must exactly match one of the available agents listed above.`;
}

// --- Router usage result ---

export interface RouterUsage {
  input: number;
  output: number;
  totalTokens: number;
  shouldCompact: boolean;
}

export interface RouteQueryResult {
  route: RouteResult;
  usage?: RouterUsage;
}

function extractUsage(
  agentMessages: any[],
  shouldCompact: boolean
): RouterUsage | undefined {
  for (let i = agentMessages.length - 1; i >= 0; i--) {
    const msg = agentMessages[i];
    if (msg.role === "assistant" && msg.usage) {
      return {
        input: msg.usage.input ?? 0,
        output: msg.usage.output ?? 0,
        totalTokens: msg.usage.totalTokens ?? 0,
        shouldCompact,
      };
    }
  }
  return undefined;
}

// --- Main routing function ---

export async function routeQuery(
  query: string,
  context?: ChatContext
): Promise<RouteQueryResult> {
  capturedRoute = null;

  const systemPrompt = buildRouterSystemPrompt(agentRegistry);

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
      tools: [respondDirectlyTool, dispatchToAgentTool, planMultiStepTool],
      thinkingLevel: "off",
    },
    getApiKey: () => "ollama",
  });

  await router.prompt(prompt);

  const usage = extractUsage(router.state.messages, shouldCompact);

  if (capturedRoute) {
    return { route: capturedRoute, usage };
  }

  // Fallback: if the router didn't call any tool, treat its text output as a direct response
  const messages = router.state.messages;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as any;
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      const text = msg.content
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("\n");
      if (text) {
        return { route: { mode: "direct", content: text }, usage };
      }
    }
  }

  return {
    route: {
      mode: "direct",
      content: "I'm not sure how to help with that. Could you rephrase?",
    },
    usage,
  };
}
