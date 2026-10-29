// @vitest-environment node

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const SRC = dirname(fileURLToPath(import.meta.url));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : /\.(ts|tsx|css)$/.test(path) && !/\.test\.(ts|tsx)$/.test(path)
        ? [path]
        : [];
  });
}

describe("architecture frontend", () => {
  test("prévoit les largeurs mobile, tablette et desktop sans débordement", () => {
    const css = readFileSync(join(SRC, "styles.css"), "utf-8");

    expect(css).toContain("overflow-x: hidden");
    expect(css).toContain("@media (min-width: 480px)");
    expect(css).toContain("@media (min-width: 768px)");
    expect(css).toContain("@media (min-width: 980px)");
    expect(css).toContain("min-width: 0");
  });

  test("ne contient aucun secret ou détail fournisseur Meta", () => {
    const source = sourceFiles(SRC)
      .map((path) => readFileSync(path, "utf-8"))
      .join("\n");

    expect(source).not.toContain("hypothesis.status =");
    expect(source).not.toContain("MODEL_API_KEY");
    expect(source).not.toContain("api.meta.ai");
    expect(source).not.toContain("muse-spark");
  });
});
