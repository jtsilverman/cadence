"use client";

import { useState } from "react";
import { rememberCta } from "./attribution";
import { track } from "./telemetry";

// Every CTA routes to the waitlist page; recording which button sent the
// visitor happens before navigation.
export function CtaLink({
  cta,
  className,
  children,
}: {
  cta: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href="/waitlist"
      className={className}
      onClick={() => {
        rememberCta(cta);
        track("cta_click", { cta });
      }}
    >
      {children}
    </a>
  );
}

// Shop band: three photo cards in a row (eightsleep 144 feature-card idiom);
// highlighting swaps the active card's text background — nothing moves,
// nothing resizes.
export function ShopCarousel({
  cards,
}: {
  cards: { title: string; body: string; photo: string }[];
}) {
  const [active, setActive] = useState(0);
  return (
    <div className="shop-cards">
      {cards.map((card, i) => (
        <div
          key={card.title}
          className={i === active ? "shop-card shop-card--active" : "shop-card"}
          onMouseEnter={() => setActive(i)}
        >
          <button type="button" className="shop-card-btn" onFocus={() => setActive(i)} onClick={() => setActive(i)}>
            <div className="shop-card-photo" style={{ backgroundImage: `url(${card.photo})` }} />
            <div className="shop-card-text">
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </div>
          </button>
        </div>
      ))}
    </div>
  );
}
