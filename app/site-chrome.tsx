import { CtaLink } from "./landing-client";
import { CaptureAttribution } from "./attribution-capture";

// The one nav + footer used by every marketing page (landing, /faq, /waitlist,
// /waitlist/thanks). Eight Sleep composition: links left, wordmark center,
// CTA right (design-refs/eightsleep 006/008 nav bar).

function Wordmark() {
  return (
    <svg width="44" height="22" viewBox="0 0 120 60" fill="none" stroke="currentColor" strokeWidth="6" aria-hidden="true">
      <path d="M8 12 V48" />
      <path d="M38 12 V48" />
      <path d="M62 12 V48" />
      <path d="M80 12 V48" />
      <path d="M94 4 V56" strokeWidth="8" />
    </svg>
  );
}

export function SiteNav({
  links = [],
  cta,
  sticky = true,
}: {
  links?: { href: string; label: string }[];
  cta?: string;
  sticky?: boolean;
}) {
  return (
    <header className={sticky ? "nav" : "nav nav--static"}>
      <CaptureAttribution />
      <div className="container nav-inner">
        <nav className="nav-links" aria-label="Site">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="nav-link">
              {link.label}
            </a>
          ))}
        </nav>
        <a href="/" className="wordmark wordmark--mark">
          <Wordmark />
          <span>Cadence</span>
        </a>
        <div className="nav-ctas">
          {cta ? (
            <CtaLink cta={cta} className="btn btn--ink">
              Join the waitlist
            </CtaLink>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="container footer-bottom">
        <span className="wordmark">Cadence</span>
        <a href="/faq" className="footer-link">
          Questions
        </a>
        <span className="footer-legal">© 2026 Cadence Health</span>
        <a href="mailto:hello@cadence.app" className="footer-link">
          hello@cadence.app
        </a>
      </div>
    </footer>
  );
}
