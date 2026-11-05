import type { FastifyReply } from "fastify";

export function sendJson(
  reply: FastifyReply,
  status: number,
  body: unknown,
): FastifyReply {
  return reply.code(status).send(body);
}
