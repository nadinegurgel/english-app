import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Question, type QuizMode } from "../api/client";
import { QuestionCard } from "../components/QuestionCard";
import { localToday } from "../lib/dates";

type Props = { kind: "daily" | "practice" };

type Outcome = { question: Question; correct: boolean };

export function QuizScreen({ kind }: Props) {
  const { setId } = useParams();
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [mode, setMode] = useState<QuizMode>("one");
  const [error, setError] = useState<string | null>(null);

  // Only the first answer to each word counts for the score and the schedule.
  const [outcomes, setOutcomes] = useState<Map<number, Outcome>>(new Map());
  const recorded = useRef(new Set<number>());
  const requeued = useRef(new Set<number>());
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [dayCompleted, setDayCompleted] = useState(false);
  const today = useRef(localToday()).current;

  useEffect(() => {
    const load = kind === "daily" ? api.dailyQuiz(today) : api.practiceQuiz(Number(setId));
    load
      .then(setQuestions)
      .catch(() => setError("Não foi possível montar o quiz. Tente de novo."));
    api
      .getSettings()
      .then((settings) => setMode(settings.quizMode))
      .catch(() => undefined);
  }, [kind, setId, today]);

  const changeMode = (next: QuizMode) => {
    setMode(next);
    api
      .getSettings()
      .then((settings) => api.updateSettings({ ...settings, quizMode: next }))
      .catch(() => undefined);
  };

  /** Records the first answer for a word. Returns true if the word should come back at the end. */
  const registerAnswer = (question: Question, correct: boolean): boolean => {
    setStarted(true);
    if (!recorded.current.has(question.wordId)) {
      recorded.current.add(question.wordId);
      setOutcomes((current) => new Map(current).set(question.wordId, { question, correct }));
      if (kind === "daily") {
        api
          .recordAnswer(question.wordId, correct, today)
          .then((result) => {
            if (result.dayCompleted) setDayCompleted(true);
          })
          .catch(() => setError("Uma resposta não foi salva. Verifique a conexão."));
      }
    }
    // A wrong word comes back once at the end of the quiz.
    if (!correct && !requeued.current.has(question.wordId)) {
      requeued.current.add(question.wordId);
      return true;
    }
    return false;
  };

  const backLink = kind === "daily" ? "/" : "/words";

  if (error && !questions) {
    return (
      <section className="screen">
        <p className="message error">{error}</p>
        <Link className="button secondary" to={backLink}>
          Voltar
        </Link>
      </section>
    );
  }

  if (!questions) {
    return (
      <section className="screen">
        <p className="hint">Preparando o quiz…</p>
      </section>
    );
  }

  if (questions.length === 0) {
    return (
      <section className="screen">
        <header className="screen-header">
          <p className="eyebrow">{kind === "daily" ? "Quiz do dia" : "Praticar"}</p>
          <h1>Nada para estudar agora</h1>
        </header>
        <div className="card empty-state">
          <p>
            {kind === "daily"
              ? "Você não tem palavras novas nem revisões para hoje."
              : "Este conjunto não tem palavras com frase de exemplo."}
          </p>
          <Link className="button secondary" to={backLink}>
            Voltar
          </Link>
        </div>
      </section>
    );
  }

  if (finished) {
    const list = [...outcomes.values()];
    const right = list.filter((outcome) => outcome.correct);
    const wrong = list.filter((outcome) => !outcome.correct);
    return (
      <section className="screen">
        <header className="screen-header">
          <p className="eyebrow">{kind === "daily" ? "Quiz do dia" : "Praticar"}</p>
          <h1>
            {right.length} de {list.length} certas
          </h1>
        </header>

        {dayCompleted && (
          <p className="message success">Estudo do dia concluído. Sua sequência continua! 🌸</p>
        )}
        {kind === "daily" && wrong.length > 0 && (
          <p className="hint">As palavras que você errou voltam amanhã para uma revisão extra.</p>
        )}
        {error && <p className="message error">{error}</p>}

        {wrong.length > 0 && <ResultList title="Para revisar" outcomes={wrong} tone="wrong" />}
        {right.length > 0 && <ResultList title="Acertei" outcomes={right} tone="correct" />}

        <Link className="button primary" to={backLink}>
          {kind === "daily" ? "Voltar para Hoje" : "Voltar para Palavras"}
        </Link>
      </section>
    );
  }

  return (
    <section className="screen">
      <header className="screen-header quiz-header">
        <div>
          <p className="eyebrow">{kind === "daily" ? "Quiz do dia" : "Praticar"}</p>
          <h1>Complete a frase</h1>
        </div>
        <Link className="link-button" to={backLink}>
          Sair
        </Link>
      </header>

      {!started && (
        <div className="segmented" role="radiogroup" aria-label="Formato do quiz">
          <button
            type="button"
            role="radio"
            aria-checked={mode === "one"}
            className={mode === "one" ? "active" : ""}
            onClick={() => changeMode("one")}
          >
            Uma pergunta por vez
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === "all"}
            className={mode === "all" ? "active" : ""}
            onClick={() => changeMode("all")}
          >
            Todas na mesma tela
          </button>
        </div>
      )}

      {error && <p className="message error">{error}</p>}

      {mode === "one" ? (
        <OneByOne
          questions={questions}
          onAnswer={registerAnswer}
          onFinish={() => setFinished(true)}
        />
      ) : (
        <AllAtOnce
          questions={questions}
          onAnswer={registerAnswer}
          onFinish={() => setFinished(true)}
        />
      )}
    </section>
  );
}

type FlowProps = {
  questions: Question[];
  onAnswer: (question: Question, correct: boolean) => boolean;
  onFinish: () => void;
};

function OneByOne({ questions, onAnswer, onFinish }: FlowProps) {
  const [queue, setQueue] = useState(questions);
  const [selected, setSelected] = useState<string | null>(null);
  // Words already shown once; a word seen again is a retry of a wrong answer.
  const [seen, setSeen] = useState<Set<number>>(new Set());
  const total = questions.length;
  const current = queue[0];

  if (!current) return null;

  const isRetry = seen.has(current.wordId);

  const choose = (option: string) => {
    setSelected(option);
    const comesBack = onAnswer(current, option === current.answer);
    if (comesBack) setQueue((q) => [...q, current]);
  };

  const next = () => {
    if (queue.length <= 1) {
      onFinish();
      return;
    }
    setSeen((ids) => new Set(ids).add(current.wordId));
    setQueue((q) => q.slice(1));
    setSelected(null);
  };

  const progress = Math.round((seen.size / total) * 100);

  return (
    <>
      <div className="progress-bar" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
      <p className="hint">
        {isRetry ? "Revisando as que você errou" : `Pergunta ${seen.size + 1} de ${total}`}
      </p>
      <QuestionCard
        key={`${current.wordId}-${queue.length}`}
        question={current}
        selected={selected}
        revealed={selected !== null}
        onSelect={choose}
      />
      {selected !== null && (
        <button className="button primary" type="button" onClick={next}>
          {queue.length <= 1 ? "Ver resultado" : "Próxima"}
        </button>
      )}
    </>
  );
}

function AllAtOnce({ questions, onAnswer, onFinish }: FlowProps) {
  const [round, setRound] = useState(questions);
  const [answers, setAnswers] = useState<Map<number, string>>(new Map());
  const [checked, setChecked] = useState(false);
  const [retry, setRetry] = useState<Question[]>([]);

  const allAnswered = round.every((q) => answers.has(q.wordId));

  const check = () => {
    const back: Question[] = [];
    for (const question of round) {
      if (onAnswer(question, answers.get(question.wordId) === question.answer)) back.push(question);
    }
    setRetry(back);
    setChecked(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startRetry = () => {
    setRound(retry);
    setAnswers(new Map());
    setChecked(false);
    setRetry([]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      {round !== questions && <p className="hint">Revisando as que você errou</p>}
      {round.map((question, index) => (
        <QuestionCard
          key={question.wordId}
          number={index + 1}
          question={question}
          selected={answers.get(question.wordId) ?? null}
          revealed={checked}
          onSelect={(option) => setAnswers((current) => new Map(current).set(question.wordId, option))}
        />
      ))}
      <div className="sticky-actions">
        {!checked ? (
          <button className="button primary" type="button" onClick={check} disabled={!allAnswered}>
            {allAnswered
              ? "Conferir respostas"
              : `Responda todas (${answers.size} de ${round.length})`}
          </button>
        ) : retry.length > 0 ? (
          <button className="button primary" type="button" onClick={startRetry}>
            Refazer as que errei ({retry.length})
          </button>
        ) : (
          <button className="button primary" type="button" onClick={onFinish}>
            Ver resultado
          </button>
        )}
      </div>
    </>
  );
}

function ResultList({
  title,
  outcomes,
  tone,
}: {
  title: string;
  outcomes: Outcome[];
  tone: "correct" | "wrong";
}) {
  return (
    <div className="card">
      <p className={`result-title ${tone}`}>
        {title} ({outcomes.length})
      </p>
      <ul className="word-list">
        {outcomes.map(({ question }) => (
          <li key={question.wordId} className="word-item">
            <div className="word-row static">
              <span className="word-term">{question.answer}</span>
              <span className="word-meaning">{question.meaningPt ?? ""}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
