/**
 * State of the blotter page: the orders store, the active filters, live
 * status, the shell's portfolio context and the user's permission flags.
 * The flags are UX only - the BFF enforces the same rules - and
 * `canCancelAny` encodes the server rule that traders may cancel any order
 * while portfolio managers may cancel only their own.
 */
Ext.define('Blotter.view.blotter.BlotterModel', {
  extend: 'Ext.app.ViewModel',
  alias: 'viewmodel.blotter',

  data: {
    selectedOrder: null,
    statusFilter: 'all',
    counts: { all: 0, approval: 0, ready: 0, working: 0, closed: 0 },
    live: 'connecting',
    activePortfolioId: null,
    activePortfolioName: null,
    /** What the user may do with the selected order; see BlotterController.actionsFor. */
    actions: { approve: false, reject: false, route: false, cancel: false },
    canCreate: false,
    canApprove: false,
    canRoute: false,
    canCancel: false,
    canCancelAny: false,
    userId: null,
  },

  stores: {
    orders: {
      model: 'Blotter.model.Order',
      proxy: { type: 'meridian', path: '/orders' },
      sorters: [{ property: 'createdAt', direction: 'DESC' }],
      groupField: 'statusGroup',
      autoLoad: false,
    },
  },

  formulas: {
    liveHtml: function (get) {
      var status = get('live');
      var label = status === 'open' ? 'Live' : status === 'offline' ? 'Offline' : 'Reconnecting';
      return (
        '<span class="mrd-live mrd-live--' +
        status +
        '" role="status"><span class="mrd-live__dot"></span>' +
        label +
        '</span>'
      );
    },

    portfolioScopeHtml: function (get) {
      var name = get('activePortfolioName');
      return name
        ? '<span class="mrd-scope">Portfolio <strong>' +
            Ext.String.htmlEncode(name) +
            '</strong></span>'
        : '<span class="mrd-scope">All portfolios</span>';
    },

    detail: {
      bind: { bindTo: '{selectedOrder}', deep: true },
      get: function (order) {
        // Never null: the XTemplate dereferences `values`, so render an empty object instead.
        return order ? Ext.apply({}, order.getData()) : {};
      },
    },
  },
});
