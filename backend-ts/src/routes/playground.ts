import { Hono } from "hono";
import { html } from "hono/html";
import { ROUTER_MODEL } from "../llm/models";

const playgroundApp = new Hono();

playgroundApp.get("/playground", (c) => {
  const contextWindow = ROUTER_MODEL.contextWindow;
  return c.html(html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Doba Playground</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family:
              "Inter",
              -apple-system,
              system-ui,
              sans-serif;
            background: #0b0f14;
            color: #e2e8f0;
            height: 100vh;
            display: flex;
            flex-direction: column;
          }

          header {
            padding: 12px 20px;
            border-bottom: 1px solid #1f2630;
            display: flex;
            align-items: center;
            gap: 12px;
            background: #11161c;
          }
          header h1 {
            font-size: 16px;
            font-weight: 600;
            letter-spacing: 0.5px;
          }
          header h1 span {
            color: #00e5a8;
          }
          .header-right {
            margin-left: auto;
            display: flex;
            align-items: center;
            gap: 16px;
          }
          .status {
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #ef4444;
          }
          .status-dot.connected {
            background: #00e5a8;
          }

          main {
            flex: 1;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0;
            overflow: hidden;
          }

          .panel {
            display: flex;
            flex-direction: column;
            overflow: hidden;
            border-right: 1px solid #1f2630;
          }
          .panel:last-child {
            border-right: none;
          }
          .panel-header {
            padding: 10px 16px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #64748b;
            background: #11161c;
            border-bottom: 1px solid #1f2630;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .panel-header .count {
            background: #1f2630;
            color: #64748b;
            font-size: 10px;
            padding: 1px 6px;
            border-radius: 8px;
          }
          .panel-actions {
            margin-left: auto;
            display: flex;
            gap: 6px;
          }

          .messages {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 2px;
          }
          .messages::-webkit-scrollbar { width: 4px; }
          .messages::-webkit-scrollbar-thumb { background: #1f2630; border-radius: 2px; }

          .msg-row {
            display: flex;
            gap: 10px;
            align-items: flex-start;
            padding: 6px 0;
          }
          .msg-row.user { flex-direction: row-reverse; }
          .msg-row.system { justify-content: center; }

          .msg-avatar {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 13px;
            flex-shrink: 0;
            font-weight: 600;
            margin-top: 2px;
          }
          .msg-row.user .msg-avatar { background: #1a3a4a; color: #5eaac0; }
          .msg-row.assistant .msg-avatar { background: #0d2a20; color: #00e5a8; }
          .msg-row.thinking .msg-avatar { background: #1a1a10; color: #94908a; font-size: 11px; }

          .msg-body { max-width: 80%; min-width: 60px; }

          .msg-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 3px;
          }
          .msg-row.user .msg-header { flex-direction: row-reverse; }
          .msg-name {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.4px;
            color: #64748b;
          }
          .msg-row.user .msg-name { color: #5eaac0; }
          .msg-row.assistant .msg-name { color: #00e5a8; }
          .msg-row.thinking .msg-name { color: #94908a; }
          .msg-ts {
            font-size: 10px;
            color: #2d3748;
            font-family: "JetBrains Mono", monospace;
          }

          .msg-bubble {
            padding: 10px 14px;
            border-radius: 12px;
            font-size: 14px;
            line-height: 1.6;
            word-wrap: break-word;
            position: relative;
          }
          .msg-row.user .msg-bubble {
            background: #1a3a4a;
            border: 1px solid #1f4a5a;
            color: #e2e8f0;
            border-top-right-radius: 4px;
            white-space: pre-wrap;
          }
          .msg-row.assistant .msg-bubble {
            background: #161b22;
            border: 1px solid #1f2630;
            color: #cbd5e1;
            border-top-left-radius: 4px;
          }
          .msg-row.system .msg-bubble {
            background: transparent;
            border: none;
            font-size: 12px;
            color: #4a5568;
            font-style: italic;
            padding: 4px 12px;
          }
          .msg-row.thinking .msg-bubble {
            background: #13150f;
            border: 1px solid #22220e;
            color: #8a8670;
            border-top-left-radius: 4px;
            font-size: 12px;
            font-family: "JetBrains Mono", monospace;
          }

          .msg-actions {
            display: flex;
            gap: 4px;
            margin-top: 4px;
            opacity: 0;
            transition: opacity 0.15s;
          }
          .msg-row:hover .msg-actions { opacity: 1; }
          .msg-row.user .msg-actions { justify-content: flex-end; }
          .msg-action-btn {
            background: none;
            border: 1px solid #1f2630;
            color: #4a5568;
            font-size: 10px;
            padding: 1px 6px;
            border-radius: 4px;
            cursor: pointer;
            font-family: "JetBrains Mono", monospace;
          }
          .msg-action-btn:hover { border-color: #3a4555; color: #94a3b8; }
          .msg-action-btn.copied { color: #00e5a8; border-color: #00e5a8; }

          /* Markdown inside assistant bubbles */
          .msg-bubble p { margin: 0 0 8px 0; }
          .msg-bubble p:last-child { margin-bottom: 0; }
          .msg-bubble strong { color: #e2e8f0; font-weight: 600; }
          .msg-bubble em { font-style: italic; color: #a0aec0; }
          .msg-bubble code {
            background: #0e1218;
            padding: 1px 5px;
            border-radius: 3px;
            font-family: "JetBrains Mono", monospace;
            font-size: 0.9em;
            color: #e2a87a;
          }
          .msg-bubble pre {
            background: #0b0e13;
            border: 1px solid #1a1f28;
            border-radius: 6px;
            padding: 10px 12px;
            margin: 8px 0;
            overflow-x: auto;
            font-family: "JetBrains Mono", monospace;
            font-size: 12px;
            line-height: 1.5;
            color: #b8c9db;
          }
          .msg-bubble pre code {
            background: none;
            padding: 0;
            color: inherit;
            font-size: inherit;
          }
          .msg-bubble ul, .msg-bubble ol {
            margin: 6px 0;
            padding-left: 20px;
          }
          .msg-bubble li { margin: 2px 0; }
          .msg-bubble li::marker { color: #3a4555; }
          .msg-bubble hr {
            border: none;
            border-top: 1px solid #1f2630;
            margin: 10px 0;
          }
          .msg-bubble h1, .msg-bubble h2, .msg-bubble h3 {
            color: #e2e8f0;
            margin: 12px 0 6px 0;
            line-height: 1.3;
          }
          .msg-bubble h1 { font-size: 1.2em; }
          .msg-bubble h2 { font-size: 1.1em; }
          .msg-bubble h3 { font-size: 1em; }

          /* Collapsible thinking */
          .think-toggle {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            cursor: pointer;
            font-size: 11px;
            color: #6b6b50;
            background: #16170e;
            border: 1px solid #22220e;
            border-radius: 6px;
            padding: 3px 10px;
            margin-bottom: 4px;
            user-select: none;
          }
          .think-toggle:hover { color: #94908a; border-color: #33331a; }
          .think-toggle .arrow { transition: transform 0.15s; font-size: 9px; }
          .think-toggle.open .arrow { transform: rotate(90deg); }
          .think-content {
            display: none;
            max-height: 200px;
            overflow-y: auto;
          }
          .think-content::-webkit-scrollbar { width: 3px; }
          .think-content::-webkit-scrollbar-thumb { background: #22220e; border-radius: 2px; }
          .think-content.open { display: block; }

          /* Typing indicator */
          .typing-row {
            display: flex;
            gap: 10px;
            align-items: flex-start;
            padding: 6px 0;
          }
          .typing-dots {
            display: flex;
            gap: 4px;
            padding: 12px 16px;
            background: #161b22;
            border: 1px solid #1f2630;
            border-radius: 12px;
            border-top-left-radius: 4px;
          }
          .typing-dots span {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: #3a4555;
            animation: typingBounce 1.2s infinite;
          }
          .typing-dots span:nth-child(2) { animation-delay: 0.15s; }
          .typing-dots span:nth-child(3) { animation-delay: 0.3s; }
          @keyframes typingBounce {
            0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
            30% { transform: translateY(-4px); opacity: 1; }
          }

          /* Response time badge */
          .msg-response-time {
            font-size: 10px;
            color: #3a4555;
            font-family: "JetBrains Mono", monospace;
            margin-top: 2px;
          }

          /* Empty state */
          .chat-empty {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: #2d3748;
            gap: 8px;
          }
          .chat-empty-icon { font-size: 36px; opacity: 0.3; }
          .chat-empty-text { font-size: 13px; }

          .input-bar {
            padding: 12px 16px;
            border-top: 1px solid #1f2630;
            background: #11161c;
            display: flex;
            gap: 8px;
            align-items: flex-end;
          }
          .input-bar textarea {
            flex: 1;
            background: #0b0f14;
            border: 1px solid #1f2630;
            border-radius: 8px;
            padding: 10px 14px;
            color: #e2e8f0;
            font-size: 14px;
            font-family: inherit;
            outline: none;
            transition: border-color 0.15s;
            resize: none;
            min-height: 40px;
            max-height: 120px;
            line-height: 1.4;
          }
          .input-bar textarea:focus { border-color: #00e5a8; }
          .input-bar textarea::placeholder { color: #3a4555; }
          .input-bar textarea:disabled { opacity: 0.5; }
          .input-bar button {
            background: #00e5a8;
            color: #0b0f14;
            border: none;
            border-radius: 8px;
            padding: 10px 20px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: opacity 0.15s;
            height: 40px;
          }
          .input-bar button:hover { opacity: 0.85; }
          .input-bar button:disabled { opacity: 0.4; cursor: not-allowed; }

          /* Events panel */
          .event-filters {
            display: flex;
            gap: 4px;
            padding: 6px 12px;
            border-bottom: 1px solid #1a1f28;
            background: #0e1218;
            flex-wrap: wrap;
            align-items: center;
          }
          .filter-chip {
            padding: 2px 7px;
            border-radius: 4px;
            font-size: 9px;
            font-weight: 600;
            cursor: pointer;
            border: 1px solid #1f2630;
            background: transparent;
            color: #4a5568;
            transition: all 0.15s;
            text-transform: uppercase;
            letter-spacing: 0.3px;
          }
          .filter-chip:hover { border-color: #3a4555; color: #94a3b8; }
          .filter-chip.active { border-color: transparent; color: #e2e8f0; }
          .filter-chip.active[data-group="flow"] { background: #1a2a3a; color: #5eaac0; }
          .filter-chip.active[data-group="task"] { background: #1a2a2a; color: #00e5a8; }
          .filter-chip.active[data-group="agent"] { background: #1a1a2a; color: #818cf8; }
          .filter-chip.active[data-group="tool"] { background: #1a2a1a; color: #22c55e; }
          .filter-chip.active[data-group="error"] { background: #2a1a1a; color: #ef4444; }
          .filter-chip.active[data-group="meta"] { background: #1f2630; color: #94a3b8; }
          .filter-sep {
            width: 1px;
            height: 14px;
            background: #1f2630;
            margin: 0 2px;
          }

          .event-item {
            padding: 5px 12px 5px 12px;
            border-bottom: 1px solid #13171e;
            font-family: "JetBrains Mono", "Fira Code", monospace;
            font-size: 11px;
            line-height: 1.5;
            display: flex;
            gap: 8px;
            align-items: flex-start;
            cursor: pointer;
            position: relative;
            transition: background 0.1s;
          }
          .event-item:hover { background: #141920; }
          .event-item.depth-1 { padding-left: 24px; }
          .event-item.depth-2 { padding-left: 40px; }
          .event-item.depth-3 { padding-left: 56px; }
          .event-item.filtered-out { display: none; }

          .event-item.depth-1::before,
          .event-item.depth-2::before,
          .event-item.depth-3::before {
            content: "";
            position: absolute;
            left: 16px;
            top: 0;
            bottom: 0;
            width: 1px;
            background: #1f2630;
          }
          .event-item.depth-2::before { left: 32px; }
          .event-item.depth-3::before { left: 48px; }

          .event-icon {
            flex-shrink: 0;
            width: 16px;
            text-align: center;
            font-size: 11px;
            line-height: 18px;
          }

          .event-badge {
            display: inline-block;
            padding: 1px 6px;
            border-radius: 4px;
            font-size: 9px;
            font-weight: 600;
            white-space: nowrap;
            flex-shrink: 0;
          }
          .event-time {
            color: #3a4555;
            font-size: 10px;
            flex-shrink: 0;
            min-width: 55px;
          }
          .event-summary {
            color: #8896a8;
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .event-duration {
            flex-shrink: 0;
            font-size: 10px;
            color: #3a4555;
            font-variant-numeric: tabular-nums;
          }
          .event-duration.slow { color: #f59e0b; }
          .event-duration.very-slow { color: #ef4444; }

          .event-detail {
            display: none;
            margin: 4px 0 2px 24px;
            padding: 8px 10px;
            background: #0e1218;
            border: 1px solid #1a1f28;
            border-radius: 6px;
            font-size: 10px;
            line-height: 1.6;
            color: #64748b;
            white-space: pre-wrap;
            word-break: break-all;
            max-height: 200px;
            overflow-y: auto;
          }
          .event-item.expanded .event-detail { display: block; }
          .event-detail::-webkit-scrollbar { width: 3px; }
          .event-detail::-webkit-scrollbar-thumb { background: #1f2630; border-radius: 2px; }

          .badge-orchestra_start,
          .badge-orchestra_end { background: #1a2a3a; color: #5eaac0; }
          .badge-task_generation_start,
          .badge-task_generation_end { background: #1a2a2a; color: #00e5a8; }
          .badge-agent_start,
          .badge-agent_end { background: #1a1a2a; color: #818cf8; }
          .badge-task_start,
          .badge-task_complete { background: #1a2a2a; color: #00e5a8; }
          .badge-tool_selection { background: #2a2a1a; color: #f59e0b; }
          .badge-tool_start,
          .badge-tool_end { background: #1a2a1a; color: #22c55e; }
          .badge-tool_error,
          .badge-task_error { background: #2a1a1a; color: #ef4444; }
          .badge-connected,
          .badge-chat_info,
          .badge-log { background: #1f2630; color: #64748b; }
          .badge-error { background: #2a1a1a; color: #ef4444; }
          .badge-retry { background: #2a2a1a; color: #f59e0b; }

          .small-btn {
            background: none;
            border: 1px solid #1f2630;
            color: #64748b;
            font-size: 10px;
            padding: 2px 8px;
            border-radius: 4px;
            cursor: pointer;
          }
          .small-btn:hover {
            border-color: #3a4555;
            color: #e2e8f0;
          }

          /* Status footer */
          footer {
            padding: 8px 20px;
            border-top: 1px solid #1f2630;
            background: #11161c;
            display: flex;
            align-items: center;
            gap: 24px;
            font-family: "JetBrains Mono", monospace;
            font-size: 11px;
            color: #64748b;
          }
          .footer-group {
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .footer-label {
            color: #3a4555;
            text-transform: uppercase;
            font-size: 9px;
            letter-spacing: 0.5px;
          }
          .footer-value {
            color: #94a3b8;
          }
          .footer-value.active {
            color: #00e5a8;
          }
          .footer-value.warn {
            color: #f59e0b;
          }
          .footer-value.error {
            color: #ef4444;
          }

          /* Context meter */
          .context-meter {
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .meter-bar {
            width: 100px;
            height: 6px;
            background: #1f2630;
            border-radius: 3px;
            overflow: hidden;
          }
          .meter-fill {
            height: 100%;
            border-radius: 3px;
            background: #00e5a8;
            transition: width 0.3s ease, background 0.3s ease;
          }
          .meter-fill.warn {
            background: #f59e0b;
          }
          .meter-fill.danger {
            background: #ef4444;
          }

          /* Model pills */
          .model-pill {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 1px 6px;
            border-radius: 4px;
            background: #1f2630;
            font-size: 10px;
          }
          .model-dot {
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: #3a4555;
          }
          .model-dot.loaded {
            background: #00e5a8;
          }
        </style>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap"
        />
      </head>
      <body>
        <header>
          <h1>DOBA <span>Playground</span></h1>
          <div class="header-right">
            <div class="status">
              <div class="status-dot" id="statusDot"></div>
              <span id="statusText">Disconnected</span>
            </div>
          </div>
        </header>

        <main>
          <div class="panel">
            <div class="panel-header">
              Chat
              <span class="count" id="chatInfo">no chat</span>
              <div class="panel-actions">
                <button class="small-btn" id="newChatBtn" title="Start new chat">New Chat</button>
              </div>
            </div>
            <div class="messages" id="chat">
              <div class="chat-empty" id="chatEmpty">
                <div class="chat-empty-icon">💬</div>
                <div class="chat-empty-text">Send a message to start chatting</div>
              </div>
            </div>
            <div class="input-bar">
              <textarea
                id="input"
                placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
                rows="1"
                disabled
              ></textarea>
              <button id="sendBtn" disabled>Send</button>
            </div>
          </div>

          <div class="panel">
            <div class="panel-header">
              Event Bus
              <span class="count" id="eventCount">0</span>
              <div class="panel-actions">
                <label style="display:flex;align-items:center;gap:4px;font-size:10px;color:#4a5568;cursor:pointer">
                  <input type="checkbox" id="autoScroll" checked style="accent-color:#00e5a8;width:12px;height:12px" /> auto-scroll
                </label>
                <button class="small-btn" id="clearEvents">Clear</button>
              </div>
            </div>
            <div class="event-filters" id="filterBar">
              <button class="filter-chip active" data-group="flow" data-types="orchestra_start,orchestra_end">flow</button>
              <button class="filter-chip active" data-group="task" data-types="task_generation_start,task_generation_end,task_start,task_complete">tasks</button>
              <button class="filter-chip active" data-group="agent" data-types="agent_start,agent_end">agents</button>
              <button class="filter-chip active" data-group="tool" data-types="tool_selection,tool_start,tool_end">tools</button>
              <div class="filter-sep"></div>
              <button class="filter-chip active" data-group="error" data-types="tool_error,task_error,error">errors</button>
              <button class="filter-chip active" data-group="meta" data-types="connected,chat_info,log,retry">meta</button>
            </div>
            <div class="messages" id="events"></div>
          </div>
        </main>

        <footer>
          <div class="footer-group">
            <span class="footer-label">Models</span>
            <span id="modelStatus">loading...</span>
          </div>
          <div class="footer-group context-meter">
            <span class="footer-label">Context</span>
            <div class="meter-bar">
              <div class="meter-fill" id="meterFill" style="width: 0%"></div>
            </div>
            <span class="footer-value" id="contextText">--</span>
          </div>
          <div class="footer-group">
            <span class="footer-label">Tokens</span>
            <span class="footer-value" id="tokenText">in: -- out: --</span>
          </div>
          <div class="footer-group">
            <span class="footer-label">Mode</span>
            <span class="footer-value" id="modeText">--</span>
          </div>
          <div class="footer-group">
            <span class="footer-label">Cost</span>
            <span class="footer-value" id="costText">$0.000000</span>
          </div>
        </footer>

        <script>
          const chat = document.getElementById("chat");
          const chatEmpty = document.getElementById("chatEmpty");
          const events = document.getElementById("events");
          const input = document.getElementById("input");
          const sendBtn = document.getElementById("sendBtn");
          const statusDot = document.getElementById("statusDot");
          const statusText = document.getElementById("statusText");
          const eventCount = document.getElementById("eventCount");
          const clearEvents = document.getElementById("clearEvents");
          const newChatBtn = document.getElementById("newChatBtn");
          const chatInfo = document.getElementById("chatInfo");
          const modelStatus = document.getElementById("modelStatus");
          const meterFill = document.getElementById("meterFill");
          const contextText = document.getElementById("contextText");
          const tokenText = document.getElementById("tokenText");
          const modeText = document.getElementById("modeText");
          const costText = document.getElementById("costText");
          const autoScrollCb = document.getElementById("autoScroll");
          const filterBar = document.getElementById("filterBar");

          let ws;
          let evtCount = 0;
          let busy = false;
          let currentChatId = null;
          let messageCount = 0;
          let cumulativeInput = 0;
          let cumulativeOutput = 0;
          let cumulativeCost = 0;
          const CONTEXT_WINDOW = ${contextWindow};

          var hiddenTypes = {};
          var startTimes = {};
          var ICONS = {
            orchestra_start: "▶", orchestra_end: "■",
            task_generation_start: "◇", task_generation_end: "◆",
            task_start: "○", task_complete: "●",
            agent_start: "⚙", agent_end: "✓",
            tool_selection: "☞", tool_start: "→", tool_end: "←",
            tool_error: "✗", task_error: "✗", error: "✗",
            connected: "◉", chat_info: "ℹ", log: "·", retry: "↻"
          };
          var DEPTH_MAP = {
            orchestra_start: 0, orchestra_end: 0,
            task_generation_start: 1, task_generation_end: 1,
            task_start: 1, task_complete: 1, task_error: 1,
            agent_start: 2, agent_end: 2,
            tool_selection: 3, tool_start: 3, tool_end: 3, tool_error: 3,
            connected: 0, chat_info: 0, log: 1, error: 0, retry: 2
          };
          var PAIR_MAP = {
            orchestra_end: "orchestra_start",
            task_generation_end: "task_generation_start",
            task_complete: "task_start",
            agent_end: "agent_start",
            tool_end: "tool_start"
          };

          function connect() {
            const protocol =
              location.protocol === "https:" ? "wss:" : "ws:";
            ws = new WebSocket(protocol + "//" + location.host + "/chat/ws");

            ws.onopen = () => {
              statusDot.classList.add("connected");
              statusText.textContent = "Connected";
              input.disabled = false;
              sendBtn.disabled = false;
              input.focus();
            };

            ws.onclose = () => {
              statusDot.classList.remove("connected");
              statusText.textContent = "Reconnecting...";
              input.disabled = true;
              sendBtn.disabled = true;
              setTimeout(connect, 2000);
            };

            ws.onerror = () => {};

            ws.onmessage = (e) => {
              const data = JSON.parse(e.data);
              addEvent(data);
              handleEvent(data);
            };
          }

          function handleEvent(data) {
            if (data.type === "chat_info" && data.data?.chat_id) {
              currentChatId = data.data.chat_id;
              chatInfo.textContent = "chat #" + currentChatId;
            } else if (data.type === "connected") {
              addChat("system", data.data.message);
            } else if (data.type === "task_generation_end" && data.data?.mode) {
              modeText.textContent = data.data.mode;
              if (data.data.mode === "direct") modeText.className = "footer-value";
              else if (data.data.mode === "single") modeText.className = "footer-value active";
              else modeText.className = "footer-value warn";
            } else if (data.type === "orchestra_end" && data.data?.final_answer) {
              var answer = data.data.final_answer;
              var thinkRe = new RegExp("<think>([\\\\s\\\\S]*?)</think>");
              var stripRe = new RegExp("<think>[\\\\s\\\\S]*?</think>\\\\s*", "g");
              var thinkMatch = answer.match(thinkRe);
              var cleanAnswer = answer.replace(stripRe, "").trim();

              var elapsed = requestStartTime ? Date.now() - requestStartTime : null;
              requestStartTime = null;

              if (thinkMatch) {
                addChat("thinking", thinkMatch[1].trim());
              }
              if (cleanAnswer) {
                addChat("assistant", cleanAnswer, { responseTime: elapsed });
              }
              messageCount += 2;

              if (data.data.usage) {
                var u = data.data.usage;
                var inp = u.input || 0;
                var out = u.output || 0;
                var cost = u.costTotal || 0;
                cumulativeInput += inp;
                cumulativeOutput += out;
                cumulativeCost += cost;
                var cacheStr = (u.cacheRead || u.cacheWrite)
                  ? " cache:" + ((u.cacheRead || 0) + (u.cacheWrite || 0)).toLocaleString()
                  : "";
                tokenText.textContent = "in: " + cumulativeInput.toLocaleString() + "  out: " + cumulativeOutput.toLocaleString() + cacheStr;
                costText.textContent = "$" + cumulativeCost.toFixed(6);
                updateContextMeter(inp);
              }

              setBusy(false);
            } else if (data.type === "error") {
              removeTyping();
              requestStartTime = null;
              addChat("system", "Error: " + (data.data?.error || "Unknown error"));
              setBusy(false);
            }
          }

          function updateContextMeter(lastInput) {
            var pct = Math.min(100, Math.round((lastInput / CONTEXT_WINDOW) * 100));
            meterFill.style.width = pct + "%";
            meterFill.className = "meter-fill" + (pct > 70 ? " danger" : pct > 50 ? " warn" : "");
            contextText.textContent = lastInput.toLocaleString() + " / " + CONTEXT_WINDOW.toLocaleString() + " (" + pct + "%)";
            contextText.className = "footer-value" + (pct > 70 ? " error" : pct > 50 ? " warn" : "");
          }

          var requestStartTime = null;
          var typingEl = null;
          var AVATARS = { user: "U", assistant: "D", thinking: "💭", system: "" };
          var BT = String.fromCharCode(96);
          var FENCE = BT + BT + BT;
          var inlineCodeRe = new RegExp(BT + "([^" + BT + "]+)" + BT, "g");
          var boldRe = new RegExp("\\\\*\\\\*([^*]+)\\\\*\\\\*", "g");
          var italicRe = new RegExp("\\\\*([^*]+)\\\\*", "g");

          function escapeHtml(str) {
            var d = document.createElement("div");
            d.textContent = str;
            return d.innerHTML;
          }

          function renderMarkdown(text) {
            var safe = escapeHtml(text);
            var lines = safe.split("\\n");
            var out = [];
            var inCode = false;
            var codeLang = "";
            var codeLines = [];
            var inUl = false;
            var inOl = false;

            for (var i = 0; i < lines.length; i++) {
              var line = lines[i];
              if (line.indexOf(FENCE) === 0) {
                if (!inCode) {
                  inCode = true;
                  codeLang = line.slice(3);
                  codeLines = [];
                } else {
                  if (inUl) { out.push("</ul>"); inUl = false; }
                  if (inOl) { out.push("</ol>"); inOl = false; }
                  out.push("<pre><code>" + codeLines.join("\\n") + "</code></pre>");
                  inCode = false;
                }
                continue;
              }
              if (inCode) { codeLines.push(line); continue; }

              var ulMatch = line.match(/^[\\-\\*]\\s+(.*)/);
              var olMatch = line.match(/^(\\d+)\\.\\s+(.*)/);
              if (ulMatch) {
                if (inOl) { out.push("</ol>"); inOl = false; }
                if (!inUl) { out.push("<ul>"); inUl = true; }
                out.push("<li>" + inlineFormat(ulMatch[1]) + "</li>");
                continue;
              } else if (inUl) { out.push("</ul>"); inUl = false; }
              if (olMatch) {
                if (inUl) { out.push("</ul>"); inUl = false; }
                if (!inOl) { out.push("<ol>"); inOl = true; }
                out.push("<li>" + inlineFormat(olMatch[2]) + "</li>");
                continue;
              } else if (inOl) { out.push("</ol>"); inOl = false; }

              if (line.match(/^###\\s/)) { out.push("<h3>" + inlineFormat(line.slice(4)) + "</h3>"); continue; }
              if (line.match(/^##\\s/)) { out.push("<h2>" + inlineFormat(line.slice(3)) + "</h2>"); continue; }
              if (line.match(/^#\\s/)) { out.push("<h1>" + inlineFormat(line.slice(2)) + "</h1>"); continue; }
              if (line.match(/^---$/)) { out.push("<hr>"); continue; }
              if (line.trim() === "") { out.push(""); continue; }
              out.push("<p>" + inlineFormat(line) + "</p>");
            }
            if (inUl) out.push("</ul>");
            if (inOl) out.push("</ol>");
            if (inCode) out.push("<pre><code>" + codeLines.join("\\n") + "</code></pre>");
            return out.join("\\n").replace(new RegExp("<p></p>", "g"), "");
          }

          function inlineFormat(s) {
            s = s.replace(inlineCodeRe, "<code>$1</code>");
            s = s.replace(boldRe, "<strong>$1</strong>");
            s = s.replace(italicRe, "<em>$1</em>");
            return s;
          }

          function showTyping() {
            removeTyping();
            var row = document.createElement("div");
            row.className = "typing-row";
            row.id = "typingIndicator";
            var av = document.createElement("div");
            av.className = "msg-avatar";
            av.style.background = "#0d2a20";
            av.style.color = "#00e5a8";
            av.textContent = "D";
            row.appendChild(av);
            var dots = document.createElement("div");
            dots.className = "typing-dots";
            dots.innerHTML = "<span></span><span></span><span></span>";
            row.appendChild(dots);
            chat.appendChild(row);
            chat.scrollTop = chat.scrollHeight;
            typingEl = row;
          }

          function removeTyping() {
            if (typingEl) { typingEl.remove(); typingEl = null; }
            var old = document.getElementById("typingIndicator");
            if (old) old.remove();
          }

          function addChat(role, text, opts) {
            opts = opts || {};
            if (chatEmpty) chatEmpty.style.display = "none";
            removeTyping();

            if (role === "system") {
              var row = document.createElement("div");
              row.className = "msg-row system";
              var bubble = document.createElement("div");
              bubble.className = "msg-bubble";
              bubble.textContent = text;
              row.appendChild(bubble);
              chat.appendChild(row);
              chat.scrollTop = chat.scrollHeight;
              return;
            }

            var row = document.createElement("div");
            row.className = "msg-row " + role;

            if (role !== "system") {
              var av = document.createElement("div");
              av.className = "msg-avatar";
              av.textContent = AVATARS[role] || "?";
              row.appendChild(av);
            }

            var body = document.createElement("div");
            body.className = "msg-body";

            var header = document.createElement("div");
            header.className = "msg-header";
            var nameEl = document.createElement("span");
            nameEl.className = "msg-name";
            nameEl.textContent = role === "thinking" ? "thinking" : role === "assistant" ? "doba" : "you";
            header.appendChild(nameEl);
            var tsEl = document.createElement("span");
            tsEl.className = "msg-ts";
            var now = new Date();
            tsEl.textContent = now.toLocaleTimeString("en-US", { hour12: false }) + ":" + String(now.getMilliseconds()).padStart(3, "0");
            header.appendChild(tsEl);
            body.appendChild(header);

            var bubble = document.createElement("div");
            bubble.className = "msg-bubble";

            if (role === "thinking") {
              var toggle = document.createElement("div");
              toggle.className = "think-toggle";
              toggle.innerHTML = '<span class="arrow">▸</span> reasoning';
              var content = document.createElement("div");
              content.className = "think-content";
              content.style.whiteSpace = "pre-wrap";
              content.textContent = text;
              toggle.addEventListener("click", function() {
                toggle.classList.toggle("open");
                content.classList.toggle("open");
              });
              bubble.appendChild(toggle);
              bubble.appendChild(content);
            } else if (role === "assistant") {
              bubble.innerHTML = renderMarkdown(text);
            } else {
              bubble.style.whiteSpace = "pre-wrap";
              bubble.textContent = text;
            }
            body.appendChild(bubble);

            if (role !== "system") {
              var actions = document.createElement("div");
              actions.className = "msg-actions";
              var copyBtn = document.createElement("button");
              copyBtn.className = "msg-action-btn";
              copyBtn.textContent = "copy";
              copyBtn.addEventListener("click", function() {
                navigator.clipboard.writeText(text).then(function() {
                  copyBtn.textContent = "copied!";
                  copyBtn.classList.add("copied");
                  setTimeout(function() { copyBtn.textContent = "copy"; copyBtn.classList.remove("copied"); }, 1500);
                });
              });
              actions.appendChild(copyBtn);
              body.appendChild(actions);
            }

            if (opts.responseTime) {
              var rtEl = document.createElement("div");
              rtEl.className = "msg-response-time";
              rtEl.textContent = opts.responseTime >= 1000 ? (opts.responseTime / 1000).toFixed(1) + "s" : opts.responseTime + "ms";
              body.appendChild(rtEl);
            }

            row.appendChild(body);
            chat.appendChild(row);
            chat.scrollTop = chat.scrollHeight;
          }

          function addEvent(data) {
            evtCount++;
            eventCount.textContent = evtCount;

            var ts = new Date(data.timestamp);
            var now = ts.getTime();
            var evType = data.type || "log";
            var depth = DEPTH_MAP[evType] || 0;

            var startKey = PAIR_MAP[evType];
            if (startKey) {
              var sk = startKey + ":" + (data.source || "");
              var elapsed = startTimes[sk] ? now - startTimes[sk] : null;
              delete startTimes[sk];
            }
            if (evType.indexOf("_start") !== -1 || evType === "task_start") {
              startTimes[evType + ":" + (data.source || "")] = now;
            }

            var div = document.createElement("div");
            div.className = "event-item depth-" + depth;
            if (hiddenTypes[evType]) div.classList.add("filtered-out");
            div.setAttribute("data-type", evType);

            var icon = document.createElement("span");
            icon.className = "event-icon";
            icon.textContent = ICONS[evType] || "·";
            div.appendChild(icon);

            var time = document.createElement("span");
            time.className = "event-time";
            time.textContent = ts.toLocaleTimeString("en-US", { hour12: false }) + "." + String(ts.getMilliseconds()).padStart(3, "0");
            div.appendChild(time);

            var badge = document.createElement("span");
            badge.className = "event-badge badge-" + evType;
            var shortType = evType.replace("orchestra_", "").replace("task_generation_", "route:").replace("task_", "task:").replace("agent_", "agent:").replace("tool_", "tool:");
            badge.textContent = shortType;
            div.appendChild(badge);

            var summary = document.createElement("span");
            summary.className = "event-summary";
            var parts = [];
            if (data.source && data.source !== "orchestra" && data.source !== "server") parts.push(data.source);
            if (data.data) {
              var dd = data.data;
              if (dd.tool) parts.push(dd.tool);
              if (dd.query) parts.push(dd.query.length > 50 ? dd.query.slice(0, 50) + "..." : dd.query);
              if (dd.agent) parts.push(dd.agent);
              if (dd.mode) parts.push("mode:" + dd.mode);
              if (dd.step) parts.push("step " + dd.step);
              if (dd.task) parts.push(dd.task.length > 50 ? dd.task.slice(0, 50) + "..." : dd.task);
              if (dd.error) parts.push(dd.error);
              if (dd.message) parts.push(dd.message);
              if (dd.usage) parts.push("tokens:" + (dd.usage.totalTokens || "?"));
              if (dd.result && typeof dd.result === "string") parts.push(dd.result.length > 50 ? dd.result.slice(0, 50) + "..." : dd.result);
              if (dd.final_answer) {
                var sr = new RegExp("<think>[\\\\s\\\\S]*?</think>\\\\s*", "g");
                var cleaned = dd.final_answer.replace(sr, "");
                parts.push(cleaned.length > 50 ? cleaned.slice(0, 50) + "..." : cleaned);
              }
            }
            summary.textContent = parts.join(" · ");
            div.appendChild(summary);

            if (typeof elapsed === "number" && elapsed !== null) {
              var dur = document.createElement("span");
              dur.className = "event-duration";
              if (elapsed > 10000) dur.classList.add("very-slow");
              else if (elapsed > 3000) dur.classList.add("slow");
              var durStr = elapsed >= 1000 ? (elapsed / 1000).toFixed(1) + "s" : elapsed + "ms";
              dur.textContent = durStr;
              div.appendChild(dur);
            }

            var detailDiv = document.createElement("div");
            detailDiv.className = "event-detail";
            detailDiv.textContent = JSON.stringify(data.data || {}, null, 2);
            div.appendChild(detailDiv);

            div.addEventListener("click", function(e) {
              e.stopPropagation();
              div.classList.toggle("expanded");
            });

            events.appendChild(div);
            if (autoScrollCb.checked) events.scrollTop = events.scrollHeight;
          }

          function setBusy(b) {
            busy = b;
            input.disabled = b;
            sendBtn.disabled = b;
            if (!b) input.focus();
          }

          function send() {
            var text = input.value.trim();
            if (!text || busy) return;
            addChat("user", text);
            var payload = { message: text };
            if (currentChatId) payload.chat_id = currentChatId;
            ws.send(JSON.stringify(payload));
            input.value = "";
            input.style.height = "auto";
            requestStartTime = Date.now();
            showTyping();
            setBusy(true);
          }

          function newChat() {
            currentChatId = null;
            messageCount = 0;
            cumulativeInput = 0;
            cumulativeOutput = 0;
            cumulativeCost = 0;
            requestStartTime = null;
            removeTyping();
            chat.innerHTML = '<div class="chat-empty" id="chatEmpty"><div class="chat-empty-icon">💬</div><div class="chat-empty-text">Send a message to start chatting</div></div>';
            chatInfo.textContent = "no chat";
            tokenText.textContent = "in: --  out: --";
            costText.textContent = "$0.000000";
            contextText.textContent = "--";
            meterFill.style.width = "0%";
            meterFill.className = "meter-fill";
            contextText.className = "footer-value";
            modeText.textContent = "--";
            modeText.className = "footer-value";
            input.focus();
          }

          async function fetchModels() {
            try {
              var res = await fetch("/v1/ollama/active-models");
              var data = await res.json();
              if (data.models && data.models.length > 0) {
                modelStatus.innerHTML = data.models.map(function(m) {
                  var name = m.name || m.model || "?";
                  var short = name.split(":")[0];
                  var sizeGB = m.size_vram ? (m.size_vram / 1e9).toFixed(1) + "G" : "";
                  return '<span class="model-pill"><span class="model-dot loaded"></span>' + short + (sizeGB ? " " + sizeGB : "") + '</span>';
                }).join(" ");
              } else {
                modelStatus.innerHTML = '<span style="color:#ef4444">no models loaded</span>';
              }
            } catch {
              modelStatus.innerHTML = '<span style="color:#ef4444">provider unreachable</span>';
            }
          }

          filterBar.addEventListener("click", function(e) {
            var chip = e.target.closest(".filter-chip");
            if (!chip) return;
            chip.classList.toggle("active");
            var types = chip.getAttribute("data-types").split(",");
            var on = chip.classList.contains("active");
            types.forEach(function(t) {
              if (on) delete hiddenTypes[t]; else hiddenTypes[t] = true;
            });
            var items = events.querySelectorAll(".event-item");
            items.forEach(function(el) {
              var t = el.getAttribute("data-type");
              if (hiddenTypes[t]) el.classList.add("filtered-out");
              else el.classList.remove("filtered-out");
            });
          });

          input.addEventListener("keydown", function(e) {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          });
          input.addEventListener("input", function() {
            input.style.height = "auto";
            input.style.height = Math.min(input.scrollHeight, 120) + "px";
          });
          sendBtn.addEventListener("click", send);
          clearEvents.addEventListener("click", function() {
            events.innerHTML = "";
            evtCount = 0;
            eventCount.textContent = "0";
            startTimes = {};
          });
          newChatBtn.addEventListener("click", newChat);

          connect();
          fetchModels();
          setInterval(fetchModels, 15000);
        </script>
      </body>
    </html>`);
});

export default playgroundApp;
