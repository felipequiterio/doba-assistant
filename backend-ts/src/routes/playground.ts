import { Hono } from "hono";
import { html } from "hono/html";

const playgroundApp = new Hono();

playgroundApp.get("/playground", (c) => {
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
            gap: 12px;
          }
          .messages::-webkit-scrollbar {
            width: 4px;
          }
          .messages::-webkit-scrollbar-thumb {
            background: #1f2630;
            border-radius: 2px;
          }

          .msg {
            max-width: 85%;
            padding: 10px 14px;
            border-radius: 10px;
            font-size: 14px;
            line-height: 1.5;
            word-wrap: break-word;
            white-space: pre-wrap;
          }
          .msg.user {
            align-self: flex-end;
            background: #1a3a4a;
            border: 1px solid #1f4a5a;
            color: #e2e8f0;
          }
          .msg.assistant {
            align-self: flex-start;
            background: #161b22;
            border: 1px solid #1f2630;
          }
          .msg.system {
            align-self: center;
            font-size: 12px;
            color: #64748b;
            font-style: italic;
          }
          .msg .label {
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
            color: #64748b;
          }
          .msg.user .label {
            color: #5eaac0;
          }
          .msg.assistant .label {
            color: #00e5a8;
          }
          .msg.thinking {
            align-self: flex-start;
            background: #1a1a10;
            border: 1px solid #2a2a1a;
            font-size: 12px;
            color: #94908a;
            font-family: "JetBrains Mono", monospace;
          }

          .input-bar {
            padding: 12px 16px;
            border-top: 1px solid #1f2630;
            background: #11161c;
            display: flex;
            gap: 8px;
          }
          .input-bar input {
            flex: 1;
            background: #0b0f14;
            border: 1px solid #1f2630;
            border-radius: 8px;
            padding: 10px 14px;
            color: #e2e8f0;
            font-size: 14px;
            outline: none;
            transition: border-color 0.15s;
          }
          .input-bar input:focus {
            border-color: #00e5a8;
          }
          .input-bar input::placeholder {
            color: #3a4555;
          }
          .input-bar input:disabled {
            opacity: 0.5;
          }
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
          }
          .input-bar button:hover {
            opacity: 0.85;
          }
          .input-bar button:disabled {
            opacity: 0.4;
            cursor: not-allowed;
          }

          /* Events panel */
          .event-item {
            padding: 8px 12px;
            border-bottom: 1px solid #1a1f28;
            font-family: "JetBrains Mono", "Fira Code", monospace;
            font-size: 12px;
            line-height: 1.6;
            display: flex;
            gap: 8px;
            align-items: flex-start;
          }
          .event-item:hover {
            background: #161b22;
          }
          .event-badge {
            display: inline-block;
            padding: 1px 6px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 600;
            white-space: nowrap;
            flex-shrink: 0;
          }
          .event-time {
            color: #3a4555;
            font-size: 10px;
            flex-shrink: 0;
            min-width: 65px;
          }
          .event-data {
            color: #64748b;
            word-break: break-all;
          }

          .badge-orchestra_start,
          .badge-orchestra_end {
            background: #1a2a3a;
            color: #5eaac0;
          }
          .badge-task_generation_start,
          .badge-task_generation_end {
            background: #1a2a2a;
            color: #00e5a8;
          }
          .badge-agent_start,
          .badge-agent_end {
            background: #1a1a2a;
            color: #818cf8;
          }
          .badge-tool_selection {
            background: #2a2a1a;
            color: #f59e0b;
          }
          .badge-tool_start,
          .badge-tool_end {
            background: #1a2a1a;
            color: #22c55e;
          }
          .badge-tool_error,
          .badge-task_error {
            background: #2a1a1a;
            color: #ef4444;
          }
          .badge-connected,
          .badge-chat_info,
          .badge-log {
            background: #1f2630;
            color: #64748b;
          }
          .badge-error {
            background: #2a1a1a;
            color: #ef4444;
          }

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
            <div class="messages" id="chat"></div>
            <div class="input-bar">
              <input
                type="text"
                id="input"
                placeholder="Type a message..."
                autocomplete="off"
                disabled
              />
              <button id="sendBtn" disabled>Send</button>
            </div>
          </div>

          <div class="panel">
            <div class="panel-header">
              Event Bus
              <span class="count" id="eventCount">0</span>
              <div class="panel-actions">
                <button class="small-btn" id="clearEvents">Clear</button>
              </div>
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
        </footer>

        <script>
          const chat = document.getElementById("chat");
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

          let ws;
          let evtCount = 0;
          let busy = false;
          let currentChatId = null;
          let messageCount = 0;
          let cumulativeInput = 0;
          let cumulativeOutput = 0;
          const CONTEXT_WINDOW = 32768;

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
              if (thinkMatch) {
                addChat("thinking", thinkMatch[1].trim());
              }
              if (cleanAnswer) {
                addChat("assistant", cleanAnswer);
              }
              messageCount += 2;

              if (data.data.usage) {
                var u = data.data.usage;
                var inp = u.input || 0;
                var out = u.output || u.output || 0;
                var total = u.totalTokens || (inp + out);
                cumulativeInput += inp;
                cumulativeOutput += out;
                tokenText.textContent = "in: " + cumulativeInput.toLocaleString() + "  out: " + cumulativeOutput.toLocaleString();
                updateContextMeter(inp);
              }

              setBusy(false);
            } else if (data.type === "error") {
              addChat(
                "system",
                "Error: " + (data.data?.error || "Unknown error")
              );
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

          function addChat(role, text) {
            var div = document.createElement("div");
            div.className = "msg " + role;
            var label = document.createElement("div");
            label.className = "label";
            label.textContent = role === "thinking" ? "thinking" : role;
            div.appendChild(label);
            var content = document.createElement("div");
            content.textContent = text;
            div.appendChild(content);
            chat.appendChild(div);
            chat.scrollTop = chat.scrollHeight;
          }

          function addEvent(data) {
            evtCount++;
            eventCount.textContent = evtCount;
            var div = document.createElement("div");
            div.className = "event-item";

            var time = document.createElement("span");
            time.className = "event-time";
            var d = new Date(data.timestamp);
            time.textContent =
              d.toLocaleTimeString("en-US", { hour12: false }) +
              "." +
              String(d.getMilliseconds()).padStart(3, "0");
            div.appendChild(time);

            var badge = document.createElement("span");
            badge.className = "event-badge badge-" + data.type;
            badge.textContent = data.type;
            div.appendChild(badge);

            var detail = document.createElement("span");
            detail.className = "event-data";
            var parts = [];
            if (data.source && data.source !== "orchestra")
              parts.push(data.source);
            if (data.data) {
              var dd = data.data;
              if (dd.tool) parts.push(dd.tool);
              if (dd.query)
                parts.push(
                  '"' +
                    (dd.query.length > 60
                      ? dd.query.slice(0, 60) + "..."
                      : dd.query) +
                    '"'
                );
              if (dd.agent) parts.push(dd.agent);
              if (dd.mode) parts.push("mode:" + dd.mode);
              if (dd.error) parts.push("ERR: " + dd.error);
              if (dd.message) parts.push(dd.message);
              if (dd.usage) parts.push("tokens:" + (dd.usage.totalTokens || "?"));
              if (dd.final_answer) {
                var sr = new RegExp("<think>[\\\\s\\\\S]*?</think>\\\\s*", "g");
                var cleaned = dd.final_answer.replace(sr, "");
                parts.push(cleaned.length > 60 ? cleaned.slice(0, 60) + "..." : cleaned);
              }
            }
            detail.textContent = parts.join(" · ");
            div.appendChild(detail);

            events.appendChild(div);
            events.scrollTop = events.scrollHeight;
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
            setBusy(true);
          }

          function newChat() {
            currentChatId = null;
            messageCount = 0;
            cumulativeInput = 0;
            cumulativeOutput = 0;
            chat.innerHTML = "";
            chatInfo.textContent = "no chat";
            tokenText.textContent = "in: --  out: --";
            contextText.textContent = "--";
            meterFill.style.width = "0%";
            meterFill.className = "meter-fill";
            contextText.className = "footer-value";
            modeText.textContent = "--";
            modeText.className = "footer-value";
            addChat("system", "New conversation started.");
            input.focus();
          }

          async function fetchModels() {
            try {
              var res = await fetch("/v1/ollama/stats");
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
              modelStatus.innerHTML = '<span style="color:#ef4444">ollama unreachable</span>';
            }
          }

          input.addEventListener("keydown", function(e) {
            if (e.key === "Enter") send();
          });
          sendBtn.addEventListener("click", send);
          clearEvents.addEventListener("click", function() {
            events.innerHTML = "";
            evtCount = 0;
            eventCount.textContent = "0";
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
