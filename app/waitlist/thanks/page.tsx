import "../../funnel.css";
import { FunnelFooter, FunnelNav } from "../../funnel-chrome";
import { funnelFonts } from "../../funnel-fonts";

// Plain confirmation (specs/landing-v3.md AC13). The conversion and any
// survey answers were banked on /waitlist before this page loads.

export const metadata = {
  title: "You're on the list - Cadence",
  description: "You're on the Cadence early-access list.",
};

export default function Thanks() {
  return (
    <div className={`funnel ${funnelFonts}`}>
      <FunnelNav />

      <main>
        <div className="wrap phead">
          <h1>
            You&rsquo;re <em>on the list</em>.
          </h1>
          <p className="sub">
            Cadence is in testing. We&rsquo;ll write when there is something worth
            reading, and again when your early access opens.
          </p>
        </div>

        <div className="wrap thanks-next">
          <p className="mono">While you wait</p>
          <a className="cta big" href="/faq">
            Read how Cadence works <span className="arw">&rarr;</span>
          </a>
        </div>
      </main>

      <FunnelFooter />
    </div>
  );
}
