import { useEffect, useState } from 'react';
import type { NavigationBadge } from './navigation';

const FERIAS_BADGE_TTL_MS = 60_000;
let feriasBadgeCache: { at: number; vencidos: number; proximos: number } | null = null;
let feriasBadgeInFlight: Promise<{ vencidos: number; proximos: number }> | null = null;

async function getFeriasBadgeCounts(): Promise<{ vencidos: number; proximos: number }> {
  const now = Date.now();
  if (feriasBadgeCache && now - feriasBadgeCache.at < FERIAS_BADGE_TTL_MS) {
    return { vencidos: feriasBadgeCache.vencidos, proximos: feriasBadgeCache.proximos };
  }
  if (feriasBadgeInFlight) return feriasBadgeInFlight;

  feriasBadgeInFlight = (async () => {
    const { feriasService } = await import('../services/feriasService');
    const colaboradores = await feriasService.fetchColaboradoresStatus();
    const vencidos = colaboradores.filter((item) => item.tem_ferias_vencidas).length;
    const proximos = colaboradores.filter((item) => {
      if (item.tem_ferias_vencidas || !item.proxima_expiracao) return false;
      const dias = Math.ceil(
        (new Date(item.proxima_expiracao).getTime() - Date.now()) / 86_400_000,
      );
      return dias > 0 && dias <= 30;
    }).length;
    feriasBadgeCache = { at: Date.now(), vencidos, proximos };
    return { vencidos, proximos };
  })();

  try {
    return await feriasBadgeInFlight;
  } finally {
    feriasBadgeInFlight = null;
  }
}

export function useFeriasNavigationBadge(): NavigationBadge | undefined {
  const [badge, setBadge] = useState<NavigationBadge>();

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const { vencidos, proximos } = await getFeriasBadgeCounts();
        if (!active) return;
        setBadge(
          vencidos > 0
            ? { count: vencidos, variant: 'danger', pulse: true }
            : proximos > 0
              ? { count: proximos, variant: 'warning' }
              : undefined,
        );
      } catch (error) {
        console.error('Erro ao buscar status de ferias:', error);
      }
    };
    void refresh();
    const interval = window.setInterval(refresh, 5 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  return badge;
}
