import type { OrderDraft } from '@meridian/contracts';

/**
 * Price used to assess an order before execution. A LIMIT order is valued at
 * the worse of its limit and the market, so a far-off limit cannot understate
 * notional or concentration: a SELL limited at 0.01 still executes at market,
 * and must face the same pre-trade controls as a market order.
 */
export function referencePrice(
  draft: Pick<OrderDraft, 'orderType' | 'limitPrice'>,
  lastPrice: number,
): number {
  return draft.orderType === 'LIMIT' && draft.limitPrice
    ? Math.max(draft.limitPrice, lastPrice)
    : lastPrice;
}
