import { getDb, migrate } from "@/lib/db";
import { getPlans } from "@/lib/library";
import CookMode from "@/app/(dev)/cook/[id]/cook-mode";

const HOUSEHOLD_ID = "hh-jake";

export const dynamic = "force-dynamic";

export default async function NutritionCookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  await migrate(db);
  const [row] = await getPlans(db, HOUSEHOLD_ID, [id]);
  if (!row || row.plan.kind !== "recipe") {
    return <main className="shell-main"><div className="p-placeholder">Recipe not found.</div></main>;
  }
  return (
    <>
      <header className="shell-header">
        <h1 className="shell-title">Cook</h1>
        <a href="/nutrition" className="shell-header-meta">Nutrition</a>
      </header>
      <main className="shell-main">
        <CookMode libraryId={id} plan={row.plan} />
      </main>
    </>
  );
}
