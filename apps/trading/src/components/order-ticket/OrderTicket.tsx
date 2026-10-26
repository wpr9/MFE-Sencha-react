import CloseOutlined from '@mui/icons-material/CloseOutlined';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Divider,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from '@mui/material';
import { describeError, type TradeTicketDraft } from '@meridian/contracts';
import { useFormatters, useHost } from '@meridian/react-sdk';
import { useState } from 'react';
import { Controller } from 'react-hook-form';
import { useCreateOrder } from '../../api';
import { CompliancePanel } from './CompliancePanel';
import { OrderEstimate } from './OrderEstimate';
import { QuotePanel } from './QuotePanel';
import { useOrderTicketForm } from './useOrderTicketForm';

/** Quantities are whole shares. */
const QUANTITY_INPUT = { min: 1, step: 1, inputMode: 'numeric' } as const;
const LIMIT_PRICE_INPUT = { min: 0.01, step: 0.01 } as const;
/** Mirrors `OrderDraftSchema.rationale`; the schema is the rule, this only stops over-typing. */
const RATIONALE_MAX_LENGTH = 500;

/**
 * Order ticket. Validation uses the same zod schema the BFF enforces, the
 * compliance check runs server-side as the user types, and the BFF repeats
 * it authoritatively on submit.
 */
export function OrderTicket({
  draft,
  close,
}: {
  readonly draft: TradeTicketDraft;
  readonly close?: () => void;
}) {
  const host = useHost();
  const f = useFormatters();
  const { scheme } = useTheme().meridian;
  const createOrder = useCreateOrder();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const ticket = useOrderTicketForm(draft);
  const { control, handleSubmit, formState } = ticket.form;
  const { values } = ticket;

  const submit = handleSubmit(async (order) => {
    setSubmitError(null);
    try {
      const created = await createOrder.mutateAsync({
        ...order,
        rationale: order.rationale || null,
      });
      const pending = created.status === 'PENDING_APPROVAL';
      host.notifications.toast({
        severity: pending ? 'warning' : 'success',
        message: pending
          ? `${created.id} submitted for compliance approval`
          : `${created.id} created · ready to route`,
        action: {
          label: 'View',
          intent: { intent: 'order.open', payload: { orderId: created.id } },
        },
      });
      host.telemetry.track('order.submitted', {
        status: created.status,
        outcome: created.compliance.outcome,
      });
      close?.();
    } catch (error) {
      setSubmitError(describeError(error));
    }
  });

  const quantityHelp = (empty: boolean, error: string | undefined): string => {
    if (empty && error) return 'Enter a quantity';
    if (error) return error;
    if (ticket.oversell)
      return ticket.held
        ? `Exceeds the position of ${f.quantity(ticket.held)} shares`
        : 'No position to sell';
    return ticket.position ? `Position ${f.quantity(ticket.position.quantity)} shares` : ' ';
  };

  return (
    <Box
      component="form"
      onSubmit={submit}
      noValidate
      sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}
      aria-label="Order ticket"
    >
      <Stack
        direction="row"
        sx={{ alignItems: 'center', justifyContent: 'space-between', px: 3, py: 2 }}
      >
        <Box>
          <Typography variant="h4" component="h2">
            New order
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Pre-trade compliance runs as you type
          </Typography>
        </Box>
        {close && (
          <IconButton aria-label="Close order ticket" onClick={close}>
            <CloseOutlined />
          </IconButton>
        )}
      </Stack>
      <Divider />
      <Stack spacing={2.5} sx={{ p: 3, overflowY: 'auto', flex: 1 }}>
        <Controller
          name="portfolioId"
          control={control}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              // MUI warns when a Select's value is not among its options, which is the
              // case until the portfolio list has loaded.
              value={
                ticket.portfolios.data?.some((option) => option.id === field.value)
                  ? field.value
                  : ''
              }
              select
              label="Portfolio"
              error={Boolean(fieldState.error)}
              helperText={fieldState.error?.message}
              fullWidth
            >
              {(ticket.portfolios.data ?? []).map((option) => (
                <MenuItem key={option.id} value={option.id}>
                  {option.name} ({option.id})
                </MenuItem>
              ))}
            </TextField>
          )}
        />
        <Controller
          name="symbol"
          control={control}
          render={({ field, fieldState }) => (
            <Autocomplete
              options={ticket.securities.data ?? []}
              loading={ticket.securities.isPending}
              value={ticket.security ?? null}
              onChange={(_, option) => {
                field.onChange(option?.symbol ?? '');
                ticket.clearLimit();
              }}
              getOptionLabel={(option) => `${option.symbol} · ${option.name}`}
              isOptionEqualToValue={(option, value) => option.symbol === value.symbol}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Security"
                  error={Boolean(fieldState.error)}
                  helperText={fieldState.error?.message}
                />
              )}
              renderOption={(props, option) => (
                <Box
                  component="li"
                  {...props}
                  key={option.symbol}
                  sx={{ display: 'flex', gap: 1.5 }}
                >
                  <Typography variant="subtitle2" sx={{ width: 64 }}>
                    {option.symbol}
                  </Typography>
                  <Typography variant="body1" color="text.secondary" noWrap>
                    {option.name}
                  </Typography>
                </Box>
              )}
            />
          )}
        />
        <QuotePanel security={ticket.security} />
        <Controller
          name="side"
          control={control}
          render={({ field }) => (
            <ToggleButtonGroup
              exclusive
              fullWidth
              value={field.value}
              onChange={(_, value) => value && field.onChange(value)}
              aria-label="Side"
            >
              <ToggleButton
                value="BUY"
                sx={{
                  '&.Mui-selected': {
                    bgcolor: scheme.trade.buy.bg,
                    color: scheme.trade.buy.fg,
                    '&:hover': { bgcolor: scheme.trade.buy.bg },
                  },
                }}
              >
                Buy
              </ToggleButton>
              <ToggleButton
                value="SELL"
                sx={{
                  '&.Mui-selected': {
                    bgcolor: scheme.trade.sell.bg,
                    color: scheme.trade.sell.fg,
                    '&:hover': { bgcolor: scheme.trade.sell.bg },
                  },
                }}
              >
                Sell
              </ToggleButton>
            </ToggleButtonGroup>
          )}
        />
        <Stack direction="row" spacing={2}>
          <Controller
            name="quantity"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                label="Quantity"
                type="number"
                fullWidth
                value={field.value ?? ''}
                onChange={(event) =>
                  field.onChange(event.target.value === '' ? null : Number(event.target.value))
                }
                error={Boolean(fieldState.error) || ticket.oversell}
                helperText={quantityHelp(field.value === null, fieldState.error?.message)}
                slotProps={{ htmlInput: QUANTITY_INPUT }}
              />
            )}
          />
          <Controller
            name="timeInForce"
            control={control}
            render={({ field }) => (
              <TextField {...field} select label="Time in force" sx={{ width: 160 }} helperText=" ">
                <MenuItem value="DAY">Day</MenuItem>
                <MenuItem value="GTC">Good till cancelled</MenuItem>
              </TextField>
            )}
          />
        </Stack>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
          <Controller
            name="orderType"
            control={control}
            render={({ field }) => (
              <ToggleButtonGroup
                exclusive
                size="small"
                value={field.value}
                onChange={(_, value) => {
                  if (!value) return;
                  field.onChange(value);
                  if (value === 'MARKET') ticket.clearLimit();
                }}
                aria-label="Order type"
                sx={{ mt: 1 }}
              >
                <ToggleButton value="MARKET">Market</ToggleButton>
                <ToggleButton value="LIMIT">Limit</ToggleButton>
              </ToggleButtonGroup>
            )}
          />
          {values.orderType === 'LIMIT' && (
            <Controller
              name="limitPrice"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  label="Limit price"
                  type="number"
                  fullWidth
                  value={field.value ?? ''}
                  onChange={(event) =>
                    field.onChange(event.target.value === '' ? null : Number(event.target.value))
                  }
                  error={Boolean(fieldState.error)}
                  helperText={fieldState.error?.message}
                  slotProps={{ htmlInput: LIMIT_PRICE_INPUT }}
                />
              )}
            />
          )}
        </Stack>
        <Controller
          name="rationale"
          control={control}
          render={({ field, fieldState }) => (
            <TextField
              label="Rationale (optional)"
              multiline
              minRows={2}
              value={field.value ?? ''}
              onChange={(event) => field.onChange(event.target.value || null)}
              error={Boolean(fieldState.error)}
              helperText={
                fieldState.error?.message ?? 'Recorded in the audit trail and shown to compliance.'
              }
              slotProps={{ htmlInput: { maxLength: RATIONALE_MAX_LENGTH } }}
            />
          )}
        />
        <OrderEstimate
          symbol={values.symbol || undefined}
          quantity={values.quantity}
          orderType={values.orderType}
          limitPrice={values.limitPrice}
          nav={ticket.portfolio.data?.nav}
        />
        <Box>
          <Typography variant="h6" component="h3" sx={{ mb: 1 }}>
            Pre-trade compliance
          </Typography>
          <CompliancePanel
            check={ticket.check.data}
            current={ticket.checkIsCurrent}
            ready={ticket.ready}
            failed={ticket.check.isError}
            onRetry={() => void ticket.check.refetch()}
          />
        </Box>
        {submitError && <Alert severity="error">{submitError}</Alert>}
      </Stack>
      <Divider />
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', px: 3, py: 2 }}>
        {close && <Button onClick={close}>Cancel</Button>}
        <Button
          type="submit"
          variant="contained"
          disabled={
            !formState.isValid ||
            !ticket.ready ||
            !ticket.checkIsCurrent ||
            ticket.blocked ||
            ticket.oversell ||
            createOrder.isPending
          }
        >
          {createOrder.isPending
            ? 'Submitting…'
            : ticket.needsApproval
              ? 'Submit for approval'
              : 'Place order'}
        </Button>
      </Stack>
    </Box>
  );
}
