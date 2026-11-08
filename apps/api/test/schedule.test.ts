import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays } from "../src/lib/dates.ts";
import { blankOutTerm, sentenceContainsTerm } from "../src/lib/normalize.ts";
import { scheduleAfterAnswer, Stage } from "../src/services/schedule.ts";

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    assert.equal(addDays("2026-12-30", 2), "2027-01-01");
    assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  });
});

describe("scheduleAfterAnswer", () => {
  const day1 = "2026-11-10";

  it("moves a new word to Day 3 (two days later)", () => {
    const changes = scheduleAfterAnswer({ stage: Stage.New, dueOn: null }, true, day1);
    assert.equal(changes.stage, Stage.FirstReview);
    assert.equal(changes.introducedOn, day1);
    assert.equal(changes.dueOn, "2026-11-12");
    assert.equal(changes.extraReviewOn, null);
  });

  it("moves a Day 3 review to Day 7 (four days later)", () => {
    const changes = scheduleAfterAnswer(
      { stage: Stage.FirstReview, dueOn: "2026-11-12" },
      true,
      "2026-11-12",
    );
    assert.equal(changes.stage, Stage.SecondReview);
    assert.equal(changes.dueOn, "2026-11-16");
  });

  it("marks the word as learned after the Day 7 review", () => {
    const changes = scheduleAfterAnswer(
      { stage: Stage.SecondReview, dueOn: "2026-11-16" },
      true,
      "2026-11-16",
    );
    assert.equal(changes.stage, Stage.Learned);
    assert.equal(changes.dueOn, null);
  });

  it("counts the next interval from the day the overdue review was done", () => {
    const changes = scheduleAfterAnswer(
      { stage: Stage.FirstReview, dueOn: "2026-11-12" },
      true,
      "2026-11-15",
    );
    assert.equal(changes.dueOn, "2026-11-19");
  });

  it("adds an extra review tomorrow on a wrong answer and keeps the schedule going", () => {
    const changes = scheduleAfterAnswer({ stage: Stage.New, dueOn: null }, false, day1);
    assert.equal(changes.extraReviewOn, "2026-11-11");
    assert.equal(changes.stage, Stage.FirstReview);
    assert.equal(changes.dueOn, "2026-11-12");
  });

  it("only clears the extra review when it is answered before the regular one is due", () => {
    const changes = scheduleAfterAnswer(
      { stage: Stage.FirstReview, dueOn: "2026-11-12" },
      true,
      "2026-11-11",
    );
    assert.equal(changes.stage, undefined);
    assert.equal(changes.dueOn, undefined);
    assert.equal(changes.extraReviewOn, null);
  });
});

describe("blankOutTerm", () => {
  it("replaces the term as a whole word, ignoring case", () => {
    assert.equal(
      blankOutTerm("Deadlines matter. The deadline is Friday.", "deadline"),
      "Deadlines matter. The _____ is Friday.",
    );
  });

  it("works with multi-word expressions", () => {
    assert.equal(
      blankOutTerm("I can't figure out this problem.", "figure out"),
      "I can't _____ this problem.",
    );
    assert.equal(sentenceContainsTerm("I can't figure it out.", "figure out"), false);
  });
});
