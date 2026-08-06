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
        },
        required: ['pilar', 'pergunta', 'ancora'],
      },
    },
  },
  required: ['perguntas'],
};
