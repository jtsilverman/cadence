// fresh — brand-new user: empty diary, empty library, no goal, no plan.
// Onboarding starts from nothing; "mid-onboarding state" is reached by the
// scenario driving the first onboarding steps live, not by seeded rows.

import type { Client } from "@libsql/client";

export async function seedFresh(_db: Client): Promise<void> {
  // intentionally nothing
}
