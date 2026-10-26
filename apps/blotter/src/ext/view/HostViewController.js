/**
 * Base controller for every Ext view the platform mounts. It owns the Host
 * API seams the views share, so the blotter and the widget do not each
 * re-implement them:
 *
 *  - `view.host`, the scoped Host API injected by `src/remote/mount-ext.ts`;
 *  - platform subscriptions that end with the view (`subscribe`);
 *  - density and locale from the shell (`followAppearance`);
 *  - intent dispatch with an error toast (`dispatch`), focus publication
 *    (`publishFocus`) and the row flash (`flashRow`).
 *
 * House rule for every Ext class in this remote: the files are ES modules,
 * i.e. strict mode, and Ext 6's `callParent()` resolves the caller through
 * `Function.caller`, which is `null` for strict callers. Call the superclass
 * explicitly, e.g. `Blotter.view.HostViewController.prototype.destroy.call(this)`.
 */
Ext.define('Blotter.view.HostViewController', {
  extend: 'Ext.app.ViewController',

  /** Runs before the subclass's `init`, so `this.host` is available there. */
  beforeInit: function (view) {
    this.host = view.host;
    this.subscriptions = [];
  },

  destroy: function () {
    Ext.each(this.subscriptions, function (unsubscribe) {
      unsubscribe();
    });
    this.subscriptions = null;
    Ext.app.ViewController.prototype.destroy.call(this);
  },

  /** Registers a platform subscription that is released when the view is destroyed. */
  subscribe: function (unsubscribe) {
    this.subscriptions.push(unsubscribe);
    return unsubscribe;
  },

  /**
   * Applies the shell's density and locale now and whenever they change.
   * `grids` are refreshed so renderers pick up the new row height and formats.
   */
  followAppearance: function (grids) {
    var me = this;
    var view = me.getView();
    var apply = function (state) {
      view.toggleCls('mrd-density-compact', state.density === 'compact');
      Blotter.util.Format.locale = state.locale;
      Ext.each(grids, function (grid) {
        if (grid && grid.rendered) grid.getView().refresh();
      });
    };
    apply(me.host.state.getSnapshot());
    me.subscribe(
      me.host.state.subscribe(function (state, previous) {
        if (state.density !== previous.density || state.locale !== previous.locale) apply(state);
      }),
    );
  },

  /** Asks the shell to do something (open a ticket, a portfolio...); a refusal becomes a toast. */
  dispatch: function (intent, payload) {
    var host = this.host;
    host.intents.dispatch(intent, payload).catch(function (error) {
      host.notifications.toast({ severity: 'error', message: error.message });
    });
  },

  /** Tells the other remotes which order the user is looking at. */
  publishFocus: function (record) {
    this.host.events.publish('order.focused', {
      orderId: record.getId(),
      portfolioId: record.get('portfolioId'),
      symbol: record.get('symbol'),
    });
  },

  /** Replays the row-flash animation on a record's row (the CSS animation ends by itself). */
  flashRow: function (grid, record) {
    var node = record && grid.getView().getNode(record);
    if (!node) return;
    var el = Ext.fly(node);
    el.removeCls('mrd-row-flash');
    void node.offsetWidth; // forces a reflow so the animation restarts
    el.addCls('mrd-row-flash');
  },
});
