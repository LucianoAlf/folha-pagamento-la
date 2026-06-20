// =====================================================
// HOOK - useAsyncAction (padrão P1 da auditoria)
// Envolve uma mutação async em try/catch e dispara toast de sucesso/erro
// de forma consistente. Substitui os `onClick={async ...}` sem tratamento
// que falhavam em silêncio (RLS/rede).
//
// Não gerencia estado de loading: os call sites usam seus próprios flags
// locais (setSaving/setSending/...) para spinners e disable de botões.
// Por isso o hook não causa re-render — é só try/catch + toast.
//
// Uso:
//   const { run } = useAsyncAction();
//   <button disabled={saving} onClick={() => run(
//     () => contasPagarService.pagar(id),
//     { success: 'Conta paga', onSuccess: () => { onClose(); refresh(); } }
//   )}>Pagar</button>
// =====================================================

import { useCallback } from 'react';
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

  const run = useCallback(
    async <T,>(
      fn: () => Promise<T>,
      opts: RunOptions<T> = {}
    ): Promise<T | undefined> => {
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
      }
    },
    [toastSuccess, toastError]
  );

  return { run };
}
