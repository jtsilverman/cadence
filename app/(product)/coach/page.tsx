"use client";

import { useEffect, useRef, useState } from "react";

// Coach — the conversation surface (ux.md: chat is the primary way
// information enters and leaves the system). Messages go to POST /api/chat;
// the engine executes actions deterministically and the reply arrives with
// server-authored receipts. Plan changes come back as proposals with an
// approve/decline pair — proposed, never imposed.

interface Message {
  who: "you" | "cadence";
  text: string;
}

interface Proposal {
  suggestion_id: string;
  summary: string;
  days: unknown;
}

export default function CoachPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      who: "cadence",
      text: "Tell me what you ate, ask about your week, or change the plan — I'll show my receipts.",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, proposal]);

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setDraft("");
    const history = messages.slice(-12);
    setMessages((m) => [...m, { who: "you", text }]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, history }),
      });
      const data = await res.json();
      if (data.ok && typeof data.reply === "string") {
        setMessages((m) => [...m, { who: "cadence", text: data.reply }]);
        setProposal(data.proposal ?? null);
      } else {
        setMessages((m) => [...m, { who: "cadence", text: "That didn't go through. Try again?" }]);
      }
    } catch {
      setMessages((m) => [...m, { who: "cadence", text: "That didn't go through. Try again?" }]);
    }
    setBusy(false);
  }

  async function resolveProposal(outcome: "accepted" | "dismissed") {
    if (!proposal || busy) return;
    setBusy(true);
    try {
      if (outcome === "accepted") {
        const applied = await fetch("/api/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ days: proposal.days }),
        });
        const appliedData = await applied.json();
        if (!appliedData.ok) throw new Error("apply failed");
      }
      await fetch("/api/suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestion_id: proposal.suggestion_id, outcome }),
      });
      setMessages((m) => [
        ...m,
        {
          who: "cadence",
          text:
            outcome === "accepted"
              ? `Done — it's on the calendar: ${proposal.summary}`
              : "No problem, the plan stays as it was.",
        },
      ]);
      setProposal(null);
    } catch {
      setMessages((m) => [...m, { who: "cadence", text: "Applying that didn't work. The plan is unchanged." }]);
    }
    setBusy(false);
  }

  return (
    <>
      <header className="shell-header">
        <h1 className="shell-title">Coach</h1>
        <span className="shell-header-meta">Log, ask, adjust</span>
      </header>
      <main className="shell-main chat-main">
        <div className="chat-list">
          {messages.map((msg, i) => (
            <div key={i} className={`chat-msg chat-msg--${msg.who}`}>
              <span className="chat-who">{msg.who === "you" ? "You" : "Cadence"}</span>
              <p style={{ whiteSpace: "pre-wrap" }}>{msg.text}</p>
            </div>
          ))}
          {proposal && (
            <div className="chat-msg chat-msg--cadence chat-proposal">
              <span className="chat-who">Proposal</span>
              <p>{proposal.summary}</p>
              <div className="chip-row">
                <button type="button" className="chip chip--on" disabled={busy} onClick={() => resolveProposal("accepted")}>
                  Approve
                </button>
                <button type="button" className="chip" disabled={busy} onClick={() => resolveProposal("dismissed")}>
                  Not now
                </button>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </main>
      <div className="chat-input-bar">
        <form
          className="chat-input-inner"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            className="chat-input"
            placeholder="Log a meal, ask anything…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Message"
          />
          <button type="submit" className="chat-send" disabled={busy || !draft.trim()}>
            {busy ? "…" : "Send"}
          </button>
        </form>
      </div>
    </>
  );
}
