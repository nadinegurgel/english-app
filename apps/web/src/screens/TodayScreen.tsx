import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type TodaySummary } from "../api/client";
import { ServerStatus } from "../components/ServerStatus";
import { describeUpcomingDay, localToday } from "../lib/dates";

export function TodayScreen() {
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [error, setError] = useState(false);
  const today = localToday();

  useEffect(() => {
    api
      .today(today)
      .then(setSummary)
      .catch(() => setError(true));
  }, [today]);

  const dueCount = summary ? summary.newCount + summary.reviewCount : 0;
  const progress = summary?.progress;
  const learnedPercent =
    progress && progress.total > 0 ? Math.round((progress.learned / progress.total) * 100) : 0;

  return (
    <section className="screen">
      <header className="screen-header quiz-header">
        <div>
          <p className="eyebrow">Hoje</p>
          <h1>Seu estudo do dia</h1>
        </div>
        <Link className="icon-button settings-link" to="/settings" aria-label="Ajustes">
          ⚙︎
        </Link>
      </header>

      {error && <p className="message error">Não foi possível carregar o seu dia.</p>}

      <div className="stat-grid">
        <div className="card stat">
          <span className="stat-value">{summary?.newCount ?? "–"}</span>
          <span className="stat-label">palavras novas</span>
        </div>
        <div className="card stat">
          <span className="stat-value">{summary?.reviewCount ?? "–"}</span>
          <span className="stat-label">revisões</span>
        </div>
      </div>

      {summary && dueCount === 0 && summary.streak.studiedToday && (
        <p className="message success">Tudo feito por hoje. Até amanhã! 🌸</p>
      )}
      {summary && dueCount === 0 && !summary.streak.studiedToday && summary.progress.total > 0 && (
        <p className="message">
          Nada marcado para hoje. Se quiser, pratique um conjunto em{" "}
          <Link to="/words">Palavras</Link>.
        </p>
      )}

      {dueCount > 0 ? (
        <Link className="button primary" to="/quiz">
          Começar quiz
        </Link>
      ) : (
        <button className="button primary" type="button" disabled>
          Começar quiz
        </button>
      )}

      {summary && progress && progress.total === 0 && (
        <div className="card empty-state">
          <p>Você ainda não tem palavras para estudar.</p>
          <Link className="button secondary" to="/add">
            Adicionar palavras
          </Link>
        </div>
      )}

      {summary && progress && progress.total > 0 && (
        <>
          <div className="card streak">
            <span className="streak-value">🔥 {summary.streak.days}</span>
            <span className="stat-label">
              {summary.streak.days === 1 ? "dia seguido de estudo" : "dias seguidos de estudo"}
              {!summary.streak.studiedToday && summary.streak.days > 0 && dueCount > 0
                ? " — termine o quiz de hoje para continuar"
                : ""}
            </span>
          </div>

          <div className="card">
            <p className="card-title">Seu progresso</p>
            <div className="progress-bar large" aria-hidden="true">
              <span style={{ width: `${learnedPercent}%` }} />
            </div>
            <div className="progress-legend">
              <span>
                <strong>{progress.learned}</strong> aprendidas
              </span>
              <span>
                <strong>{progress.learning}</strong> em revisão
              </span>
              <span>
                <strong>{progress.new}</strong> novas
              </span>
            </div>
          </div>

          <div className="card">
            <p className="card-title">Próximas revisões</p>
            {summary.upcoming.length === 0 ? (
              <p className="hint">Nenhuma revisão marcada para os próximos 7 dias.</p>
            ) : (
              <ul className="upcoming-list">
                {summary.upcoming.map((item) => (
                  <li key={item.day}>
                    <span>{describeUpcomingDay(item.day, today)}</span>
                    <span className="upcoming-count">
                      {item.count === 1 ? "1 palavra" : `${item.count} palavras`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {summary.withoutSentence > 0 && (
            <p className="message warning">
              {summary.withoutSentence === 1
                ? "1 palavra não tem frase de exemplo e fica fora do quiz."
                : `${summary.withoutSentence} palavras não têm frase de exemplo e ficam fora do quiz.`}{" "}
              <Link to="/words">Completar em Palavras</Link>
            </p>
          )}
        </>
      )}

      <ServerStatus />
    </section>
  );
}
