// =====================================================
// ErrorBoundary global (P2 da auditoria)
// Captura erros de renderização em qualquer ponto da árvore e mostra
// um fallback no tema do app, em vez da "tela branca". Oferece
// "tentar novamente" (reseta o boundary) e "recarregar a página".
// =====================================================

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Fallback customizado opcional. Recebe o erro e um reset. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Hook para logar em telemetria externa, se houver. */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Mantém o stack no console para diagnóstico.
    console.error('[ErrorBoundary]', error, info.componentStack);
    this.props.onError?.(error, info);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(error, this.reset);
    }

    return (
      <div
        role="alert"
        className="min-h-screen flex items-center justify-center p-6 bg-slate-950 text-slate-200 font-sans"
      >
        <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900/60 backdrop-blur-md p-8 shadow-2xl shadow-black/40">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mb-5">
            <span className="text-3xl" aria-hidden="true">
              ⚠️
            </span>
          </div>
          <h1 className="text-xl font-black text-slate-100">
            Algo deu errado nesta tela
          </h1>
          <p className="mt-2 text-sm text-slate-400 leading-relaxed">
            Um erro inesperado interrompeu a renderização. Você pode tentar
            novamente — se persistir, recarregue a página.
          </p>

          <pre className="mt-4 max-h-40 overflow-auto rounded-xl border border-slate-800 bg-black/30 p-3 text-xs text-rose-300/80 whitespace-pre-wrap break-words">
            {error.name}: {error.message}
          </pre>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={this.reset}
              className="flex-1 px-5 py-3 rounded-2xl font-black text-white bg-violet-600 hover:bg-violet-500 transition-colors active:scale-95"
            >
              Tentar novamente
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex-1 px-5 py-3 rounded-2xl font-black text-slate-200 border border-slate-700 bg-slate-900/40 hover:bg-slate-900/70 transition-colors active:scale-95"
            >
              Recarregar a página
            </button>
          </div>
        </div>
      </div>
    );
  }
}
