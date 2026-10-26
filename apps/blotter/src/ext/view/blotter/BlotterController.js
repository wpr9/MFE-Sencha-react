import { Permission, apiPaths } from '@meridian/contracts';
import { TERMINAL } from '../../util/Format.js';

/** Justification bounds, mirroring the BFF's `OrderActionSchema`: checked before the round trip. */
var MIN_JUSTIFICATION_CHARS = 3;
var MAX_JUSTIFICATION_CHARS = 500;
/** Ext.Msg titles and messages are HTML; ids are server data, encoded like everything else. */
var encodeId = function (record) {
  return Ext.String.htmlEncode(record.getId());
};
/** Columns of the CSV export, in order. */
var EXPORT_COLUMNS = [
  'id',
  'createdAt',
  'portfolioId',
  'portfolioName',
  'side',
  'symbol',
  'quantity',
  'filledQuantity',
  'status',
  'orderType',
  'limitPrice',
  'averageFillPrice',
  'estimatedNotional',
  'createdByName',
];
var NO_ACTIONS = { approve: false, reject: false, route: false, cancel: false };

/**
 * Bridges the blotter view to the platform. Everything platform-facing goes
 * through `this.host` (the scoped Host API): permissions, live events, the
 * shell's portfolio context, deep links, intents and notifications.
 */
Ext.define('Blotter.view.blotter.BlotterController', {
  extend: 'Blotter.view.HostViewController',
  alias: 'controller.blotter',

  init: function (view) {
    var me = this;
    var host = me.host;
    var vm = me.getViewModel();
    var auth = host.auth;
    var store = vm.getStore('orders');

    me.searchText = '';
    me.portfolioNames = {};
    store.getProxy().setHost(host);

    vm.set({
      userId: auth.getUser().id,
      canCreate: auth.hasPermission(Permission.OrderCreate),
      canApprove: auth.hasPermission(Permission.OrderApprove),
      canRoute: auth.hasPermission(Permission.OrderRoute),
      canCancel: auth.hasPermission(Permission.OrderCancel),
      // Traders may cancel any order; portfolio managers only their own (server rule).
      canCancelAny: auth.hasPermission(Permission.OrderRoute),
      live: host.marketData.getStatus(),
    });

    me.subscribe(
      host.events.subscribe('order.created', function (payload) {
        me.upsert(payload.order, true);
      }),
    );
    me.subscribe(
      host.events.subscribe('order.updated', function (payload) {
        me.upsert(payload.order, payload.previousStatus !== payload.order.status);
      }),
    );
    me.subscribe(
      host.state.subscribe(function (state, previous) {
        if (state.activePortfolioId !== previous.activePortfolioId) me.applyPortfolioScope();
      }),
    );
    me.subscribe(
      host.navigation.subscribe(function (location) {
        me.focusFromLocation(location);
      }),
    );
    me.subscribe(
      host.marketData.subscribeStatus(function (status) {
        if (!vm.destroyed) vm.set('live', status);
      }),
    );
    me.followAppearance([me.lookup('ordersGrid')]);

    // Names are cosmetic: without them the scope chip shows the portfolio id.
    host.http
      .get(apiPaths.portfolios())
      .then(function (portfolios) {
        if (me.destroyed) return;
        portfolios.forEach(function (portfolio) {
          me.portfolioNames[portfolio.id] = portfolio.name;
        });
        me.applyPortfolioScope();
      })
      .catch(Ext.emptyFn);

    me.applyPortfolioScope();
    // Loads, filters and inserts fire `datachanged`; `record.set()` fires only `update`.
    store.on({ datachanged: me.updateCounts, update: me.updateCounts, scope: me });
    me.loadOrders(function () {
      me.focusFromLocation(host.navigation.getLocation());
    });
  },

  destroy: function () {
    Ext.destroy(this.contextMenu);
    this.contextMenu = null;
    // Ext.Msg is a page-level singleton: don't leave our dialog open on a page we no longer own.
    if (Ext.Msg.isVisible()) Ext.Msg.hide();
    Blotter.view.HostViewController.prototype.destroy.call(this);
  },

  /* ----------------------------------------------------------- data flow */

  /** Loads the store; failures are shown, success runs `onLoaded`. */
  loadOrders: function (onLoaded) {
    var me = this;
    me.getViewModel()
      .getStore('orders')
      .load({
        callback: function (records, operation, success) {
          if (me.destroyed) return;
          if (!success) {
            var error = operation.getError();
            me.host.notifications.toast({
              severity: 'error',
              message: 'Could not load orders. ' + ((error && error.statusText) || ''),
            });
            return;
          }
          if (onLoaded) onLoaded();
        },
      });
  },

  findRecord: function (id) {
    var data = this.getViewModel().getStore('orders').getData();
    return (data.getSource() || data).get(id);
  },

  upsert: function (order, flash) {
    var vm = this.getViewModel();
    var store = vm.getStore('orders');
    if (!store || store.destroyed) return;
    var record = this.findRecord(order.id);
    var changed = !record || record.get('status') !== order.status;
    if (record) {
      record.set(order, { dirty: false });
    } else {
      // Copy: an Ext model adopts the object it is given as its data and converts it
      // in place, while event payloads are shared (bus history, other stores) and immutable.
      record = store.insert(0, Ext.apply({}, order))[0];
    }
    // A status change on the selected order changes what the detail toolbar may do.
    if (record === vm.get('selectedOrder')) vm.set('actions', this.actionsFor(record));
    if (flash && changed) this.flashRow(this.lookup('ordersGrid'), record);
  },

  matchesPortfolio: function (record) {
    var portfolioId = this.getViewModel().get('activePortfolioId');
    return !portfolioId || record.get('portfolioId') === portfolioId;
  },

  matchesScope: function (record) {
    return this.matchesPortfolio(record) && this.matchesSearch(record);
  },

  matchesSearch: function (record) {
    var query = this.searchText;
    if (!query) return true;
    return ['id', 'symbol', 'securityName', 'portfolioName', 'createdByName'].some(
      function (field) {
        return (
          String(record.get(field) || '')
            .toLowerCase()
            .indexOf(query) !== -1
        );
      },
    );
  },

  applyFilters: function (bucketOverride) {
    var me = this;
    var vm = me.getViewModel();
    var store = vm.getStore('orders');
    var bucket = bucketOverride !== undefined ? bucketOverride : vm.get('statusFilter');
    var filters = [
      {
        id: 'scope',
        filterFn: function (record) {
          return me.matchesScope(record);
        },
      },
    ];
    if (bucket && bucket !== 'all') {
      filters.push({
        id: 'bucket',
        filterFn: function (record) {
          return record.get('statusBucket') === bucket;
        },
      });
    }
    store.clearFilter(true);
    store.filter(filters);
  },

  /** Counts per bucket over the scoped (portfolio + search) orders, ignoring the bucket filter. */
  updateCounts: function () {
    var me = this;
    var vm = me.getViewModel();
    var store = vm && vm.getStore('orders');
    if (!store || store.destroyed) return;
    var data = store.getData();
    var counts = { all: 0, approval: 0, ready: 0, working: 0, closed: 0 };
    (data.getSource() || data).each(function (record) {
      if (!me.matchesScope(record)) return;
      counts.all += 1;
      counts[record.get('statusBucket')] += 1;
    });
    vm.set('counts', counts);
  },

  applyPortfolioScope: function () {
    var vm = this.getViewModel();
    var id = this.host.state.getSnapshot().activePortfolioId;
    vm.set({
      activePortfolioId: id,
      activePortfolioName: id ? this.portfolioNames[id] || id : null,
    });
    this.applyFilters();
  },

  focusFromLocation: function (location) {
    var id = new URLSearchParams(location.search).get('focus');
    if (!id) return;
    var record = this.findRecord(id);
    if (!record) return;
    var vm = this.getViewModel();
    var grid = this.lookup('ordersGrid');
    if (vm.get('statusFilter') !== 'all' && record.get('statusBucket') !== vm.get('statusFilter')) {
      vm.set('statusFilter', 'all');
      // Flush the binding now: the segmented button's change handler filters once, here,
      // instead of a deferred second pass that would re-render the rows and drop the flash.
      vm.notify();
    }
    // Widen only what actually hides the order: the workspace portfolio is shared with
    // every remote, so it is cleared only when the order belongs to another portfolio.
    if (!this.matchesPortfolio(record)) {
      this.host.state.setActivePortfolio(null);
    }
    if (!this.matchesSearch(record)) {
      var search = this.lookup('search');
      this.searchText = '';
      search.suspendEvent('change');
      search.setValue('');
      search.resumeEvent('change');
      search.getTrigger('clear').setVisible(false);
      this.applyFilters();
    }
    grid.getSelectionModel().select(record);
    grid.ensureVisible(record, { select: true, focus: true });
    this.flashRow(grid, record);
    this.lookup('detail').expand();
  },

  /* ---------------------------------------------------------- permissions */

  /**
   * Which actions the current user may take on `record`: the one place the
   * rule lives, for the row action, the context menu and the detail toolbar.
   * Mirrors the BFF, which re-checks every action: approval needs four eyes
   * (never your own order), rejection does not, traders cancel any working
   * order and portfolio managers only their own.
   */
  actionsFor: function (record) {
    var vm = this.getViewModel();
    var status = record.get('status');
    var terminal = TERMINAL.indexOf(status) !== -1;
    var own = (record.get('createdBy') || {}).id === vm.get('userId');
    var pending = status === 'PENDING_APPROVAL';
    return {
      approve: vm.get('canApprove') && pending && !own,
      reject: vm.get('canApprove') && pending,
      route: vm.get('canRoute') && status === 'NEW',
      cancel: vm.get('canCancel') && !terminal && (vm.get('canCancelAny') || own),
    };
  },

  /* ------------------------------------------------------------ handlers */

  onStatusFilterChange: function (button, value) {
    // ViewModel bindings flush asynchronously: use the event value directly.
    var vm = this.getViewModel();
    if (vm.get('statusFilter') !== value) vm.set('statusFilter', value);
    this.applyFilters(value);
  },

  onSearchChange: function (field, value) {
    this.searchText = String(value || '')
      .trim()
      .toLowerCase();
    field.getTrigger('clear').setVisible(!!value);
    this.applyFilters();
  },

  onSearchClear: function (field) {
    field.setValue('');
  },

  onGroupByChange: function (combo, value) {
    var store = this.getViewModel().getStore('orders');
    if (value === 'none') store.clearGrouping();
    else store.group(value);
  },

  onClearScope: function () {
    this.host.state.setActivePortfolio(null);
  },

  onSelectionChange: function (selectionModel, selected) {
    var record = selected && selected[0];
    var vm = this.getViewModel();
    vm.set('actions', record ? this.actionsFor(record) : NO_ACTIONS);
    if (!record) return;
    var detail = this.lookup('detail');
    if (detail.getCollapsed()) detail.expand();
    this.publishFocus(record);
  },

  onItemDblClick: function () {
    this.lookup('detail').expand();
  },

  onRefresh: function () {
    this.loadOrders();
  },

  onNewOrder: function () {
    var portfolioId = this.getViewModel().get('activePortfolioId');
    this.dispatch('trade.ticket.open', portfolioId ? { portfolioId: portfolioId } : {});
  },

  onItemContextMenu: function (grid, record, item, index, event) {
    var me = this;
    var actions = me.actionsFor(record);
    event.stopEvent();
    grid.getSelectionModel().select(record);
    Ext.destroy(me.contextMenu);
    me.contextMenu = Ext.create('Ext.menu.Menu', {
      cls: 'mrd-ext mrd-menu',
      plain: true,
      items: [
        {
          text: 'Copy order ID',
          iconCls: 'mrd-icon mrd-icon-copy',
          handler: function () {
            me.copyId(record);
          },
        },
        {
          text: 'Open portfolio',
          iconCls: 'mrd-icon mrd-icon-portfolio',
          handler: function () {
            me.openPortfolio(record);
          },
        },
        {
          text: 'Trade similar',
          iconCls: 'mrd-icon mrd-icon-trade',
          hidden: !me.getViewModel().get('canCreate'),
          handler: function () {
            me.tradeSimilar(record);
          },
        },
        {
          xtype: 'menuseparator',
          // No dangling rule for read-only users: hidden with the actions it introduces.
          hidden: !(actions.approve || actions.reject || actions.route || actions.cancel),
        },
        {
          text: 'Approve',
          iconCls: 'mrd-icon mrd-icon-approve',
          hidden: !actions.approve,
          handler: function () {
            me.approve(record);
          },
        },
        {
          text: 'Reject',
          iconCls: 'mrd-icon mrd-icon-reject',
          hidden: !actions.reject,
          handler: function () {
            me.reject(record);
          },
        },
        {
          text: 'Route to market',
          iconCls: 'mrd-icon mrd-icon-route',
          hidden: !actions.route,
          handler: function () {
            me.route(record);
          },
        },
        {
          text: 'Cancel order',
          iconCls: 'mrd-icon mrd-icon-cancel',
          hidden: !actions.cancel,
          handler: function () {
            me.cancel(record);
          },
        },
      ],
    });
    me.contextMenu.showAt(event.getXY());
  },

  /** The row's single action button: approve when pending, route when ready. */
  onRowAction: function (grid, rowIndex, colIndex, item, event, record) {
    var actions = this.actionsFor(record);
    if (actions.approve) this.approve(record);
    else if (actions.route) this.route(record);
  },

  rowActionClass: function (value, meta, record) {
    var actions = this.actionsFor(record);
    if (actions.approve) {
      meta.tdAttr = 'data-qtip="Approve"';
      return 'mrd-icon mrd-icon-approve mrd-row-action';
    }
    if (actions.route) {
      meta.tdAttr = 'data-qtip="Route to market"';
      return 'mrd-icon mrd-icon-route mrd-row-action';
    }
    return 'x-hidden-display';
  },

  /* ------------------------------------------------------------- actions */

  selected: function () {
    return this.getViewModel().get('selectedOrder');
  },

  onApproveSelected: function () {
    this.approve(this.selected());
  },
  onRejectSelected: function () {
    this.reject(this.selected());
  },
  onRouteSelected: function () {
    this.route(this.selected());
  },
  onCancelSelected: function () {
    this.cancel(this.selected());
  },
  onTradeSimilarSelected: function () {
    this.tradeSimilar(this.selected());
  },
  onOpenPortfolioSelected: function () {
    this.openPortfolio(this.selected());
  },

  approve: function (record) {
    var me = this;
    me.promptComment(
      'Approve ' + encodeId(record),
      'Record the justification for the audit trail.',
      function (comment) {
        me.post(record, 'approve', { comment: comment }, 'Order ' + record.getId() + ' approved');
      },
    );
  },

  reject: function (record) {
    var me = this;
    me.promptComment(
      'Reject ' + encodeId(record),
      'Explain why the order is rejected. The portfolio manager is notified.',
      function (comment) {
        me.post(record, 'reject', { comment: comment }, 'Order ' + record.getId() + ' rejected');
      },
    );
  },

  route: function (record) {
    this.post(record, 'route', undefined, 'Order ' + record.getId() + ' routed to market');
  },

  cancel: function (record) {
    var me = this;
    Ext.Msg.show({
      title: 'Cancel ' + encodeId(record) + '?',
      message:
        'Unfilled quantity (' +
        Blotter.util.Format.quantity(record.get('quantity') - record.get('filledQuantity')) +
        ') will be withdrawn from the market. This cannot be undone.',
      buttons: Ext.Msg.YESNO,
      buttonText: { yes: 'Cancel order', no: 'Keep order' },
      cls: 'mrd-ext mrd-dialog',
      fn: function (button) {
        if (button === 'yes')
          me.post(record, 'cancel', undefined, 'Order ' + record.getId() + ' cancelled');
      },
    });
  },

  tradeSimilar: function (record) {
    this.dispatch('trade.ticket.open', {
      portfolioId: record.get('portfolioId'),
      symbol: record.get('symbol'),
      side: record.get('side'),
      quantity: record.get('quantity'),
    });
  },

  openPortfolio: function (record) {
    this.dispatch('portfolio.open', { portfolioId: record.get('portfolioId') });
  },

  copyId: function (record) {
    var host = this.host;
    // `navigator.clipboard` is undefined outside secure contexts (plain http on a LAN address).
    if (!navigator.clipboard) {
      host.notifications.toast({
        severity: 'error',
        message: 'Clipboard needs a secure (https) page',
      });
      return;
    }
    navigator.clipboard.writeText(record.getId()).then(
      function () {
        host.notifications.toast({ severity: 'info', message: 'Copied ' + record.getId() });
      },
      function () {
        // Clipboard access needs focus and a secure context; say so instead of failing silently.
        host.notifications.toast({ severity: 'error', message: 'Could not copy to the clipboard' });
      },
    );
  },

  promptComment: function (title, message, callback) {
    var host = this.host;
    Ext.Msg.show({
      title: title,
      message: message,
      prompt: true,
      multiline: true,
      defaultTextHeight: 96,
      buttons: Ext.Msg.OKCANCEL,
      buttonText: { ok: 'Submit', cancel: 'Cancel' },
      cls: 'mrd-ext mrd-dialog',
      fn: function (button, text) {
        if (button !== 'ok') return;
        var length = text ? text.trim().length : 0;
        if (length < MIN_JUSTIFICATION_CHARS || length > MAX_JUSTIFICATION_CHARS) {
          host.notifications.toast({
            severity: 'warning',
            message:
              'A justification of ' +
              MIN_JUSTIFICATION_CHARS +
              ' to ' +
              MAX_JUSTIFICATION_CHARS +
              ' characters is required.',
          });
          return;
        }
        callback(text.trim());
      },
    });
  },

  post: function (record, action, body, successMessage) {
    var me = this;
    var host = this.host;
    var view = this.getView();
    view.mask('Working…');
    host.http
      .post(apiPaths.orderAction(record.getId(), action), body)
      .then(function (order) {
        // Apply the server's answer now - even while the stream is reconnecting. Its later
        // echo re-applies the same values (object fields compare by identity) without a
        // second flash: `upsert` flashes only when the status actually changes.
        if (order && !view.destroyed) me.upsert(order, true);
        host.notifications.toast({ severity: 'success', message: successMessage });
        return order;
      })
      .catch(function (error) {
        var detail =
          (error && error.problem && error.problem.detail) ||
          (error && error.message) ||
          'Request failed';
        host.notifications.toast({ severity: 'error', message: detail });
      })
      .then(function () {
        if (!view.destroyed) view.unmask();
      });
  },

  onExport: function () {
    var store = this.getViewModel().getStore('orders');
    var csv = Blotter.util.Csv.render(store, EXPORT_COLUMNS);
    Blotter.util.Csv.download(csv, 'orders-' + new Date().toISOString().slice(0, 10) + '.csv');
    this.host.telemetry.track('blotter.export', { rows: store.getCount() });
  },
});
