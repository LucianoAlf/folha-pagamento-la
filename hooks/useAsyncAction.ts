// =====================================================
// HOOK - useAsyncAction (padrão P1 da auditoria)
// Envolve uma mutação async em try/catch, gerencia o estado
// `running` (para desabilitar botões e evitar duplo-clique) e
// dispara toast de sucesso/erro de forma consistente.
//
// Substitui os `onClick={async ...}` sem tratamento que falhavam
// em silêncio (RLS/rede). Espelha o `runAction` de DesenvolvimentoTab,
// porém compartilhado e com feedback via toast.
//
// Uso:
//   const { running, run } = useAsyncAction();
//   <button disabled={running} onClick={() => run(
//     () => contasPagarService.pagar(id),
//     { success: 'Conta paga', onSuccess: () => { onClose(); refresh(); } }
//   )}>Pagar</button>
// =====================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from './useToast';

export interface RunOptions<T> {
  /** Mensagem de toast em caso de sucesso (omitir = sem toast de sucesso). */
  success?: string;
  /** Mensagem de toast de erro. Default: a mensagem do erro lançado. */
  error?: string;
  /** Callback executado apenas em caso de sucesso, com o retorno de `fn`. */
  onSuccess?: (data: T) => void;
  /** Callback executado apenas em caso de erro. */
  onError?: (err: unknown) => void;
  /** Repropaga o erro após tratar/exibir (default: false). */
  rethrow?: boolean;
}

export function useAsyncAction() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [running, setRunning] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async <T,>(
      fn: () => Promise<T>,
      opts: RunOptions<T> = {}
    ): Promise<T | undefined> => {
      setRunning(true);
      try {
        const data = await fn();
        if (opts.success) toastSuccess(opts.success);
        opts.onSuccess?.(data);
        return data;
      } catch (err: any) {
        const message =
          opts.error ||
          err?.message ||
          'Não foi possível concluir a operação. Tente novamente.';
        toastError(message);
        // Mantém o erro no console para diagnóstico.
        console.error('[useAsyncAction]', err);
        opts.onError?.(err);
        if (opts.rethrow) throw err;
        return undefined;
      } finally {
        if (mounted.current) setRunning(false);
      }
    },
    [toastSuccess, toastError]
  );

  return { running, run };
}
