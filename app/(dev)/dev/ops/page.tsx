// /dev/ops — the internal ops view (charter Layer 4): today's traffic, the
// three funnels, the error list with breadcrumb drill-in, and the chat-turn
// feed. Queryable, not pretty. Dev-gated: in production it 404s unless
// OPS_DASH=1 is set in the environment.

import { notFound } from "next/navigation";
import { getDb, migrate } from "@/lib/db";

export const dynamic = "force-dynamic";

interface Search {
  day?: string;
}

function dayBounds(day: string): { from: string; to: string } {
  return { from: `${day}T00:00:00`, to: `${day}T23:59:59.999Z` };
}

async function rows(sql: string, args: (string | number)[] = []) {
  const db = getDb();
  await migrate(db);
  const result = await db.execute({ sql, args });
  return result.rows;
}

export default async function OpsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  if (process.env.NODE_ENV === "production" && process.env.OPS_DASH !== "1") {
    notFound();
  }
  const params = await searchParams;
  const day = params.day ?? new Date().toISOString().slice(0, 10);
  const { from, to } = dayBounds(day);

  const traffic = await rows(
    `SELECT kind, COUNT(*) AS n FROM analytics_events WHERE ts >= ? AND ts <= ? GROUP BY kind ORDER BY n DESC`,
    [from, to]
  );

  // Funnel 1: landing → CTA → waitlist submit, by utm_source
  const siteFunnel = await rows(
    `SELECT
       COALESCE(NULLIF(json_extract(props, '$.utm_source'), ''), '(none)') AS source,
       SUM(CASE WHEN kind = 'page_view' AND path = '/' THEN 1 ELSE 0 END) AS landing_views,
       SUM(CASE WHEN kind = 'cta_click' THEN 1 ELSE 0 END) AS cta_clicks,
       SUM(CASE WHEN kind = 'waitlist_submit' THEN 1 ELSE 0 END) AS submits
     FROM analytics_events WHERE ts >= ? AND ts <= ?
     GROUP BY source ORDER BY landing_views DESC`,
    [from, to]
  );

  // Funnel 2: onboarding start → basics → proposal → drafted → approved
  const onboarding = await rows(
    `SELECT json_extract(props, '$.step') AS step, COUNT(*) AS n
     FROM analytics_events WHERE kind = 'onboarding_step' AND ts >= ? AND ts <= ?
     GROUP BY step`,
    [from, to]
  );

  // Funnel 3: chat message → intent resolved → action succeeded
  const chat = await rows(
    `SELECT
       COUNT(*) AS turns,
       SUM(CASE WHEN json_extract(props, '$.intent') NOT IN ('', 'unknown') THEN 1 ELSE 0 END) AS intent_resolved,
       SUM(CASE WHEN json_extract(props, '$.ok') THEN 1 ELSE 0 END) AS action_ok
     FROM analytics_events WHERE kind = 'chat_turn' AND ts >= ? AND ts <= ?`,
    [from, to]
  );

  const chatFailures = await rows(
    `SELECT ts, props FROM analytics_events
     WHERE kind = 'chat_turn' AND ts >= ? AND ts <= ?
       AND (json_extract(props, '$.ok') = 0 OR json_extract(props, '$.intent') IN ('', 'unknown'))
     ORDER BY ts DESC LIMIT 50`,
    [from, to]
  );

  const errors = await rows(
    `SELECT ts, side, route, message, stack, context FROM error_events
     WHERE ts >= ? AND ts <= ? ORDER BY ts DESC LIMIT 100`,
    [from, to]
  );

  const td: React.CSSProperties = { border: "1px solid #ddd", padding: "4px 8px", verticalAlign: "top" };

  return (
    <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}>
      <h1>ops — {day}</h1>
      <p>
        <a href={`/dev/ops?day=${new Date(Date.parse(day) - 86400000).toISOString().slice(0, 10)}`}>← prev day</a>{" "}
        | <a href={`/dev/ops?day=${new Date(Date.parse(day) + 86400000).toISOString().slice(0, 10)}`}>next day →</a>
      </p>

      <h2>traffic</h2>
      <table style={{ borderCollapse: "collapse" }}>
        <tbody>
          {traffic.map((r, i) => (
            <tr key={i}>
              <td style={td}>{String(r.kind)}</td>
              <td style={td}>{String(r.n)}</td>
            </tr>
          ))}
          {traffic.length === 0 && (
            <tr><td style={td}>no events today</td></tr>
          )}
        </tbody>
      </table>

      <h2>funnel: landing → cta → waitlist (by utm_source)</h2>
      <table style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr><th style={td}>source</th><th style={td}>landing</th><th style={td}>cta</th><th style={td}>submit</th></tr>
        </thead>
        <tbody>
          {siteFunnel.map((r, i) => (
            <tr key={i}>
              <td style={td}>{String(r.source)}</td>
              <td style={td}>{String(r.landing_views)}</td>
              <td style={td}>{String(r.cta_clicks)}</td>
              <td style={td}>{String(r.submits)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>funnel: onboarding steps</h2>
      <table style={{ borderCollapse: "collapse" }}>
        <tbody>
          {onboarding.map((r, i) => (
            <tr key={i}>
              <td style={td}>{String(r.step)}</td>
              <td style={td}>{String(r.n)}</td>
            </tr>
          ))}
          {onboarding.length === 0 && <tr><td style={td}>no onboarding activity</td></tr>}
        </tbody>
      </table>

      <h2>funnel: chat turns</h2>
      <table style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr><th style={td}>turns</th><th style={td}>intent resolved</th><th style={td}>action ok</th></tr>
        </thead>
        <tbody>
          <tr>
            <td style={td}>{String(chat[0]?.turns ?? 0)}</td>
            <td style={td}>{String(chat[0]?.intent_resolved ?? 0)}</td>
            <td style={td}>{String(chat[0]?.action_ok ?? 0)}</td>
          </tr>
        </tbody>
      </table>

      <h2>chat-turn failure feed</h2>
      {chatFailures.length === 0 ? (
        <p>none</p>
      ) : (
        chatFailures.map((r, i) => (
          <details key={i}>
            <summary>{String(r.ts)}</summary>
            <pre style={{ whiteSpace: "pre-wrap" }}>{String(r.props)}</pre>
          </details>
        ))
      )}

      <h2>errors ({errors.length})</h2>
      {errors.length === 0 ? (
        <p>none</p>
      ) : (
        errors.map((r, i) => (
          <details key={i}>
            <summary>
              [{String(r.side)}] {String(r.ts)} {String(r.route ?? "")} — {String(r.message).slice(0, 120)}
            </summary>
            <pre style={{ whiteSpace: "pre-wrap" }}>
              {String(r.stack ?? "(no stack)")}
              {"\n\ncontext: "}
              {String(r.context)}
            </pre>
          </details>
        ))
      )}
    </div>
  );
}
