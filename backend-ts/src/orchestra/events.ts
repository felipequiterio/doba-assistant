/**
 * Event types matching the Python EventBus protocol exactly.
 * The frontend EventsCard and ChatCard depend on these string values.
 */
export const EventType = {
  ORCHESTRA_START: "orchestra_start",
  ORCHESTRA_END: "orchestra_end",
  TASK_GENERATION_START: "task_generation_start",
  TASK_GENERATION_END: "task_generation_end",
  TASK_START: "task_start",
  TASK_COMPLETE: "task_complete",
  TASK_ERROR: "task_error",
  AGENT_START: "agent_start",
  AGENT_END: "agent_end",
  TOOL_SELECTION: "tool_selection",
  TOOL_START: "tool_start",
  TOOL_END: "tool_end",
  TOOL_ERROR: "tool_error",
  RETRY: "retry",
  LOG: "log",
} as const;

export type EventTypeValue = (typeof EventType)[keyof typeof EventType];

/**
 * Event envelope matching the Python system: { type, source, data, timestamp }.
 * The frontend parses this exact shape.
 */
export interface OrchestraEvent {
  type: EventTypeValue;
  source: string;
  data: Record<string, unknown>;
  timestamp: string;
}

type EventCallback = (event: OrchestraEvent) => void;
type TypedEventCallback = (event: OrchestraEvent) => void;

/**
 * Pub/sub EventBus matching the Python EventBus singleton.
 * Emits events with the same envelope shape so the frontend receives
 * identical JSON payloads over WebSocket.
 */
export class EventBus {
  private listeners = new Set<EventCallback>();
  private typedListeners = new Map<EventTypeValue, Set<TypedEventCallback>>();

  emit(
    type: EventTypeValue,
    source: string,
    data: Record<string, unknown> = {}
  ): OrchestraEvent {
    const event: OrchestraEvent = {
      type,
      source,
      data,
      timestamp: new Date().toISOString(),
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error(`[EventBus] Listener error on ${type}:`, err);
      }
    }

    const typed = this.typedListeners.get(type);
    if (typed) {
      for (const listener of typed) {
        try {
          listener(event);
        } catch (err) {
          console.error(`[EventBus] Typed listener error on ${type}:`, err);
        }
      }
    }

    return event;
  }

  /**
   * Subscribe to all events. Returns an unsubscribe function.
   */
  subscribe(callback: EventCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Subscribe to events of a specific type. Returns an unsubscribe function.
   */
  subscribeToType(
    type: EventTypeValue,
    callback: TypedEventCallback
  ): () => void {
    if (!this.typedListeners.has(type)) {
      this.typedListeners.set(type, new Set());
    }
    this.typedListeners.get(type)!.add(callback);
    return () => this.typedListeners.get(type)?.delete(callback);
  }

  /**
   * Remove all listeners.
   */
  clear(): void {
    this.listeners.clear();
    this.typedListeners.clear();
  }
}

/** Singleton EventBus instance shared across the backend. */
export const eventBus = new EventBus();
