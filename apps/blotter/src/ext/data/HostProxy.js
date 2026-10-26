/**
 * Ext data proxy backed by the platform's HTTP client (`host.http`).
 *
 * Stores keep their idiomatic Sencha configuration (`proxy: { type: 'meridian' }`),
 * while the transport inherits every cross-cutting concern owned by the shell:
 * session cookie, CSRF, W3C trace context, caller attribution, timeouts,
 * RFC 9457 errors and central 401 handling. This is the seam that lets a
 * legacy Ext data layer join the platform without being rewritten.
 */
Ext.define('Blotter.data.HostProxy', {
  extend: 'Ext.data.proxy.Server',
  alias: 'proxy.meridian',

  config: {
    /** Scoped Host API of the mounting remote. */
    host: null,
    /** API path relative to `host.env.apiBaseUrl`. */
    path: '',
    /** Extra query parameters. */
    query: null,
  },

  url: 'meridian://host-http',

  /** The in-flight read; a newer read supersedes (and cancels) it. */
  pending: null,

  doRequest: function (operation) {
    var me = this;
    var request = me.buildRequest(operation);
    var host = me.getHost();
    var path = me.getPath();

    // Ext stores apply whichever response arrives last: cancel the superseded
    // read so a slow, stale response can never overwrite a newer one.
    if (me.pending) me.pending.abort();
    var controller = new AbortController();
    me.pending = controller;
    var current = function () {
      return !me.destroyed && me.pending === controller;
    };

    host.http.get(path, { query: me.getQuery() || undefined, signal: controller.signal }).then(
      function (data) {
        if (!current()) return;
        me.pending = null;
        try {
          me.processResponse(true, operation, request, {
            status: 200,
            responseText: JSON.stringify(data),
          });
        } catch (error) {
          // A throwing renderer or load listener must not be reported as a failed
          // load (and must not run the operation's callbacks a second time).
          host.telemetry.error(error, { kind: 'ext-load-callback', path: path });
        }
      },
      function (error) {
        if (!current()) return; // superseded or destroyed: nobody is waiting for it
        me.pending = null;
        var detail =
          (error && error.problem && error.problem.detail) ||
          (error && error.message) ||
          'Request failed';
        me.processResponse(false, operation, request, {
          status: (error && error.status) || 0,
          statusText: detail,
          responseText: '',
        });
      },
    );

    return request;
  },

  destroy: function () {
    if (this.pending) this.pending.abort();
    this.pending = null;
    // Not this.callParent(): this file is an ES module (strict mode) and Ext 6's callParent
    // resolves the caller via Function.caller, which is null for strict callers.
    Ext.data.proxy.Server.prototype.destroy.call(this);
  },
});
