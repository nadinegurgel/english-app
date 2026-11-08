export function normalizeTerm(term: string): string {
  return term.trim().replace(/\s+/g, " ").toLowerCase();
}

/** True when the sentence contains the term as a whole word or expression, ignoring case. */
export function sentenceContainsTerm(sentence: string, term: string): boolean {
  const escaped = normalizeTerm(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}])${escaped}($|[^\\p{L}])`, "iu").test(sentence);
}
