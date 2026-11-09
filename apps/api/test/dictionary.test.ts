import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const { pickStored } = await import("../src/services/suggestions.ts");

describe("pickStored (shared example sentences, limit 3)", () => {
  const a = "Sentence A.";
  const b = "Sentence B.";
  const c = "Sentence C.";

  it("asks the AI when the dictionary is empty", () => {
    assert.deepEqual(pickStored([], [], 3), { sentence: "", needsAi: true });
  });

  it("serves a stored sentence the user has not seen, without AI", () => {
    assert.deepEqual(pickStored([a, b], [a], 3), { sentence: b, needsAi: false });
  });

  it("asks the AI once the user has seen every stored sentence and there is room", () => {
    assert.deepEqual(pickStored([a, b], [a, b], 3), { sentence: "", needsAi: true });
  });

  it("rotates without AI when the dictionary is full, avoiding the sentence on screen", () => {
    for (let i = 0; i < 20; i++) {
      const pick = pickStored([a, b, c], [a, b, c], 3);
      assert.equal(pick.needsAi, false);
      assert.notEqual(pick.sentence, c);
    }
  });
});
