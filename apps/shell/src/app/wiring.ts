import {
  Permission,
  TradeTicketDraftSchema,
  type HostApi,
  type HostLocation,
  type InboxNotification,
  type NavigationApi,
  type Order,
} from '@meridian/contracts';
import { formatCurrency, formatPrice, formatQuantity } from '@meridian/formatting';
import type { Platform } from '@meridian/platform';
import type { createBrowserRouter } from 'react-router';
import { useShellUi } from './ui-store';

type AppRouter = ReturnType<typeof createBrowserRouter>;

const href = (location: HostLocation) => `${location.pathname}${location.search}${location.hash}`;

/** Exposes the shell's data router to remotes through the framework-agnostic NavigationApi. */
export function createRouterNavigation(router: AppRouter): NavigationApi {
  const current = (): HostLocation => {
    const { pathname, search, hash } = router.state.location;
    return { pathname, search, hash };
  };
  return {
    getLocation: current,
    navigate: (to, options) => void router.navigate(to, { replace: options?.replace }),
    subscribe(listener) {
      let last = href(current());
      return router.subscribe(() => {
        const next = current();
        if (href(next) !== last) {
          last = href(next);
          // React Router notifies subscribers in one loop: isolate each remote's listener.
          try {
            listener(next);
          } catch (error) {
            reportError(error);
          }
        }
      });
    },
  };
}

class IntentDeniedError extends Error {
  override readonly name = 'IntentDeniedError';
}

/**
 * The shell is the only intent handler registry. Remotes say *what* they
 * want ("open a trade ticket for AAPL"); the shell decides *how* (which
 * remote renders it, which route, which surface) and enforces permissions.
 */
export function registerIntents(platform: Platform) {
  const auth = platform.hostFor({ name: 'shell', module: 'shell' }).auth;
  const navigate = (to: string) => platform.navigation.navigate(to);
  const require = (permission: Permission, action: string) => {
    if (!auth.hasPermission(permission))
      throw new IntentDeniedError(`You do not have permission to ${action}.`);
  };

  platform.intents.register('trade.ticket.open', (payload) => {
    require(Permission.OrderCreate, 'create orders');
    const draft = TradeTicketDraftSchema.parse(payload);
    if (draft.portfolioId && !auth.canAccessPortfolio(draft.portfolioId)) {
      throw new IntentDeniedError(`You are not entitled to trade portfolio ${draft.portfolioId}.`);
    }
    useShellUi.getState().openTicket(draft);
  });
  platform.intents.register('order.open', ({ orderId }) => {
    require(Permission.OrderRead, 'view orders');
    navigate(`/orders?focus=${encodeURIComponent(orderId)}`);
  });
  platform.intents.register('portfolio.open', ({ portfolioId, tab }) => {
    require(Permission.PortfolioRead, 'view portfolios');
    platform.state.setActivePortfolio(portfolioId);
    navigate(
      `/portfolios/${encodeURIComponent(portfolioId)}${tab && tab !== 'overview' ? `/${tab}` : ''}`,
    );
  });
  platform.intents.register('compliance.alert.open', ({ alertId }) => {
    require(Permission.ComplianceRead, 'view compliance alerts');
    navigate(`/compliance?focus=${encodeURIComponent(alertId)}`);
  });
  platform.intents.register('security.open', ({ symbol }) => {
    require(Permission.MarketDataRead, 'view market data');
    navigate(`/market?symbol=${encodeURIComponent(symbol)}`);
  });
}

const describe = (order: Order) =>
  `${order.side === 'BUY' ? 'Buy' : 'Sell'} ${formatQuantity(order.quantity)} ${order.symbol}`;

/** A toast now plus an inbox entry to find later: every server-driven notification does both. */
function notify(host: HostApi, notification: InboxNotification & { readonly toast: string }) {
  const { toast, ...inbox } = notification;
  host.notifications.toast({ severity: inbox.severity, message: toast, action: inbox.action });
  host.notifications.publish(inbox);
}

/**
 * Turns server events into user-facing notifications in ONE place, so
 * remotes do not each re-implement (and duplicate) alerts for the same fact.
 */
export function wireServerNotifications(platform: Platform) {
  const host = platform.hostFor({ name: 'shell', module: 'notifications' });
  const me = host.auth.getUser().id;
  const isManager = host.auth.hasPermission(Permission.ComplianceManage);
  const isTrader = host.auth.hasPermission(Permission.OrderRoute);

  host.events.subscribe('order.updated', ({ order, previousStatus }) => {
    if (order.status === previousStatus) return;
    const mine = order.createdBy.id === me;
    const action = {
      label: 'View',
      intent: { intent: 'order.open' as const, payload: { orderId: order.id } },
    };
    if (order.status === 'FILLED' && (mine || isTrader)) {
      const fill = `${describe(order)} filled at ${formatPrice(order.averageFillPrice)} (${formatCurrency(order.filledQuantity * (order.averageFillPrice ?? 0), { compact: true })})`;
      notify(host, {
        severity: 'success',
        toast: `${order.id} · ${fill}`,
        title: `Order ${order.id} filled`,
        message: fill,
        action,
      });
    } else if (mine && order.status === 'NEW' && previousStatus === 'PENDING_APPROVAL') {
      notify(host, {
        severity: 'success',
        toast: `${order.id} approved by ${order.approvedBy?.name ?? 'compliance'}`,
        title: `Order ${order.id} approved`,
        message: `${describe(order)} is ready to route.`,
        action,
      });
    } else if (mine && order.status === 'REJECTED') {
      notify(host, {
        severity: 'error',
        toast: `${order.id} was rejected by compliance`,
        title: `Order ${order.id} rejected`,
        message: `${describe(order)} was rejected.`,
        action,
      });
    }
  });

  host.events.subscribe('compliance.alert.raised', ({ alert }) => {
    if (!isManager) return;
    notify(host, {
      severity: 'warning',
      toast: `Approval needed: ${[alert.portfolioName, alert.symbol].filter(Boolean).join(' · ')}`,
      title: alert.ruleName,
      message: `${alert.portfolioName}: ${alert.message}`,
      action: {
        label: 'Review',
        intent: { intent: 'compliance.alert.open' as const, payload: { alertId: alert.id } },
      },
    });
  });
}
