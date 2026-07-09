import { sendWhatsappMessage } from './whatsappService';

export const ANA_WHATSAPP_FOLHA = '5521965910990';

type FolhaAprovadaWhatsappInput = {
  mes?: number | null;
  ano?: number | null;
};

const capitalize = (value: string) => (
  value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value
);

export function formatFolhaCompetenciaLabel(input: FolhaAprovadaWhatsappInput): string {
  const mes = Number(input.mes);
  const ano = Number(input.ano);

  if (!mes || !ano || mes < 1 || mes > 12) {
    return 'o mês selecionado';
  }

  const monthName = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
  return `${capitalize(monthName)}/${ano}`;
}

export function buildAnaFolhaAprovadaMessage(input: FolhaAprovadaWhatsappInput): string {
  const competencia = formatFolhaCompetenciaLabel(input);

  return [
    `Ana, notícia boa: o chefe aprovou a folha de ${competencia} ✅`,
    '',
    'Pode seguir com a rotina daí.',
    'Prometo que dessa vez eu não vou fingir que fui eu quem aprovou 😄',
    '',
    '— Maria',
  ].join('\n');
}

export async function notifyAnaFolhaAprovada(input: FolhaAprovadaWhatsappInput): Promise<void> {
  await sendWhatsappMessage(ANA_WHATSAPP_FOLHA, buildAnaFolhaAprovadaMessage(input));
}
