import { describe, expect, it } from 'vitest';
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatPrice,
  formatQuantity,
  formatRelativeTime,
  formatSignedPercent,
  trendOf,
} from './formatters';

describe('formatters', () => {
  it('formats currency with sign and compact notation', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50');
    expect(formatCurrency(-50, { signDisplay: 'always' })).toBe('-$50.00');
    expect(formatCurrency(25, { signDisplay: 'always' })).toBe('+$25.00');
    expect(formatCurrency(1_250_000_000, { compact: true })).toBe('$1.3B');
    expect(formatCurrency(1000, { currency: 'EUR', locale: 'de-DE' })).toBe('1.000,00 €');
  });

  it('renders an em dash for missing values', () => {
    expect(formatCurrency(null)).toBe('—');
    expect(formatNumber(Number.NaN)).toBe('—');
    expect(formatPercent(undefined)).toBe('—');
    expect(formatDateTime('not a date')).toBe('—');
  });

  it('treats percentages as percent units', () => {
    expect(formatPercent(1.256)).toBe('1.26%');
    expect(formatSignedPercent(2)).toBe('+2.00%');
    expect(formatSignedPercent(0)).toBe('0.00%');
    expect(formatPercent(-0.5, { decimals: 1 })).toBe('-0.5%');
  });

  it('formats quantities and prices', () => {
    expect(formatQuantity(12500.7)).toBe('12,501');
    expect(formatPrice(189.5)).toBe('189.50');
    expect(formatPrice(0.12345)).toBe('0.1235');
  });

  it('formats relative time', () => {
    const now = Date.parse('2026-01-01T12:00:00Z');
    expect(formatRelativeTime(now - 5_000, { now })).toBe('now');
    expect(formatRelativeTime(now - 120_000, { now })).toBe('2 minutes ago');
    expect(formatRelativeTime(now - 86_400_000, { now })).toBe('yesterday');
  });

  it('derives trend direction', () => {
    expect(trendOf(0.01)).toBe('up');
    expect(trendOf(-3)).toBe('down');
    expect(trendOf(0)).toBe('flat');
    expect(trendOf(null)).toBe('flat');
  });
});
