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
    subtitle: 'Visao operacional do RH com fila, vencimentos e alertas criticos.',
    icon: LayoutDashboard,
    highlights: ['Minha fila', 'Atrasados', 'Vence em 5 dias', 'Ultimos eventos'],
    foundation: ['Indicadores prontos para operacao', 'Filtros globais por unidade, contrato e responsavel', 'Base preparada para paineis e resumos'],
  },
  candidatos: {
    title: 'Candidatos',
    subtitle: 'Pipeline de recrutamento como processo estruturado.',
    icon: Users,
    highlights: ['Questionario', 'Entrevista RH', 'Aula teste', 'Aprovacao e conversao em onboarding'],
    foundation: ['Cadastro-base de candidatos', 'Recrutamento tratado como processo', 'Espaco pronto para curriculo, anexos e avaliacoes'],
  },
  onboarding: {
    title: 'Onboarding',
    subtitle: 'Jornada completa de entrada, incluindo experiencia, cultura e treinamentos.',
    icon: LogIn,
    highlights: ['Template oficial da Ana', 'Responsaveis multiplos', 'Checkpoints 7/30/45/90', 'Documentos e historico'],
    foundation: ['Etapas oficiais ja preparadas no template', 'Checklist e documentos materializados por processo', 'Mentor e responsavel principal separados na estrutura'],
  },
  colaboradores: {
    title: 'Colaboradores',
    subtitle: 'Dossie vivo do colaborador com jornada, documentos permanentes e marcos.',
    icon: Users,
    highlights: ['Dossie documental', 'Historico da jornada', 'Marcos celebrados', 'Movimentacoes de carreira'],
    foundation: ['Jornada viva por colaborador', 'Documentos permanentes centralizados', 'Base pronta para acompanhar evolucao e marcos'],
  },
  desenvolvimento: {
    title: 'Desenvolvimento / PDI',
    subtitle: 'Plano individual, competencias, checkpoints, devolutivas e carreira gamificada.',
    icon: Target,
    highlights: ['Objetivos por ciclo', 'Checkpoints 30/60/90', 'Evidencias e devolutivas', 'Badges e progressao'],
    foundation: ['Planos, objetivos e checkpoints estruturados', 'Ciclos, badges e niveis preparados', 'Base pronta para progresso e celebracoes'],
  },
  desligamentos: {
    title: 'Desligamentos',
    subtitle: 'Fluxo formal de saida com aviso previo, checklist e rescisao.',
    icon: LogOut,
    highlights: ['Aviso previo', 'Reducao 2h/7 dias', 'Checklist documental', 'Entrevista de saida'],
    foundation: ['Dados especificos de desligamento separados', 'Base pronta para gerar PDFs oficiais', 'Controle documental e financeiro preparado'],
  },
  documentos: {
    title: 'Documentos',
    subtitle: 'Caixa central de documentos enviados, conferidos, rejeitados e gerados.',
    icon: FileBadge,
    highlights: ['Upload privado', 'Conferencia', 'Motivo de rejeicao', 'Documentos oficiais gerados'],
    foundation: ['Bucket privado de documentos', 'Historico dos arquivos preservado', 'Versionamento e rastreabilidade mantidos'],
  },
  templates: {
    title: 'Templates',
    subtitle: 'Templates versionados por processo, vinculo, cargo e unidade.',
    icon: ClipboardCheck,
    highlights: ['Etapas padrao', 'Checklist padrao', 'Documentos obrigatorios', 'Responsaveis padrao'],
    foundation: ['Base inicial de recrutamento, onboarding e desligamento', 'Versionamento de templates preservado', 'Prazos previstos para alertas'],
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
