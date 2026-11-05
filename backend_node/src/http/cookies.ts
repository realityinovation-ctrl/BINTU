export function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  if (header === undefined || header === "") {
    return undefined;
  }
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = part.slice(0, separator).trim();
    if (key === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return undefined;
}

export function sessionCookieName(production: boolean): string {
  return production ? "__Host-bintu_session" : "bintu_session";
}

export function writeSessionCookie(options: {
  name: string;
  value: string;
  maxAgeSeconds: number;
  secure: boolean;
}): string {
  const parts = [
    `${options.name}=${options.value}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${options.maxAgeSeconds}`,
  ];
  if (options.secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}
