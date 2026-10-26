var F = Blotter.util.Format;

var DEFAULT_LIMIT = 8;
/** Upper bound on the rows the shell may ask for: a dashboard card, not a blotter. */
var MAX_LIMIT = 100;
var ERROR_TEXT =
  '<div class="mrd-empty mrd-empty--compact"><strong>Orders are unavailable</strong><span>They will reload automatically when the connection recovers.</span></div>';

/**
 * Controller of the dashboard widget. Inputs, by direction:
 *  - shell -> this remote (props): `limit`, `interaction` ('open' | 'focus'),
 *    initially as `view.widgetProps`, then through the `hostpropschange` event;
 *  - shell -> all remotes (host.state): the workspace portfolio, density, locale;
 *  - remote -> remote (host.events): `security.focused` narrows the list.
 * Output: in 'focus' mode a selected row publishes `order.focused`.
 */
Ext.define('Blotter.view.widget.RecentOrdersController', {
  extend: 'Blotter.view.HostViewController',
  alias: 'controller.recentorders',

  init: function (view) {
    var me = this;
    var host = me.host;
    me.symbol = null;
    me.emptyText = view.getView().emptyText;
    me.applyProps(view.widgetProps);
    view.getStore().getProxy().setHost(host);
    me.subscribe(
      host.events.subscribe('order.created', function (payload) {
        me.upsert(payload.order);
      }),
    );
    me.subscribe(
      host.events.subscribe('order.updated', function (payload) {
        me.upsert(payload.order);
      }),
    );
    me.subscribe(
      host.events.subscribe('security.focused', function (payload) {
        if (me.interaction !== 'focus' || payload.symbol === me.symbol) return;
        me.symbol = payload.symbol;
        me.reload();
      }),
    );
    me.subscribe(
      host.state.subscribe(function (state, previous) {
        if (state.activePortfolioId !== previous.activePortfolioId) me.reload();
      }),
    );
    // Self-healing: after a failed load, reload as soon as the platform is reachable again.
    me.subscribe(
      host.marketData.subscribeStatus(function (status) {
        if (status === 'open' && me.loadFailed) me.reload();
      }),
    );
    me.followAppearance([view]);
    me.reload();
  },

  applyProps: function (props) {
    var limit = Number(props && props.limit);
    this.limit = limit > 0 ? Math.min(Math.max(1, Math.round(limit)), MAX_LIMIT) : DEFAULT_LIMIT;
    this.interaction = props && props.interaction === 'focus' ? 'focus' : 'open';
  },

  /** New props from the shell (RemoteInstance.update): applied in place, no remount. */
  onHostPropsChange: function (props) {
    var previousLimit = this.limit;
    var previousSymbol = this.symbol;
    this.applyProps(props);
    if (this.interaction !== 'focus') this.symbol = null;
    // Either change alters the server-side query: a cleared focus must not leave filtered rows.
    if (this.limit !== previousLimit || this.symbol !== previousSymbol) this.reload();
    else this.updateFocusBar();
  },

  portfolioScope: function () {
    return this.host.state.getSnapshot().activePortfolioId;
  },

  /** Server-side filtering: the BFF applies entitlements, scope and limit together. */
  reload: function () {
    var me = this;
    var view = me.getView();
    var store = view.getStore();
    if (!store || store.destroyed) return;
    var query = { limit: me.limit };
    var portfolioId = me.portfolioScope();
    if (portfolioId) query.portfolioId = portfolioId;
    if (me.symbol) query.symbol = me.symbol;
    store.getProxy().setQuery(query);
    // The store's own refresh paints the result; only a failure needs a second pass.
    view.getView().emptyText = me.emptyText;
    store.load({
      callback: function (records, operation, success) {
        if (view.destroyed) return;
        me.loadFailed = !success;
        if (success) return;
        // A failed load must not look like "no matching orders".
        view.getView().emptyText = ERROR_TEXT;
        store.removeAll();
        me.host.telemetry.track('widget.load-failed', { widget: 'RecentOrders' });
      },
    });
    me.updateFocusBar();
  },

  updateFocusBar: function () {
    var bar = this.lookup('focusbar');
    if (!bar || bar.destroyed) return;
    var portfolioId = this.portfolioScope();
    var symbol = this.symbol;
    var strong = function (text) {
      return '<strong>' + F.encode(text) + '</strong>';
    };
    var html = symbol
      ? 'Showing ' + strong(symbol) + ' orders' + (portfolioId ? ' in ' + strong(portfolioId) : '')
      : portfolioId
        ? 'Showing orders in ' + strong(portfolioId)
        : '';
    this.lookup('focuslabel').setHtml(html);
    this.lookup('clearfocus').setHidden(!symbol);
    bar.setHidden(!html);
  },

  matches: function (order) {
    var portfolioId = this.portfolioScope();
    return (
      (!portfolioId || order.portfolioId === portfolioId) &&
      (!this.symbol || order.symbol === this.symbol)
    );
  },

  upsert: function (order) {
    var view = this.getView();
    var store = view.getStore();
    if (!store || store.destroyed) return;
    var record = store.getById(order.id);
    if (record) {
      record.set(order, { dirty: false });
    } else {
      if (!this.matches(order)) return;
      // Copy: Ext converts record data in place; event payloads are shared and immutable.
      record = store.insert(0, Ext.apply({}, order))[0];
      while (store.getCount() > this.limit) store.removeAt(store.getCount() - 1);
    }
    this.flashRow(view, record);
  },

  onClearFocus: function () {
    this.symbol = null;
    this.reload();
  },

  onItemClick: function (grid, record) {
    if (this.interaction === 'focus') return;
    this.dispatch('order.open', { orderId: record.getId() });
  },

  /** 'focus' mode: mouse and keyboard selection both tell the other remotes. */
  onSelectionChange: function (selectionModel, selected) {
    var record = selected && selected[0];
    if (record && this.interaction === 'focus') this.publishFocus(record);
  },
});

/** Federated `blotter/RecentOrdersWidget`: a compact live order list for dashboards. */
Ext.define('Blotter.view.widget.RecentOrders', {
  extend: 'Ext.grid.Panel',
  xtype: 'blotter-recentorders',
  requires: ['Blotter.view.widget.RecentOrdersController'],

  /** Scoped Host API, injected by src/remote/mount-ext.ts. */
  host: null,
  /** Props from the shell at mount time; later changes arrive as `hostpropschange`. */
  widgetProps: null,

  controller: 'recentorders',
  cls: 'mrd-ext mrd-grid mrd-grid--widget',
  border: false,
  rowLines: true,
  sortableColumns: false,
  enableColumnMove: false,

  store: {
    model: 'Blotter.model.Order',
    proxy: { type: 'meridian', path: '/orders' },
    sorters: [{ property: 'createdAt', direction: 'DESC' }],
    autoLoad: false,
    // Inline store configs are not destroyed with the grid unless asked: without this the
    // proxy outlives the widget and an in-flight load is never aborted.
    autoDestroy: true,
  },

  dockedItems: [
    {
      xtype: 'toolbar',
      dock: 'top',
      reference: 'focusbar',
      cls: 'mrd-focusbar',
      hidden: true,
      items: [
        { xtype: 'component', reference: 'focuslabel', cls: 'mrd-scope', ariaRole: 'status' },
        { xtype: 'tbfill' },
        {
          xtype: 'button',
          reference: 'clearfocus',
          cls: 'mrd-btn-text mrd-btn-dense',
          text: 'Show all',
          hidden: true,
          handler: 'onClearFocus',
        },
      ],
    },
  ],

  viewConfig: {
    markDirty: false,
    deferEmptyText: false,
    emptyText:
      '<div class="mrd-empty mrd-empty--compact"><strong>No matching orders</strong></div>',
  },

  columns: {
    defaults: { menuDisabled: true, resizable: false },
    items: [
      {
        text: 'Time',
        dataIndex: 'createdAt',
        width: 84,
        tdCls: 'mrd-num',
        renderer: function (value) {
          return F.time(value);
        },
      },
      {
        text: 'Order',
        dataIndex: 'symbol',
        flex: 1,
        renderer: function (value, meta, record) {
          return (
            F.sideTag(record.get('side')) +
            ' <span class="mrd-num">' +
            F.quantity(record.get('quantity')) +
            '</span> <span class="mrd-symbol">' +
            F.encode(value) +
            '</span>'
          );
        },
      },
      {
        text: 'Fund',
        dataIndex: 'portfolioId',
        width: 64,
        renderer: function (value) {
          return '<span class="mrd-subtle">' + F.encode(value) + '</span>';
        },
      },
      {
        text: 'Status',
        dataIndex: 'status',
        width: 164,
        renderer: function (value) {
          return F.statusChip(value);
        },
      },
    ],
  },

  listeners: {
    itemclick: 'onItemClick',
    selectionchange: 'onSelectionChange',
    hostpropschange: 'onHostPropsChange',
  },
});
