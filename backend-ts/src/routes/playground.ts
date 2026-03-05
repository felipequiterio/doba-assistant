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
          :root {
            --bg-0: #0a0a0a;
            --bg-1: #111111;
            --bg-2: #171717;
            --bg-3: #1e1e1e;
            --bg-4: #262626;
            --border: #1e1e1e;
            --border-light: #2e2e2e;
            --text-1: #e8e8e8;
            --text-2: #a0a0a0;
            --text-3: #666666;
            --text-4: #3d3d3d;
            --accent: #10b981;
            --accent-muted: rgba(16, 185, 129, 0.12);
            --error: #f43f5e;
            --error-muted: rgba(244, 63, 94, 0.10);
            --warning: #eab308;
            --warning-muted: rgba(234, 179, 8, 0.10);
            --info: #818cf8;
            --info-muted: rgba(129, 140, 248, 0.10);
            --user: #60a5fa;
            --user-muted: rgba(96, 165, 250, 0.08);
            --tool: #34d399;
            --tool-muted: rgba(52, 211, 153, 0.10);
            --radius-sm: 6px;
            --radius-md: 10px;
          }

          * { margin: 0; padding: 0; box-sizing: border-box; }

          body {
            font-family: "Geist", -apple-system, system-ui, sans-serif;
            background: var(--bg-0);
            color: var(--text-1);
            height: 100vh;
            display: flex;
            flex-direction: column;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            font-feature-settings: "cv02", "cv03", "cv04", "cv11";
          }

          /* ---- HEADER ---- */
          header {
            padding: 0 24px;
            height: 48px;
            border-bottom: 1px solid var(--border);
            display: flex;
            align-items: center;
            gap: 12px;
            background: var(--bg-1);
            flex-shrink: 0;
          }
          header h1 {
            font-family: "Geist Mono", monospace;
            font-size: 13px;
            font-weight: 500;
            letter-spacing: 1.2px;
            color: var(--text-2);
          }
          header h1 span {
            font-family: "Geist", -apple-system, system-ui, sans-serif;
            color: var(--accent);
            font-weight: 400;
            letter-spacing: 0.3px;
          }
          .header-right {
            margin-left: auto;
            display: flex;
            align-items: center;
            gap: 16px;
          }
          .status {
            font-size: 11px;
            color: var(--text-3);
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .status-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: var(--error);
            transition: background 0.3s;
          }
          .status-dot.connected {
            background: var(--accent);
            box-shadow: 0 0 6px rgba(16, 185, 129, 0.4);
          }

          /* ---- MAIN LAYOUT ---- */
          main {
            flex: 1;
            display: grid;
            grid-template-columns: 1fr 1fr;
            overflow: hidden;
          }
          .panel {
            display: flex;
            flex-direction: column;
            overflow: hidden;
          }
          .panel:first-child {
            border-right: 1px solid var(--border);
          }
          .panel-header {
            padding: 0 16px;
            height: 36px;
            font-family: "Geist Mono", monospace;
            font-size: 10px;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            color: var(--text-4);
            background: var(--bg-1);
            border-bottom: 1px solid var(--border);
            display: flex;
            align-items: center;
            gap: 8px;
            flex-shrink: 0;
          }
          .panel-header .count {
            background: var(--bg-3);
            color: var(--text-3);
            font-size: 9px;
            padding: 1px 6px;
            border-radius: 4px;
            font-weight: 500;
          }
          .panel-actions {
            margin-left: auto;
            display: flex;
            align-items: center;
            gap: 8px;
          }

          /* ---- MESSAGES ---- */
          .messages {
            flex: 1;
            overflow-y: auto;
            padding: 20px 16px;
            display: flex;
            flex-direction: column;
            gap: 4px;
          }
          .messages::-webkit-scrollbar { width: 4px; }
          .messages::-webkit-scrollbar-track { background: transparent; }
          .messages::-webkit-scrollbar-thumb { background: var(--bg-4); border-radius: 2px; }

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
            border-radius: var(--radius-sm);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            flex-shrink: 0;
            font-weight: 600;
            margin-top: 2px;
          }
          .msg-row.user .msg-avatar { background: var(--user-muted); color: var(--user); }
          .msg-row.assistant .msg-avatar { background: var(--accent-muted); color: var(--accent); }
          .msg-row.thinking .msg-avatar { background: var(--bg-3); color: var(--text-3); font-size: 11px; }
          .typing-row .msg-avatar { background: var(--accent-muted); color: var(--accent); }

          .msg-body { max-width: 78%; min-width: 60px; }

          .msg-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 4px;
          }
          .msg-row.user .msg-header { flex-direction: row-reverse; }
          .msg-name {
            font-family: "Geist Mono", monospace;
            font-size: 10px;
            font-weight: 500;
            letter-spacing: 0.5px;
            text-transform: lowercase;
            color: var(--text-3);
          }
          .msg-row.user .msg-name { color: var(--user); }
          .msg-row.assistant .msg-name { color: var(--accent); }
          .msg-row.thinking .msg-name { color: var(--text-4); }
          .msg-ts {
            font-size: 10px;
            color: var(--text-4);
            font-family: "Geist Mono", monospace;
          }

          .msg-bubble {
            font-family: "Geist Mono", monospace;
            padding: 10px 14px;
            border-radius: var(--radius-md);
            font-size: 13.5px;
            line-height: 1.7;
            word-wrap: break-word;
            position: relative;
            letter-spacing: 0.01em;
          }
          .msg-row.user .msg-bubble {
            background: var(--bg-3);
            color: var(--text-1);
            border-top-right-radius: 4px;
            white-space: pre-wrap;
          }
          .msg-row.assistant .msg-bubble {
            background: var(--bg-2);
            color: var(--text-2);
            border-top-left-radius: 4px;
          }
          .msg-row.system .msg-bubble {
            background: transparent;
            font-size: 12px;
            color: var(--text-4);
            font-style: italic;
            padding: 4px 12px;
          }
          .msg-row.thinking .msg-bubble {
            background: var(--bg-2);
            color: var(--text-3);
            border-top-left-radius: 4px;
            font-size: 12px;
            font-family: "Geist Mono", monospace;
          }

          .msg-actions {
            display: flex;
            gap: 4px;
            margin-top: 4px;
            opacity: 0;
            transition: opacity 0.2s;
          }
          .msg-row:hover .msg-actions { opacity: 1; }
          .msg-row.user .msg-actions { justify-content: flex-end; }
          .msg-action-btn {
            background: none;
            border: 1px solid var(--border);
            color: var(--text-4);
            font-size: 10px;
            padding: 1px 6px;
            border-radius: 4px;
            cursor: pointer;
            font-family: "Geist Mono", monospace;
            transition: all 0.15s;
          }
          .msg-action-btn:hover { border-color: var(--border-light); color: var(--text-2); }
          .msg-action-btn.copied { color: var(--accent); border-color: var(--accent); }

          /* Markdown */
          .msg-bubble p { margin: 0 0 8px 0; }
          .msg-bubble p:last-child { margin-bottom: 0; }
          .msg-bubble strong { color: var(--text-1); font-weight: 600; }
          .msg-bubble em { font-style: italic; color: var(--text-2); }
          .msg-bubble code {
            background: rgba(255,255,255,0.06);
            padding: 2px 6px;
            border-radius: 4px;
            font-family: "Geist Mono", monospace;
            font-size: 0.85em;
            font-weight: 400;
            color: #c9956a;
          }
          .msg-bubble pre {
            background: var(--bg-0);
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            padding: 12px 14px;
            margin: 8px 0;
            overflow-x: auto;
            font-family: "Geist Mono", monospace;
            font-size: 12px;
            line-height: 1.6;
            color: var(--text-2);
          }
          .msg-bubble pre code {
            background: none;
            padding: 0;
            color: inherit;
            font-size: inherit;
          }
          .msg-bubble ul, .msg-bubble ol { margin: 6px 0; padding-left: 20px; }
          .msg-bubble li { margin: 2px 0; }
          .msg-bubble li::marker { color: var(--text-4); }
          .msg-bubble hr { border: none; border-top: 1px solid var(--border); margin: 10px 0; }
          .msg-bubble h1, .msg-bubble h2, .msg-bubble h3 {
            color: var(--text-1);
            margin: 12px 0 6px;
            line-height: 1.3;
          }
          .msg-bubble h1 { font-size: 1.2em; }
          .msg-bubble h2 { font-size: 1.1em; }
          .msg-bubble h3 { font-size: 1em; }

          /* Thinking */
          .think-toggle {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            cursor: pointer;
            font-size: 11px;
            color: var(--text-4);
            background: var(--bg-3);
            border: none;
            border-radius: var(--radius-sm);
            padding: 4px 10px;
            margin-bottom: 4px;
            user-select: none;
            transition: color 0.15s;
          }
          .think-toggle:hover { color: var(--text-3); }
          .think-toggle .arrow { transition: transform 0.2s; font-size: 9px; }
          .think-toggle.open .arrow { transform: rotate(90deg); }
          .think-content {
            display: none;
            max-height: 200px;
            overflow-y: auto;
          }
          .think-content::-webkit-scrollbar { width: 3px; }
          .think-content::-webkit-scrollbar-thumb { background: var(--bg-4); border-radius: 2px; }
          .think-content.open { display: block; }

          /* Typing */
          .typing-row {
            display: flex;
            gap: 10px;
            align-items: flex-start;
            padding: 6px 0;
          }
          .typing-dots {
            display: flex;
            gap: 4px;
            padding: 14px 18px;
            background: var(--bg-2);
            border-radius: var(--radius-md);
            border-top-left-radius: 4px;
          }
          .typing-dots span {
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: var(--text-4);
            animation: typingBounce 1.2s infinite;
          }
          .typing-dots span:nth-child(2) { animation-delay: 0.15s; }
          .typing-dots span:nth-child(3) { animation-delay: 0.3s; }
          @keyframes typingBounce {
            0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
            30% { transform: translateY(-4px); opacity: 1; }
          }

          .msg-response-time {
            font-size: 10px;
            color: var(--text-4);
            font-family: "Geist Mono", monospace;
            margin-top: 4px;
          }

          /* Empty state */
          .chat-empty {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: var(--text-4);
            gap: 10px;
          }
          .chat-empty-icon {
            font-size: 28px;
            opacity: 0.15;
          }
          .chat-empty-text {
            font-family: "Geist Mono", monospace;
            font-size: 12px;
            font-weight: 400;
            letter-spacing: 0.3px;
          }

          /* Input bar */
          .input-bar {
            padding: 12px 16px;
            border-top: 1px solid var(--border);
            background: var(--bg-1);
            display: flex;
            gap: 8px;
            align-items: flex-end;
          }
          .input-bar textarea {
            flex: 1;
            background: var(--bg-0);
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            padding: 10px 14px;
            color: var(--text-1);
            font-size: 13.5px;
            font-family: "Geist Mono", monospace;
            outline: none;
            transition: border-color 0.2s;
            resize: none;
            min-height: 40px;
            max-height: 120px;
            line-height: 1.4;
          }
          .input-bar textarea:focus { border-color: var(--text-4); }
          .input-bar textarea::placeholder { color: var(--text-4); }
          .input-bar textarea:disabled { opacity: 0.4; }
          .input-bar button {
            background: var(--text-1);
            color: var(--bg-0);
            border: none;
            border-radius: var(--radius-sm);
            padding: 10px 20px;
            font-family: "Geist", -apple-system, system-ui, sans-serif;
            font-size: 13px;
            font-weight: 550;
            cursor: pointer;
            transition: opacity 0.15s;
            height: 40px;
          }
          .input-bar button:hover { opacity: 0.85; }
          .input-bar button:disabled { opacity: 0.25; cursor: not-allowed; }

          /* ---- EVENT BUS ---- */
          .event-filters {
            display: flex;
            gap: 4px;
            padding: 8px 12px;
            border-bottom: 1px solid var(--border);
            background: var(--bg-1);
            flex-wrap: wrap;
            align-items: center;
          }
          .filter-chip {
            padding: 3px 8px;
            border-radius: 4px;
            font-family: "Geist Mono", monospace;
            font-size: 10px;
            font-weight: 450;
            cursor: pointer;
            border: none;
            background: transparent;
            color: var(--text-4);
            transition: all 0.15s;
            text-transform: lowercase;
            letter-spacing: 0.3px;
          }
          .filter-chip:hover { color: var(--text-2); }
          .filter-chip.active { color: var(--text-2); background: var(--bg-3); }
          .filter-chip.active[data-group="flow"] { color: var(--user); background: var(--user-muted); }
          .filter-chip.active[data-group="task"] { color: var(--accent); background: var(--accent-muted); }
          .filter-chip.active[data-group="agent"] { color: var(--info); background: var(--info-muted); }
          .filter-chip.active[data-group="tool"] { color: var(--tool); background: var(--tool-muted); }
          .filter-chip.active[data-group="error"] { color: var(--error); background: var(--error-muted); }
          .filter-chip.active[data-group="meta"] { color: var(--text-3); background: var(--bg-3); }
          .filter-sep {
            width: 1px;
            height: 12px;
            background: var(--border);
            margin: 0 4px;
          }

          .event-item {
            padding: 5px 12px;
            border-bottom: 1px solid var(--bg-2);
            font-family: "Geist Mono", monospace;
            font-size: 11px;
            line-height: 1.5;
            display: flex;
            gap: 8px;
            align-items: flex-start;
            cursor: pointer;
            position: relative;
            transition: background 0.1s;
          }
          .event-item:hover { background: var(--bg-2); }
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
            background: var(--border);
          }
          .event-item.depth-2::before { left: 32px; }
          .event-item.depth-3::before { left: 48px; }

          .event-icon {
            flex-shrink: 0;
            width: 16px;
            text-align: center;
            font-size: 11px;
            line-height: 18px;
            color: var(--text-4);
          }
          .event-badge {
            display: inline-block;
            padding: 1px 6px;
            border-radius: 3px;
            font-size: 9px;
            font-weight: 600;
            white-space: nowrap;
            flex-shrink: 0;
          }
          .event-time {
            color: var(--text-4);
            font-size: 10px;
            flex-shrink: 0;
            min-width: 55px;
          }
          .event-summary {
            color: var(--text-3);
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .event-duration {
            flex-shrink: 0;
            font-size: 10px;
            color: var(--text-4);
            font-variant-numeric: tabular-nums;
          }
          .event-duration.slow { color: var(--warning); }
          .event-duration.very-slow { color: var(--error); }

          .event-detail {
            display: none;
            margin: 4px 0 2px 24px;
            padding: 8px 10px;
            background: var(--bg-0);
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            font-size: 10px;
            line-height: 1.6;
            color: var(--text-3);
            white-space: pre-wrap;
            word-break: break-all;
            max-height: 200px;
            overflow-y: auto;
          }
          .event-item.expanded .event-detail { display: block; }
          .event-detail::-webkit-scrollbar { width: 3px; }
          .event-detail::-webkit-scrollbar-thumb { background: var(--bg-4); border-radius: 2px; }

          /* Badge accent colors */
          .badge-orchestra_start, .badge-orchestra_end { background: var(--user-muted); color: var(--user); }
          .badge-task_generation_start, .badge-task_generation_end { background: var(--accent-muted); color: var(--accent); }
          .badge-agent_start, .badge-agent_end { background: var(--info-muted); color: var(--info); }
          .badge-task_start, .badge-task_complete { background: var(--accent-muted); color: var(--accent); }
          .badge-tool_selection { background: var(--warning-muted); color: var(--warning); }
          .badge-tool_start, .badge-tool_end { background: var(--tool-muted); color: var(--tool); }
          .badge-tool_error, .badge-task_error { background: var(--error-muted); color: var(--error); }
          .badge-connected, .badge-chat_info, .badge-log { background: var(--bg-3); color: var(--text-3); }
          .badge-error { background: var(--error-muted); color: var(--error); }
          .badge-retry { background: var(--warning-muted); color: var(--warning); }

          .small-btn {
            background: none;
            border: 1px solid var(--border);
            color: var(--text-4);
            font-family: "Geist Mono", monospace;
            font-size: 10px;
            font-weight: 450;
            padding: 2px 8px;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.15s;
          }
          .small-btn:hover { border-color: var(--border-light); color: var(--text-2); }

          /* ---- FOOTER ---- */
          footer {
            padding: 0 24px;
            height: 36px;
            border-top: 1px solid var(--border);
            background: var(--bg-1);
            display: flex;
            align-items: center;
            gap: 24px;
            font-family: "Geist Mono", monospace;
            font-size: 10px;
            color: var(--text-3);
            flex-shrink: 0;
            font-variant-numeric: tabular-nums;
          }
          .footer-group {
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .footer-label {
            color: var(--text-4);
            text-transform: uppercase;
            font-size: 9px;
            font-weight: 400;
            letter-spacing: 0.8px;
          }
          .footer-value { color: var(--text-3); }
          .footer-value.active { color: var(--accent); }
          .footer-value.warn { color: var(--warning); }
          .footer-value.error { color: var(--error); }
          .footer-value.info { color: var(--info); }

          .context-meter {
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .meter-bar {
            width: 80px;
            height: 3px;
            background: var(--bg-3);
            border-radius: 2px;
            overflow: hidden;
          }
          .meter-fill {
            height: 100%;
            border-radius: 2px;
            background: var(--accent);
            transition: width 0.3s ease, background 0.3s ease;
          }
          .meter-fill.warn { background: var(--warning); }
          .meter-fill.danger { background: var(--error); }

          .model-pill {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 1px 6px;
            border-radius: 3px;
            background: var(--bg-3);
            font-size: 10px;
          }
          .model-dot {
            width: 4px;
            height: 4px;
            border-radius: 50%;
            background: var(--text-4);
          }
          .model-dot.loaded { background: var(--accent); }

          /* Auto-scroll toggle */
          .auto-scroll-label {
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 10px;
            color: var(--text-4);
            cursor: pointer;
            font-family: "Geist Mono", monospace;
          }
          .auto-scroll-label input {
            accent-color: var(--accent);
            width: 12px;
            height: 12px;
          }
          @font-face {
            font-family: 'Geist';
            font-style: normal;
            font-display: swap;
            font-weight: 100 900;
            src: url(https://cdn.jsdelivr.net/fontsource/fonts/geist:vf@latest/latin-wght-normal.woff2) format('woff2-variations');
          }
          @font-face {
            font-family: 'Geist Mono';
            font-style: normal;
            font-display: swap;
            font-weight: 100 900;
            src: url(https://cdn.jsdelivr.net/fontsource/fonts/geist-mono:vf@latest/latin-wght-normal.woff2) format('woff2-variations');
          }
        </style>
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
                <div class="chat-empty-icon">⌘</div>
                <div class="chat-empty-text">Send a message to start</div>
              </div>
            </div>
            <div class="input-bar">
              <textarea
                id="input"
                placeholder="Message... (Enter to send, Shift+Enter for newline)"
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
                <label class="auto-scroll-label">
                  <input type="checkbox" id="autoScroll" checked /> auto-scroll
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
          <div class="footer-group" id="creditsGroup" style="display:none">
            <span class="footer-label">Credits</span>
            <span class="footer-value" id="creditsText">--</span>
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
          const creditsText = document.getElementById("creditsText");
          const creditsGroup = document.getElementById("creditsGroup");
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
              var mode = data.data.mode;
              if (mode === "observe" && data.data.agents && data.data.agents.length) {
                modeText.textContent = "observe(" + data.data.agents.join("+") + ")";
              } else {
                modeText.textContent = mode;
              }
              if (mode === "direct") modeText.className = "footer-value";
              else if (mode === "single") modeText.className = "footer-value active";
              else if (mode === "observe") modeText.className = "footer-value info";
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
              fetchCredits();
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
              if (dd.mode) {
                var modeLabel = dd.mode;
                if (dd.mode === "observe" && dd.agents && dd.agents.length) {
                  modeLabel = "mode:observe(" + dd.agents.join("+") + ")";
                } else {
                  modeLabel = "mode:" + dd.mode;
                }
                parts.push(modeLabel);
              }
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
            chat.innerHTML = '<div class="chat-empty" id="chatEmpty"><div class="chat-empty-icon">⌘</div><div class="chat-empty-text">Send a message to start</div></div>';
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
                modelStatus.innerHTML = '<span style="color:var(--error)">no models loaded</span>';
              }
            } catch {
              modelStatus.innerHTML = '<span style="color:var(--error)">provider unreachable</span>';
            }
          }

          async function fetchCredits() {
            try {
              var res = await fetch("/v1/ollama/credits");
              var data = await res.json();
              if (!data.supported) return;
              creditsGroup.style.display = "";
              var remaining = data.remaining;
              creditsText.textContent = "$" + remaining.toFixed(4);
              if (remaining < 0.05) {
                creditsText.className = "footer-value error";
              } else if (remaining < 0.20) {
                creditsText.className = "footer-value warn";
              } else {
                creditsText.className = "footer-value active";
              }
            } catch {
              // silently ignore — credits display is best-effort
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
          fetchCredits();
          setInterval(fetchCredits, 60000);
        </script>
      </body>
    </html>`);
});

export default playgroundApp;
