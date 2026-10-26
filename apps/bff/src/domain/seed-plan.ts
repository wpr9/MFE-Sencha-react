import type { OrderSide, OrderStatus } from '@meridian/contracts';

/** One order of the seeded trading day and the state it should have reached. */
export interface SeedOrder {
  portfolioId: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  limit?: boolean;
  target: OrderStatus;
}

/** A trading day already in progress: what the blotter shows at start-up. Data only. */
export const SEED_PLAN: readonly SeedOrder[] = [
  { portfolioId: 'GEQ', symbol: 'MSFT', side: 'BUY', quantity: 12_000, target: 'FILLED' },
  {
    portfolioId: 'GEQ',
    symbol: 'LLY',
    side: 'BUY',
    quantity: 6_500,
    limit: true,
    target: 'FILLED',
  },
  { portfolioId: 'USV', symbol: 'JPM', side: 'SELL', quantity: 18_000, target: 'FILLED' },
  { portfolioId: 'TEC', symbol: 'AVGO', side: 'BUY', quantity: 25_000, target: 'FILLED' },
  { portfolioId: 'MAB', symbol: 'AGG', side: 'BUY', quantity: 95_000, target: 'FILLED' },
  {
    portfolioId: 'ESG',
    symbol: 'NEE',
    side: 'BUY',
    quantity: 40_000,
    limit: true,
    target: 'FILLED',
  },
  { portfolioId: 'USV', symbol: 'CVX', side: 'SELL', quantity: 22_000, target: 'FILLED' },
  {
    portfolioId: 'MAB',
    symbol: 'TLT',
    side: 'SELL',
    quantity: 60_000,
    target: 'PARTIALLY_FILLED',
  },
  {
    portfolioId: 'GEQ',
    symbol: 'ASML',
    side: 'BUY',
    quantity: 9_000,
    limit: true,
    target: 'PARTIALLY_FILLED',
  },
  { portfolioId: 'TEC', symbol: 'ORCL', side: 'BUY', quantity: 30_000, target: 'WORKING' },
  {
    portfolioId: 'USV',
    symbol: 'PG',
    side: 'BUY',
    quantity: 14_000,
    limit: true,
    target: 'WORKING',
  },
  { portfolioId: 'ESG', symbol: 'SAP', side: 'BUY', quantity: 8_000, target: 'WORKING' },
  { portfolioId: 'GEQ', symbol: 'V', side: 'BUY', quantity: 7_500, target: 'NEW' },
  {
    portfolioId: 'MAB',
    symbol: 'SPY',
    side: 'BUY',
    quantity: 20_000,
    limit: true,
    target: 'NEW',
  },
  { portfolioId: 'USV', symbol: 'HON', side: 'SELL', quantity: 9_000, target: 'NEW' },
  {
    portfolioId: 'TEC',
    symbol: 'CRM',
    side: 'SELL',
    quantity: 11_000,
    limit: true,
    target: 'NEW',
  },
  {
    portfolioId: 'TEC',
    symbol: 'NVDA',
    side: 'BUY',
    quantity: 160_000,
    target: 'PENDING_APPROVAL',
  },
  {
    portfolioId: 'GEQ',
    symbol: 'MSFT',
    side: 'BUY',
    quantity: 72_000,
    target: 'PENDING_APPROVAL',
  },
  {
    portfolioId: 'MAB',
    symbol: 'QQQ',
    side: 'BUY',
    quantity: 58_000,
    target: 'PENDING_APPROVAL',
  },
  { portfolioId: 'USV', symbol: 'KO', side: 'BUY', quantity: 30_000, target: 'CANCELLED' },
  { portfolioId: 'ESG', symbol: 'ADBE', side: 'SELL', quantity: 4_000, target: 'CANCELLED' },
  {
    portfolioId: 'GEQ',
    symbol: 'META',
    side: 'BUY',
    quantity: 5_000,
    limit: true,
    target: 'NEW',
  },
];
