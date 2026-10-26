import { STATUS_META } from '../util/Format.js';

var toDate = function (value) {
  return value ? new Date(value) : null;
};

/** Order record - mirrors `Order` from @meridian/contracts. */
Ext.define('Blotter.model.Order', {
  extend: 'Ext.data.Model',
  idProperty: 'id',

  fields: [
    { name: 'id', type: 'string' },
    { name: 'portfolioId', type: 'string' },
    { name: 'portfolioName', type: 'string' },
    { name: 'symbol', type: 'string' },
    { name: 'securityName', type: 'string' },
    { name: 'side', type: 'string' },
    { name: 'quantity', type: 'number' },
    { name: 'orderType', type: 'string' },
    { name: 'limitPrice', type: 'number', allowNull: true },
    { name: 'timeInForce', type: 'string' },
    { name: 'status', type: 'string' },
    { name: 'filledQuantity', type: 'number' },
    { name: 'averageFillPrice', type: 'number', allowNull: true },
    { name: 'estimatedNotional', type: 'number' },
    { name: 'createdAt', type: 'date', convert: toDate },
    { name: 'updatedAt', type: 'date', convert: toDate },
    { name: 'createdBy', type: 'auto' },
    { name: 'approvedBy', type: 'auto' },
    { name: 'routedBy', type: 'auto' },
    { name: 'compliance', type: 'auto' },
    { name: 'rationale', type: 'string', allowNull: true },
    { name: 'fills', type: 'auto' },
    {
      name: 'fillPercent',
      type: 'number',
      depends: ['filledQuantity', 'quantity'],
      calculate: function (data) {
        return data.quantity ? (data.filledQuantity / data.quantity) * 100 : 0;
      },
    },
    {
      name: 'statusGroup',
      type: 'string',
      depends: ['status'],
      calculate: function (data) {
        return (STATUS_META[data.status] || { group: '9 Other' }).group;
      },
    },
    {
      name: 'statusBucket',
      type: 'string',
      depends: ['status'],
      calculate: function (data) {
        return (STATUS_META[data.status] || { bucket: 'closed' }).bucket;
      },
    },
    {
      name: 'createdByName',
      type: 'string',
      depends: ['createdBy'],
      calculate: function (data) {
        return data.createdBy ? data.createdBy.name : '';
      },
    },
    {
      name: 'complianceOutcome',
      type: 'string',
      depends: ['compliance'],
      calculate: function (data) {
        return data.compliance ? data.compliance.outcome : 'PASS';
      },
    },
  ],
});
