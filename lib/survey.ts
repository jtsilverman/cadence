// The waitlist survey. drafts/website/WEBSITE.md is the copy authority and
// tests/waitlist-survey.test.tsx fails when this list and that deck disagree.
//
// `field` names the key the answer travels under to POST /api/waitlist/survey,
// which is also the waitlist row's column minus its `survey_` prefix. The
// wording and the order changed on 2026-08-18; the columns did not.

// One union rather than a flat record with a `kind` beside a `field`: the two
// travel together, so `kind === "one"` narrows the field to the columns that
// hold one answer, and no call site has to assert what the data already knows.
export type SurveyQuestion =
  | { kind: "one"; field: "pick" | "price"; question: string; options: readonly string[] }
  | { kind: "many"; field: "tools" | "features"; question: string; options: readonly string[] }
  | { kind: "text"; field: "wish"; question: string };

export type SurveyField = SurveyQuestion["field"];

export const SURVEY: readonly SurveyQuestion[] = [
  {
    field: "tools",
    question: "What apps do you use today?",
    kind: "many",
    options: [
      "MyFitnessPal or similar tracker",
      "A meal-planning app",
      "Notes app or spreadsheet",
      "Paper",
      "A meal kit or delivery service",
      "Nothing",
    ],
  },
  {
    field: "features",
    question: "What feature would you like included?",
    kind: "many",
    options: [
      "Wearable sync to tune daily calories",
      "Workout planning that informs your meals",
      "Check-ins that adjust the plan for you",
      "Household or family sharing",
      "None, just the food part",
    ],
  },
  {
    field: "pick",
    question: "What's the hardest part of sticking to your nutrition plan?",
    kind: "one",
    options: [
      "Deciding what to cook or eat",
      "Feeling hungry often",
      "One off-plan meal and the whole week feels blown",
      "Bored of the planned meals",
      "Tracking calories or macros",
      "Excessive snacking",
      "Lacking willpower",
    ],
  },
  {
    field: "price",
    question: "If it worked as described, what's it worth monthly?",
    kind: "one",
    options: ["$0, I'd only use it free", "~$5 a month", "~$10 a month", "~$15+ a month"],
  },
  {
    field: "wish",
    question: "What made you stop using something you tried?",
    kind: "text",
  },
];
