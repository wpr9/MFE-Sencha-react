import { formatCurrency, formatDateTime, formatPrice, formatQuantity } from '@meridian/formatting';

/**
 * Status vocabulary for the blotter: label, tone (status token), icon and
 * the bucket used by the segmented filter and the default grouping. Group keys
 * are prefixed with a rank so Ext's string sort orders the groups by workflow.
 */
export const STATUS_META = {
  PENDING_APPROVAL: {
    label: 'Pending approval',
    tone: 'warning',
    icon: 'pending',
    group: '1 Needs approval',
    bucket: 'approval',
  },
  NEW: {
    label: 'Ready to route',
    tone: 'info',
    icon: 'new',
    group: '2 Ready to route',
    bucket: 'ready',
  },
  WORKING: {
    label: 'Working',
    tone: 'info',
    icon: 'working',
    group: '3 Working',
    bucket: 'working',
  },
  PARTIALLY_FILLED: {
    label: 'Partially filled',
    tone: 'info',
    icon: 'partial',
    group: '3 Working',
    bucket: 'working',
  },
  FILLED: { label: 'Filled', tone: 'success', icon: 'filled', group: '4 Closed', bucket: 'closed' },
  CANCELLED: {
    label: 'Cancelled',
    tone: 'neutral',
    icon: 'cancelled',
    group: '4 Closed',
    bucket: 'closed',
  },
  REJECTED: {
    label: 'Rejected',
    tone: 'error',
    icon: 'rejected',
    group: '4 Closed',
    bucket: 'closed',
  },
};

export const TERMINAL = ['FILLED', 'CANCELLED', 'REJECTED'];

const COMPLIANCE_META = {
  PASS: { tone: 'success', icon: 'pass', label: 'All rules passed' },
  WARN: { tone: 'warning', icon: 'warning', label: 'Approval required' },
  FAIL: { tone: 'error', icon: 'error', label: 'Hard breach' },
};

/** Strips the rank prefix from a `STATUS_META.group` key ("1 Needs approval" -> "Needs approval"). */
export function groupLabel(value) {
  var text = String(value === null || value === undefined ? '' : value);
  return /^\d /.test(text) ? text.substring(2) : text;
}

/**
 * Cell renderers and HTML snippets shared by the blotter views. Numbers,
 * dates and money go through `@meridian/formatting`, the same functions the
 * React remotes use, so a value looks identical in Ext JS and React.
 */
Ext.define('Blotter.util.Format', {
  singleton: true,

  /** Set from `host.state.locale` by HostViewController.followAppearance; grids re-render on change. */
  locale: 'en-US',

  encode: function (value) {
    return Ext.String.htmlEncode(value === null || value === undefined ? '' : String(value));
  },

  quantity: function (value) {
    return formatQuantity(value, { locale: this.locale });
  },

  price: function (value) {
    return formatPrice(value, { locale: this.locale });
  },

  money: function (value, compact) {
    return formatCurrency(value, { locale: this.locale, compact: !!compact });
  },

  time: function (value) {
    return formatDateTime(value, { locale: this.locale, style: 'time' });
  },

  dateTime: function (value) {
    return formatDateTime(value, { locale: this.locale, style: 'medium' });
  },

  icon: function (name) {
    return '<span class="mrd-icon mrd-icon-' + name + '" aria-hidden="true"></span>';
  },

  statusChip: function (status) {
    var meta = STATUS_META[status] || { label: status, tone: 'neutral', icon: 'info' };
    return (
      '<span class="mrd-chip mrd-chip--' +
      meta.tone +
      '">' +
      this.icon(meta.icon) +
      meta.label +
      '</span>'
    );
  },

  sideTag: function (side) {
    return (
      '<span class="mrd-side mrd-side--' +
      String(side).toLowerCase() +
      '">' +
      (side === 'BUY' ? 'Buy' : 'Sell') +
      '</span>'
    );
  },

  complianceBadge: function (outcome, withLabel) {
    var meta = COMPLIANCE_META[outcome] || COMPLIANCE_META.PASS;
    return (
      '<span class="mrd-compliance mrd-compliance--' +
      meta.tone +
      '">' +
      this.icon(meta.icon) +
      (withLabel ? '<span>' + meta.label + '</span>' : '') +
      '</span>'
    );
  },

  complianceLabel: function (outcome) {
    return (COMPLIANCE_META[outcome] || COMPLIANCE_META.PASS).label;
  },

  progress: function (percent) {
    var clamped = Math.max(0, Math.min(100, percent || 0));
    return (
      '<span class="mrd-fill"><span class="mrd-fill__track"><span class="mrd-fill__bar" style="width:' +
      clamped.toFixed(1) +
      '%"></span></span><span class="mrd-fill__label">' +
      Math.round(clamped) +
      '%</span></span>'
    );
  },
});
