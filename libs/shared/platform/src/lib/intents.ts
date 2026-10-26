import type {
  IntentRequest,
  IntentsApi,
  MeridianIntent,
  MeridianIntentMap,
  Unsubscribe,
} from '@meridian/contracts';
import { notifyAll } from './listeners';

export interface IntentContext {
  /** Remote (or `shell`) that dispatched the intent. */
  readonly source: string;
}

export type IntentHandler<K extends MeridianIntent> = (
  payload: MeridianIntentMap[K],
  context: IntentContext,
) => void | Promise<void>;

export class IntentNotHandledError extends Error {
  override readonly name = 'IntentNotHandledError';
  constructor(readonly intent: string) {
    super(`No handler is registered for intent "${intent}"`);
  }
}

export interface IntentRegistry {
  register<K extends MeridianIntent>(intent: K, handler: IntentHandler<K>): Unsubscribe;
  dispatch<K extends MeridianIntent>(
    intent: K,
    payload: MeridianIntentMap[K],
    source: string,
  ): Promise<void>;
  /** Dispatches a stored `{ intent, payload }` pair (notification actions, menu items). */
  dispatchRequest(request: IntentRequest, source: string): Promise<void>;
  forSource(source: string): IntentsApi;
  /** Observe dispatches (diagnostics, message-flow inspector). Not exposed to remotes. */
  observe(listener: (dispatch: IntentDispatch) => void): Unsubscribe;
}

export interface IntentDispatch {
  readonly intent: MeridianIntent;
  readonly payload: unknown;
  readonly source: string;
  readonly outcome: 'handled' | 'rejected' | 'unhandled';
  readonly error?: string;
  readonly timestamp: number;
}

export interface IntentRegistryOptions {
  readonly onDispatch?: (intent: string, source: string) => void;
  /** An observer threw. Observers are diagnostics; they must never fail a dispatch. */
  readonly onObserverError?: (error: unknown) => void;
}

/**
 * Intent routing: exactly one handler per intent (last registration wins,
 * which lets the shell override a default). Remotes only ever see
 * `dispatch`; registration is a shell privilege.
 */
export function createIntentRegistry(options: IntentRegistryOptions = {}): IntentRegistry {
  const handlers = new Map<string, IntentHandler<MeridianIntent>>();
  const observers = new Set<(dispatch: IntentDispatch) => void>();
  const notify = (dispatch: Omit<IntentDispatch, 'timestamp'>) =>
    notifyAll(observers, [{ ...dispatch, timestamp: Date.now() }], options.onObserverError);

  const registry: IntentRegistry = {
    register(intent, handler) {
      handlers.set(intent, handler as IntentHandler<MeridianIntent>);
      return () => {
        if (handlers.get(intent) === handler) handlers.delete(intent);
      };
    },
    async dispatch(intent, payload, source) {
      const handler = handlers.get(intent);
      if (!handler) {
        notify({ intent, payload, source, outcome: 'unhandled' });
        throw new IntentNotHandledError(intent);
      }
      options.onDispatch?.(intent, source);
      try {
        await handler(payload as MeridianIntentMap[MeridianIntent], { source });
        notify({ intent, payload, source, outcome: 'handled' });
      } catch (error) {
        notify({
          intent,
          payload,
          source,
          outcome: 'rejected',
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    dispatchRequest(request, source) {
      // TypeScript cannot correlate the two members of a discriminated union
      // through a generic call, so the one cast lives here rather than at
      // every call site.
      return registry.dispatch(
        request.intent,
        request.payload as MeridianIntentMap[MeridianIntent],
        source,
      );
    },
    observe(listener) {
      observers.add(listener);
      return () => {
        observers.delete(listener);
      };
    },
    forSource(source) {
      return Object.freeze({
        dispatch: (intent, payload) => registry.dispatch(intent, payload, source),
      } satisfies IntentsApi);
    },
  };
  return registry;
}
