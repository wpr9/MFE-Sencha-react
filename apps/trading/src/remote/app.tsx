import { defineReactRemote } from '@meridian/react-sdk';
import { MarketPage } from '../pages/MarketPage';

/** Federated as `trading/App`, mounted by the shell under `/market`. */
export default defineReactRemote({
  routes: [
    { index: true, element: <MarketPage /> },
    { path: '*', element: <MarketPage /> },
  ],
});
