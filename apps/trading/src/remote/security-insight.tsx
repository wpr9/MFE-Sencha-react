import { defineReactRemote, type WidgetProps } from '@meridian/react-sdk';
import { SecurityInsight } from '../components/SecurityInsight';

function InsightWidget({ symbol }: { readonly symbol?: string } & WidgetProps) {
  return <SecurityInsight initialSymbol={symbol} />;
}

/**
 * Federated as `trading/SecurityInsight`. Demonstrates remote -> remote data
 * flow: it follows `order.focused` (published by the Ext JS blotter) and
 * `security.focused` (published by other React remotes).
 */
export default defineReactRemote<{ symbol?: string }>({ component: InsightWidget });
