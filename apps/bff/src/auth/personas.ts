import {
  FeatureFlag,
  Permission,
  Role,
  type PortfolioEntitlement,
  type SessionUser,
} from '@meridian/contracts';

/**
 * MOCK IDENTITY PROVIDER DATA.
 *
 * In production these claims come from the corporate IdP (OIDC) and an
 * entitlement service; the rest of the BFF only depends on the `Persona`
 * shape, so swapping the source does not touch authorization logic.
 */
export interface Persona {
  readonly user: SessionUser;
  readonly roles: readonly Role[];
  readonly entitlements: PortfolioEntitlement;
  readonly summary: string;
}

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  [Role.PortfolioManager]: [
    Permission.PortfolioRead,
    Permission.OrderRead,
    Permission.OrderCreate,
    Permission.OrderCancel,
    Permission.ComplianceRead,
    Permission.MarketDataRead,
  ],
  [Role.Trader]: [
    Permission.PortfolioRead,
    Permission.OrderRead,
    Permission.OrderRoute,
    Permission.OrderCancel,
    Permission.MarketDataRead,
  ],
  [Role.ComplianceOfficer]: [
    Permission.PortfolioRead,
    Permission.OrderRead,
    Permission.OrderApprove,
    Permission.ComplianceRead,
    Permission.ComplianceManage,
    Permission.MarketDataRead,
  ],
  [Role.Analyst]: [Permission.PortfolioRead, Permission.MarketDataRead],
  [Role.PlatformAdmin]: [
    Permission.PortfolioRead,
    Permission.OrderRead,
    Permission.ComplianceRead,
    Permission.MarketDataRead,
    Permission.PlatformAdmin,
  ],
};

export const PERSONAS: readonly Persona[] = [
  {
    user: {
      id: 'u-alex',
      name: 'Alex Morgan',
      email: 'alex.morgan@meridian.example',
      title: 'Portfolio Manager, Global Equities',
      initials: 'AM',
      avatarColor: '#0b57d0',
    },
    roles: [Role.PortfolioManager],
    entitlements: { all: false, ids: ['GEQ', 'USV', 'ESG'] },
    summary: 'Manages 3 funds. Creates orders; sees compliance results.',
  },
  {
    user: {
      id: 'u-jordan',
      name: 'Jordan Patel',
      email: 'jordan.patel@meridian.example',
      title: 'Senior Execution Trader',
      initials: 'JP',
      avatarColor: '#137333',
    },
    roles: [Role.Trader],
    entitlements: { all: true },
    summary: 'Works the order blotter: routes and cancels orders.',
  },
  {
    user: {
      id: 'u-sam',
      name: 'Sam Rivera',
      email: 'sam.rivera@meridian.example',
      title: 'Compliance Officer',
      initials: 'SR',
      avatarColor: '#b3261e',
    },
    roles: [Role.ComplianceOfficer],
    entitlements: { all: true },
    summary: 'Reviews pre-trade breaches; approves or rejects orders.',
  },
  {
    user: {
      id: 'u-taylor',
      name: 'Taylor Kim',
      email: 'taylor.kim@meridian.example',
      title: 'Research Analyst',
      initials: 'TK',
      avatarColor: '#9334e6',
    },
    roles: [Role.Analyst],
    entitlements: { all: false, ids: ['GEQ', 'TEC'] },
    summary: 'Read-only access to 2 funds. No trading, no compliance.',
  },
  {
    user: {
      id: 'u-riley',
      name: 'Riley Chen',
      email: 'riley.chen@meridian.example',
      title: 'Platform Administrator',
      initials: 'RC',
      avatarColor: '#5f6368',
    },
    roles: [Role.PlatformAdmin],
    entitlements: { all: true },
    summary: 'Platform diagnostics: remotes, flags, telemetry, events.',
  },
];

export function findPersona(userId: string): Persona | undefined {
  return PERSONAS.find((persona) => persona.user.id === userId);
}

export function permissionsFor(roles: readonly Role[]): Permission[] {
  return [...new Set(roles.flatMap((role) => ROLE_PERMISSIONS[role]))];
}

/** Server-side flag evaluation (a real system would call a flag service). */
export function flagsFor(persona: Persona): Record<string, boolean> {
  const has = (role: Role) => persona.roles.includes(role);
  return {
    [FeatureFlag.CommandPalette]: true,
    [FeatureFlag.HomeMarketMovers]: true,
    [FeatureFlag.BlotterCellFlash]: true,
    [FeatureFlag.PortfolioRiskAnalytics]:
      has(Role.PortfolioManager) || has(Role.PlatformAdmin) || has(Role.ComplianceOfficer),
    [FeatureFlag.TradingAlgoOrders]: has(Role.PlatformAdmin),
  };
}
