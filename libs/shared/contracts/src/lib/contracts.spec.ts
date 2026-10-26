import { describe, expect, it } from 'vitest';
import { isPortfolioEntitled } from './authorization';
import { OrderDraftSchema } from './domain';
import { STREAM_EVENT_TYPES, StreamEventSchema } from './messaging';
import { isRemoteModule, satisfiesContract } from './remote';

describe('satisfiesContract', () => {
  it.each([
    ['^1.0.0', '1.0.0', true],
    ['^1.0.0', '1.4.2', true],
    ['^1.2.3', '1.2.3', true],
    ['^1.2.3', '1.2.2', false],
    ['^1.2.0', '1.1.9', false],
    ['^1.0.0', '2.0.0', false],
    ['^2.0.0', '1.9.9', false],
    ['1.0.0', '1.0.0', false],
    ['^x', '1.0.0', false],
  ])('range %s against host %s -> %s', (range, version, expected) => {
    expect(satisfiesContract(range, version)).toBe(expected);
  });
});

describe('OrderDraftSchema', () => {
  const draft = {
    portfolioId: 'GEQ',
    symbol: 'AAPL',
    side: 'BUY',
    quantity: 100,
    orderType: 'LIMIT',
    limitPrice: 190.5,
    timeInForce: 'DAY',
    rationale: null,
  } as const;

  it('accepts a valid limit order', () => {
    expect(OrderDraftSchema.parse(draft)).toEqual(draft);
  });

  it('requires a limit price for limit orders', () => {
    const result = OrderDraftSchema.safeParse({ ...draft, limitPrice: null });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['limitPrice']);
  });

  it('rejects fractional and non-positive quantities', () => {
    expect(OrderDraftSchema.safeParse({ ...draft, quantity: 10.5 }).success).toBe(false);
    expect(OrderDraftSchema.safeParse({ ...draft, quantity: 0 }).success).toBe(false);
  });
});

describe('StreamEventSchema', () => {
  it('enumerates every event type for SSE listeners', () => {
    expect(STREAM_EVENT_TYPES).toContain('quotes');
    expect(STREAM_EVENT_TYPES).toContain('order.updated');
    expect(new Set(STREAM_EVENT_TYPES).size).toBe(STREAM_EVENT_TYPES.length);
  });

  it('rejects unknown event types', () => {
    expect(StreamEventSchema.safeParse({ type: 'nope' }).success).toBe(false);
  });
});

describe('entitlements and module guards', () => {
  it('evaluates portfolio entitlements', () => {
    expect(isPortfolioEntitled({ all: true }, 'ANY')).toBe(true);
    expect(isPortfolioEntitled({ all: false, ids: ['GEQ'] }, 'GEQ')).toBe(true);
    expect(isPortfolioEntitled({ all: false, ids: ['GEQ'] }, 'TEC')).toBe(false);
  });

  it('recognises lifecycle modules', () => {
    expect(
      isRemoteModule({ hostContract: '^1.0.0', mount: () => ({ unmount: () => undefined }) }),
    ).toBe(true);
    expect(isRemoteModule({ default: {} })).toBe(false);
    expect(isRemoteModule(null)).toBe(false);
  });
});
