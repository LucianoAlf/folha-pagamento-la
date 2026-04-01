import React from 'react';
import {
  ClipboardCheck,
  FileBadge,
  LayoutDashboard,
  LogIn,
  LogOut,
  Target,
  Users,
} from 'lucide-react';
import type { RhJornadaTab } from '../../types/rh';
import { CandidatosTab } from './tabs/CandidatosTab';
import { DashboardTab } from './tabs/DashboardTab';
import { DesligamentosTab } from './tabs/DesligamentosTab';
import { DocumentosTab } from './tabs/DocumentosTab';
import { DesenvolvimentoTab } from './tabs/DesenvolvimentoTab';
import { ColaboradoresTab } from './tabs/ColaboradoresTab';
import { OnboardingTab } from './tabs/OnboardingTab';
import { TemplatesTab } from './tabs/TemplatesTab';
import { RhPlaceholderTab } from './tabs/RhPlaceholderTab';

const TAB_META: Record<RhJornadaTab, {
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  highlights: string[];
  foundation: string[];
}> = {
  dashboard: {
    title: 'Dashboard RH',
    subtitle: 'Visão operacional do RH com fila, vencimentos e alertas críticos.',
    icon: LayoutDashboard,
    highlights: ['Minha fila', 'Atrasados', 'Vence em 5 dias', 'Últimos eventos'],
    foundation: ['Views SQL de KPI previstas', 'Filtros globais por unidade, contrato e responsável', 'Base pronta para cards e painéis'],
  },
  candidatos: {
    title: 'Candidatos',
    subtitle: 'Pipeline de recrutamento como processo estruturado.',
    icon: Users,
    highlights: ['Questionário', 'Entrevista RH', 'Aula teste', 'Aprovação e conversão em onboarding'],
    foundation: ['`rh_candidatos` como cadastro-base', '`rh_processos.tipo = recrutamento`', 'Espaço preparado para currículo/PDF e avaliações'],
  },
  onboarding: {
    title: 'Onboarding',
    subtitle: 'Jornada completa de entrada, incluindo experiência, cultura e treinamentos.',
    icon: LogIn,
    highlights: ['Template oficial da Ana', 'Responsáveis múltiplos', 'Checkpoints 7/30/45/90', 'Documentos e histórico'],
    foundation: ['Etapas oficiais já seedadas em template', 'Checklist e documentos materializados por processo', 'Mentor e owner separados na modelagem'],
  },
  colaboradores: {
    title: 'Colaboradores',
    subtitle: 'Dossiê vivo do colaborador com jornada, documentos permanentes e marcos.',
    icon: Users,
    highlights: ['Dossiê documental', 'Histórico da jornada', 'Marcos celebrados', 'Movimentações de carreira'],
    foundation: ['`rh_colaborador_jornadas` e `rh_colaborador_documentos`', 'Linha do tempo viva por colaborador', 'Base pronta para centralizar documentos permanentes'],
  },
  desenvolvimento: {
    title: 'Desenvolvimento / PDI',
    subtitle: 'Plano individual, competências, checkpoints, feedbacks e carreira gamificada.',
    icon: Target,
    highlights: ['Objetivos por ciclo', 'Checkpoints 30/60/90', 'Evidências e feedbacks', 'Badges e progressão'],
    foundation: ['`rh_pdi_planos`, objetivos, checkpoints e feedbacks', 'Seeds de ciclos, badges e níveis', 'Base pronta para score e celebrações'],
  },
  desligamentos: {
    title: 'Desligamentos',
    subtitle: 'Fluxo formal de saída com aviso prévio, checklist e rescisão.',
    icon: LogOut,
    highlights: ['Aviso prévio', 'Redução 2h/7 dias', 'Checklist documental', 'Entrevista de saída'],
    foundation: ['`rh_desligamentos` separado', 'Base pronta para PDF de aviso prévio', 'Controle documental e financeiro preparado'],
  },
  documentos: {
    title: 'Documentos',
    subtitle: 'Inbox central de documentos enviados, conferidos, rejeitados e gerados.',
    icon: FileBadge,
    highlights: ['Upload privado', 'Conferência', 'Motivo de rejeição', 'Documentos oficiais gerados'],
    foundation: ['Bucket privado `rh-documentos`', '`rh_documentos` e `rh_documentos_gerados`', 'Template/versionamento preservado no histórico'],
  },
  templates: {
    title: 'Templates',
    subtitle: 'Modelos versionados por processo, vínculo, cargo e unidade.',
    icon: ClipboardCheck,
    highlights: ['Etapas padrão', 'Checklist padrão', 'Documentos obrigatórios', 'Responsáveis padrão'],
    foundation: ['Seed inicial de recrutamento, onboarding e desligamento', 'Versionamento em `rh_templates`', 'Offsets de prazo previstos para alertas'],
  },
};

export const RhJornadaPage: React.FC<{ mode?: RhJornadaTab }> = ({ mode = 'dashboard' }) => {
  const meta = TAB_META[mode];
  if (mode === 'dashboard') return <DashboardTab />;
  if (mode === 'candidatos') return <CandidatosTab />;
  if (mode === 'onboarding') return <OnboardingTab />;
  if (mode === 'colaboradores') return <ColaboradoresTab />;
  if (mode === 'desenvolvimento') return <DesenvolvimentoTab />;
  if (mode === 'desligamentos') return <DesligamentosTab />;
  if (mode === 'documentos') return <DocumentosTab />;
  if (mode === 'templates') return <TemplatesTab />;

  return <RhPlaceholderTab title={meta.title} subtitle={meta.subtitle} highlights={meta.highlights} foundation={meta.foundation} />;
};
