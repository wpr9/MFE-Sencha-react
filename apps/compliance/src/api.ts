import {
  AlertResolutionSchema,
  ComplianceAlertSchema,
  ComplianceRuleSchema,
  RuleUtilizationSchema,
  apiPaths,
  type AlertResolution,
} from '@meridian/contracts';
import { useHost, useHostEvent } from '@meridian/react-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/** Query keys, so live invalidation and the hooks agree on them. */
const complianceKeys = {
  alerts: ['compliance', 'alerts'] as const,
  rules: ['compliance', 'rules'] as const,
  utilization: ['compliance', 'utilization'] as const,
};

/** Alerts visible to the user (all of them for managers, own orders otherwise). */
export function useAlerts() {
  const { http } = useHost();
  return useQuery({
    queryKey: complianceKeys.alerts,
    queryFn: ({ signal }) =>
      http.get(apiPaths.complianceAlerts(), { signal, parser: ComplianceAlertSchema.array() }),
  });
}

/** The rulebook (static for a session). */
export function useRules() {
  const { http } = useHost();
  return useQuery({
    queryKey: complianceKeys.rules,
    queryFn: ({ signal }) =>
      http.get(apiPaths.complianceRules(), { signal, parser: ComplianceRuleSchema.array() }),
    staleTime: Infinity,
  });
}

/** Limit utilisation per entitled portfolio; polled as a fallback to server push. */
export function useUtilization() {
  const { http } = useHost();
  return useQuery({
    queryKey: complianceKeys.utilization,
    queryFn: ({ signal }) =>
      http.get(apiPaths.complianceUtilization(), { signal, parser: RuleUtilizationSchema.array() }),
    refetchInterval: 30_000,
  });
}

/** Approves or rejects the order behind an alert, with a justification. */
export function useResolveAlert() {
  const { http } = useHost();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ alertId, resolution }: { alertId: string; resolution: AlertResolution }) =>
      http.post(
        apiPaths.complianceAlertResolution(alertId),
        AlertResolutionSchema.parse(resolution),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: complianceKeys.alerts }),
  });
}

/** Alerts raised or resolved anywhere (by any user, any remote) refresh this view live. */
export function useLiveCompliance() {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: complianceKeys.alerts });
    void queryClient.invalidateQueries({ queryKey: complianceKeys.utilization });
  };
  useHostEvent('compliance.alert.raised', refresh);
  useHostEvent('compliance.alert.updated', refresh);
  useHostEvent(
    'portfolio.changed',
    () => void queryClient.invalidateQueries({ queryKey: complianceKeys.utilization }),
  );
}
