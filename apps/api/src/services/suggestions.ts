import { z } from "zod";
import { normalizeTerm, sentenceContainsTerm } from "../lib/normalize.js";
import { askClaude } from "./claude.js";

const SYSTEM_PROMPT = `You help a Brazilian university student learn English vocabulary.
For each English word or expression you receive, write:
- meaningPt: its most common meaning in Brazilian Portuguese, short (1 to 4 words). If there are two very common meanings, separate them with a comma.
- exampleSentence: one natural English sentence at CEFR level B1, 8 to 18 words, set in everyday life or university life.

Rules for exampleSentence:
- It must contain the word or expression exactly as given (same spelling and form), because it will be used as a fill-in-the-blank quiz.
- The context must make the meaning clear enough to guess the missing word.
- Use simple, modern, natural English. No names of real people or brands.
Return the items in the same order you received them.`;

const SuggestionsSchema = z.object({
  items: z.array(
    z.object({
      term: z.string(),
      meaningPt: z.string(),
      exampleSentence: z.string(),
    }),
  ),
});

export type Suggestion = {
  term: string;
  meaningPt: string;
  exampleSentence: string;
  // False when the sentence does not contain the exact term and needs a manual fix.
  sentenceHasTerm: boolean;
};

export async function generateSuggestions(terms: string[]): Promise<Suggestion[]> {
  const output = await askClaude({
    system: SYSTEM_PROMPT,
    content: terms.map((term) => `- ${term}`).join("\n"),
    schema: SuggestionsSchema,
  });

  // Match by term rather than position, in case the model reorders or skips items.
  const byTerm = new Map(output.items.map((item) => [normalizeTerm(item.term), item]));

  return terms.map((term) => {
    const item = byTerm.get(normalizeTerm(term));
    const exampleSentence = item?.exampleSentence.trim() ?? "";
    return {
      term,
      meaningPt: item?.meaningPt.trim() ?? "",
      exampleSentence,
      sentenceHasTerm: exampleSentence !== "" && sentenceContainsTerm(exampleSentence, term),
    };
  });
}
