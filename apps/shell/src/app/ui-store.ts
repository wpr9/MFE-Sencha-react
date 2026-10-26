import type { TradeTicketDraft } from '@meridian/contracts';
import { create } from 'zustand';

/** Shell-only UI state (never exposed to remotes). */
interface ShellUiState {
  navExpanded: boolean;
  mobileNavOpen: boolean;
  paletteOpen: boolean;
  portfolioPickerOpen: boolean;
  ticket: { readonly open: boolean; readonly draft: TradeTicketDraft; readonly key: number };
  toggleNav(): void;
  setMobileNavOpen(open: boolean): void;
  setPaletteOpen(open: boolean): void;
  setPortfolioPickerOpen(open: boolean): void;
  openTicket(draft: TradeTicketDraft): void;
  closeTicket(): void;
}

const NAV_PREFERENCE_KEY = 'meridian.nav-expanded';

const readNavPreference = () => {
  try {
    return localStorage.getItem(NAV_PREFERENCE_KEY) !== 'false';
  } catch {
    return true;
  }
};

export const useShellUi = create<ShellUiState>()((set, get) => ({
  navExpanded: readNavPreference(),
  mobileNavOpen: false,
  paletteOpen: false,
  portfolioPickerOpen: false,
  ticket: { open: false, draft: {}, key: 0 },
  toggleNav: () => {
    const navExpanded = !get().navExpanded;
    try {
      localStorage.setItem(NAV_PREFERENCE_KEY, String(navExpanded));
    } catch {
      // Storage can be unavailable (private mode); the preference then lasts the session.
    }
    set({ navExpanded });
  },
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setPortfolioPickerOpen: (portfolioPickerOpen) => set({ portfolioPickerOpen }),
  // A new key remounts the ticket so every request starts from a clean form.
  openTicket: (draft) => set({ ticket: { open: true, draft, key: get().ticket.key + 1 } }),
  closeTicket: () => set({ ticket: { ...get().ticket, open: false } }),
}));
