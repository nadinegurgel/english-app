export function normalizeTerm(term: string): string {
  return term.trim().replace(/\s+/g, " ").toLowerCase();
}

function termPattern(term: string): RegExp {
  const escaped = normalizeTerm(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}])${escaped}($|[^\\p{L}])`, "iu");
}

/** True when the sentence contains the term as a whole word or expression, ignoring case. */
export function sentenceContainsTerm(sentence: string, term: string): boolean {
  return termPattern(term).test(sentence);
}

/** Replaces the first occurrence of the term with a blank. */
export function blankOutTerm(sentence: string, term: string): string {
  return sentence.replace(termPattern(term), (_match, before: string, after: string) => {
    return `${before}_____${after}`;
  });
}
