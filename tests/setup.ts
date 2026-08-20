// Two things every DOM test needs and no test should have to remember.
//
// next/font/google is a build-time macro: under vitest the import resolves to
// an object, not a callable, so any component reaching a font module throws
// "Inter_Tight is not a function". The stub returns the same shape next/font
// hands back, with the CSS variable name the caller asked for.
//
// usePathname() returns null outside a router provider rather than throwing,
// so a component branching on it goes untested while the suite stays green.
import { vi } from "vitest";

// Named exports, not a Proxy: a Proxy whose `get` answers every key also
// answers `then`, which makes the module namespace look like a thenable and
// hangs the runner before a single test reports.
const font = ({ variable }: { variable?: string }) => ({
  className: "font-stub",
  variable: variable ?? "",
  style: { fontFamily: "stub" },
});

vi.mock("next/font/google", () => ({
  Inter: font,
  Inter_Tight: font,
  Familjen_Grotesk: font,
}));

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));
