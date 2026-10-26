import { CATALOG } from './catalog';

/** A federated module the shell mounts somewhere. */
export interface FederatedModule {
  readonly remote: string;
  readonly module: string;
  readonly technology: 'React' | 'Ext JS';
  /** Where the shell uses it; shown on the Platform page. */
  readonly role: string;
}

/**
 * Widgets and overlays, defined once. Pages come from the navigation catalog.
 * Every surface that mounts a module (overview, trading desk, ticket drawer,
 * diagnostics) refers to these entries, so a renamed module is one edit.
 */
export const WIDGET_MODULES = {
  summary: {
    remote: 'portfolio',
    module: './SummaryWidget',
    technology: 'React',
    role: 'Overview widget',
  },
  recentOrders: {
    remote: 'blotter',
    module: './RecentOrdersWidget',
    technology: 'Ext JS',
    role: 'Overview and trading desk widget',
  },
  alerts: {
    remote: 'compliance',
    module: './AlertsWidget',
    technology: 'React',
    role: 'Overview widget',
  },
  movers: {
    remote: 'trading',
    module: './MoversWidget',
    technology: 'React',
    role: 'Overview and trading desk widget',
  },
  securityInsight: {
    remote: 'trading',
    module: './SecurityInsight',
    technology: 'React',
    role: 'Trading desk widget',
  },
  orderTicket: {
    remote: 'trading',
    module: './OrderTicket',
    technology: 'React',
    role: 'Intent: trade.ticket.open',
  },
} as const satisfies Record<string, FederatedModule>;

/** Every module the shell can mount: catalog pages first, then the widgets. */
export const FEDERATED_MODULES: readonly FederatedModule[] = [
  ...CATALOG.flatMap((entry) =>
    entry.remote
      ? [
          {
            remote: entry.remote.name,
            module: entry.remote.module,
            technology: entry.remote.technology,
            role: `Page ${entry.path}`,
          },
        ]
      : [],
  ),
  ...Object.values(WIDGET_MODULES),
];
