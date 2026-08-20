import "./product.css";
import { CoachDock, TabBar } from "./shell";
import { AppTelemetry } from "./app-telemetry";

// Product shell (ux.md screen map): scrollable screen content, coach docked
// at the bottom, tab bar under it. Dark-first product surface — the cream
// marketing system (landing.css) never crosses this boundary.
export default function ProductLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="product">
      <AppTelemetry />
      {children}
      <CoachDock />
      <TabBar />
    </div>
  );
}
