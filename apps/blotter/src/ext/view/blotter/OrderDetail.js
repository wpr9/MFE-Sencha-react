/** Selected-order inspector (east region of the blotter). */
Ext.define('Blotter.view.blotter.OrderDetail', {
  extend: 'Ext.panel.Panel',
  xtype: 'blotter-orderdetail',

  cls: 'mrd-detail',
  title: 'Order details',
  border: false,
  scrollable: 'y',
  layout: 'anchor',
  defaults: { anchor: '100%' },

  items: [
    {
      xtype: 'component',
      cls: 'mrd-detail__empty',
      bind: { hidden: '{selectedOrder}' },
      html: '<span class="mrd-icon mrd-icon-receipt"></span><strong>Select an order</strong><span>Its executions, compliance results and available actions appear here.</span>',
    },
    {
      xtype: 'component',
      cls: 'mrd-detail__body',
      hidden: true,
      bind: { data: '{detail}', hidden: '{!selectedOrder}' },
      tpl: new Ext.XTemplate(
        '<tpl if="id">',
        '<div class="mrd-detail__head">',
        '  <div class="mrd-detail__headline">{[this.f.sideTag(values.side)]}<span class="mrd-detail__qty">{[this.f.quantity(values.quantity)]}</span><span class="mrd-detail__symbol">{symbol:htmlEncode}</span></div>',
        '  <div class="mrd-detail__sub">{securityName:htmlEncode} &middot; {portfolioName:htmlEncode}</div>',
        '  <div class="mrd-detail__status">{[this.f.statusChip(values.status)]}</div>',
        '</div>',
        '<div class="mrd-detail__progress">',
        '  <div class="mrd-detail__progress-row"><span>Filled</span><span class="mrd-num">{[this.f.quantity(values.filledQuantity)]} of {[this.f.quantity(values.quantity)]}</span></div>',
        '  <div class="mrd-detail__bar"><span style="width:{[Math.min(100, values.fillPercent || 0).toFixed(1)]}%"></span></div>',
        '</div>',
        '<dl class="mrd-kv">',
        '  <dt>Order ID</dt><dd class="mrd-mono">{id:htmlEncode}</dd>',
        '  <dt>Type</dt><dd>{[values.orderType === "LIMIT" ? "Limit " + this.f.price(values.limitPrice) : "Market"]} &middot; {timeInForce:htmlEncode}</dd>',
        '  <dt>Avg fill price</dt><dd class="mrd-num">{[this.f.price(values.averageFillPrice)]}</dd>',
        '  <dt>Est. notional</dt><dd class="mrd-num">{[this.f.money(values.estimatedNotional)]}</dd>',
        '  <dt>Created</dt><dd>{[this.f.dateTime(values.createdAt)]}<br><span class="mrd-subtle">by {createdBy.name:htmlEncode}</span></dd>',
        '  <tpl if="approvedBy"><dt>Approved by</dt><dd>{approvedBy.name:htmlEncode}</dd></tpl>',
        '  <tpl if="routedBy"><dt>Routed by</dt><dd>{routedBy.name:htmlEncode}</dd></tpl>',
        '  <tpl if="rationale"><dt>Rationale</dt><dd>{rationale:htmlEncode}</dd></tpl>',
        '</dl>',
        '<h3 class="mrd-detail__section">Pre-trade compliance</h3>',
        '<div class="mrd-detail__compliance">{[this.f.complianceBadge(values.compliance.outcome, true)]}</div>',
        '<ul class="mrd-rules">',
        '  <tpl for="compliance.results">',
        '    <li class="mrd-rule mrd-rule--{[this.ruleTone(values.severity)]}">{[this.ruleIcon(values.severity)]}<div><strong>{ruleName:htmlEncode}</strong><span>{message:htmlEncode}</span></div></li>',
        '  </tpl>',
        '</ul>',
        '<h3 class="mrd-detail__section">Executions <span class="mrd-group__count">{fills.length}</span></h3>',
        '<tpl if="fills.length">',
        '  <table class="mrd-fills"><thead><tr><th>Time</th><th class="mrd-r">Qty</th><th class="mrd-r">Price</th><th>Venue</th></tr></thead><tbody>',
        '  <tpl for="fills"><tr><td class="mrd-num">{[this.f.time(values.timestamp)]}</td><td class="mrd-r mrd-num">{[this.f.quantity(values.quantity)]}</td><td class="mrd-r mrd-num">{[this.f.price(values.price)]}</td><td>{venue:htmlEncode}</td></tr></tpl>',
        '  </tbody></table>',
        '<tpl else>',
        '  <p class="mrd-subtle mrd-detail__none">No executions yet.</p>',
        '</tpl>',
        '</tpl>',
        {
          // Defined earlier in the import graph (see ext/index.js).
          f: Blotter.util.Format,
          ruleIcon: function (severity) {
            return this.f.icon(
              severity === 'PASS' ? 'pass' : severity === 'WARN' ? 'warning' : 'error',
            );
          },
          /** Allow-listed class suffix: a severity never lands in a class attribute raw. */
          ruleTone: function (severity) {
            return severity === 'PASS' ? 'pass' : severity === 'WARN' ? 'warn' : 'fail';
          },
        },
      ),
    },
  ],

  dockedItems: [
    {
      xtype: 'toolbar',
      dock: 'bottom',
      cls: 'mrd-detail__actions',
      hidden: true,
      bind: { hidden: '{!selectedOrder}' },
      items: [
        {
          text: 'Approve',
          cls: 'mrd-btn-filled',
          iconCls: 'mrd-icon mrd-icon-approve',
          hidden: true,
          bind: { hidden: '{!actions.approve}' },
          handler: 'onApproveSelected',
        },
        {
          text: 'Reject',
          cls: 'mrd-btn-outlined',
          hidden: true,
          bind: { hidden: '{!actions.reject}' },
          handler: 'onRejectSelected',
        },
        {
          text: 'Route to market',
          cls: 'mrd-btn-filled',
          iconCls: 'mrd-icon mrd-icon-route',
          hidden: true,
          bind: { hidden: '{!actions.route}' },
          handler: 'onRouteSelected',
        },
        {
          text: 'Cancel order',
          cls: 'mrd-btn-outlined mrd-btn-danger',
          hidden: true,
          bind: { hidden: '{!actions.cancel}' },
          handler: 'onCancelSelected',
        },
        { xtype: 'tbfill' },
        {
          cls: 'mrd-btn-icon',
          iconCls: 'mrd-icon mrd-icon-trade',
          tooltip: 'Trade similar',
          ariaLabel: 'Trade similar',
          hidden: true,
          bind: { hidden: '{!canCreate}' },
          handler: 'onTradeSimilarSelected',
        },
        {
          cls: 'mrd-btn-icon',
          iconCls: 'mrd-icon mrd-icon-portfolio',
          tooltip: 'Open portfolio',
          ariaLabel: 'Open portfolio',
          handler: 'onOpenPortfolioSelected',
        },
      ],
    },
  ],
});
