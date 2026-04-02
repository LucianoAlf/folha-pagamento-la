import React, { useEffect, useState } from 'react';
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

const TAB_META: Record<
  RhJornadaTab,
  {
    title: string;
    subtitle: string;
    icon: React.ComponentType<{ className?: string }>;
    highlights: string[];
    foundation: string[];
  }
> = {
  dashboard: {
    title: 'Dashboard RH',
    subtitle: 'Visão operacional do RH com fila, vencimentos e alertas críticos.',
    icon: LayoutDashboard,
    highlights: ['Minha fila', 'Atrasados', 'Vence em 5 dias', 'Últimos eventos'],
    foundation: ['Indicadores prontos para operação', 'Filtros globais por unidade, contrato e responsável', 'Base preparada para painéis e resumos'],
  },
  candidatos: {
    title: 'Candidatos',
    subtitle: 'Pipeline de recrutamento como processo estruturado.',
    icon: Users,
    highlights: ['Questionário', 'Entrevista RH', 'Aula teste', 'Aprovação e conversão em onboarding'],
    foundation: ['Cadastro-base de candidatos', 'Recrutamento tratado como processo', 'Espaço pronto para currículo, anexos e avaliações'],
  },
  onboarding: {
    title: 'Onboarding',
    subtitle: 'Jornada completa de entrada, incluindo experiência, cultura e treinamentos.',
    icon: LogIn,
    highlights: ['Template oficial da Ana', 'Responsáveis múltiplos', 'Checkpoints 7/30/45/90', 'Documentos e histórico'],
    foundation: ['Etapas oficiais já preparadas no template', 'Checklist e documentos materializados por processo', 'Mentor e responsável principal separados na estrutura'],
  },
  colaboradores: {
    title: 'Colaboradores',
    subtitle: 'Dossiê vivo do colaborador com jornada, documentos permanentes e marcos.',
    icon: Users,
    highlights: ['Dossiê documental', 'Histórico da jornada', 'Marcos celebrados', 'Movimentações de carreira'],
    foundation: ['Jornada viva por colaborador', 'Documentos permanentes centralizados', 'Base pronta para acompanhar evolução e marcos'],
  },
  desenvolvimento: {
    title: 'Desenvolvimento / PDI',
    subtitle: 'Plano individual, competências, checkpoints, devolutivas e carreira gamificada.',
    icon: Target,
    highlights: ['Objetivos por ciclo', 'Checkpoints 30/60/90', 'Evidências e devolutivas', 'Badges e progressão'],
    foundation: ['Planos, objetivos e checkpoints estruturados', 'Ciclos, badges e níveis preparados', 'Base pronta para progresso e celebrações'],
  },
  desligamentos: {
    title: 'Desligamentos',
    subtitle: 'Fluxo formal de saída com aviso prévio, checklist e rescisão.',
    icon: LogOut,
    highlights: ['Aviso prévio', 'Redução 2h/7 dias', 'Checklist documental', 'Entrevista de saída'],
    foundation: ['Dados específicos de desligamento separados', 'Base pronta para gerar PDFs oficiais', 'Controle documental e financeiro preparado'],
  },
  documentos: {
    title: 'Documentos',
    subtitle: 'Caixa central de documentos enviados, conferidos, rejeitados e gerados.',
    icon: FileBadge,
    highlights: ['Upload privado', 'Conferência', 'Motivo de rejeição', 'Documentos oficiais gerados'],
    foundation: ['Bucket privado de documentos', 'Histórico dos arquivos preservado', 'Versionamento e rastreabilidade mantidos'],
  },
  templates: {
    title: 'Modelos',
    subtitle: 'Modelos versionados por processo, vínculo, cargo e unidade.',
    icon: ClipboardCheck,
    highlights: ['Etapas padrão', 'Checklist padrão', 'Documentos obrigatórios', 'Responsáveis padrão'],
    foundation: ['Base inicial de recrutamento, onboarding e desligamento', 'Versionamento de modelos preservado', 'Prazos previstos para alertas'],
  },
};

export const RhJornadaPage: React.FC<{ mode?: RhJornadaTab }> = ({ mode = 'dashboard' }) => {
  const meta = TAB_META[mode];
  const [visitedTabs, setVisitedTabs] = useState<RhJornadaTab[]>([mode]);

  useEffect(() => {
    setVisitedTabs((current) => (current.includes(mode) ? current : [...current, mode]));
  }, [mode]);

  if (
    mode !== 'dashboard' &&
    mode !== 'candidatos' &&
    mode !== 'onboarding' &&
    mode !== 'colaboradores' &&
    mode !== 'desenvolvimento' &&
    mode !== 'desligamentos' &&
    mode !== 'documentos' &&
    mode !== 'templates'
  ) {
    return <RhPlaceholderTab title={meta.title} subtitle={meta.subtitle} highlights={meta.highlights} foundation={meta.foundation} />;
  }

  const tabContent: Record<RhJornadaTab, React.ReactNode> = {
    dashboard: <DashboardTab />,
    candidatos: <CandidatosTab />,
    onboarding: <OnboardingTab />,
    colaboradores: <ColaboradoresTab />,
    desenvolvimento: <DesenvolvimentoTab />,
    desligamentos: <DesligamentosTab />,
    documentos: <DocumentosTab />,
    templates: <TemplatesTab />,
  };

  return (
    <>
      {visitedTabs.map((tab) => (
        <div key={tab} className={tab === mode ? 'block' : 'hidden'} aria-hidden={tab !== mode}>
          {tabContent[tab]}
        </div>
      ))}
    </>
  );
};
