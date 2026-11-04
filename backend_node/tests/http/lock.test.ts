import { describe, expect, it } from "vitest";

import { withAdvanceLock } from "../../src/http/lock";

describe("advance lock", () => {
  it("runs one advance at a time in the process", async () => {
    const order: string[] = [];
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = withAdvanceLock(async () => {
      order.push("first-start");
      await gate;
      order.push("first-end");
    });
    const second = withAdvanceLock(async () => {
      order.push("second");
    });

    await Promise.resolve();
    expect(order).toEqual(["first-start"]);
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(["first-start", "first-end", "second"]);
  });
});
