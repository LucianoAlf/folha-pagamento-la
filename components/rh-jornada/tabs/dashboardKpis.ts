export type DashboardKpiTone = 'primary' | 'warning' | 'danger' | 'accent' | 'info' | 'success';

export type DashboardKpiMetric = {
  id: string;
  label: string;
  subvalue: string;
  value: number;
  tone: DashboardKpiTone;
};

export type DashboardKpiGroup = {
  id: 'operacao' | 'desenvolvimento';
  label: string;
  metrics: DashboardKpiMetric[];
};

export type DashboardKpiValues = {
  recrutamentos: number;
  onboardings: number;
  desligamentos: number;
  documentosPendentes: number;
  criticos: number;
  pdisAtivos: number;
  checkpointsAtrasados: number;
  conquistasMes: number;
  prontosParaPromocao: number;
  colaboradoresTravados: number;
};

export function getDashboardKpiGroups(values: DashboardKpiValues): DashboardKpiGroup[] {
  return [
    {
      id: 'operacao',
      label: 'Operação',
      metrics: [
        { id: 'recrutamentos', label: 'Recrutamentos', subvalue: 'Ativos', value: values.recrutamentos, tone: 'primary' },
        { id: 'onboardings', label: 'Onboardings', subvalue: 'Em andamento', value: values.onboardings, tone: 'primary' },
        { id: 'desligamentos', label: 'Desligamentos', subvalue: 'Abertos', value: values.desligamentos, tone: 'primary' },
        { id: 'documentos', label: 'Documentos', subvalue: 'Pendentes', value: values.documentosPendentes, tone: 'warning' },
        { id: 'criticos', label: 'Críticos', subvalue: 'Atrasados', value: values.criticos, tone: 'danger' },
      ],
    },
    {
      id: 'desenvolvimento',
      label: 'Desenvolvimento de pessoas',
      metrics: [
        { id: 'pdis', label: 'PDI ativos', subvalue: 'Planos em andamento', value: values.pdisAtivos, tone: 'accent' },
        { id: 'checkpoints', label: 'Checkpoints', subvalue: 'Atrasados', value: values.checkpointsAtrasados, tone: 'info' },
        { id: 'conquistas', label: 'Conquistas', subvalue: 'No mês', value: values.conquistasMes, tone: 'success' },
        { id: 'promocao', label: 'Promoção', subvalue: 'Prontos', value: values.prontosParaPromocao, tone: 'info' },
        { id: 'travados', label: 'Travados', subvalue: 'Desenvolvimento', value: values.colaboradoresTravados, tone: 'danger' },
      ],
    },
  ];
}
