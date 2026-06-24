export type NowSaoPaulo = {
  date: string;
  time: string;
  dow: number;
  dom: number;
};

export type GrupoNotificacaoSchedule = {
  frequencia?: string | null;
  horario?: string | null;
  dia_semana?: number | null;
  dia_mes?: number | null;
  ultima_execucao?: string | null;
};

const TZ = "America/Sao_Paulo";

function partsSaoPaulo(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    weekday: get("weekday"),
  };
}

function dowFromShort(value: string): number {
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[value] ?? 0;
}

export function nowSaoPaulo(date = new Date()): NowSaoPaulo {
  const parts = partsSaoPaulo(date);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    dow: dowFromShort(parts.weekday),
    dom: Number(parts.day),
  };
}

export function dateSaoPaulo(dateIso: string | null | undefined): string | null {
  if (!dateIso) return null;
  const parsed = new Date(dateIso);
  if (Number.isNaN(parsed.getTime())) return null;
  const parts = partsSaoPaulo(parsed);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function horarioHHMM(value: string | null | undefined): string {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "00:00";
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

export function avaliarAgendamentoGrupo(input: {
  notificacao: GrupoNotificacaoSchedule;
  nowSP: NowSaoPaulo;
}) {
  const { notificacao, nowSP } = input;
  const horario = horarioHHMM(notificacao.horario);
  const horaChegou = nowSP.time >= horario;
  const jaRodouHoje = dateSaoPaulo(notificacao.ultima_execucao) === nowSP.date;
  const frequencia = String(notificacao.frequencia || "diario");

  let na_hora = false;
  if (frequencia === "diario") {
    na_hora = horaChegou;
  } else if (frequencia === "semanal") {
    na_hora = Number(notificacao.dia_semana) === nowSP.dow && horaChegou;
  } else if (frequencia === "mensal") {
    na_hora = Number(notificacao.dia_mes) === nowSP.dom && horaChegou;
  }

  return {
    horario,
    horaChegou,
    jaRodouHoje,
    na_hora,
    deveDisparar: na_hora && !jaRodouHoje,
  };
}
