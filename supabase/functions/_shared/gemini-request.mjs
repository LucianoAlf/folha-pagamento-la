function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

function currentTextMimeType(value) {
  if (value === 'application/json') return 'APPLICATION_JSON';
  if (value === 'text/plain') return 'TEXT_PLAIN';
  return value;
}

export function buildGeminiGenerateContentBody(prompt, { isGemini3, config = {} } = {}) {
  const structuredOutput = config.responseMimeType && config.responseJsonSchema
    ? {
        mimeType: currentTextMimeType(config.responseMimeType),
        schema: config.responseJsonSchema,
      }
    : undefined;

  const generationConfig = isGemini3
    ? compact({
        maxOutputTokens: config.maxOutputTokens ?? 2048,
        thinkingConfig: { thinkingLevel: (config.thinkingLevel ?? 'low').toUpperCase() },
        responseFormat: structuredOutput ? { text: structuredOutput } : undefined,
      })
    : compact({
        temperature: config.temperature ?? 0.2,
        topP: config.topP ?? 0.9,
        topK: config.topK,
        maxOutputTokens: config.maxOutputTokens ?? 2048,
        responseMimeType: config.responseMimeType,
        responseJsonSchema: config.responseJsonSchema,
      });

  return {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig,
  };
}
