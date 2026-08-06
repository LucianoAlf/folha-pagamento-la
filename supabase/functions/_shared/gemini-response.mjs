export function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  return Array.isArray(parts)
    ? parts.map((part) => typeof part?.text === 'string' ? part.text : '').join('').trim()
    : '';
}

export function describeGeminiResponse(data) {
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  const candidate = candidates[0];
  const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];

  return {
    candidateCount: candidates.length,
    finishReason: candidate?.finishReason ?? null,
    partCount: parts.length,
    parts: parts.map((part) => ({
      fields: Object.keys(part ?? {}).sort(),
      textLength: typeof part?.text === 'string' ? part.text.length : null,
      thought: part?.thought === true,
    })),
  };
}
