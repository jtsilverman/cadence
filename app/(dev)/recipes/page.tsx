import Link from "next/link";
import { getDb, migrate } from "@/lib/db";
import { listRecipes } from "@/lib/library";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

export const dynamic = "force-dynamic";

// The cookbook: everything you've saved. Server-rendered straight off the library.
export default async function CookbookPage() {
  const db = getDb();
  await migrate(db);
  const recipes = await listRecipes(db, HOUSEHOLD_ID);

  return (
    <div>
      <h1>Cookbook</h1>
      {recipes.length === 0 && (
        <p>
          Nothing saved yet — <Link href="/recipes/new">add a recipe</Link>.
        </p>
      )}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {recipes.map((r) => (
          <li key={r.id} style={{ padding: "8px 0", borderBottom: "1px solid #eee" }}>
            <Link href={`/cook/${r.id}`} style={{ fontSize: 18 }}>
              {r.title}
            </Link>
          </li>
        ))}
      </ul>
      <p>
        <Link href="/recipes/new">+ Add a recipe</Link>
      </p>
    </div>
  );
}
