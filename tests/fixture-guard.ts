import { existsSync } from "node:fs";

/**
 * Page fixtures are saved copies of third-party pages and are not committed to the
 * public repository. See tests/fixtures/README.md. The extractor suites that read them
 * skip themselves when they are absent, so a fresh clone runs green.
 */
export const hasPageFixtures = existsSync("tests/fixtures/budgetbytes-chili.html");
