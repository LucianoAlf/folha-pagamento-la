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
        className="min-h-screen flex items-center justify-center p-6 bg-bg text-secondary font-sans"
      >
        <div className="w-full max-w-lg rounded-3xl border border-base bg-surface/60 backdrop-blur-md p-8 shadow-2xl shadow-[var(--shadow-card)]">
          <div className="w-14 h-14 rounded-2xl bg-danger/10 border border-danger/30 flex items-center justify-center mb-5">
            <span className="text-3xl" aria-hidden="true">
              ⚠️
            </span>
          </div>
          <h1 className="text-xl font-black text-primary">
            Algo deu errado nesta tela
          </h1>
          <p className="mt-2 text-sm text-secondary leading-relaxed">
            Um erro inesperado interrompeu a renderização. Você pode tentar
            novamente — se persistir, recarregue a página.
          </p>

          <pre className="mt-4 max-h-40 overflow-auto rounded-xl border border-base bg-black/30 p-3 text-xs text-danger/80 whitespace-pre-wrap break-words">
            {error.name}: {error.message}
          </pre>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={this.reset}
              className="flex-1 px-5 py-3 rounded-2xl font-black text-white bg-accent hover:bg-accent/90 transition-colors active:scale-95"
            >
              Tentar novamente
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex-1 px-5 py-3 rounded-2xl font-black text-secondary border border-strong bg-surface/40 hover:bg-surface/70 transition-colors active:scale-95"
            >
              Recarregar a página
            </button>
          </div>
        </div>
      </div>
    );
  }
}
