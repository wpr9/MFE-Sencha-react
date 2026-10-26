import { z, ZodError } from 'zod';
import { buildApp } from './app';
import { loadConfig } from './config';

/**
 * Orchestrators send SIGTERM and wait for a grace period (10 s on Docker,
 * 30 s on Kubernetes) before SIGKILL. Shutdown must finish inside it, and it
 * must never hang - a stuck close would turn every deploy into a kill.
 */
const SHUTDOWN_DEADLINE_MS = 10_000;

async function main() {
  const config = loadConfig();
  const app = await buildApp(config);
  await app.listen({ host: config.HOST, port: config.PORT });
  app.log.info(
    {
      env: config.NODE_ENV,
      authMode: config.AUTH_MODE,
      simulatedLatencyMs: config.simulatedLatencyMs,
    },
    'ready',
  );

  const shutdown = (signal: NodeJS.Signals) => {
    app.log.info({ signal }, 'shutting down');
    setTimeout(() => {
      app.log.error('shutdown deadline reached; exiting');
      process.exit(1);
    }, SHUTDOWN_DEADLINE_MS).unref();
    // Fastify answers 503 to new requests, waits for in-flight ones and runs the
    // `preClose`/`onClose` hooks (which end live streams and stop the simulation).
    app.close().then(
      () => process.exit(0),
      (error: unknown) => {
        app.log.error({ err: error }, 'close failed');
        process.exit(1);
      },
    );
  };
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => shutdown(signal));
}

main().catch((error: unknown) => {
  if (error instanceof ZodError) console.error(`Invalid configuration:\n${z.prettifyError(error)}`);
  else console.error(error);
  process.exit(1);
});
