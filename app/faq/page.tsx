import "../funnel.css";
import { FunnelFooter, FunnelNav } from "../funnel-chrome";
import { funnelFonts } from "../funnel-fonts";
import { AskBox, Faq } from "./faq-client";

export const metadata = {
  title: "Questions - Cadence",
  description: "How Cadence works: planning, logging, recipes, scanning, travel, and eating out.",
};

export default function FaqPage() {
  return (
    <div className={`funnel ${funnelFonts}`}>
      <FunnelNav cta="faq-nav" />

      <main>
        <div className="wrap phead">
          <h1>
            <em>Questions</em>, answered plainly.
          </h1>
          <p className="sub">How Cadence works, one mechanic at a time.</p>
        </div>

        <div className="wrap">
          <Faq />
          <div className="ask-block">
            <p className="mono">Something we didn&rsquo;t cover?</p>
            <AskBox />
          </div>
        </div>
      </main>

      <FunnelFooter />
    </div>
  );
}
