import "../funnel.css";
import { FunnelFooter, FunnelNav } from "../funnel-chrome";
import { funnelFonts } from "../funnel-fonts";
import { WaitlistSignup } from "./waitlist-client";

// Registration + survey, one page (specs/landing-v3.md AC12). The email is
// the only required field; the survey rides along when answered.

export const metadata = {
  title: "Join the waitlist - Cadence",
  description: "Get in early, and shape what gets built first.",
};

export default function WaitlistPage() {
  return (
    <div className={`funnel ${funnelFonts}`}>
      <FunnelNav />

      <main>
        <div className="wrap phead">
          <h1>
            <em>Get in early</em>, and shape what gets built.
          </h1>
          <p className="sub">
            Early members decide what lands first. The email is all we need; the
            questions under it are optional.
          </p>
        </div>

        <div className="wrap">
          <WaitlistSignup />
        </div>
      </main>

      <FunnelFooter />
    </div>
  );
}
