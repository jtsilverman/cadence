// The FAQ deck. drafts/website/WEBSITE.md is the copy authority and
// tests/faq-copy.test.tsx fails when this list and that deck disagree, so edit
// both or neither.
//
// The notation is the deck's own: [square brackets] mark the orange phrase in a
// question, (parentheses) mark the green phrase in an answer. One phrase each.
// Keeping the marker in the string is what lets the test compare code and deck
// as plain text instead of reassembling markup.

export interface FaqEntry {
  q: string;
  a: string;
}

export const FAQ: FaqEntry[] = [
  {
    q: "[What is Cadence]?",
    a: "Think of Cadence like an on-demand nutritionist you can customize. It takes your preferences, your recipes, and the ingredients you have, and gives you a weekly meal plan. You can tune it and change it on the fly. Cadence picks up your tendencies, so it (fits you more each week).",
  },
  {
    q: "Do I have to [log every meal]?",
    a: "No. Meals on your plan take (one tap). For anything else, tell Cadence in a sentence. \"Chicken bowl and three rice cakes\" is enough.",
  },
  {
    q: "Can I [change my meal plan]?",
    a: "Yes. Say what changed, and (the rest of the week adjusts around it). You can also move meals by hand.",
  },
  {
    q: "Can I use [my own recipes]?",
    a: "Yes, (four ways in). Paste a video link. Paste an article link. Photograph a page. Or type one in.",
  },
  {
    q: "Do I have to [type in everything I eat]?",
    a: "No. (Scan a barcode, photograph it, or say the name on the label.)",
  },
  {
    q: "Does it plan around [travel days]?",
    a: "Yes. Tell Cadence the days you are away, and (the plan works around them).",
  },
  {
    q: "Can it tell me [what to order] at a restaurant?",
    a: "Yes. Tell Cadence where you are eating, and it picks (the order that fits your goals) before you go.",
  },
  {
    q: "Does it work with [intermittent fasting]?",
    a: "Yes. Cadence (fits your meals into the hours you eat). It does not set the window for you.",
  },
  {
    q: "Does it write my [grocery list]?",
    a: "Yes. (Every ingredient across your planned week), combined and sorted by aisle.",
  },
  {
    q: "What will it [cost]?",
    a: "(Free during early access.) Pricing lands before Cadence opens to everyone.",
  },
  {
    q: "When can I [use it]?",
    a: "Cadence is in (testing) now. Early access opens after that.",
  },
];

export interface Segment {
  text: string;
  accent: boolean;
}

// One marked phrase becomes one accented run; everything else reads plain.
// Exactly one phrase per line, which tests/faq-copy.test.tsx asserts: the
// grammar has no escape, so a second parenthetical would silently turn green.
export function segments(line: string): Segment[] {
  return line
    .split(/(\[[^\]]+\]|\([^)]+\))/)
    .filter((part) => part !== "")
    .map((part) =>
      /^[[(].*[\])]$/.test(part)
        ? { text: part.slice(1, -1), accent: true }
        : { text: part, accent: false }
    );
}
