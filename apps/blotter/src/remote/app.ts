import { Permission } from '@meridian/contracts';
import { defineExtRemote } from './mount-ext';

/** Federated as `blotter/App`: the full order management blotter page. */
export default defineExtRemote({
  className: 'Blotter.view.blotter.Blotter',
  denied: ({ host }) =>
    host.auth.hasPermission(Permission.OrderRead)
      ? null
      : 'You do not have access to the order blotter.',
});
