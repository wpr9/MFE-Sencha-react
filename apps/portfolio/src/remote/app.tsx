import { defineReactRemote, useHostState } from '@meridian/react-sdk';
import { useEffect, useRef } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router';
import { useLivePortfolioInvalidation } from '../api';
import { PortfolioDetailPage } from '../pages/portfolio-detail/PortfolioDetailPage';
import { PortfolioListPage } from '../pages/PortfolioListPage';

/**
 * Follows the shell's workspace portfolio context: picking a portfolio in
 * the top bar opens it here; clearing the context returns to the list.
 */
function PortfolioRoutes() {
  useLivePortfolioInvalidation();
  const activeId = useHostState((state) => state.activePortfolioId);
  const { portfolioId } = useParams();
  const navigate = useNavigate();
  const previous = useRef(activeId);
  useEffect(() => {
    if (previous.current === activeId) return;
    previous.current = activeId;
    if (activeId && activeId !== portfolioId) navigate(activeId);
    else if (!activeId && portfolioId) navigate('.');
  }, [activeId, portfolioId, navigate]);
  return <Outlet />;
}

/** Federated as `portfolio/App`, mounted by the shell under `/portfolios`. */
export default defineReactRemote({
  routes: [
    {
      element: <PortfolioRoutes />,
      children: [
        { index: true, element: <PortfolioListPage /> },
        { path: ':portfolioId', element: <PortfolioDetailPage /> },
        { path: ':portfolioId/:tab', element: <PortfolioDetailPage /> },
      ],
    },
  ],
});
