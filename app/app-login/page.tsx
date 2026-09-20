interface LoginProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

export default async function AppLoginPage({ searchParams }: LoginProps) {
  const params = await searchParams;
  const next = params.next?.startsWith("/") && !params.next.startsWith("//")
    ? params.next
    : "/today";

  return (
    <main style={{ maxWidth: 420, margin: "15vh auto", padding: 24, fontFamily: "system-ui" }}>
      <h1>Open Cadence</h1>
      <p>This private app is available only to Jake.</p>
      <form method="post" action="/api/app-login">
        <input type="hidden" name="next" value={next} />
        <label style={{ display: "block", marginTop: 24 }}>
          Access password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
            style={{ display: "block", width: "100%", marginTop: 8, padding: 12 }}
          />
        </label>
        {params.error === "1" && <p role="alert">That password did not work.</p>}
        <button type="submit" style={{ marginTop: 16, padding: "12px 18px" }}>
          Continue
        </button>
      </form>
    </main>
  );
}
