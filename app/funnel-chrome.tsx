import { CaptureAttribution } from "./attribution-capture";
import { CtaLink } from "./landing-client";

// The nav and footer for the funnel pages (/faq, /waitlist, /waitlist/thanks),
// in the design language of the built main page: a fixed cream band with a
// hairline under it, the five-bar mark beside the wordmark, and the bare
// underlined CTA on the right. app/site-chrome.tsx still serves the v4 landing
// at `/`; this file replaces it for the funnel and retires with it.
//
// CaptureAttribution mounts here. It renders nothing, so a rewrite that drops
// it costs every UTM and breaks no other test. Keep it.

// Five bars at closing intervals: the beat speeding up, which is the name.
function Mark() {
  return (
    <svg
      width="52"
      height="26"
      viewBox="0 0 120 60"
      fill="none"
      stroke="currentColor"
      strokeWidth="6"
      aria-hidden="true"
    >
      <path d="M8 12 V48" />
      <path d="M38 12 V48" />
      <path d="M62 12 V48" />
      <path d="M80 12 V48" />
      <path d="M94 4 V56" strokeWidth="8" />
    </svg>
  );
}

export function FunnelNav({ cta }: { cta?: string }) {
  return (
    <header className="funnel-navbar">
      <CaptureAttribution />
      <div className="bar nav">
        <a className="brand" href="/" aria-label="Cadence home">
          <Mark />
          <span className="mark">Cadence</span>
        </a>
        {cta ? (
          <CtaLink cta={cta} className="cta small">
            Get early access <span className="arw">&rarr;</span>
          </CtaLink>
        ) : null}
      </div>
    </header>
  );
}

export function FunnelFooter() {
  return (
    <footer className="bar foot">
      <p className="mono">Cadence</p>
      <p className="mono">
        <a href="/faq">Questions</a> &middot; <a href="mailto:hello@cadence.app">hello@cadence.app</a>
      </p>
    </footer>
  );
}
