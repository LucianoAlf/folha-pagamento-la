// =====================================================
// HOOK - useDialog (acessibilidade de modais — P2 da auditoria)
// Centraliza o comportamento acessível de diálogos:
//  - Esc fecha APENAS o diálogo do topo (pilha module-level), para que um
//    ConfirmDialog sobre um Modal não feche os dois de uma vez; em fase de
//    bubble, para não atropelar Radix Select/Popover aninhados (que dão
//    stopPropagation no próprio Esc);
//  - foca o diálogo ao abrir e restaura o foco anterior ao fechar;
//  - focus trap (Tab/Shift+Tab circulam dentro do diálogo) — só no topo;
//  - trava o scroll do body enquanto houver QUALQUER diálogo aberto
//    (ref-count: trava no primeiro, destrava quando a pilha esvazia,
//    independente da ordem de fechamento).
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

// Estado compartilhado entre instâncias (diálogos empilhados):
const dialogStack: symbol[] = [];
let scrollLockCount = 0;
let savedBodyOverflow = '';

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

    const dialogId = Symbol('dialog');
    dialogStack.push(dialogId);
    const isTopmost = () => dialogStack[dialogStack.length - 1] === dialogId;

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
      // Apenas o diálogo do topo reage a Esc/Tab.
      if (!isTopmost()) return;

      // Se o foco está dentro de um portal do Radix (Select/Popover/Dropdown
      // abertos, renderizados fora do container), deixa o Radix tratar o
      // teclado — não fechamos o diálogo nem prendemos o Tab.
      const focused = document.activeElement as HTMLElement | null;
      if (focused?.closest('[data-radix-popper-content-wrapper]')) return;

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

    // Trava o scroll do body via contador (independe da ordem de fechamento).
    if (scrollLockCount === 0) {
      savedBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    scrollLockCount += 1;

    return () => {
      window.cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown);

      const idx = dialogStack.lastIndexOf(dialogId);
      if (idx !== -1) dialogStack.splice(idx, 1);

      scrollLockCount = Math.max(0, scrollLockCount - 1);
      if (scrollLockCount === 0) {
        document.body.style.overflow = savedBodyOverflow;
      }

      // Restaura o foco só se ele "se perdeu" ao fechar (foi para o body).
      // Se já está num elemento real (ex.: outro diálogo ainda aberto, em
      // fechamento fora de ordem), não roubamos o foco de volta.
      const activeNow = document.activeElement;
      if (activeNow === document.body || activeNow === null) {
        previouslyFocused.current?.focus?.({ preventScroll: true });
      }
    };
  }, [isOpen]);

  return containerRef;
}
