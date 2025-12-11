import React, { useState, useRef, useEffect } from "react";

const WORKER_API = import.meta.env.WORKER_AI || "__WORKER_AI__"; 
// Cloudflare Pages injects this safely during build

const escapeHtml = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export default function FuturisticChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("disconnected");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (WORKER_API) setStatus("ready — connected to worker");
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const addMessage = (text, role) => {
    setMessages((prev) => [...prev, { text, role }]);
    setTimeout(scrollToBottom, 50);
  };

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    addMessage(trimmed, "user");
    setInput("");

    if (!WORKER_API) {
      addMessage("No API configured. Check Cloudflare Pages secrets.", "ai");
      return;
    }

    const payload = { messages: [{ role: "user", content: trimmed }] };

    try {
      const resp = await fetch(
        WORKER_API.replace(/\/+$/, "") + "/api/chat",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (resp.body && resp.body.getReader) {
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        addMessage("", "ai");
        const idx = messages.length;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            accumulated += decoder.decode(value, { stream: true });
            setMessages((prev) => {
              const copy = [...prev];
              copy[idx] = { text: accumulated, role: "ai" };
              return copy;
            });
          }
        }
      } else {
        const data = await resp.json();
        const reply =
          data?.reply ||
          data?.result ||
          data?.choices?.[0]?.message?.content ||
          JSON.stringify(data);
        addMessage(String(reply), "ai");
      }
    } catch (err) {
      addMessage("Error connecting to worker: " + err.message, "ai");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0b1020",
        color: "#e6eef8",
        padding: "40px",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "360px 1fr",
          gap: "18px",
          width: "980px",
          maxWidth: "calc(100% - 40px)",
          background: "#0f1724",
          borderRadius: "18px",
          padding: "18px",
          boxShadow: "0 10px 40px rgba(2,6,23,0.6)",
        }}
      >
        {/* 🔮 Left Panel */}
        <div
          style={{
            padding: "14px",
            borderRadius: "12px",
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "12px",
              alignItems: "center",
              marginBottom: "12px",
            }}
          >
            <div
              style={{
                width: "46px",
                height: "46px",
                borderRadius: "10px",
                background:
                  "linear-gradient(90deg,#6ee7b7,#60a5fa,#c084fc)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                fontWeight: 700,
              }}
            >
              AI
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: "16px" }}>Futuristic Chat</h1>
              <div style={{ fontSize: "12px", opacity: 0.8 }}>
                Cloudflare Worker Frontend
              </div>
            </div>
          </div>

          <div
            style={{ fontSize: "12px", color: "#bcd7ff", marginBottom: "8px" }}
          >
            Quick presets
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {["Concise Assistant", "Explain Like I'm 5", "Dev Assistant"].map(
              (preset, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "10px",
                    borderRadius: "10px",
                    background: "rgba(255,255,255,0.04)",
                    cursor: "pointer",
                  }}
                  onClick={() =>
                    addMessage(`<em>Preset applied:</em> ${preset}`, "ai")
                  }
                >
                  {preset}
                </div>
              )
            )}
          </div>
        </div>

        {/* ✨ Chat Panel */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            height: "70vh",
            minHeight: "420px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px 12px",
              borderRadius: "10px",
              background: "rgba(255,255,255,0.01)",
              border: "1px solid rgba(255,255,255,0.02)",
            }}
          >
            <div style={{ fontWeight: 600 }}>Futuristic Chat</div>
            <div style={{ fontSize: "12px", opacity: 0.85 }}>{status}</div>
          </div>

          <div
            style={{
              flex: 1,
              padding: "18px",
              overflow: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "80%",
                  padding: "12px 14px",
                  borderRadius: "12px",
                  background:
                    m.role === "user"
                      ? "#111827"
                      : "rgba(96,165,250,0.06)",
                  border:
                    m.role === "user"
                      ? "1px solid rgba(255,255,255,0.02)"
                      : "1px solid rgba(255,255,255,0.03)",
                  boxShadow: "0 4px 20px rgba(2,6,23,0.6)",
                }}
                dangerouslySetInnerHTML={{
                  __html: escapeHtml(m.text).replace(/\n/g, "<br>"),
                }}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div
            style={{
              display: "flex",
              gap: "10px",
              padding: "12px",
              background: "transparent",
            }}
          >
            <textarea
              style={{
                flex: 1,
                padding: "12px 14px",
                borderRadius: "12px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
                color: "inherit",
              }}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything..."
            />

            <button
              style={{
                padding: "10px 14px",
                borderRadius: "12px",
                border: 0,
                background:
                  "linear-gradient(90deg,#6ee7b7,#60a5fa,#c084fc)",
                fontWeight: 600,
                cursor: "pointer",
              }}
              onClick={sendMessage}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
