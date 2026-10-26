/** How long the object URL stays alive after the download starts; browsers read it synchronously. */
var REVOKE_DELAY_MS = 1000;

/** CSV export of Ext records, RFC 4180 quoting, downloaded through a transient object URL. */
Ext.define('Blotter.util.Csv', {
  singleton: true,

  escape: function (value) {
    var text =
      value instanceof Date
        ? value.toISOString()
        : value === null || value === undefined
          ? ''
          : String(value);
    return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  },

  /** Builds the CSV for `columns` (field names, used as headers) over `store`'s records. */
  render: function (store, columns) {
    var me = this;
    var lines = [columns.join(',')];
    store.each(function (record) {
      lines.push(
        columns
          .map(function (column) {
            return me.escape(record.get(column));
          })
          .join(','),
      );
    });
    return lines.join('\n');
  },

  download: function (csv, filename) {
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    Ext.defer(function () {
      URL.revokeObjectURL(link.href);
    }, REVOKE_DELAY_MS);
  },
});
