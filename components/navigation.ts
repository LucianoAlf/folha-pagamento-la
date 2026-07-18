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
  'contas-receber',
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
  accessibleLabel: string;
  pulse?: boolean;
}

interface NavigationItemBase {
  id: NavigationItemId;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
}

interface ActiveNavigationItem extends NavigationItemBase {
  status: 'active';
  destination: NavigationDestination;
  activeMode?: 'module' | 'exact';
  excludedPages?: string[];
}

interface FutureNavigationItem extends NavigationItemBase {
  status: 'future';
  destination?: never;
  activeMode?: never;
  excludedPages?: never;
}

export type NavigationItem = ActiveNavigationItem | FutureNavigationItem;

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
      {
        id: 'dashboard-financeiro',
        label: 'Dashboard financeiro',
        icon: BarChart3,
        status: 'future',
      },
      {
        id: 'contas',
        label: 'Contas a Pagar',
        shortLabel: 'Contas',
        icon: CreditCard,
        status: 'active',
        destination: { module: 'contas' },
      },
      {
        id: 'contas-receber',
        label: 'Contas a Receber',
        icon: CircleDollarSign,
        status: 'active',
        destination: { module: 'contas-receber' },
      },
      {
        id: 'fluxo-caixa',
        label: 'Fluxo de Caixa',
        icon: RefreshCw,
        status: 'future',
      },
      { id: 'dre', label: 'DRE', icon: BarChart3, status: 'future' },
      {
        id: 'conciliacao',
        label: 'Conciliação',
        icon: Landmark,
        status: 'future',
      },
      {
        id: 'cartoes',
        label: 'Cartões',
        shortLabel: 'Cartões',
        icon: WalletCards,
        status: 'active',
        destination: { module: 'cartoes' },
      },
      {
        id: 'bistro',
        label: 'Bistrô',
        icon: ChefHat,
        status: 'future',
      },
    ],
  },
  {
    id: 'rh-dp',
    label: 'RH / DP',
    items: [
      {
        id: 'folha',
        label: 'Folha de Pagamento',
        shortLabel: 'Folha',
        icon: Users,
        status: 'active',
        destination: { module: 'folha' },
      },
      {
        id: 'rh',
        label: 'Jornada RH',
        icon: UserCheck,
        status: 'active',
        destination: { module: 'rh' },
      },
      {
        id: 'ferias',
        label: 'Férias CLT',
        icon: CalendarCheck,
        status: 'active',
        destination: { module: 'ferias' },
      },
      {
        id: 'agenda',
        label: 'Agenda',
        shortLabel: 'Agenda',
        icon: Calendar,
        status: 'active',
        destination: { module: 'agenda' },
      },
    ],
  },
  {
    id: 'configuracoes',
    label: 'Configurações',
    items: [
      {
        id: 'notificacoes',
        label: 'Notificações',
        icon: Bell,
        status: 'active',
        destination: { module: 'notificacoes' },
      },
      {
        id: 'gerenciar-plano-contas',
        label: 'Gerenciar plano de contas',
        icon: ListTree,
        status: 'future',
      },
      {
        id: 'gerenciar-centros-custo',
        label: 'Gerenciar centros de custo',
        icon: Building2,
        status: 'future',
      },
      {
        id: 'gerenciar-empresas-contas',
        label: 'Gerenciar empresas e contas bancárias',
        icon: Landmark,
        status: 'future',
      },
    ],
  },
];

export const BOTTOM_NAVIGATION_IDS = ['folha', 'contas', 'cartoes', 'agenda'] as const;

const DEFAULT_PAGE: Record<ModuleId, string> = {
  folha: 'dashboard',
  contas: 'dashboard',
  'contas-receber': 'dashboard',
  cartoes: 'cartoes',
  agenda: 'agenda',
  notificacoes: 'notificacoes',
  ferias: 'ferias',
  rh: 'dashboard',
};

const allItems = NAVIGATION_GROUPS.flatMap((group) => group.items);

export function getNavigationItem(id: NavigationItemId): NavigationItem {
  const item = allItems.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Item de navegacao desconhecido: ${id}`);
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
