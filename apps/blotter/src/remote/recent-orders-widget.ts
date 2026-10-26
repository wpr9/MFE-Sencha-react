import { Permission } from '@meridian/contracts';
import { defineExtRemote } from './mount-ext';

/** Federated as `blotter/RecentOrdersWidget`: compact live list for dashboards. */
export default defineExtRemote({
  className: 'Blotter.view.widget.RecentOrders',
  denied: ({ host }) =>
    host.auth.hasPermission(Permission.OrderRead) ? null : 'No access to orders.',
});
