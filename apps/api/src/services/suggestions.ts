import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { env } from "../env.js";
import { HttpError } from "../lib/http-errors.js";
import { normalizeTerm, sentenceContainsTerm } from "../lib/normalize.js";

const MODEL = "claude-haiku-5-5";

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

const client = env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;

export const isAiEnabled = client !== null;

export async function generateSuggestions(terms: string[]): Promise<Suggestion[]> {
  if (!client) {
    throw new HttpError(503, "AI suggestions are not configured. Set ANTHROPIC_API_KEY.");
  }

  let response;
  try {
    response = await client.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      output_config: { effort: "low", format: zodOutputFormat(SuggestionsSchema) },
      messages: [{ role: "user", content: terms.map((term) => `- ${term}`).join("\n") }],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new HttpError(503, "The Claude API key is invalid.");
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new HttpError(429, "Too many requests to the Claude API. Try again in a minute.");
    }
    if (error instanceof Anthropic.APIError) {
      throw new HttpError(502, "The Claude API is unavailable right now.");
    }
    throw error;
  }

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new HttpError(502, "Could not generate suggestions for these words.");
  }

  // Match by term rather than position, in case the model reorders or skips items.
  const byTerm = new Map(
    response.parsed_output.items.map((item) => [normalizeTerm(item.term), item]),
  );

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
