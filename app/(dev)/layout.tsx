import Link from "next/link";

// Dev harness chrome: one nav, every dev page reachable from anywhere;
// pages own only their content. The marketing landing at / has its own look.
const NAV = [
  ["/recipes", "Cookbook"],
  ["/week", "This week"],
  ["/orders", "Orders"],
  ["/pantry", "Pantry"],
] as const;

export default function DevLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ fontFamily: "system-ui" }}>
      <nav
        style={{
          display: "flex",
          gap: 20,
          alignItems: "baseline",
          padding: "12px 16px",
          borderBottom: "1px solid #eee",
        }}
      >
        <Link href="/dev" style={{ fontWeight: 700, textDecoration: "none", color: "inherit" }}>
          cadence
        </Link>
        {NAV.map(([href, label]) => (
          <Link key={href} href={href} style={{ textDecoration: "none", color: "#333" }}>
            {label}
          </Link>
        ))}
      </nav>
      <main style={{ maxWidth: 720, margin: "2rem auto", padding: "0 1rem" }}>{children}</main>
    </div>
  );
}
