/** Read a stored photovoltaic installation as a generic diagnosed system. */

export function normalizeLegacySystem(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if ("system" in payload || !("installation" in payload)) {
    return payload;
  }
  const installation = payload.installation;
  if (
    typeof installation !== "object" ||
    installation === null ||
    Array.isArray(installation)
  ) {
    return payload;
  }
  const characteristics: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(installation)) {
    if (value !== null) {
      characteristics[key] = value;
    }
  }
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key !== "installation") {
      normalized[key] = value;
    }
  }
  normalized.system = {
    domain: "photovoltaic",
    type: "photovoltaic_installation",
    manufacturer: null,
    model: null,
    characteristics,
  };
  return normalized;
}
