import React, { useEffect, useMemo, useState } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone() {
  // iOS Safari
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nav: any = navigator;
  return window.matchMedia?.('(display-mode: standalone)')?.matches || nav?.standalone === true;
}

export default function InstallPWAPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  const isIOS = useMemo(() => /iPad|iPhone|iPod/.test(navigator.userAgent), []);

  useEffect(() => {
    if (isStandalone()) return;
    if (sessionStorage.getItem('pwa-prompt-dismissed') === 'true') return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      window.setTimeout(() => setShowPrompt(true), 12000);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // iOS não emite beforeinstallprompt: mostramos instrução
    if (isIOS) {
      window.setTimeout(() => setShowPrompt(true), 12000);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [isIOS]);

  const dismiss = () => {
    sessionStorage.setItem('pwa-prompt-dismissed', 'true');
    setShowPrompt(false);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } finally {
      setDeferredPrompt(null);
      setShowPrompt(false);
    }
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed left-4 right-4 md:left-auto md:right-4 md:w-[420px] z-[12000]"
      style={{ bottom: 'calc(88px + env(safe-area-inset-bottom))' }}
    >
      <div className="relative bg-gradient-to-br from-surface/95 to-bg/95 border border-accent/20 rounded-2xl p-5 shadow-2xl backdrop-blur-xl">
        <button
          type="button"
          onClick={dismiss}
          className="absolute top-3 right-3 p-2 text-secondary hover:text-primary hover:bg-white/10 rounded-xl transition-colors"
          aria-label="Fechar"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-4">
          <div className="p-3 bg-accent/10 rounded-2xl border border-accent/15">
            <Smartphone className="w-7 h-7 text-accent" />
          </div>

          <div className="flex-1 pr-8">
            <div className="text-primary font-black text-base leading-tight">Instalar LA Music</div>
            <div className="text-xs text-muted font-medium mt-1 leading-relaxed">
              {isIOS
                ? 'No iPhone: toque em “Compartilhar” e depois “Adicionar à Tela de Início”.'
                : 'Instale como app para abrir mais rápido e ter uma experiência mais fluida.'}
            </div>

            {!isIOS ? (
              <button
                type="button"
                onClick={handleInstall}
                disabled={!deferredPrompt}
                className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-accent hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black shadow-lg shadow-[var(--shadow-card)] transition-all active:scale-[0.98]"
              >
                <Download className="w-4 h-4" />
                Instalar agora
              </button>
            ) : (
              <div className="mt-4 text-[11px] font-bold text-accent bg-accent/10 border border-accent/15 px-3 py-2 rounded-xl">
                Compartilhar → Adicionar à Tela de Início
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

