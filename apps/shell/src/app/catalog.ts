import AccountBalanceWalletOutlined from '@mui/icons-material/AccountBalanceWalletOutlined';
import ViewQuiltOutlined from '@mui/icons-material/ViewQuiltOutlined';
import CandlestickChartOutlined from '@mui/icons-material/CandlestickChartOutlined';
import GavelOutlined from '@mui/icons-material/GavelOutlined';
import MonitorHeartOutlined from '@mui/icons-material/MonitorHeartOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import SpaceDashboardOutlined from '@mui/icons-material/SpaceDashboardOutlined';
import type { SvgIconComponent } from '@mui/icons-material';
import { Permission, type AuthApi } from '@meridian/contracts';

export interface AppEntry {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly path: string;
  readonly icon: SvgIconComponent;
  readonly section: 'workspace' | 'platform';
  /** Federated page that renders this route. Absent for shell-native pages. */
  readonly remote?: {
    readonly name: string;
    readonly module: string;
    readonly technology: 'React' | 'Ext JS';
  };
  readonly permission?: Permission;
}

/**
 * Navigation catalog: which routes exist, who may see them and which remote
 * renders them. Permission checks here are UX; the BFF enforces the same
 * permissions on every API call.
 */
export const CATALOG: readonly AppEntry[] = [
  {
    id: 'home',
    label: 'Overview',
    description: 'Your workspace at a glance',
    path: '/',
    icon: SpaceDashboardOutlined,
    section: 'workspace',
  },
  {
    id: 'desk',
    label: 'Trading desk',
    description: 'Ext JS and React micro-frontends working together on one screen',
    path: '/desk',
    icon: ViewQuiltOutlined,
    section: 'workspace',
    permission: Permission.OrderRead,
  },
  {
    id: 'portfolios',
    label: 'Portfolios',
    description: 'Holdings, performance, exposures and risk',
    path: '/portfolios',
    icon: AccountBalanceWalletOutlined,
    section: 'workspace',
    remote: { name: 'portfolio', module: './App', technology: 'React' },
    permission: Permission.PortfolioRead,
  },
  {
    id: 'orders',
    label: 'Orders',
    description: 'Order management blotter',
    path: '/orders',
    icon: ReceiptLongOutlined,
    section: 'workspace',
    remote: { name: 'blotter', module: './App', technology: 'Ext JS' },
    permission: Permission.OrderRead,
  },
  {
    id: 'market',
    label: 'Market',
    description: 'Live quotes and market movers',
    path: '/market',
    icon: CandlestickChartOutlined,
    section: 'workspace',
    remote: { name: 'trading', module: './App', technology: 'React' },
    permission: Permission.MarketDataRead,
  },
  {
    id: 'compliance',
    label: 'Compliance',
    description: 'Pre-trade alerts, approvals and rule utilisation',
    path: '/compliance',
    icon: GavelOutlined,
    section: 'workspace',
    remote: { name: 'compliance', module: './App', technology: 'React' },
    permission: Permission.ComplianceRead,
  },
  {
    id: 'platform',
    label: 'Platform',
    description: 'Micro-frontends, session, events and telemetry',
    path: '/platform',
    icon: MonitorHeartOutlined,
    section: 'platform',
  },
  {
    id: 'settings',
    label: 'Settings',
    description: 'Theme, density and preferences',
    path: '/settings',
    icon: SettingsOutlined,
    section: 'platform',
  },
];

/** Catalog entries the user may navigate to (UX gating; the API enforces the same). */
export function visibleEntries(auth: AuthApi): AppEntry[] {
  return CATALOG.filter((entry) => !entry.permission || auth.hasPermission(entry.permission));
}

/** The catalog entry that owns a pathname (its route or any sub-route). */
export function entryForPath(pathname: string): AppEntry | undefined {
  if (pathname === '/') return CATALOG[0];
  return CATALOG.find(
    (entry) =>
      entry.path !== '/' && (pathname === entry.path || pathname.startsWith(`${entry.path}/`)),
  );
}
