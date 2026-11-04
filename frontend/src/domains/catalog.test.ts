import { describe, expect, test } from "vitest";
import { DIAGNOSTIC_DOMAINS, domainGuidePrefix, findDomain } from "./catalog";

describe("diagnostic domains", () => {
  test("expose le photovoltaïque prêt à l'emploi", () => {
    const pv = findDomain("photovoltaic");
    expect(pv?.status).toBe("ready");
    expect(domainGuidePrefix(pv!)).toContain("photovoltaïque");
  });

  test("conserve des identifiants uniques", () => {
    const ids = DIAGNOSTIC_DOMAINS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
