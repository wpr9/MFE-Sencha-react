import type { RemoteInstance, RemoteModule, RemoteProps } from '@meridian/contracts';
import { loadExt, loadExtClasses, type ExtNamespace } from './ext-runtime';

export interface ExtRemoteOptions {
  /** Fully qualified Ext class to instantiate, e.g. `Blotter.view.blotter.Blotter`. */
  readonly className: string;
  /** Rendered (as plain DOM) instead of the Ext view when this returns a message. */
  readonly denied?: (context: Parameters<RemoteModule['mount']>[1]) => string | null;
}

/** Used until the ResizeObserver reports the container (Ext classic components need a size). */
const FALLBACK_HEIGHT = 400;

function renderDenied(element: HTMLElement, message: string): RemoteInstance {
  const box = document.createElement('div');
  box.className = 'mrd-ext-denied';
  box.setAttribute('role', 'alert');
  box.textContent = message;
  element.append(box);
  return { unmount: () => box.remove() };
}

/**
 * Adapts an Ext JS view to the platform's framework-agnostic lifecycle
 * contract (`mount` / `update` / `unmount`). Ext classic components are not
 * fluid: they need explicit sizes, so a ResizeObserver keeps the component in
 * sync with the host-provided container.
 */
export function defineExtRemote(options: ExtRemoteOptions): RemoteModule {
  return {
    hostContract: '^1.0.0',
    async mount(element, context): Promise<RemoteInstance> {
      const deniedMessage = options.denied?.(context) ?? null;
      if (deniedMessage) return renderDenied(element, deniedMessage);

      const Ext: ExtNamespace = await context.host.telemetry.measure('extjs.load', loadExt, {
        remote: 'blotter',
      });
      await loadExtClasses();

      element.classList.add('mrd-ext-host');
      const component = Ext.create(options.className, {
        renderTo: element,
        width: element.clientWidth || undefined,
        height: element.clientHeight || FALLBACK_HEIGHT,
        host: context.host,
        widgetProps: context.props,
      });

      let frame = 0;
      const observer = new ResizeObserver(() => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          if (!component.destroyed && element.clientWidth > 0 && element.clientHeight > 0) {
            component.setSize(element.clientWidth, element.clientHeight);
          }
        });
      });
      observer.observe(element);

      return {
        update(props: RemoteProps) {
          component.fireEvent('hostpropschange', props);
        },
        unmount() {
          observer.disconnect();
          cancelAnimationFrame(frame);
          // A QuickTip shown for this view would otherwise point at removed DOM.
          Ext.tip.QuickTipManager.getQuickTip()?.hide();
          try {
            if (!component.destroyed) component.destroy();
          } catch (error) {
            // Teardown runs inside the host's commit phase: report, never rethrow.
            context.host.telemetry.error(error, {
              kind: 'ext-destroy',
              className: options.className,
            });
          } finally {
            element.classList.remove('mrd-ext-host');
          }
        },
      };
    },
  };
}
