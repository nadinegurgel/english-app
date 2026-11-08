import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { env } from "../env.js";
import { HttpError } from "../lib/http-errors.js";

const MODEL = "claude-haiku-5-5";

const client = env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;

export const isAiEnabled = client !== null;

/** Sends one request to Claude and returns the response parsed against `schema`. */
export async function askClaude<T extends z.ZodType>(options: {
  system: string;
  content: string;
  schema: T;
}): Promise<z.infer<T>> {
  if (!client) {
    throw new HttpError(503, "AI suggestions are not configured. Set ANTHROPIC_API_KEY.");
  }

  let response;
  try {
    response = await client.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      system: options.system,
      output_config: { effort: "low", format: zodOutputFormat(options.schema) },
      messages: [{ role: "user", content: options.content }],
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
    throw new HttpError(502, "Claude could not answer this request.");
  }
  return response.parsed_output;
}
