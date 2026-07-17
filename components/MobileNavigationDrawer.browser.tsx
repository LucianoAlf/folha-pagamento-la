import React, { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MobileNavigationDrawer } from './MobileNavigationDrawer';

interface HarnessSnapshot {
  callbackVersion: number;
  closeVersions: number[];
  externalClicks: number;
  mounted: boolean;
  navigations: Array<{ module: string; page?: string }>;
  open: boolean;
  showTrigger: boolean;
}

interface DrawerHarnessApi {
  getSnapshot: () => HarnessSnapshot;
  setCallbackVersion: (version: number) => void;
  setMounted: (mounted: boolean) => void;
  setOpen: (open: boolean) => void;
  setShowTrigger: (show: boolean) => void;
}

declare global {
  interface Window {
    drawerHarness: DrawerHarnessApi;
    focusRestoreAttempts?: number;
  }
}

const telemetry = {
  closeVersions: [] as number[],
  externalClicks: 0,
  navigations: [] as Array<{ module: string; page?: string }>,
};

const Harness: React.FC = () => {
  const [callbackVersion, setCallbackVersion] = useState(1);
  const [mounted, setMounted] = useState(true);
  const [open, setOpen] = useState(false);
  const [showTrigger, setShowTrigger] = useState(true);

  const handleClose = useCallback(() => {
    telemetry.closeVersions.push(callbackVersion);
    setOpen(false);
  }, [callbackVersion]);

  window.drawerHarness = {
    getSnapshot: () => ({
      callbackVersion,
      closeVersions: [...telemetry.closeVersions],
      externalClicks: telemetry.externalClicks,
      mounted,
      navigations: [...telemetry.navigations],
      open,
      showTrigger,
    }),
    setCallbackVersion,
    setMounted,
    setOpen,
    setShowTrigger,
  };

  return (
    <>
      {showTrigger && (
        <button
          id="mobile-trigger"
          type="button"
          className="mobile-only"
          onClick={() => setOpen(true)}
        >
          Abrir menu
        </button>
      )}
      <button
        id="external-fab"
        type="button"
        onClick={() => {
          telemetry.externalClicks += 1;
        }}
      >
        Agenda
      </button>
      {mounted && (
        <MobileNavigationDrawer
          open={open}
          current={{ module: 'folha', page: 'dashboard' }}
          onNavigate={(next) => telemetry.navigations.push(next)}
          onClose={handleClose}
        />
      )}
    </>
  );
};

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Harness root ausente');
createRoot(rootElement).render(<Harness />);
