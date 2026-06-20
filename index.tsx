import React from 'react';
import ReactDOM from 'react-dom/client';
import { ToastProvider } from './hooks/useToast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeProvider } from './hooks/useTheme';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

function FatalBootError({ error }: { error: unknown }) {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: 24,
        background: 'rgb(var(--bg))',
        color: 'rgb(var(--text))',
        fontFamily:
          "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,Arial,sans-serif",
      }}
    >
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, letterSpacing: 0.5 }}>
          Erro ao iniciar o app
        </h1>
        <p style={{ marginTop: 12, color: 'rgba(255,255,255,0.8)' }}>
          Algo falhou durante o carregamento inicial. Veja a mensagem abaixo:
        </p>
        <pre
          style={{
            marginTop: 16,
            padding: 16,
            borderRadius: 12,
            background: 'rgba(0,0,0,0.35)',
            border: '1px solid rgba(148,163,184,0.25)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {message}
        </pre>
        <p style={{ marginTop: 16, color: 'rgba(255,255,255,0.7)' }}>
          Dica: se isso for configuração, verifique o arquivo <code>.env.local</code>{' '}
          e reinicie o servidor.
        </p>
      </div>
    </div>
  );
}

async function bootstrap() {
  try {
    const mod = await import('./App');
    const App = mod.default;
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <ThemeProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </React.StrictMode>
    );
  } catch (error) {
    // Evita "tela branca" (ex.: erro de env/config) e mostra a causa.
    root.render(<FatalBootError error={error} />);
  }
}

void bootstrap();
