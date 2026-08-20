import { getDb, migrate } from "@/lib/db";
import { getPlans } from "@/lib/library";
import CookMode from "./cook-mode";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

export const dynamic = "force-dynamic";

export default async function CookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  await migrate(db);
  const [row] = await getPlans(db, HOUSEHOLD_ID, [id]);

  // a workout id is honestly not cookable — same message shape as not-found
  if (!row || row.plan.kind !== "recipe") {
    return (
      <div>
        <p>{row ? "That's a workout, not a recipe — nothing to cook." : "Recipe not found."}</p>
      </div>
    );
  }
  return <CookMode libraryId={id} plan={row.plan} />;
}
