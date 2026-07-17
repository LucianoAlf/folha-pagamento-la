# Sidebar Reorganizada Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Reorganizar a navegacao do Super Folha com um mapa unico para sidebar, drawer mobile e barra inferior, preservando os destinos atuais e exibindo os modulos futuros como indisponiveis.

**Architecture:** Um modelo tipado em \`components/navigation.ts\` passa a definir grupos, destinos, defaults e regras de estado ativo. \`NavigationGroups\` renderiza a mesma arvore na sidebar e no drawer; \`BottomNavigation\` referencia o mesmo modelo para os quatro atalhos fixos e \`Mais\`. O \`App.tsx\` adota \`NavigationDestination\` como contrato unico e remove unions/listas duplicadas.

**Tech Stack:** React 19, TypeScript, Lucide React, CSS tokens/Tailwind existente, Node test runner, Vite, Agent Browser.

---

## Estrutura de arquivos

- Criar \`components/navigation.ts\`: tipos, inventario, defaults e helpers puros.
- Criar \`components/navigation.test.ts\`: testes comportamentais do modelo.
- Criar \`components/NavigationGroups.tsx\`: renderer compartilhado de grupos.
- Criar \`components/NavigationGroups.test.ts\`: contrato estatico de acessibilidade e indisponibilidade.
- Modificar \`components/Sidebar.tsx\`: manter somente o invólucro desktop e o badge dinamico de Ferias.
- Criar \`components/MobileNavigationDrawer.tsx\`: modal mobile, foco, Escape, backdrop e scroll lock.
- Criar \`components/MobileNavigationDrawer.test.ts\`: contrato estatico do drawer.
- Criar \`components/BottomNavigation.tsx\`: quatro atalhos e botao \`Mais\`.
- Criar \`components/BottomNavigation.test.ts\`: contrato estatico da barra.
- Criar \`components/navigationAppIntegration.test.ts\`: prova de consolidacao no \`App.tsx\`.
- Modificar \`App.tsx\`: contrato de destino, drawer e barra inferior extraida.

## Task 1: Modelo tipado e regras de estado ativo

**Files:**
- Create: \`components/navigation.ts\`
- Create: \`components/navigation.test.ts\`

- [ ] **Step 1: Escrever o teste comportamental que falha**

\`\`\`ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BOTTOM_NAVIGATION_IDS,
  NAVIGATION_GROUPS,
  getDefaultPage,
  getNavigationItem,
  isModuleId,
  isMoreNavigationActive,
  isNavigationItemActive,
} from './navigation.ts';

test('mantem o inventario aprovado e Contas a Pagar aparece uma unica vez', () => {
  assert.deepEqual(
    NAVIGATION_GROUPS.map((group) => [group.label, group.items.map((item) => item.label)]),
    [
      ['Financeiro', [
        'Dashboard financeiro',
        'Contas a Pagar',
        'Contas a Receber',
        'Fluxo de Caixa',
        'DRE',
        'Conciliação',
        'Cartões',
        'Bistrô',
      ]],
      ['RH / DP', ['Folha de Pagamento', 'Jornada RH', 'Férias CLT', 'Agenda']],
      ['Configurações', [
        'Notificações',
        'Gerenciar plano de contas',
        'Gerenciar centros de custo',
        'Gerenciar empresas e contas bancarias',
      ]],
    ],
  );
  assert.equal(
    NAVIGATION_GROUPS.flatMap((group) => group.items)
      .filter((item) => item.label === 'Contas a Pagar').length,
    1,
  );
});

test('itens futuros nao possuem destino', () => {
  const futureItems = NAVIGATION_GROUPS
    .flatMap((group) => group.items)
    .filter((item) => item.status === 'future');

  assert.equal(futureItems.length, 8);
  assert.ok(futureItems.every((item) => item.destination === undefined));
});

test('Bistro ativa apenas Bistro e move o mobile para Mais', () => {
  const current = { module: 'folha' as const, page: 'bistro' };
  assert.equal(isNavigationItemActive(getNavigationItem('bistro'), current), true);
  assert.equal(isNavigationItemActive(getNavigationItem('folha'), current), false);
  assert.equal(isMoreNavigationActive(current), true);
});

test('Folha continua ativa nas demais abas internas', () => {
  const current = { module: 'folha' as const, page: 'lancamentos' };
  assert.equal(isNavigationItemActive(getNavigationItem('folha'), current), true);
  assert.equal(isNavigationItemActive(getNavigationItem('bistro'), current), false);
  assert.equal(isMoreNavigationActive(current), false);
});

test('barra inferior possui quatro destinos fixos e defaults validos', () => {
  assert.deepEqual(BOTTOM_NAVIGATION_IDS, ['folha', 'contas', 'cartoes', 'agenda']);
  assert.equal(getDefaultPage('cartoes'), 'cartoes');
  assert.equal(getDefaultPage('rh'), 'dashboard');
  assert.equal(isModuleId('notificacoes'), true);
  assert.equal(isModuleId('dashboard-financeiro'), false);
});
\`\`\`

- [ ] **Step 2: Rodar o teste e confirmar RED**

Run:

\`\`\`powershell
node --test components/navigation.test.ts
\`\`\`

Expected: FAIL com \`ERR_MODULE_NOT_FOUND\` para \`components/navigation.ts\`.

- [ ] **Step 3: Implementar o modelo minimo**

\`\`\`ts
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Bell,
  Building2,
  Calendar,
  CalendarCheck,
  ChefHat,
  CircleDollarSign,
  CreditCard,
  Landmark,
  ListTree,
  RefreshCw,
  UserCheck,
  Users,
  WalletCards,
} from 'lucide-react';

export const MODULE_IDS = [
  'folha',
  'contas',
  'cartoes',
  'agenda',
  'notificacoes',
  'ferias',
  'rh',
] as const;

export type ModuleId = (typeof MODULE_IDS)[number];
export type NavigationItemId =
  | 'dashboard-financeiro'
  | 'contas'
  | 'contas-receber'
  | 'fluxo-caixa'
  | 'dre'
  | 'conciliacao'
  | 'cartoes'
  | 'bistro'
  | 'folha'
  | 'rh'
  | 'ferias'
  | 'agenda'
  | 'notificacoes'
  | 'gerenciar-plano-contas'
  | 'gerenciar-centros-custo'
  | 'gerenciar-empresas-contas';

export interface NavigationDestination {
  module: ModuleId;
  page?: string;
}

export interface NavigationBadge {
  count: number;
  variant: 'danger' | 'warning';
  pulse?: boolean;
}

export interface NavigationItem {
  id: NavigationItemId;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
  status: 'active' | 'future';
  destination?: NavigationDestination;
  activeMode?: 'module' | 'exact';
  excludedPages?: string[];
}

export interface NavigationGroup {
  id: 'financeiro' | 'rh-dp' | 'configuracoes';
  label: string;
  items: NavigationItem[];
}

export const NAVIGATION_GROUPS: NavigationGroup[] = [
  {
    id: 'financeiro',
    label: 'Financeiro',
    items: [
      { id: 'dashboard-financeiro', label: 'Dashboard financeiro', icon: BarChart3, status: 'future' },
      { id: 'contas', label: 'Contas a Pagar', shortLabel: 'Contas', icon: CreditCard, status: 'active', destination: { module: 'contas' } },
      { id: 'contas-receber', label: 'Contas a Receber', icon: CircleDollarSign, status: 'future' },
      { id: 'fluxo-caixa', label: 'Fluxo de Caixa', icon: RefreshCw, status: 'future' },
      { id: 'dre', label: 'DRE', icon: BarChart3, status: 'future' },
      { id: 'conciliacao', label: 'Conciliação', icon: Landmark, status: 'future' },
      { id: 'cartoes', label: 'Cartões', shortLabel: 'Cartões', icon: WalletCards, status: 'active', destination: { module: 'cartoes' } },
      { id: 'bistro', label: 'Bistrô', icon: ChefHat, status: 'active', destination: { module: 'folha', page: 'bistro' }, activeMode: 'exact' },
    ],
  },
  {
    id: 'rh-dp',
    label: 'RH / DP',
    items: [
      { id: 'folha', label: 'Folha de Pagamento', shortLabel: 'Folha', icon: Users, status: 'active', destination: { module: 'folha' }, excludedPages: ['bistro'] },
      { id: 'rh', label: 'Jornada RH', icon: UserCheck, status: 'active', destination: { module: 'rh' } },
      { id: 'ferias', label: 'Férias CLT', icon: CalendarCheck, status: 'active', destination: { module: 'ferias' } },
      { id: 'agenda', label: 'Agenda', shortLabel: 'Agenda', icon: Calendar, status: 'active', destination: { module: 'agenda' } },
    ],
  },
  {
    id: 'configuracoes',
    label: 'Configurações',
    items: [
      { id: 'notificacoes', label: 'Notificações', icon: Bell, status: 'active', destination: { module: 'notificacoes' } },
      { id: 'gerenciar-plano-contas', label: 'Gerenciar plano de contas', icon: ListTree, status: 'future' },
      { id: 'gerenciar-centros-custo', label: 'Gerenciar centros de custo', icon: Building2, status: 'future' },
      { id: 'gerenciar-empresas-contas', label: 'Gerenciar empresas e contas bancarias', icon: Landmark, status: 'future' },
    ],
  },
];

export const BOTTOM_NAVIGATION_IDS = ['folha', 'contas', 'cartoes', 'agenda'] as const;

const DEFAULT_PAGE: Record<ModuleId, string> = {
  folha: 'dashboard',
  contas: 'dashboard',
  cartoes: 'cartoes',
  agenda: 'agenda',
  notificacoes: 'notificacoes',
  ferias: 'ferias',
  rh: 'dashboard',
};

const allItems = NAVIGATION_GROUPS.flatMap((group) => group.items);

export function getNavigationItem(id: NavigationItemId): NavigationItem {
  const item = allItems.find((candidate) => candidate.id === id);
  if (!item) throw new Error(\`Item de navegacao desconhecido: \${id}\`);
  return item;
}

export function getDefaultPage(module: ModuleId): string {
  return DEFAULT_PAGE[module];
}

export function isModuleId(value: string): value is ModuleId {
  return (MODULE_IDS as readonly string[]).includes(value);
}

export function isNavigationItemActive(
  item: NavigationItem,
  current: NavigationDestination,
): boolean {
  if (!item.destination || item.destination.module !== current.module) return false;
  if (item.activeMode === 'exact') return item.destination.page === current.page;
  return !item.excludedPages?.includes(current.page ?? '');
}

export function isMoreNavigationActive(current: NavigationDestination): boolean {
  return !BOTTOM_NAVIGATION_IDS.some((id) =>
    isNavigationItemActive(getNavigationItem(id), current),
  );
}
\`\`\`

- [ ] **Step 4: Rodar o teste e confirmar GREEN**

Run:

\`\`\`powershell
node --test components/navigation.test.ts
\`\`\`

Expected: 5 tests PASS.

- [ ] **Step 5: Commitar o modelo**

\`\`\`powershell
git add components/navigation.ts components/navigation.test.ts
git commit -m "feat: centralizar modelo de navegacao"
\`\`\`

## Task 2: Renderer compartilhado e Sidebar desktop

**Files:**
- Create: \`components/NavigationGroups.tsx\`
- Create: \`components/NavigationGroups.test.ts\`
- Create: \`components/useFeriasNavigationBadge.ts\`
- Modify: \`components/Sidebar.tsx:1-305\`

- [ ] **Step 1: Escrever o teste estatico que falha**

\`\`\`ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const groupsSource = readFileSync(new URL('./NavigationGroups.tsx', import.meta.url), 'utf8');
const sidebarSource = readFileSync(new URL('./Sidebar.tsx', import.meta.url), 'utf8');

test('NavigationGroups usa button disabled nativo e nome acessivel para Em breve', () => {
  assert.match(groupsSource, /disabled=\{item\.status === 'future'\}/);
  assert.match(groupsSource, /item\.status === 'future'.*Em breve/s);
  assert.match(groupsSource, /aria-label=\{accessibleLabel\}/);
  assert.match(groupsSource, /if \(!item\.destination\) return/);
});

test('Sidebar usa o renderer compartilhado e nao conserva modo drawer legado', () => {
  assert.match(sidebarSource, /<NavigationGroups/);
  assert.match(sidebarSource, /useFeriasNavigationBadge/);
  assert.doesNotMatch(sidebarSource, /isMobileDrawer/);
  assert.doesNotMatch(sidebarSource, /onCloseMobileDrawer/);
  assert.doesNotMatch(sidebarSource, /const modules = useMemo/);
  assert.match(sidebarSource, /la-music-sidebar-collapsed/);
});
\`\`\`

- [ ] **Step 2: Rodar o teste e confirmar RED**

Run:

\`\`\`powershell
node --test components/NavigationGroups.test.ts
\`\`\`

Expected: FAIL porque \`NavigationGroups.tsx\` ainda nao existe.

- [ ] **Step 3: Criar o renderer compartilhado**

\`\`\`tsx
import React from 'react';
import { Tooltip } from './UI';
import {
  NAVIGATION_GROUPS,
  isNavigationItemActive,
  type NavigationBadge,
  type NavigationDestination,
  type NavigationItemId,
} from './navigation';

interface NavigationGroupsProps {
  current: NavigationDestination;
  collapsed?: boolean;
  badges?: Partial<Record<NavigationItemId, NavigationBadge>>;
  onNavigate: (next: NavigationDestination) => void;
  onItemSelected?: () => void;
}

export const NavigationGroups: React.FC<NavigationGroupsProps> = ({
  current,
  collapsed = false,
  badges = {},
  onNavigate,
  onItemSelected,
}) => (
  <div className="space-y-6">
    {NAVIGATION_GROUPS.map((group) => (
      <section
        key={group.id}
        aria-label={collapsed ? group.label : undefined}
        aria-labelledby={collapsed ? undefined : \`navigation-group-\${group.id}\`}
      >
        {!collapsed && (
          <h2
            id={\`navigation-group-\${group.id}\`}
            className="px-4 pb-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted"
          >
            {group.label}
          </h2>
        )}
        <div className="space-y-1">
          {group.items.map((item) => {
            const Icon = item.icon;
            const badge = badges[item.id];
            const active = isNavigationItemActive(item, current);
            const accessibleLabel =
              item.status === 'future' ? \`\${item.label}, Em breve\` : item.label;
            const button = (
              <button
                key={item.id}
                type="button"
                disabled={item.status === 'future'}
                aria-label={accessibleLabel}
                aria-current={active ? 'page' : undefined}
                onClick={() => {
                  if (!item.destination) return;
                  onNavigate(item.destination);
                  onItemSelected?.();
                }}
                className={[
                  'relative flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors',
                  item.status === 'future'
                    ? 'cursor-not-allowed border-transparent text-muted opacity-55'
                    : active
                      ? 'border-accent/25 bg-accent/12 text-accent shadow-sm shadow-accent/10'
                      : 'border-transparent text-secondary hover:bg-surface-2 hover:text-primary',
                ].join(' ')}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!collapsed && (
                  <>
                    <span className="min-w-0 flex-1 text-sm font-bold">{item.label}</span>
                    {item.status === 'future' && (
                      <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-secondary">
                        Em breve
                      </span>
                    )}
                    {badge && (
                      <span className={[
                        'flex h-[22px] min-w-[22px] items-center justify-center rounded-full border px-1.5 text-[10px] font-black',
                        badge.variant === 'danger'
                          ? 'border-danger/40 bg-danger/20 text-danger'
                          : 'border-warning/40 bg-warning/20 text-warning',
                        badge.pulse ? 'animate-pulse' : '',
                      ].join(' ')}>
                        {badge.count}
                      </span>
                    )}
                  </>
                )}
                {collapsed && badge && (
                  <span className={[
                    'absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-bg px-1 text-[9px] font-black text-white',
                    badge.variant === 'danger' ? 'bg-danger' : 'bg-warning',
                    badge.pulse ? 'animate-pulse' : '',
                  ].join(' ')}>
                    {badge.count}
                  </span>
                )}
              </button>
            );

            return collapsed ? (
              <Tooltip key={item.id} content={accessibleLabel} side="right">
                {button}
              </Tooltip>
            ) : (
              <React.Fragment key={item.id}>{button}</React.Fragment>
            );
          })}
        </div>
      </section>
    ))}
  </div>
);
\`\`\`

- [ ] **Step 4: Extrair a fonte compartilhada do badge de Ferias**

\`\`\`ts
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
\`\`\`

- [ ] **Step 5: Refatorar Sidebar sem alterar persistencia desktop**

Remover o inventario local, a busca local de Ferias, os imports de icones de modulo e as props de drawer. Manter o logo e o botao recolher/expandir. O contrato fica:

\`\`\`tsx
export interface SidebarProps {
  current: NavigationDestination;
  onNavigate: (next: NavigationDestination) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ current, onNavigate }) => {
  // manter collapsed e setCollapsedPersisted existentes
  const feriasBadge = useFeriasNavigationBadge();

  return (
    <div className="relative h-full overflow-visible">
      <aside
        className={[
          collapsed ? 'w-20' : 'w-72',
          'app-sidebar relative flex h-full flex-col border-r border-line-strong bg-surface transition-all duration-300 dark:border-line dark:bg-[#0a0d14]',
        ].join(' ')}
        aria-label="Navegacao principal"
      >
        {/* manter bloco de logo existente */}
        <nav className="relative z-10 flex-1 overflow-y-auto p-4">
          <NavigationGroups
            current={current}
            collapsed={collapsed}
            badges={{ ferias: feriasBadge }}
            onNavigate={onNavigate}
          />
        </nav>
      </aside>
      {/* manter botao desktop recolher/expandir existente, sem condicional mobile */}
    </div>
  );
};
\`\`\`

- [ ] **Step 6: Rodar testes e confirmar GREEN**

Run:

\`\`\`powershell
node --test components/navigation.test.ts components/NavigationGroups.test.ts
npm run typecheck
\`\`\`

Expected: 7 tests PASS e TypeScript sem erros.

- [ ] **Step 7: Commitar renderer, hook e Sidebar**

\`\`\`powershell
git add components/NavigationGroups.tsx components/NavigationGroups.test.ts components/useFeriasNavigationBadge.ts components/Sidebar.tsx
git commit -m "refactor: compartilhar grupos da navegacao"
\`\`\`

## Task 3: Drawer mobile acessivel e independente

**Files:**
- Create: \`components/MobileNavigationDrawer.tsx\`
- Create: \`components/MobileNavigationDrawer.test.ts\`

- [ ] **Step 1: Escrever o teste estatico que falha**

\`\`\`ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./MobileNavigationDrawer.tsx', import.meta.url), 'utf8');

test('drawer oferece os quatro caminhos de fechamento', () => {
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /aria-label="Fechar menu"/);
  assert.match(source, /onClick=\{onClose\}/);
  assert.match(source, /onItemSelected=\{onClose\}/);
});

test('drawer controla foco e rolagem sem usar estado recolhido', () => {
  assert.match(source, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(source, /previousOverflow/);
  assert.match(source, /previousActive\?\.focus\(\)/);
  assert.match(source, /event\.key === 'Tab'/);
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(source, /collapsed/);
});

test('drawer possui semantica modal e area segura', () => {
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /env\(safe-area-inset-bottom\)/);
});

test('drawer preserva o badge dinamico de Ferias', () => {
  assert.match(source, /useFeriasNavigationBadge/);
  assert.match(source, /badges=\{\{ ferias: feriasBadge \}\}/);
});
\`\`\`

- [ ] **Step 2: Rodar o teste e confirmar RED**

Run:

\`\`\`powershell
node --test components/MobileNavigationDrawer.test.ts
\`\`\`

Expected: FAIL porque o componente nao existe.

- [ ] **Step 3: Implementar drawer com trap de foco**

\`\`\`tsx
import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { NavigationGroups } from './NavigationGroups';
import { useFeriasNavigationBadge } from './useFeriasNavigationBadge';
import type { NavigationDestination } from './navigation';

interface MobileNavigationDrawerProps {
  open: boolean;
  current: NavigationDestination;
  onNavigate: (next: NavigationDestination) => void;
  onClose: () => void;
}

export const MobileNavigationDrawer: React.FC<MobileNavigationDrawerProps> = ({
  open,
  current,
  onNavigate,
  onClose,
}) => {
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const feriasBadge = useFeriasNavigationBadge();

  useEffect(() => {
    if (!open) return;
    const previousActive = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousActive?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10600] lg:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        aria-label="Fechar menu"
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-navigation-title"
        className="absolute inset-y-0 left-0 flex w-[min(88vw,360px)] flex-col border-r border-line-strong bg-surface shadow-2xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <header className="flex items-center justify-between border-b border-line-strong px-5 py-4">
          <div>
            <p id="mobile-navigation-title" className="text-sm font-black text-primary">
              SUPER FOLHA SYSTEM
            </p>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
              Navegacao
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar menu"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-line-strong text-secondary hover:bg-surface-2 hover:text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <nav className="flex-1 overflow-y-auto p-4" aria-label="Navegacao completa">
          <NavigationGroups
            current={current}
            badges={{ ferias: feriasBadge }}
            onNavigate={onNavigate}
            onItemSelected={onClose}
          />
        </nav>
      </aside>
    </div>
  );
};
\`\`\`

- [ ] **Step 4: Rodar teste e confirmar GREEN**

Run:

\`\`\`powershell
node --test components/MobileNavigationDrawer.test.ts
npm run typecheck
\`\`\`

Expected: 4 tests PASS e TypeScript sem erros.

- [ ] **Step 5: Commitar drawer**

\`\`\`powershell
git add components/MobileNavigationDrawer.tsx components/MobileNavigationDrawer.test.ts
git commit -m "feat: adicionar drawer mobile de navegacao"
\`\`\`

## Task 4: Barra inferior e integracao unica no App

**Files:**
- Create: \`components/BottomNavigation.tsx\`
- Create: \`components/BottomNavigation.test.ts\`
- Create: \`components/navigationAppIntegration.test.ts\`
- Modify: \`App.tsx:32,215-438,1917-1924,4168,4777-4816\`

- [ ] **Step 1: Escrever testes que falham para barra e App**

\`\`\`ts
// components/BottomNavigation.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./BottomNavigation.tsx', import.meta.url), 'utf8');

test('barra usa quatro itens do modelo e um botao Mais', () => {
  assert.match(source, /BOTTOM_NAVIGATION_IDS\.map/);
  assert.match(source, /grid-cols-5/);
  assert.match(source, />Mais</);
  assert.match(source, /isMoreNavigationActive\(current\)/);
});
\`\`\`

\`\`\`ts
// components/navigationAppIntegration.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

test('App usa um unico contrato de destino', () => {
  assert.match(appSource, /useState<ModuleId>/);
  assert.match(appSource, /const handleNavigate = \(next: NavigationDestination\)/);
  assert.match(appSource, /getDefaultPage\(next\.module\)/);
  assert.doesNotMatch(appSource, /const mod = module as 'folha'/);
  assert.doesNotMatch(appSource, /grid-cols-6/);
});

test('App monta drawer e barra extraida', () => {
  assert.match(appSource, /<MobileNavigationDrawer/);
  assert.match(appSource, /<BottomNavigation/);
  assert.match(appSource, /setMobileNavigationOpen\(true\)/);
});

test('atalho Bistro continua sendo Folha com pagina bistro', () => {
  assert.match(appSource, /handleNavigate\(\{ module: 'folha', page: 'bistro' \}\)/);
});
\`\`\`

- [ ] **Step 2: Rodar testes e confirmar RED**

Run:

\`\`\`powershell
node --test components/BottomNavigation.test.ts components/navigationAppIntegration.test.ts
\`\`\`

Expected: FAIL porque \`BottomNavigation.tsx\` nao existe e \`App.tsx\` ainda usa o contrato antigo.

- [ ] **Step 3: Criar BottomNavigation**

\`\`\`tsx
import React from 'react';
import { Menu } from 'lucide-react';
import { cn } from './UI';
import {
  BOTTOM_NAVIGATION_IDS,
  getNavigationItem,
  isMoreNavigationActive,
  isNavigationItemActive,
  type NavigationDestination,
} from './navigation';

interface BottomNavigationProps {
  current: NavigationDestination;
  moreOpen: boolean;
  onNavigate: (next: NavigationDestination) => void;
  onOpenMore: () => void;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  current,
  moreOpen,
  onNavigate,
  onOpenMore,
}) => {
  const moreActive = isMoreNavigationActive(current);
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[10500] border-t border-line/70 bg-surface lg:hidden"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 10px)' }}
      aria-label="Navegacao inferior"
    >
      <div className="grid grid-cols-5 gap-1 px-3 pt-2">
        {BOTTOM_NAVIGATION_IDS.map((id) => {
          const item = getNavigationItem(id);
          const Icon = item.icon;
          const active = isNavigationItemActive(item, current);
          return (
            <button
              key={id}
              type="button"
              onClick={() => item.destination && onNavigate(item.destination)}
              aria-current={active ? 'page' : undefined}
              aria-label={item.shortLabel ?? item.label}
              className={cn(
                'flex min-w-0 flex-col items-center justify-center gap-1.5 py-3 transition-colors',
                active ? 'text-accent' : 'text-muted hover:text-secondary',
              )}
            >
              <Icon className={cn('h-6 w-6', active && 'scale-110')} />
              <span className="max-w-full truncate text-[11px] font-medium">
                {item.shortLabel ?? item.label}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={onOpenMore}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          aria-current={moreActive ? 'page' : undefined}
          className={cn(
            'flex min-w-0 flex-col items-center justify-center gap-1.5 py-3 transition-colors',
            moreActive ? 'text-accent' : 'text-muted hover:text-secondary',
          )}
        >
          <Menu className={cn('h-6 w-6', moreActive && 'scale-110')} />
          <span className="text-[11px] font-medium">Mais</span>
        </button>
      </div>
    </nav>
  );
};
\`\`\`

- [ ] **Step 4: Migrar App para NavigationDestination**

Adicionar imports:

\`\`\`tsx
import { BottomNavigation } from './components/BottomNavigation';
import { MobileNavigationDrawer } from './components/MobileNavigationDrawer';
import {
  getDefaultPage,
  isModuleId,
  type ModuleId,
  type NavigationDestination,
} from './components/navigation';
\`\`\`

Adicionar \`useCallback\` ao import React existente no topo do \`App.tsx\`, sem criar um segundo import de \`react\`.

Substituir o estado e handler:

\`\`\`tsx
const [currentModule, setCurrentModule] = useState<ModuleId>(() =>
  window.location.pathname === '/cartoes' || window.location.pathname === '/faturas'
    ? 'cartoes'
    : 'folha',
);
const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
const openMobileNavigation = useCallback(() => setMobileNavigationOpen(true), []);
const closeMobileNavigation = useCallback(() => setMobileNavigationOpen(false), []);

const handleNavigate = (next: NavigationDestination) => {
  setCurrentModule(next.module);
  setActiveTab(next.page ?? getDefaultPage(next.module));
  if (next.module === 'folha') setUnidadeFiltro('todos');

  try {
    const targetPath = next.module === 'cartoes' ? '/cartoes' : '/';
    if (window.location.pathname !== targetPath) {
      window.history.pushState(
        {},
        '',
        \`\${targetPath}\${window.location.search || ''}\${window.location.hash || ''}\`,
      );
    }
  } catch {
    // ignore navigation sync errors
  }
};
\`\`\`

No listener \`la:navigate\`, validar e normalizar antes de navegar:

\`\`\`tsx
const requestedModule = detail.module === 'faturas' ? 'cartoes' : detail.module;
if (!isModuleId(requestedModule)) return;
handleNavigate({ module: requestedModule, page: detail.page });
\`\`\`

Atualizar todos os chamadores:

\`\`\`tsx
handleNavigate({ module: 'cartoes' });
handleNavigate({ module: moduleParam, page: pageParam || undefined });
onNavigate={handleNavigate}
onOpenContasPagar={() => handleNavigate({ module: 'contas' })}
\`\`\`

Montar os componentes no final do App:

\`\`\`tsx
<MobileNavigationDrawer
  open={mobileNavigationOpen}
  current={{ module: currentModule, page: activeTab }}
  onNavigate={handleNavigate}
  onClose={closeMobileNavigation}
/>
<BottomNavigation
  current={{ module: currentModule, page: activeTab }}
  moreOpen={mobileNavigationOpen}
  onNavigate={handleNavigate}
  onOpenMore={openMobileNavigation}
/>
\`\`\`

Remover integralmente o \`<nav>\` inline de seis colunas e os casts \`as any\` no \`Sidebar\`:

\`\`\`tsx
<Sidebar
  current={{ module: currentModule, page: activeTab }}
  onNavigate={handleNavigate}
/>
\`\`\`

- [ ] **Step 5: Rodar testes focados e corrigir somente o necessario**

Run:

\`\`\`powershell
node --test components/navigation.test.ts components/NavigationGroups.test.ts components/MobileNavigationDrawer.test.ts components/BottomNavigation.test.ts components/navigationAppIntegration.test.ts components/cartoes/cartoesNavigation.test.ts
npm run typecheck
\`\`\`

Expected: todos os testes PASS e TypeScript sem erros.

- [ ] **Step 6: Commitar integracao**

\`\`\`powershell
git add App.tsx components/BottomNavigation.tsx components/BottomNavigation.test.ts components/navigationAppIntegration.test.ts
git commit -m "feat: integrar navegacao mobile reorganizada"
\`\`\`

## Task 5: Regressao completa e Agent Browser

**Files:**
- Modify only if a failing test identifies a regression in the files already listed.

- [ ] **Step 1: Rodar a suite completa**

Run:

\`\`\`powershell
node --test
\`\`\`

Expected: todos os testes do repositorio PASS.

- [ ] **Step 2: Rodar gates de compilacao**

Run:

\`\`\`powershell
npm run typecheck
npm run build
git diff --check origin/main...HEAD
\`\`\`

Expected: tres comandos com exit code 0.

- [ ] **Step 3: Confirmar escopo do diff**

Run:

\`\`\`powershell
git diff --name-only origin/main...HEAD
git diff --stat origin/main...HEAD
\`\`\`

Expected: somente especificacao/plano, \`App.tsx\`, arquivos de navegacao em \`components\` e testes correspondentes. Nenhum caminho em \`supabase/\`, \`services/\` ou migrations.

- [ ] **Step 4: Iniciar o preview**

Run:

\`\`\`powershell
npm run dev -- --host 127.0.0.1
\`\`\`

Expected: Vite informa uma URL local sem reutilizar uma porta ocupada.

- [ ] **Step 5: Validar desktop claro e escuro no Agent Browser**

Checklist:

- sidebar mostra Financeiro, RH / DP e Configuracoes na ordem aprovada;
- Contas a Pagar aparece somente em Financeiro;
- os oito itens futuros exibem \`Em breve\` e nao respondem a clique;
- todos os destinos ativos navegam;
- Bistrô abre Folha na aba Bistrô e somente Bistrô fica ativo;
- recolher/expandir desktop continua persistindo;
- badge de Ferias permanece visivel quando houver contagem.

- [ ] **Step 6: Validar mobile claro e escuro no Agent Browser**

Usar viewport aproximada de 390x844 e conferir:

- barra inferior possui Folha, Contas, Cartoes, Agenda e Mais;
- \`Mais\` fica ativo em Bistrô, Jornada RH, Ferias e Notificacoes;
- drawer abre sempre expandido mesmo se a sidebar desktop estiver recolhida;
- drawer fecha por item, backdrop, X e Escape;
- foco retorna ao botao \`Mais\`;
- pagina nao rola por baixo do drawer;
- nenhum texto, badge ou controle sobrepoe ou causa rolagem horizontal.

- [ ] **Step 7: Rodar gates novamente depois do QA**

Run:

\`\`\`powershell
node --test
npm run typecheck
npm run build
git diff --check origin/main...HEAD
git status --short
\`\`\`

Expected: suite e gates verdes; working tree contem apenas ajustes intencionais ainda nao commitados.

- [ ] **Step 8: Commitar eventuais ajustes de QA**

\`\`\`powershell
git add App.tsx components/navigation.ts components/navigation.test.ts components/NavigationGroups.tsx components/NavigationGroups.test.ts components/useFeriasNavigationBadge.ts components/MobileNavigationDrawer.tsx components/MobileNavigationDrawer.test.ts components/BottomNavigation.tsx components/BottomNavigation.test.ts components/navigationAppIntegration.test.ts
git commit -m "test: validar navegacao reorganizada"
\`\`\`

Se nao houver ajuste depois do QA, nao criar commit vazio.

## Evidencia final esperada

- hashes dos commits da implementacao;
- lista completa de arquivos tocados;
- resultados numericos de \`node --test\`;
- saida verde de typecheck, build e diff check;
- URL local usada no Agent Browser;
- matriz desktop/mobile e claro/escuro;
- confirmacao de que nao houve backend, migration, seed ou Edge Function;
- confirmacao de que \`isMobileDrawer\`, \`onCloseMobileDrawer\`, o inventario local da Sidebar e a barra inline de seis itens foram removidos.
