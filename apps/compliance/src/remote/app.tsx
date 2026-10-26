import { defineReactRemote } from '@meridian/react-sdk';
import { CompliancePage } from '../pages/CompliancePage';

/** Federated as `compliance/App`, mounted by the shell under `/compliance`. */
export default defineReactRemote({
  routes: [
    { index: true, element: <CompliancePage /> },
    { path: '*', element: <CompliancePage /> },
  ],
});
