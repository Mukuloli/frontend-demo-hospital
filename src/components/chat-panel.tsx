"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Send, Loader2, Bot, User, MessageSquare, X } from "lucide-react";
import { restoreGoogleSignIn } from "@/lib/firebase";

const ADK_URL = process.env.NEXT_PUBLIC_ADK_URL || "http://127.0.0.1:8001";

type Message = { role: "user" | "assistant"; text: string; time: string };

type Props = {
  token: string;
};

export default function ChatPanel({ token }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID());
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initialized = useRef(false);

  const now = () =>
    new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  // Greeting on first open
  useEffect(() => {
    if (open && !initialized.current) {
      initialized.current = true;
      setMessages([{
        role: "assistant",
        text: "Hi! I'm Noor 👋 Type your request below to book, view or cancel dental appointments. Hindi/Hinglish bhi chal sakta hai!",
        time: now(),
      }]);
      setTimeout(() => inputRef.current?.focus(), 200);
    }
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Auto scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text, time: now() }]);
    setLoading(true);
    try {
      let requestToken = token;
      if (token.split(".").length === 3) {
        const restored = await restoreGoogleSignIn();
        if (restored) requestToken = restored.token;
      }
      const res = await fetch(`${ADK_URL.replace(/\/$/, "")}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${requestToken}`,
        },
        body: JSON.stringify({ message: text, session_id: sessionId }),
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail = (err as { detail?: unknown }).detail;
        throw new Error(res.status === 401
          ? "Your sign-in has expired. Please sign in again."
          : typeof detail === "string" ? detail : "Noor could not respond right now. Please try again.");
      }
      const data = await res.json() as { reply: string };
      setMessages((m) => [...m, { role: "assistant", text: data.reply, time: now() }]);
    } catch (error) {
      setMessages((m) => [...m, {
        role: "assistant",
        text: error instanceof TypeError
          ? "Cannot reach the booking service. Please try again in a moment."
          : error instanceof DOMException && error.name === "TimeoutError"
            ? "Noor took too long to respond. Please try again."
            : error instanceof Error ? error.message : "Noor could not respond right now. Please try again.",
        time: now(),
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, loading, token, sessionId]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
  };

  if (!token) return null;

  return (
    <>
      {/* FAB button */}
      <button
        className="chat-fab"
        onClick={() => setOpen((s) => !s)}
        aria-label={open ? "Close chat" : "Open chat"}
        id="chat-fab"
      >
        {open ? <X size={22} /> : <MessageSquare size={22} />}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="chat-panel" id="chat-widget">
          {/* Header */}
          <div className="chat-header">
            <div className="chat-header-info">
              <div className="chat-avatar"><Bot size={17} /></div>
              <div>
                <span className="chat-name">Noor</span>
                <span className="chat-status">
                  <span className="chat-online-dot" />
                  Book via text
                </span>
              </div>
            </div>
            <button className="chat-close" onClick={() => setOpen(false)} aria-label="Close chat">
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div className="chat-messages" id="chat-messages">
            {messages.map((m, i) => (
              <div key={i} className={`chat-bubble-row ${m.role}`}>
                {m.role === "assistant" && <span className="chat-msg-avatar"><Bot size={12} /></span>}
                <div className="chat-bubble">
                  <p>{m.text}</p>
                  <span className="chat-time">{m.time}</span>
                </div>
                {m.role === "user" && <span className="chat-msg-avatar user-avatar"><User size={12} /></span>}
              </div>
            ))}
            {loading && (
              <div className="chat-bubble-row assistant">
                <span className="chat-msg-avatar"><Bot size={12} /></span>
                <div className="chat-bubble typing">
                  <Loader2 size={13} className="chat-spinner" />
                  <span>Noor is thinking…</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="chat-input-area">
            <textarea
              ref={inputRef}
              id="chat-input"
              className="chat-input"
              placeholder="Type your message… (Enter to send)"
              value={input}
              rows={1}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={loading}
            />
            <button
              id="chat-send-btn"
              className="chat-send"
              onClick={() => void send()}
              disabled={loading || !input.trim()}
              aria-label="Send"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
