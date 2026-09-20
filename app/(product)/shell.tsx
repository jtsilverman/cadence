"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The nutrition-only product surfaces (ux.md screen map). Today is home; the
// coach is the docked bar below, not a tab. Feed and workouts are later scope
// and must not appear as available product surfaces.
const TABS = [
  ["/today", "Today"],
  ["/nutrition", "Nutrition"],
  ["/journal", "Journal"],
] as const;

export function TabBar() {
  const pathname = usePathname() ?? "/today";
  return (
    <nav className="tab-bar" aria-label="App">
      {TABS.map(([href, label]) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={active ? "tab-item tab-item--active" : "tab-item"}
            aria-current={active ? "page" : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

// Docked on every product screen; absent on /coach because that screen is the
// conversation.
export function CoachDock() {
  const pathname = usePathname() ?? "";
  if (pathname.startsWith("/coach")) return null;
  return (
    <div className="coach-dock">
      <Link href="/coach" className="coach-dock-inner">
        <span className="coach-dock-mark">Cadence</span>
        <span>Log a meal, ask anything…</span>
      </Link>
    </div>
  );
}
