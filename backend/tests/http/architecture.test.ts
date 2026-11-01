import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return typescriptFiles(path);
    }
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("http architecture", () => {
  it("depends on ports and does not open the database driver", () => {
    const files = typescriptFiles(join(process.cwd(), "src", "http"));
    expect(files.length).toBeGreaterThan(0);
    for (const path of files) {
      const source = readFileSync(path, "utf8");
      expect(source, path).not.toContain("better-sqlite3");
      expect(source, path).not.toContain("readAll(");
    }
  });
});
