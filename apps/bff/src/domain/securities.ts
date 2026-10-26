import type { Security } from '@meridian/contracts';

export interface SecurityDefinition extends Security {
  /** Reference price used to seed the simulation (not real market data). */
  readonly basePrice: number;
  /** Annualised volatility used by the price simulator. */
  readonly volatility: number;
}

const eq = (
  symbol: string,
  name: string,
  sector: string,
  country: string,
  exchange: string,
  basePrice: number,
  volatility: number,
): SecurityDefinition => ({
  symbol,
  name,
  assetClass: 'Equity',
  sector,
  country,
  currency: 'USD',
  exchange,
  basePrice,
  volatility,
});

const etf = (
  symbol: string,
  name: string,
  sector: string,
  basePrice: number,
  volatility: number,
  assetClass: 'ETF' | 'Fixed Income' = 'ETF',
): SecurityDefinition => ({
  symbol,
  name,
  assetClass,
  sector,
  country: 'US',
  currency: 'USD',
  exchange: 'NYSE Arca',
  basePrice,
  volatility,
});

/** Security master (simulated prices - for demonstration only). */
export const SECURITIES: readonly SecurityDefinition[] = [
  eq('AAPL', 'Apple Inc.', 'Information Technology', 'US', 'NASDAQ', 228.4, 0.27),
  eq('MSFT', 'Microsoft Corp.', 'Information Technology', 'US', 'NASDAQ', 452.1, 0.24),
  eq('NVDA', 'NVIDIA Corp.', 'Information Technology', 'US', 'NASDAQ', 138.6, 0.48),
  eq('AVGO', 'Broadcom Inc.', 'Information Technology', 'US', 'NASDAQ', 186.3, 0.38),
  eq('ORCL', 'Oracle Corp.', 'Information Technology', 'US', 'NYSE', 182.2, 0.3),
  eq('CRM', 'Salesforce Inc.', 'Information Technology', 'US', 'NYSE', 312.5, 0.32),
  eq('ADBE', 'Adobe Inc.', 'Information Technology', 'US', 'NASDAQ', 512.8, 0.31),
  eq('ASML', 'ASML Holding N.V.', 'Information Technology', 'NL', 'NASDAQ', 812.4, 0.36),
  eq('SAP', 'SAP SE', 'Information Technology', 'DE', 'NYSE', 268.9, 0.26),
  eq('TSM', 'Taiwan Semiconductor', 'Information Technology', 'TW', 'NYSE', 196.2, 0.37),
  eq('GOOGL', 'Alphabet Inc.', 'Communication Services', 'US', 'NASDAQ', 182.7, 0.29),
  eq('META', 'Meta Platforms Inc.', 'Communication Services', 'US', 'NASDAQ', 584.3, 0.36),
  eq('NFLX', 'Netflix Inc.', 'Communication Services', 'US', 'NASDAQ', 742.1, 0.34),
  eq('DIS', 'Walt Disney Co.', 'Communication Services', 'US', 'NYSE', 112.4, 0.28),
  eq('AMZN', 'Amazon.com Inc.', 'Consumer Discretionary', 'US', 'NASDAQ', 206.5, 0.31),
  eq('TSLA', 'Tesla Inc.', 'Consumer Discretionary', 'US', 'NASDAQ', 248.2, 0.58),
  eq('HD', 'Home Depot Inc.', 'Consumer Discretionary', 'US', 'NYSE', 402.6, 0.22),
  eq('MCD', "McDonald's Corp.", 'Consumer Discretionary', 'US', 'NYSE', 296.3, 0.17),
  eq('NKE', 'Nike Inc.', 'Consumer Discretionary', 'US', 'NYSE', 82.4, 0.3),
  eq('SONY', 'Sony Group Corp.', 'Consumer Discretionary', 'JP', 'NYSE', 21.6, 0.29),
  eq('PG', 'Procter & Gamble Co.', 'Consumer Staples', 'US', 'NYSE', 168.2, 0.15),
  eq('KO', 'Coca-Cola Co.', 'Consumer Staples', 'US', 'NYSE', 68.3, 0.14),
  eq('PEP', 'PepsiCo Inc.', 'Consumer Staples', 'US', 'NASDAQ', 162.4, 0.16),
  eq('COST', 'Costco Wholesale Corp.', 'Consumer Staples', 'US', 'NASDAQ', 912.7, 0.2),
  eq('NSRGY', 'Nestle S.A.', 'Consumer Staples', 'CH', 'OTC', 98.1, 0.16),
  eq('JNJ', 'Johnson & Johnson', 'Health Care', 'US', 'NYSE', 158.3, 0.16),
  eq('UNH', 'UnitedHealth Group', 'Health Care', 'US', 'NYSE', 562.4, 0.24),
  eq('LLY', 'Eli Lilly & Co.', 'Health Care', 'US', 'NYSE', 862.5, 0.33),
  eq('PFE', 'Pfizer Inc.', 'Health Care', 'US', 'NYSE', 28.4, 0.25),
  eq('MRK', 'Merck & Co.', 'Health Care', 'US', 'NYSE', 102.2, 0.21),
  eq('NVO', 'Novo Nordisk A/S', 'Health Care', 'DK', 'NYSE', 108.6, 0.32),
  eq('JPM', 'JPMorgan Chase & Co.', 'Financials', 'US', 'NYSE', 226.1, 0.22),
  eq('V', 'Visa Inc.', 'Financials', 'US', 'NYSE', 302.4, 0.19),
  eq('MA', 'Mastercard Inc.', 'Financials', 'US', 'NYSE', 518.2, 0.2),
  eq('BAC', 'Bank of America Corp.', 'Financials', 'US', 'NYSE', 42.3, 0.27),
  eq('GS', 'Goldman Sachs Group', 'Financials', 'US', 'NYSE', 532.6, 0.26),
  eq('HSBC', 'HSBC Holdings plc', 'Financials', 'GB', 'NYSE', 46.2, 0.22),
  eq('XOM', 'Exxon Mobil Corp.', 'Energy', 'US', 'NYSE', 118.4, 0.24),
  eq('CVX', 'Chevron Corp.', 'Energy', 'US', 'NYSE', 152.7, 0.23),
  eq('SHEL', 'Shell plc', 'Energy', 'GB', 'NYSE', 68.2, 0.22),
  eq('CAT', 'Caterpillar Inc.', 'Industrials', 'US', 'NYSE', 382.4, 0.27),
  eq('HON', 'Honeywell International', 'Industrials', 'US', 'NASDAQ', 218.3, 0.19),
  eq('GE', 'GE Aerospace', 'Industrials', 'US', 'NYSE', 186.2, 0.29),
  eq('NEE', 'NextEra Energy Inc.', 'Utilities', 'US', 'NYSE', 78.4, 0.21),
  eq('LIN', 'Linde plc', 'Materials', 'GB', 'NASDAQ', 462.3, 0.18),
  eq('PLD', 'Prologis Inc.', 'Real Estate', 'US', 'NYSE', 118.6, 0.26),
  etf('SPY', 'SPDR S&P 500 ETF Trust', 'Broad Market', 582.4, 0.16),
  etf('QQQ', 'Invesco QQQ Trust', 'Broad Market', 498.2, 0.21),
  etf('EFA', 'iShares MSCI EAFE ETF', 'International', 82.3, 0.15),
  etf('AGG', 'iShares Core US Aggregate Bond', 'Aggregate Bonds', 99.1, 0.06, 'Fixed Income'),
  etf('TLT', 'iShares 20+ Year Treasury Bond', 'Government Bonds', 94.2, 0.14, 'Fixed Income'),
  etf('LQD', 'iShares iBoxx IG Corporate Bond', 'Corporate Bonds', 110.4, 0.08, 'Fixed Income'),
];

const bySymbol = new Map(SECURITIES.map((security) => [security.symbol, security]));

export function getSecurity(symbol: string): SecurityDefinition | undefined {
  return bySymbol.get(symbol.toUpperCase());
}

export function toSecurity({
  basePrice: _price,
  volatility: _vol,
  ...security
}: SecurityDefinition): Security {
  return security;
}
