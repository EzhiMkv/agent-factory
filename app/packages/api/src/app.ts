// @af/api — HTTP-слой продукта. Эндпоинты наполняются спекой 004.
import Fastify from "fastify";

export function buildApp() {
  const app = Fastify({ logger: true });
  app.get("/health", async () => ({ ok: true, service: "agent-factory/api" }));
  return app;
}
