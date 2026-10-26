import { z } from 'zod';
import { ALL_PERMISSIONS, type Permission, Role } from './authorization';

const PermissionSchema = z.enum(ALL_PERMISSIONS as [Permission, ...Permission[]]);

export const SessionUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  title: z.string(),
  initials: z.string().max(3),
  avatarColor: z.string(),
});
export type SessionUser = z.infer<typeof SessionUserSchema>;

/**
 * Session document returned by `GET /auth/session`.
 *
 * The session itself lives server-side (BFF) and is referenced by an HttpOnly
 * cookie; tokens never reach the browser. This payload only carries what the
 * UI needs to render and gate features, plus the CSRF token that must be
 * echoed on unsafe requests.
 */
export const SessionSchema = z.object({
  user: SessionUserSchema,
  roles: z.array(z.enum(Object.values(Role) as [Role, ...Role[]])),
  permissions: z.array(PermissionSchema),
  entitlements: z.object({
    portfolios: z.union([
      z.object({ all: z.literal(true) }),
      z.object({ all: z.literal(false), ids: z.array(z.string()) }),
    ]),
  }),
  flags: z.record(z.string(), z.boolean()),
  csrfToken: z.string().min(16),
  issuedAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
  absoluteExpiresAt: z.iso.datetime({ offset: true }),
  idleTimeoutSeconds: z.number().int().positive(),
  authMode: z.enum(['mock', 'oidc']),
  /** Server clock when the document was issued: lets clients judge deadlines in server time. */
  serverTime: z.iso.datetime({ offset: true }).optional(),
});
export type Session = z.infer<typeof SessionSchema>;

/** Header carrying the CSRF token on unsafe requests. */
export const CSRF_HEADER = 'x-csrf-token';
