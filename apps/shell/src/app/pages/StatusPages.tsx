import LockOutlined from '@mui/icons-material/LockOutlined';
import SearchOffOutlined from '@mui/icons-material/SearchOffOutlined';
import { Box, Button } from '@mui/material';
import { describeError } from '@meridian/contracts';
import { EmptyState, ErrorState } from '@meridian/ui';
import { useLocation, useNavigate, useRouteError } from 'react-router';

/** Unknown route. */
export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <Box sx={{ flex: 1, display: 'grid', placeItems: 'center' }}>
      <EmptyState
        icon={<SearchOffOutlined />}
        title="Page not found"
        description="The address may be mistyped, or the page was moved."
        action={
          <Button variant="contained" onClick={() => navigate('/')}>
            Go to overview
          </Button>
        }
      />
    </Box>
  );
}

/** A page the user's role does not include (the API refuses it too). */
export function ForbiddenPage({ what }: { readonly what: string }) {
  const navigate = useNavigate();
  return (
    <Box sx={{ flex: 1, display: 'grid', placeItems: 'center' }}>
      <EmptyState
        icon={<LockOutlined />}
        title={`You don't have access to ${what}`}
        description="Your role does not include this area. Ask your administrator if you need access."
        action={
          <Button variant="outlined" onClick={() => navigate('/')}>
            Go to overview
          </Button>
        }
      />
    </Box>
  );
}

/** The shell itself failed to render: nothing else is left to show, so offer a reload. */
export function RouteErrorPage() {
  const error = useRouteError();
  return (
    <Box sx={{ height: '100dvh', display: 'grid', placeItems: 'center' }}>
      <ErrorState
        title="Meridian hit an unexpected error"
        message="Reload the page to continue."
        detail={describeError(error)}
        onRetry={() => window.location.reload()}
      />
    </Box>
  );
}

/** A page failed to render: contained inside the content panel, the shell keeps working. */
export function PageErrorPage() {
  const error = useRouteError();
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <Box sx={{ flex: 1, display: 'grid', placeItems: 'center' }}>
      <ErrorState
        title="This page hit an unexpected error"
        message="The rest of the workspace is unaffected. Try again or go back to the overview."
        detail={describeError(error)}
        // Soft retry: re-navigating clears the route error; mounted remotes, open
        // drafts and the live stream survive (a reload would discard them all).
        onRetry={() =>
          void navigate(`${location.pathname}${location.search}${location.hash}`, {
            replace: true,
          })
        }
      />
      <Button variant="text" onClick={() => navigate('/')}>
        Go to overview
      </Button>
    </Box>
  );
}
