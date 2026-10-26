import { zodResolver } from '@hookform/resolvers/zod';
import { OrderDraftSchema, type OrderDraft, type TradeTicketDraft } from '@meridian/contracts';
import { useHost, useHostState } from '@meridian/react-sdk';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch, type Resolver } from 'react-hook-form';
import { useComplianceCheck, usePortfolioDetail, usePortfolios, useSecurities } from '../../api';

/** Form values before validation: numeric fields are `null` while empty. */
export type TicketFormValues = Omit<OrderDraft, 'limitPrice' | 'quantity'> & {
  quantity: number | null;
  limitPrice: number | null;
};

/** How long after the last keystroke the server-side what-if check runs. */
const CHECK_DEBOUNCE_MS = 300;

/** Debounces a primitive; callers pass a serialised draft so identity churn cannot re-arm it. */
function useDebounced<T extends string | null>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * State of the order ticket: the form, the reference data it needs, the live
 * pre-trade compliance check and everything derived from them. Validation
 * uses the schema the BFF enforces (`OrderDraftSchema`), so what passes here
 * passes there.
 */
export function useOrderTicketForm(draft: TradeTicketDraft) {
  const host = useHost();
  const activePortfolioId = useHostState((state) => state.activePortfolioId);
  const portfolios = usePortfolios();
  const securities = useSecurities();

  const defaultPortfolio =
    draft.portfolioId ??
    (activePortfolioId && host.auth.canAccessPortfolio(activePortfolioId)
      ? activePortfolioId
      : undefined);
  const form = useForm<TicketFormValues, unknown, OrderDraft>({
    // The resolver's input type is the schema's (numbers), the form's holds
    // nulls while fields are empty; the one cast documents that difference.
    resolver: zodResolver(OrderDraftSchema) as Resolver<TicketFormValues, unknown, OrderDraft>,
    mode: 'onChange',
    defaultValues: {
      portfolioId: defaultPortfolio ?? '',
      symbol: draft.symbol ?? '',
      side: draft.side ?? 'BUY',
      quantity: draft.quantity ?? null,
      orderType: draft.orderType ?? 'MARKET',
      limitPrice: draft.limitPrice ?? null,
      timeInForce: 'DAY',
      rationale: null,
    },
  });
  const { control, setValue } = form;
  const values = useWatch({ control });

  useEffect(() => {
    if (!values.portfolioId && portfolios.data?.[0])
      setValue('portfolioId', portfolios.data[0].id, { shouldValidate: true });
  }, [portfolios.data, values.portfolioId, setValue]);

  const security = useMemo(
    () => securities.data?.find((candidate) => candidate.symbol === values.symbol),
    [securities.data, values.symbol],
  );
  const portfolio = usePortfolioDetail(values.portfolioId || undefined);
  const position = portfolio.data?.holdings.find((holding) => holding.symbol === values.symbol);

  // A limit is suggested once per security from its live price, never re-imposed:
  // the trader may clear it, and a new security or a switch to MARKET discards it.
  // The price is read once (no subscription in the form), so ticks do not re-render it.
  const prefilledFor = useRef<string | null>(null);
  const { symbol, orderType } = values;
  useEffect(() => {
    if (orderType !== 'LIMIT' || !symbol || prefilledFor.current === symbol) return undefined;
    const apply = (last: number) => {
      prefilledFor.current = symbol;
      setValue('limitPrice', last, { shouldValidate: true });
    };
    const quote = host.marketData.getQuote(symbol);
    if (quote) {
      apply(quote.last);
      return undefined;
    }
    // No quote yet (stream still connecting): take the first one that arrives.
    return host.marketData.subscribe([symbol], (quotes) => {
      const first = quotes.get(symbol);
      if (first && prefilledFor.current !== symbol) apply(first.last);
    });
  }, [host, orderType, symbol, setValue]);
  const clearLimit = () => {
    prefilledFor.current = null;
    setValue('limitPrice', null, { shouldValidate: true });
  };

  const parsed = OrderDraftSchema.safeParse({ ...values, rationale: values.rationale || null });
  const draftKey = parsed.success ? JSON.stringify(parsed.data) : null;
  const debouncedKey = useDebounced(draftKey, CHECK_DEBOUNCE_MS);
  const debouncedDraft = useMemo<OrderDraft | null>(
    () => (debouncedKey ? (JSON.parse(debouncedKey) as OrderDraft) : null),
    [debouncedKey],
  );
  const check = useComplianceCheck(debouncedDraft);
  // A result only gates the order on screen: not while typing (debounce), not while the
  // next result loads (placeholder data), and never after a failed check.
  const checkIsCurrent = check.isSuccess && !check.isPlaceholderData && debouncedKey === draftKey;
  const held = position?.quantity ?? 0;
  const oversell = values.side === 'SELL' && portfolio.isSuccess && (values.quantity ?? 0) > held;

  return {
    form,
    values,
    portfolios,
    securities,
    security,
    portfolio,
    position,
    held,
    oversell,
    /** The draft is complete and valid (the compliance check can run). */
    ready: parsed.success,
    check,
    checkIsCurrent,
    blocked: checkIsCurrent && check.data.outcome === 'FAIL',
    needsApproval: checkIsCurrent && check.data.outcome === 'WARN',
    clearLimit,
  };
}
