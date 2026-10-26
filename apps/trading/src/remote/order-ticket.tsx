import type { TradeTicketDraft } from '@meridian/contracts';
import { defineReactRemote, type WidgetProps } from '@meridian/react-sdk';
import { OrderTicket } from '../components/order-ticket/OrderTicket';

function TicketWidget({ close, ...draft }: TradeTicketDraft & WidgetProps) {
  return <OrderTicket draft={draft} close={close} />;
}

/**
 * Federated as `trading/OrderTicket`. Never routed: the shell mounts it in a
 * side sheet when any remote dispatches the `trade.ticket.open` intent.
 */
export default defineReactRemote<TradeTicketDraft>({ component: TicketWidget });
