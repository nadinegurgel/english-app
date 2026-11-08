export function normalizeTerm(term: string): string {
  return term.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Splits pasted text into unique terms, one per line, keeping the first spelling. */
export function parseTerms(text: string): { terms: string[]; repeatedInPaste: number } {
  const seen = new Set<string>();
  const terms: string[] = [];
  let repeatedInPaste = 0;
  for (const line of text.split("\n")) {
    const term = line.trim().replace(/\s+/g, " ");
    if (!term) continue;
    const key = normalizeTerm(term);
    if (seen.has(key)) {
      repeatedInPaste++;
      continue;
    }
    seen.add(key);
    terms.push(term);
  }
  return { terms, repeatedInPaste };
}

/** Mirrors the API check: the sentence must contain the term as a whole word or expression. */
export function sentenceContainsTerm(sentence: string, term: string): boolean {
  const escaped = normalizeTerm(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}])${escaped}($|[^\\p{L}])`, "iu").test(sentence);
}
