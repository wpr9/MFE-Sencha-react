import { z } from 'zod';

/**
 * Client telemetry batch posted to `POST /api/telemetry` (via `sendBeacon`).
 * Shared so a field rename is a compile error on both sides; the BFF also
 * uses the schema to bound untrusted input.
 */
/** Keys per record: bounds the size of one log line as much as the values' limits do. */
export const MAX_ATTRIBUTES = 32;

export const TelemetryKindSchema = z.enum(['event', 'error', 'timing', 'vital']);
export type TelemetryKind = z.infer<typeof TelemetryKindSchema>;

export const TelemetryRecordSchema = z.object({
  kind: TelemetryKindSchema,
  name: z.string().max(128),
  /** Logical emitter: `shell` or a remote name. */
  source: z.string().max(64),
  timestamp: z.number(),
  /** Route path only - never query strings or bodies. */
  path: z.string().max(512),
  attributes: z
    .record(
      z.string().max(64),
      z.union([z.string().max(1_024), z.number(), z.boolean(), z.null(), z.undefined()]),
    )
    .refine((attributes) => Object.keys(attributes).length <= MAX_ATTRIBUTES, {
      message: `At most ${MAX_ATTRIBUTES} attributes per record`,
    }),
  value: z.number().optional(),
  error: z
    .object({
      name: z.string().max(128),
      message: z.string().max(2_048),
      stack: z.string().max(8_192).optional(),
    })
    .optional(),
});
export type TelemetryRecord = z.infer<typeof TelemetryRecordSchema>;

export const TelemetryBatchSchema = z.object({
  app: z.string().max(64),
  version: z.string().max(64),
  records: z.array(TelemetryRecordSchema).max(50),
});
export type TelemetryBatch = z.infer<typeof TelemetryBatchSchema>;
