import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { NavigationGroups } from './NavigationGroups';
import type { NavigationDestination } from './navigation';
import { useFeriasNavigationBadge } from './useFeriasNavigationBadge';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface FocusCycleInput {
  focusableCount: number;
  activeIndex: number;
  shiftKey: boolean;
  focusInsidePanel: boolean;
}

type FocusCycleTarget = 'first' | 'last' | 'panel' | null;

export function getFocusCycleTarget({
  focusableCount,
  activeIndex,
  shiftKey,
  focusInsidePanel,
}: FocusCycleInput): FocusCycleTarget {
  if (focusableCount === 0) return 'panel';
  if (!focusInsidePanel || activeIndex < 0) return shiftKey ? 'last' : 'first';
  if (shiftKey && activeIndex === 0) return 'last';
  if (!shiftKey && activeIndex === focusableCount - 1) return 'first';
  return null;
}

function isFocusRestorable(element: HTMLElement | null): element is HTMLElement {
  if (!element?.isConnected || !element.matches(FOCUSABLE_SELECTOR)) return false;
  if (element.getClientRects().length === 0) return false;

  let current: HTMLElement | null = element;
  while (current) {
    const style = window.getComputedStyle(current);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse' ||
      Number.parseFloat(style.opacity) === 0
    ) {
      return false;
    }
    current = current.parentElement;
  }
  return true;
}

export interface MobileNavigationDrawerProps {
  open: boolean;
  current: NavigationDestination;
  onNavigate: (next: NavigationDestination) => void;
  onClose: () => void;
}

type OpenMobileNavigationDrawerProps = Omit<MobileNavigationDrawerProps, 'open'>;

const OpenMobileNavigationDrawer: React.FC<OpenMobileNavigationDrawerProps> = ({
  current,
  onNavigate,
  onClose,
}) => {
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const feriasBadge = useFeriasNavigationBadge();
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousActive = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const desktopMedia = window.matchMedia('(min-width: 1024px)');
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus({ preventScroll: true });

    const getFocusableElements = () => {
      const panel = panelRef.current;
      if (!panel) return [];
      return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusable = getFocusableElements();
      const active = document.activeElement as HTMLElement | null;
      const target = getFocusCycleTarget({
        focusableCount: focusable.length,
        activeIndex: active ? focusable.indexOf(active) : -1,
        shiftKey: event.shiftKey,
        focusInsidePanel: active ? panel.contains(active) : false,
      });
      if (!target) return;

      event.preventDefault();
      const targetElement =
        target === 'panel'
          ? panel
          : target === 'first'
            ? focusable[0]
            : focusable[focusable.length - 1];
      targetElement?.focus({ preventScroll: true });
    };

    const handleDesktopChange = (event: MediaQueryListEvent) => {
      if (event.matches) onCloseRef.current();
    };

    document.addEventListener('keydown', handleKeyDown);
    desktopMedia.addEventListener('change', handleDesktopChange);
    if (desktopMedia.matches) onCloseRef.current();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      desktopMedia.removeEventListener('change', handleDesktopChange);
      document.body.style.overflow = previousOverflow;
      if (isFocusRestorable(previousActive)) {
        previousActive.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[13000] bg-black/55 backdrop-blur-sm lg:hidden"
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        onClose();
      }}
    >
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-navigation-title"
        tabIndex={-1}
        className="absolute inset-y-0 left-0 flex w-[min(88vw,360px)] max-w-full flex-col overflow-hidden border-r border-line-strong bg-surface shadow-2xl"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-line-strong px-5 py-4">
          <div className="min-w-0">
            <h2
              id="mobile-navigation-title"
              className="truncate text-sm font-black text-primary"
            >
              SUPER FOLHA SYSTEM
            </h2>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
              Navegacao
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar menu"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line-strong text-secondary transition-colors hover:bg-surface-2 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>
        <nav className="min-h-0 flex-1 overflow-y-auto p-4" aria-label="Navegacao completa">
          <NavigationGroups
            current={current}
            badges={{ ferias: feriasBadge }}
            onNavigate={onNavigate}
            onItemSelected={onClose}
          />
        </nav>
      </aside>
    </div>
  );
};

export const MobileNavigationDrawer: React.FC<MobileNavigationDrawerProps> = ({
  open,
  current,
  onNavigate,
  onClose,
}) => {
  if (!open) return null;

  return (
    <OpenMobileNavigationDrawer
      current={current}
      onNavigate={onNavigate}
      onClose={onClose}
    />
  );
};
