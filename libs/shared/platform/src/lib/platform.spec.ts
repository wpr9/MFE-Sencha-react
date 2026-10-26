import type { Quote, Session } from '@meridian/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEventBus } from './event-bus';
import { ContractError, HttpError, createHttpClient } from './http';
import { createHostStore, toHostStateApi } from './host-store';
import { IntentNotHandledError, createIntentRegistry } from './intents';
import { createMarketDataService } from './market-data';
import { createRealtimeConnection } from './realtime';
import { createSessionManager } from './session';

const order = { id: 'ORD-1' } as never;

describe('event bus', () => {
  it('delivers typed events with source attribution', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.forSource('blotter').subscribe('order.focused', handler);
    bus
      .forSource('portfolio')
      .publish('order.focused', { orderId: 'ORD-1', portfolioId: 'GEQ', symbol: 'AAPL' });
    expect(handler).toHaveBeenCalledWith(
      { orderId: 'ORD-1', portfolioId: 'GEQ', symbol: 'AAPL' },
      expect.objectContaining({ topic: 'order.focused', source: 'portfolio' }),
    );
  });

  it('isolates failing subscribers', () => {
    const onHandlerError = vi.fn();
    const bus = createEventBus({ onHandlerError });
    const healthy = vi.fn();
    bus.forSource('a').subscribe('order.created', () => {
      throw new Error('boom');
    });
    bus.forSource('b').subscribe('order.created', healthy);
    bus.publish('server', 'order.created', { order });
    expect(healthy).toHaveBeenCalledOnce();
    expect(onHandlerError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ topic: 'order.created' }),
    );
  });

  it('tolerates unsubscribing during dispatch and caps history', () => {
    const bus = createEventBus({ historySize: 2 });
    const second = vi.fn();
    const unsubscribeFirst = bus
      .forSource('x')
      .subscribe('order.created', () => unsubscribeFirst());
    bus.forSource('y').subscribe('order.created', second);
    bus.publish('server', 'order.created', { order });
    bus.publish('server', 'order.created', { order });
    bus.publish('server', 'order.created', { order });
    expect(second).toHaveBeenCalledTimes(3);
    expect(bus.history()).toHaveLength(2);
  });
});

describe('http client', () => {
  const json = (body: unknown, init: ResponseInit = {}) =>
    new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json' },
      ...init,
    });

  it('sends CSRF only on unsafe methods and always propagates trace context', async () => {
    const fetchMock = vi.fn(async () => json({ ok: true }));
    const http = createHttpClient({
      baseUrl: '/api',
      clientName: 'portfolio',
      getCsrfToken: () => 'csrf-token-value-123',
      onUnauthorized: vi.fn(),
      fetch: fetchMock as unknown as typeof fetch,
    });
    await http.get('/orders', { query: { status: 'NEW', empty: '', none: undefined } });
    await http.post('/orders', { a: 1 });
    const [[getUrl, getInit], [, postInit]] = fetchMock.mock.calls as unknown as [
      [string, RequestInit],
      [string, RequestInit],
    ];
    expect(getUrl).toBe('/api/orders?status=NEW');
    expect(getInit.headers).not.toHaveProperty('x-csrf-token');
    expect((getInit.headers as Record<string, string>)['traceparent']).toMatch(
      /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/,
    );
    expect(postInit.headers).toMatchObject({
      'x-csrf-token': 'csrf-token-value-123',
      'x-meridian-client': 'portfolio',
    });
  });

  it('maps problem+json errors and reports 401s', async () => {
    const onUnauthorized = vi.fn();
    const problem = {
      type: 'about:blank',
      title: 'Unauthorized',
      status: 401,
      detail: 'Session expired',
    };
    const http = createHttpClient({
      baseUrl: '/api',
      clientName: 'shell',
      getCsrfToken: () => undefined,
      onUnauthorized,
      fetch: (async () =>
        new Response(JSON.stringify(problem), {
          status: 401,
          headers: { 'content-type': 'application/problem+json' },
        })) as unknown as typeof fetch,
    });
    const error = await http.get('/portfolios').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).problem.detail).toBe('Session expired');
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('validates responses with a parser', async () => {
    const http = createHttpClient({
      baseUrl: '/api',
      clientName: 'shell',
      getCsrfToken: () => undefined,
      onUnauthorized: vi.fn(),
      fetch: (async () => json({ unexpected: true })) as unknown as typeof fetch,
    });
    const parser = {
      parse: (data: unknown) => {
        if (!(data as { id?: string }).id) throw new Error('missing id');
        return data;
      },
    };
    await expect(http.get('/x', { parser })).rejects.toBeInstanceOf(ContractError);
  });
});

describe('market data', () => {
  const quote = (symbol: string, last: number, timestamp = '2026-01-01T10:00:00.000Z'): Quote => ({
    symbol,
    last,
    bid: last - 0.01,
    ask: last + 0.01,
    open: last,
    previousClose: last,
    change: 0,
    changePercent: 0,
    dayHigh: last,
    dayLow: last,
    volume: 0,
    timestamp,
  });

  it('coalesces ticks per frame and filters by symbol', () => {
    let flush: (() => void) | undefined;
    const service = createMarketDataService({ schedule: (fn) => (flush = fn) });
    const aapl = vi.fn();
    const all = vi.fn();
    service.api.subscribe(['AAPL'], aapl);
    service.api.subscribe('*', all);
    service.ingest([quote('AAPL', 1), quote('MSFT', 2)]);
    service.ingest([quote('AAPL', 3, '2026-01-01T10:00:01.000Z')]);
    expect(aapl).not.toHaveBeenCalled();
    flush?.();
    expect(aapl).toHaveBeenCalledOnce();
    expect([...(aapl.mock.calls[0]?.[0] as Map<string, Quote>).keys()]).toEqual(['AAPL']);
    expect((all.mock.calls[0]?.[0] as Map<string, Quote>).size).toBe(2);
    expect(service.api.getQuote('AAPL')?.last).toBe(3);
  });

  it('drops out-of-order quotes', () => {
    const service = createMarketDataService({ schedule: () => undefined });
    service.ingest([quote('AAPL', 5, '2026-01-01T10:00:05.000Z')]);
    service.ingest([quote('AAPL', 4, '2026-01-01T10:00:01.000Z')]);
    expect(service.api.getQuote('AAPL')?.last).toBe(5);
  });
});

describe('intents', () => {
  it('routes to the registered handler with the dispatching source', async () => {
    const registry = createIntentRegistry();
    const handler = vi.fn();
    registry.register('trade.ticket.open', handler);
    await registry.forSource('portfolio').dispatch('trade.ticket.open', { symbol: 'AAPL' });
    expect(handler).toHaveBeenCalledWith({ symbol: 'AAPL' }, { source: 'portfolio' });
  });

  it('rejects unhandled intents', async () => {
    const registry = createIntentRegistry();
    await expect(registry.dispatch('order.open', { orderId: '1' }, 'x')).rejects.toBeInstanceOf(
      IntentNotHandledError,
    );
  });
});

describe('host state facade', () => {
  it('exposes stable snapshots and persists preferences', () => {
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn() };
    const store = createHostStore({ storageKey: 'k', storage, prefersDark: () => false });
    const api = toHostStateApi(store);
    const first = api.getSnapshot();
    expect(api.getSnapshot()).toBe(first);
    const listener = vi.fn();
    api.subscribe(listener);
    api.setActivePortfolio('GEQ');
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ activePortfolioId: 'GEQ' }),
      first,
    );
    api.setActivePortfolio('GEQ');
    expect(listener).toHaveBeenCalledOnce();
    expect(storage.setItem).toHaveBeenCalledWith(
      'k',
      expect.stringContaining('"activePortfolioId":"GEQ"'),
    );
    expect(Object.isFrozen(api.getSnapshot())).toBe(true);
  });
});

describe('session manager', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const makeSession = (expiresInMs: number): Session => ({
    user: {
      id: 'u1',
      name: 'Alex',
      email: 'alex@meridian.example',
      title: 'PM',
      initials: 'AM',
      avatarColor: '#000',
    },
    roles: ['portfolio-manager'],
    permissions: ['portfolio:read'],
    entitlements: { portfolios: { all: true } },
    flags: {},
    csrfToken: 'csrf-token-value-123',
    issuedAt: new Date(Date.now()).toISOString(),
    expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
    absoluteExpiresAt: new Date(Date.now() + 8 * 3_600_000).toISOString(),
    idleTimeoutSeconds: 900,
    authMode: 'mock',
  });

  it('warns before idle expiry, then expires', () => {
    const manager = createSessionManager({
      initialSession: makeSession(90_000),
      fetch: vi.fn() as never,
      warningLeadMs: 60_000,
    });
    expect(manager.getState().phase).toBe('active');
    vi.advanceTimersByTime(31_000);
    expect(manager.getState().phase).toBe('expiring');
    vi.advanceTimersByTime(60_000);
    expect(manager.getState().phase).toBe('expired');
    manager.dispose();
  });

  it('renews the session on keep-alive', async () => {
    const renewed = makeSession(15 * 60_000);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(renewed), { status: 200 }));
    const manager = createSessionManager({
      initialSession: makeSession(30_000),
      fetch: fetchMock as never,
    });
    vi.advanceTimersByTime(1_000);
    expect(manager.getState().phase).toBe('expiring');
    await manager.keepAlive();
    expect(manager.getState().phase).toBe('active');
    expect(fetchMock).toHaveBeenCalledWith(
      '/auth/session/keep-alive',
      expect.objectContaining({ method: 'POST' }),
    );
    manager.dispose();
  });
});

describe('realtime connection', () => {
  class FakeEventSource {
    static instances: FakeEventSource[] = [];
    readyState = 0;
    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;
    listeners = new Map<string, (event: MessageEvent<string>) => void>();
    constructor(readonly url: string) {
      FakeEventSource.instances.push(this);
    }
    addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
      this.listeners.set(type, listener);
    }
    close() {
      this.readyState = 2;
    }
    emit(type: string, data: unknown, lastEventId = '') {
      this.listeners.get(type)?.({
        type,
        data: JSON.stringify(data),
        lastEventId,
      } as MessageEvent<string>);
    }
  }

  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
  });
  afterEach(() => vi.useRealTimers());

  it('parses events, then resumes from the last event id after a hard failure', () => {
    const onEvent = vi.fn();
    const onInvalidEvent = vi.fn();
    const connection = createRealtimeConnection({
      url: '/api/stream',
      onEvent,
      onInvalidEvent,
      createEventSource: (url) => new FakeEventSource(url) as unknown as EventSource,
      random: () => 1,
    });
    connection.start();
    const first = FakeEventSource.instances[0]!;
    first.onopen?.();
    expect(connection.getStatus()).toBe('open');

    first.emit(
      'portfolio.changed',
      { type: 'portfolio.changed', portfolioId: 'GEQ', reason: 'fill' },
      '41',
    );
    expect(onEvent).toHaveBeenCalledWith({
      type: 'portfolio.changed',
      portfolioId: 'GEQ',
      reason: 'fill',
    });
    first.emit('quotes', { type: 'quotes', quotes: 'not-an-array' });
    expect(onInvalidEvent).toHaveBeenCalledOnce();

    first.readyState = 2;
    first.onerror?.();
    expect(connection.getStatus()).toBe('reconnecting');
    vi.advanceTimersByTime(1_000);
    expect(FakeEventSource.instances[1]?.url).toBe('/api/stream?lastEventId=41');
    connection.stop();
  });
});
