import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const core = path.resolve(import.meta.dirname, "../../src/core");

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(full));
    } else if (entry.name.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

describe("core boundaries", () => {
  it("does not import sql, http, cookies, or Meta", () => {
    const forbidden = [
      "sqlite",
      "node:http",
      "node:https",
      "fastify",
      "express",
      "cookie",
      "meta.ai",
      "clerk",
    ];
    for (const file of sourceFiles(core)) {
      const text = readFileSync(file, "utf8").toLowerCase();
      for (const term of forbidden) {
        expect(text, file).not.toContain(term);
      }
    }
  });
});
