import Fastify from 'fastify';
import { z } from 'zod';
import { orchestrate } from './orchestrator';

const PORT = Number(process.env.PORT ?? 8787);

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
});

app.get('/healthz', async () => ({ status: 'ok' }));

const RouteBody = z.object({
  kind: z.enum([
    'suggest_quote',
    'triage_inventory',
    'evaluate_tier',
    'draft_ticket_reply',
  ]),
  scope: z.record(z.unknown()),
  options: z
    .object({
      maxCostUsd: z.number().positive().max(2).optional(),
      modelHint: z.string().optional(),
    })
    .optional(),
});

app.post('/ai/route', async (req, reply) => {
  // The admin/staff JWT is validated upstream by Caddy + the orchestrator
  // (see orchestrator.ts for the role check).
  const auth = req.headers.authorization ?? '';
  if (!auth.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'missing_bearer' });
  }

  const parsed = RouteBody.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: 'invalid_body', detail: parsed.error.flatten() });
  }

  try {
    const result = await orchestrate({
      jwt: auth.slice('Bearer '.length),
      ...parsed.data,
    });
    return result;
  } catch (err) {
    req.log.error({ err }, 'orchestrator failed');
    return reply.code(500).send({ error: 'orchestrator_failed' });
  }
});

app
  .listen({ port: PORT, host: '0.0.0.0' })
  .then(() => app.log.info(`ai-api listening on :${PORT}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
