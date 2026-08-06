export const INTERVIEW_QUESTION_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    perguntas: {
      type: 'array',
      minItems: 6,
      maxItems: 9,
      items: {
        type: 'object',
        properties: {
          pilar: { type: 'string', enum: ['comportamental', 'cultura', 'tecnica'] },
          pergunta: { type: 'string' },
          ancora: { type: 'string' },
          titulo_curto: { type: 'string' },
          sinal_consistencia: { type: 'string' },
          sinal_atencao: { type: 'string' },
        },
        required: ['pilar', 'pergunta', 'ancora', 'titulo_curto', 'sinal_consistencia', 'sinal_atencao'],
      },
    },
  },
  required: ['perguntas'],
};
