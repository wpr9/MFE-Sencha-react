import { z } from 'zod';

/**
 * Runtime configuration, 12-factor style: everything comes from the
 * environment and is validated at startup, so a bad deployment fails fast
 * with a readable error instead of misbehaving under load.
 */
const EnvSchema = z.object({
  /** Switches production defaults (no simulated latency, HSTS, JSON logs). */
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Bind address; `0.0.0.0` in a container. */
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().default(3333),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /**
   * Origins allowed to send unsafe (state-changing) requests, comma separated.
   * Development defaults cover the shell and each remote's standalone dev server.
   */
  PUBLIC_ORIGINS: z
    .string()
    .default(
      'http://localhost:4200,http://localhost:4201,http://localhost:4202,http://localhost:4203,http://localhost:4204',
    )
    .transform((value, context) => {
      const origins = value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
      for (const origin of origins) {
        if (!z.url().safeParse(origin).success) {
          context.addIssue({ code: 'custom', message: `PUBLIC_ORIGINS: "${origin}" is not a URL` });
        }
      }
      return origins;
    }),
  /** `true` behind TLS: cookies become `Secure` and `__Host-` prefixed. */
  COOKIE_SECURE: z.stringbool().default(false),
  /** Idle timeout, extended only by real user activity. */
  SESSION_IDLE_TIMEOUT_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60),
  /** Maximum session length; only a new sign-in resets it. */
  SESSION_ABSOLUTE_TIMEOUT_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(8 * 60 * 60),
  /**
   * Reverse proxies in front of the BFF (the nginx ingress = 1). Only the
   * X-Forwarded-For entries they append are trusted, so a client cannot spoof
   * its address into logs or rate-limit keys. 0 = use the socket address.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(1),
  /**
   * Identity provider. Only the mock IdP exists in this POC; mock-only routes
   * (persona sign-in, simulated expiry) are registered in this mode alone.
   */
  AUTH_MODE: z.literal('mock').default('mock'),
  /** Seed of the deterministic market/portfolio simulation (same seed, same data). */
  SIMULATION_SEED: z.coerce.number().int().default(20261024),
  /** Quote tick interval. */
  MARKET_TICK_MS: z.coerce.number().int().positive().default(1000),
  /**
   * Artificial latency (ms) added to API responses so loading states are
   * visible in development. Unset: 120 ms in development, 0 in production.
   */
  SIMULATED_LATENCY_MS: z.coerce.number().int().nonnegative().optional(),
});

export type Config = ReturnType<typeof loadConfig>;

/** Parses and derives the configuration; throws a `ZodError` naming every invalid variable. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = EnvSchema.parse(env);
  const isProduction = parsed.NODE_ENV === 'production';
  const secure = parsed.COOKIE_SECURE;
  return {
    ...parsed,
    isProduction,
    publicOrigins: parsed.PUBLIC_ORIGINS,
    simulatedLatencyMs: parsed.SIMULATED_LATENCY_MS ?? (isProduction ? 0 : 120),
    /** `__Host-` cookies must be Secure, path=/ and host-only - the strongest scoping available. */
    sessionCookieName: secure ? '__Host-mrd_session' : 'mrd_session',
    loginStateCookieName: secure ? '__Host-mrd_login' : 'mrd_login',
  } as const;
}
