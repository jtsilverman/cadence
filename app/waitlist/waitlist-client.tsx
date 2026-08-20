"use client";

import { useEffect, useState } from "react";
import { attribution, joinedEmail, lastCta, rememberJoined } from "../attribution";
import { SURVEY, type SurveyField } from "@/lib/survey";

// Registration + survey on one page: the email banks the conversion
// (POST /api/waitlist, with attribution), the survey answers ride along
// (POST /api/waitlist/survey) before the thank-you redirect. Every survey
// field is optional; an email alone is a complete submission.
//
// The questions live in lib/survey.ts, which mirrors the locked deck in
// drafts/website/WEBSITE.md. Adding a question there adds it here.

// One slot per question, seeded from SURVEY itself, so a sixth question needs
// no edit here. An empty answer is "" or [], never null: one less state to
// carry and the same thing to test for.
type Answers = Record<SurveyField, string | string[]>;

const EMPTY: Answers = Object.fromEntries(
  SURVEY.map((q) => [q.field, q.kind === "many" ? [] : ""])
) as Answers;

function Choice({
  checked,
  onToggle,
  label,
  radioName,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  radioName?: string;
}) {
  return (
    <label className="opt">
      <input
        type={radioName ? "radio" : "checkbox"}
        name={radioName}
        checked={checked}
        onChange={onToggle}
        aria-label={label}
      />
      <span>{label}</span>
    </label>
  );
}

export function WaitlistSignup() {
  const [email, setEmail] = useState("");
  const [known, setKnown] = useState(false);
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [call, setCall] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");

  // A visitor who already joined this session gets their email back: the
  // survey should never feel like re-registering.
  useEffect(() => {
    const prior = joinedEmail();
    if (prior) {
      setEmail(prior);
      setKnown(true);
    }
  }, []);

  function answerOne(field: SurveyField, value: string) {
    setAnswers((prev) => ({ ...prev, [field]: value }));
  }

  function toggleMany(field: SurveyField, value: string) {
    setAnswers((prev) => {
      const list = prev[field] as string[];
      if (list.includes(value)) return { ...prev, [field]: list.filter((v) => v !== value) };
      return { ...prev, [field]: [...list, value] };
    });
  }

  const answered =
    call ||
    Object.values(answers).some((v) => (Array.isArray(v) ? v.length > 0 : v.trim() !== ""));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "busy") return;
    setState("busy");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, cta: lastCta("waitlist-page"), ...attribution() }),
      });
      if (!res.ok) {
        setState("error");
        return;
      }
      const clean = email.trim().toLowerCase();
      rememberJoined(clean);
      if (answered) {
        // Answers are a bonus on top of the banked conversion: a dropped
        // survey post is not worth blocking the thank-you.
        try {
          await fetch("/api/waitlist/survey", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: clean, ...answers, call_optin: call }),
          });
        } catch {
          // ignore
        }
      }
      window.location.href = "/waitlist/thanks";
    } catch {
      setState("error");
    }
  }

  return (
    // method+action: the native fallback for pre-hydration and no-JS submits.
    // The API's form-encoded branch banks the row and redirects to thanks.
    <form className="signup" onSubmit={submit} method="post" action="/api/waitlist">
      <div className="field">
        <label className="mono" htmlFor="email">
          {known ? "You're joining as" : "Email, the only required field"}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          className="email-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <p className="survey-lede">
        The rest is optional. Five questions that decide what gets built first.
      </p>

      {SURVEY.map((q) => (
        <fieldset key={q.field} className="field">
          <legend className="survey-q">{q.question}</legend>
          {q.kind === "text" ? (
            <textarea
              id={q.field}
              name={q.field}
              rows={1}
              className="survey-text"
              aria-label={q.question}
              value={answers[q.field] as string}
              onChange={(e) => {
                // one line to start, growing with the answer, so the words sit
                // on the rule rather than four lines above it
                e.target.style.height = "auto";
                e.target.style.height = `${e.target.scrollHeight}px`;
                answerOne(q.field, e.target.value);
              }}
            />
          ) : (
            <div className="survey-options">
              {q.options.map((option) => (
                <Choice
                  key={option}
                  label={option}
                  radioName={q.kind === "one" ? q.field : undefined}
                  checked={
                    q.kind === "one"
                      ? answers[q.field] === option
                      : (answers[q.field] as string[]).includes(option)
                  }
                  onToggle={() =>
                    q.kind === "one"
                      ? answerOne(q.field, option)
                      : toggleMany(q.field, option)
                  }
                />
              ))}
            </div>
          )}
        </fieldset>
      ))}

      <div className="field">
        <Choice
          label="I'm open to a 15-minute call about how I do this today."
          checked={call}
          onToggle={() => setCall(!call)}
        />
      </div>

      <div className="signup-actions">
        <button type="submit" className="cta big" disabled={state === "busy"}>
          {state === "busy" ? "Joining..." : "Get early access"}{" "}
          <span className="arw">&rarr;</span>
        </button>
        {state === "error" && (
          <span className="mono">That didn&rsquo;t go through. Check the email and try again.</span>
        )}
      </div>
    </form>
  );
}
