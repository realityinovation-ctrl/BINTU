import type { FastifyRequest } from "fastify";

import { addressForQuota } from "../auth/trustedProxy";
import { headerText } from "./origin";

/** Peer address, unless that peer is an explicitly trusted proxy. */
export function clientAddress(
  request: FastifyRequest,
  trustedProxies: readonly string[],
): string {
  const remote = request.socket?.remoteAddress;
  const peer = typeof remote === "string" && remote.length > 0 ? remote : request.ip;
  return addressForQuota(
    peer,
    headerText(request.headers["x-forwarded-for"]),
    trustedProxies,
  );
}
