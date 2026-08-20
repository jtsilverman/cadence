"use client";

import { useState } from "react";
import { joinedEmail } from "../attribution";
import { FAQ, segments } from "@/lib/faq";

// The questions page: one accordion row per entry, one open at a time, plus the
// ask-a-question box feeding POST /api/question. Every unanswered question is
// validation data.
//
// The copy lives in lib/faq.ts, marked with the deck's own notation. accented()
// turns one marked phrase into one <em>, which the stylesheet paints tomato in
// a question and green in an answer. Same two voices as the pain belt on the
// main page.

function accented(line: string) {
  return segments(line).map((segment, i) =>
    segment.accent ? <em key={i}>{segment.text}</em> : segment.text
  );
}

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="faq-list">
      {FAQ.map((item, i) => (
        <div key={item.q} className="faq-item">
          <button
            type="button"
            className="faq-row"
            aria-expanded={open === i}
            onClick={() => setOpen(open === i ? null : i)}
          >
            <span className="mono ix">{String(i + 1).padStart(2, "0")}</span>
            <h2 className="faq-q">{accented(item.q)}</h2>
            <span className="faq-toggle" aria-hidden="true">
              {open === i ? "\u2013" : "+"}
            </span>
          </button>
          <div className={open === i ? "faq-panel faq-panel--open" : "faq-panel"}>
            {/* the padding lives on the paragraph, never on the collapsing grid
                item: padding on the item itself floors the closed row's height */}
            <div className="faq-panel-inner">
              <p className="faq-a">{accented(item.a)}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AskBox() {
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "busy" || !question.trim()) return;
    setState("busy");
    try {
      const res = await fetch("/api/question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, email: joinedEmail() ?? undefined }),
      });
      setState(res.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "sent") {
    return <p className="ask-sent">Got it. We&rsquo;ll answer it here.</p>;
  }

  return (
    <form className="ask-form" onSubmit={submit}>
      <textarea
        rows={1}
        className="ask-textarea"
        placeholder="Ask anything. Unanswered questions decide what we write next."
        aria-label="Your question"
        value={question}
        onChange={(e) => {
          e.target.style.height = "auto";
          e.target.style.height = `${e.target.scrollHeight}px`;
          setQuestion(e.target.value);
        }}
      />
      <div className="ask-actions">
        <button type="submit" className="cta small" disabled={state === "busy"}>
          {state === "busy" ? "Sending..." : "Send question"}
        </button>
        {state === "error" && (
          <span className="mono">That didn&rsquo;t go through. Try again.</span>
        )}
      </div>
    </form>
  );
}
