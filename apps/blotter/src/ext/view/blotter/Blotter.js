import { groupLabel } from '../../util/Format.js';

var F = Blotter.util.Format;

/**
 * Order management blotter - the federated `blotter/App` page.
 * Classic Ext JS MVVM: this view is pure configuration; behaviour lives in
 * BlotterController and state in BlotterModel.
 */
Ext.define('Blotter.view.blotter.Blotter', {
  extend: 'Ext.panel.Panel',

  /** Scoped Host API, injected by src/remote/mount-ext.ts. */
  host: null,
  xtype: 'meridian-blotter',

  requires: [
    'Blotter.view.blotter.BlotterController',
    'Blotter.view.blotter.BlotterModel',
    'Blotter.view.blotter.OrderDetail',
  ],

  controller: 'blotter',
  viewModel: { type: 'blotter' },

  cls: 'mrd-ext mrd-blotter',
  border: false,
  bodyBorder: false,
  layout: 'border',

  dockedItems: [
    {
      xtype: 'toolbar',
      dock: 'top',
      cls: 'mrd-pagebar',
      items: [
        {
          xtype: 'component',
          cls: 'mrd-pagebar__title',
          html: '<h1>Orders</h1><span class="mrd-tech" title="This page is a Sencha Ext JS application loaded through Module Federation">Ext JS 6.2 &middot; federated remote</span>',
        },
        { xtype: 'tbfill' },
        { xtype: 'component', cls: 'mrd-pagebar__live', bind: { html: '{liveHtml}' } },
        {
          xtype: 'button',
          cls: 'mrd-btn-icon',
          iconCls: 'mrd-icon mrd-icon-refresh',
          tooltip: 'Reload orders',
          ariaLabel: 'Reload orders',
          handler: 'onRefresh',
        },
        {
          xtype: 'button',
          cls: 'mrd-btn-text',
          iconCls: 'mrd-icon mrd-icon-download',
          text: 'Export CSV',
          handler: 'onExport',
        },
        {
          xtype: 'button',
          cls: 'mrd-btn-filled',
          iconCls: 'mrd-icon mrd-icon-add',
          text: 'New order',
          handler: 'onNewOrder',
          hidden: true,
          bind: { hidden: '{!canCreate}' },
        },
      ],
    },
    {
      xtype: 'toolbar',
      dock: 'top',
      cls: 'mrd-filterbar',
      items: [
        {
          xtype: 'segmentedbutton',
          cls: 'mrd-segmented',
          value: 'all',
          bind: { value: '{statusFilter}' },
          listeners: { change: 'onStatusFilterChange' },
          defaults: { cls: 'mrd-segmented__item' },
          items: [
            { value: 'all', bind: { text: 'All <span class="mrd-count">{counts.all}</span>' } },
            {
              value: 'approval',
              bind: { text: 'Needs approval <span class="mrd-count">{counts.approval}</span>' },
            },
            {
              value: 'ready',
              bind: { text: 'Ready to route <span class="mrd-count">{counts.ready}</span>' },
            },
            {
              value: 'working',
              bind: { text: 'Working <span class="mrd-count">{counts.working}</span>' },
            },
            {
              value: 'closed',
              bind: { text: 'Closed <span class="mrd-count">{counts.closed}</span>' },
            },
          ],
        },
        { xtype: 'tbspacer', width: 8 },
        { xtype: 'component', cls: 'mrd-scope-wrap', bind: { html: '{portfolioScopeHtml}' } },
        {
          xtype: 'button',
          cls: 'mrd-btn-text mrd-btn-dense',
          text: 'Show all',
          handler: 'onClearScope',
          hidden: true,
          bind: { hidden: '{!activePortfolioId}' },
        },
        { xtype: 'tbfill' },
        {
          xtype: 'combobox',
          cls: 'mrd-field mrd-groupby',
          fieldLabel: 'Group by',
          labelWidth: 60,
          width: 186,
          editable: false,
          forceSelection: true,
          queryMode: 'local',
          displayField: 'label',
          valueField: 'value',
          value: 'statusGroup',
          store: {
            fields: ['value', 'label'],
            data: [
              { value: 'statusGroup', label: 'Status' },
              { value: 'portfolioName', label: 'Portfolio' },
              { value: 'symbol', label: 'Security' },
              { value: 'side', label: 'Side' },
              { value: 'none', label: 'None' },
            ],
          },
          listConfig: { cls: 'mrd-ext mrd-boundlist' },
          listeners: { change: 'onGroupByChange' },
        },
        {
          xtype: 'textfield',
          reference: 'search',
          cls: 'mrd-field mrd-search mrd-icon-search',
          emptyText: 'Search ID, security, portfolio',
          ariaLabel: 'Search orders',
          width: 220,
          triggers: {
            clear: {
              cls: 'mrd-trigger-clear mrd-icon-close',
              hidden: true,
              handler: 'onSearchClear',
            },
          },
          listeners: { change: { fn: 'onSearchChange', buffer: 150 } },
        },
      ],
    },
  ],

  items: [
    {
      region: 'center',
      xtype: 'grid',
      reference: 'ordersGrid',
      cls: 'mrd-grid',
      border: false,
      rowLines: true,
      columnLines: false,
      bind: { store: '{orders}', selection: '{selectedOrder}' },
      features: [
        {
          ftype: 'grouping',
          enableGroupingMenu: false,
          startCollapsed: false,
          groupHeaderTpl: [
            '<span class="mrd-group">{[this.label(values.groupValue, values.groupField)]}<span class="mrd-group__count">{rows.length}</span></span>',
            {
              // Groups are status buckets (rank-prefixed), the order side, or a name.
              label: function (value, field) {
                var text = groupLabel(value, field);
                return Ext.String.htmlEncode(
                  text === 'BUY' ? 'Buy' : text === 'SELL' ? 'Sell' : text,
                );
              },
            },
          ],
        },
      ],
      viewConfig: {
        markDirty: false,
        stripeRows: false,
        deferEmptyText: false,
        emptyText:
          '<div class="mrd-empty"><span class="mrd-icon mrd-icon-receipt"></span><strong>No orders match</strong><span>Adjust the filters or search to see more orders.</span></div>',
      },
      columns: {
        // Header menu: sort + show/hide columns, like any desktop blotter.
        defaults: { menuDisabled: false },
        items: [
          {
            text: 'Status',
            dataIndex: 'status',
            width: 172,
            renderer: function (value) {
              return F.statusChip(value);
            },
          },
          {
            text: 'Order',
            dataIndex: 'id',
            width: 108,
            renderer: function (value) {
              return '<span class="mrd-mono">' + F.encode(value) + '</span>';
            },
          },
          {
            text: 'Time',
            dataIndex: 'createdAt',
            width: 88,
            tdCls: 'mrd-num',
            renderer: function (value) {
              return F.time(value);
            },
          },
          {
            text: 'Side',
            dataIndex: 'side',
            width: 76,
            renderer: function (value) {
              return F.sideTag(value);
            },
          },
          {
            text: 'Security',
            dataIndex: 'symbol',
            flex: 1,
            minWidth: 190,
            renderer: function (value, meta, record) {
              return (
                '<span class="mrd-symbol">' +
                F.encode(value) +
                '</span><span class="mrd-subtle">' +
                F.encode(record.get('securityName')) +
                '</span>'
              );
            },
          },
          {
            // Fund code keeps the blotter compact; the full name is a tooltip.
            text: 'Fund',
            dataIndex: 'portfolioId',
            width: 72,
            renderer: function (value, meta, record) {
              meta.tdAttr = 'data-qtip="' + F.encode(record.get('portfolioName')) + '"';
              return '<span class="mrd-mono">' + F.encode(value) + '</span>';
            },
          },
          {
            text: 'Quantity',
            dataIndex: 'quantity',
            width: 104,
            align: 'right',
            tdCls: 'mrd-num',
            renderer: function (value) {
              return F.quantity(value);
            },
          },
          {
            text: 'Filled',
            dataIndex: 'fillPercent',
            width: 128,
            renderer: function (value) {
              return F.progress(value);
            },
          },
          {
            text: 'Limit',
            dataIndex: 'limitPrice',
            width: 92,
            align: 'right',
            tdCls: 'mrd-num',
            renderer: function (value, meta, record) {
              return record.get('orderType') === 'MARKET'
                ? '<span class="mrd-subtle">Market</span>'
                : F.price(value);
            },
          },
          {
            text: 'Avg price',
            dataIndex: 'averageFillPrice',
            width: 96,
            hidden: true,
            align: 'right',
            tdCls: 'mrd-num',
            renderer: function (value) {
              return F.price(value);
            },
          },
          {
            text: 'Notional',
            dataIndex: 'estimatedNotional',
            width: 104,
            align: 'right',
            tdCls: 'mrd-num',
            renderer: function (value) {
              return F.money(value, true);
            },
          },
          {
            text: 'Compliance',
            dataIndex: 'complianceOutcome',
            width: 104,
            align: 'center',
            renderer: function (value, meta) {
              meta.tdAttr = 'data-qtip="' + F.complianceLabel(value) + '"';
              return F.complianceBadge(value);
            },
          },
          {
            text: 'Created by',
            dataIndex: 'createdByName',
            width: 136,
            hidden: true,
            renderer: function (value) {
              return F.encode(value);
            },
          },
          {
            xtype: 'actioncolumn',
            width: 52,
            align: 'center',
            sortable: false,
            menuDisabled: true,
            hideable: false,
            items: [
              {
                getClass: function (value, meta, record) {
                  return this.lookupController().rowActionClass(value, meta, record);
                },
                handler: 'onRowAction',
              },
            ],
          },
        ],
      },
      listeners: {
        selectionchange: 'onSelectionChange',
        itemdblclick: 'onItemDblClick',
        itemcontextmenu: 'onItemContextMenu',
      },
    },
    {
      region: 'east',
      xtype: 'blotter-orderdetail',
      reference: 'detail',
      width: 380,
      minWidth: 320,
      split: true,
      collapsible: true,
      // Collapsed until an order is selected, so the grid gets the full width.
      collapsed: true,
      animCollapse: false,
    },
  ],
});
