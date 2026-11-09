import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickThemes, SENTENCE_THEMES } from "../src/lib/themes.ts";

describe("pickThemes", () => {
  it("returns different themes for one word", () => {
    const themes = pickThemes(8);
    assert.equal(themes.length, 8);
    assert.equal(new Set(themes).size, 8);
    themes.forEach((theme) => assert.ok(SENTENCE_THEMES.includes(theme as never)));
  });

  it("reuses themes only after all of them were used", () => {
    const themes = pickThemes(SENTENCE_THEMES.length + 2);
    assert.equal(new Set(themes.slice(0, SENTENCE_THEMES.length)).size, SENTENCE_THEMES.length);
  });
});
