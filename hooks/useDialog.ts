// =====================================================
// HOOK - useDialog (acessibilidade de modais — P2 da auditoria)
// Centraliza o comportamento acessível de diálogos:
//  - Esc fecha (fase de bubble, para não atropelar Radix Select/Popover
//    aninhados, que dão stopPropagation no próprio Esc);
//  - foca o diálogo ao abrir e restaura o foco anterior ao fechar;
//  - focus trap (Tab/Shift+Tab circulam dentro do diálogo);
//  - trava o scroll do body enquanto aberto (com suporte a empilhamento).
//
// Retorna um ref para anexar ao container do conteúdo do diálogo.
// Use junto com role="dialog" aria-modal="true" e tabIndex={-1}.
// =====================================================

import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useDialog<T extends HTMLElement = HTMLDivElement>(
  isOpen: boolean,
  onClose: () => void
) {
  const containerRef = useRef<T | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Mantém o onClose mais recente sem re-disparar o effect a cada render
  // (call sites passam arrows inline; depender de onClose roubaria o foco).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const getFocusables = (): HTMLElement[] => {
      const container = containerRef.current;
      if (!container) return [];
      const nodes = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      return (Array.from(nodes) as HTMLElement[]).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
    };

    // Foca o primeiro elemento focável (ou o próprio container) ao abrir.
    const raf = window.requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;
      const focusables = getFocusables();
      (focusables[0] || container).focus({ preventScroll: true });
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      const container = containerRef.current;
      if (!container) return;
      const focusables = getFocusables();
      if (focusables.length === 0) {
        e.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const insideContainer = active ? container.contains(active) : false;

      if (e.shiftKey) {
        if (active === first || active === container || !insideContainer) {
          e.preventDefault();
          last.focus({ preventScroll: true });
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', onKeyDown);

    // Trava o scroll do body (preserva valor anterior p/ diálogos empilhados).
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      // Restaura o foco para quem estava focado antes de abrir.
      previouslyFocused.current?.focus?.({ preventScroll: true });
    };
  }, [isOpen]);

  return containerRef;
}
