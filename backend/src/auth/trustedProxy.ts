/**
 * Explicit proxy addresses and CIDR ranges.
 * An empty list ignores X-Forwarded-For. A prefix of 0 matches nothing.
 */

export function parseTrustedProxies(value: string | undefined): readonly string[] {
  if (value === undefined || value.trim() === "") {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function addressForQuota(
  peer: string,
  forwarded: string | undefined,
  trusted: readonly string[],
): string {
  const connection = normalizeIp(peer);
  if (!isTrustedProxy(connection, trusted)) {
    return connection;
  }
  const client = forwarded?.split(",")[0]?.trim() ?? "";
  if (client.length === 0) {
    return connection;
  }
  return normalizeIp(client);
}

export function isTrustedProxy(peer: string, trusted: readonly string[]): boolean {
  const normalized = normalizeIp(peer);
  return trusted.some((entry) => proxyMatches(normalized, entry));
}

export function normalizeIp(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith("::ffff:")) {
    const mapped = trimmed.slice("::ffff:".length);
    if (ipv4ToInt(mapped) !== null) {
      return mapped;
    }
  }
  return trimmed;
}

function proxyMatches(ip: string, entry: string): boolean {
  const candidate = entry.trim().toLowerCase();
  if (candidate === "*" || candidate === "0.0.0.0/0" || candidate === "::/0") {
    return false;
  }
  if (!candidate.includes("/")) {
    return normalizeIp(candidate) === ip;
  }
  if (candidate.includes(":")) {
    return ipv6Cidr(ip, candidate);
  }
  return ipv4Cidr(ip, candidate);
}

function ipv4Cidr(ip: string, cidr: string): boolean {
  const [base, bitsText] = cidr.split("/");
  const bits = Number(bitsText);
  if (base === undefined || !Number.isInteger(bits) || bits < 1 || bits > 32) {
    return false;
  }
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  if (ipInt === null || baseInt === null) {
    return false;
  }
  const mask = bits === 32 ? 0xffffffff : (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

function ipv4ToInt(value: string): number | null {
  const parts = value.split(".");
  if (parts.length !== 4) {
    return null;
  }
  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return null;
    }
    const number = Number(part);
    if (number > 255) {
      return null;
    }
    result = (result << 8) + number;
  }
  return result >>> 0;
}

function ipv6Cidr(ip: string, cidr: string): boolean {
  const [base, bitsText] = cidr.split("/");
  const bits = Number(bitsText);
  if (base === undefined || !Number.isInteger(bits) || bits < 1 || bits > 128) {
    return false;
  }
  const ipInt = parseIpv6(ip);
  const baseInt = parseIpv6(base);
  if (ipInt === null || baseInt === null) {
    return false;
  }
  const shift = BigInt(128 - bits);
  return ipInt >> shift === baseInt >> shift;
}

function parseIpv6(input: string): bigint | null {
  const value = input.toLowerCase();
  if (value.includes(".")) {
    return null;
  }
  const halves = value.split("::");
  if (halves.length > 2) {
    return null;
  }
  const head = halves[0] === "" ? [] : (halves[0]?.split(":") ?? []);
  const tail =
    halves.length === 1 || halves[1] === "" ? [] : (halves[1]?.split(":") ?? []);
  const missing = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (missing < 0) {
    return null;
  }
  const groups = halves.length === 2 ? [...head, ...Array<string>(missing).fill("0"), ...tail] : head;
  if (groups.length !== 8) {
    return null;
  }
  let result = 0n;
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) {
      return null;
    }
    result = (result << 16n) + BigInt(Number.parseInt(group, 16));
  }
  return result;
}
