function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        const next = value[key];
        if (next !== undefined) result[key] = canonicalize(next);
        return result;
      }, {});
  }
  return value;
}

export async function hashFichaSnapshot(ficha) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(ficha)));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function decideFichaRefresh({ previousHash, nextHash, hasInterviewQuestions }) {
  const changed = previousHash !== nextHash;
  return {
    changed,
    perguntasDesatualizadas: changed && hasInterviewQuestions,
  };
}
