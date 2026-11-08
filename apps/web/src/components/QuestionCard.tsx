import type { Question } from "../api/client";
import { splitAroundTerm } from "../lib/terms";

type Props = {
  question: Question;
  selected: string | null;
  // When true, the right answer and the explanation are shown.
  revealed: boolean;
  onSelect: (option: string) => void;
  number?: number;
};

function HighlightedSentence({ sentence, term }: { sentence: string; term: string }) {
  const parts = splitAroundTerm(sentence, term);
  if (!parts) return <>{sentence}</>;
  return (
    <>
      {parts.before}
      <strong>{parts.match}</strong>
      {parts.after}
    </>
  );
}

export function QuestionCard({ question, selected, revealed, onSelect, number }: Props) {
  const correct = selected === question.answer;

  return (
    <div className="card question">
      {number !== undefined && <p className="question-number">Pergunta {number}</p>}
      <p className="question-prompt">{question.prompt}</p>

      <div className="options" role="radiogroup" aria-label="Alternativas">
        {question.options.map((option) => {
          let state = "";
          if (revealed && option === question.answer) state = "correct";
          else if (revealed && option === selected) state = "wrong";
          else if (option === selected) state = "selected";
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={option === selected}
              className={`option ${state}`}
              onClick={() => onSelect(option)}
              disabled={revealed}
            >
              {option}
            </button>
          );
        })}
      </div>

      {revealed && (
        <div className={`feedback ${correct ? "correct" : "wrong"}`}>
          <p className="feedback-title">{correct ? "✓ Acertou!" : "✗ Não foi dessa vez"}</p>
          <p>
            <strong>{question.answer}</strong>
            {question.meaningPt ? ` — ${question.meaningPt}` : ""}
          </p>
          <p className="feedback-sentence">
            <HighlightedSentence sentence={question.sentence} term={question.answer} />
          </p>
        </div>
      )}
    </div>
  );
}
