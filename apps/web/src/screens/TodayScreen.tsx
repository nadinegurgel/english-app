import { Link } from "react-router-dom";
import { ServerStatus } from "../components/ServerStatus";

export function TodayScreen() {
  return (
    <section className="screen">
      <header className="screen-header">
        <p className="eyebrow">Hoje</p>
        <h1>Seu estudo do dia</h1>
      </header>

      <div className="stat-grid">
        <div className="card stat">
          <span className="stat-value">0</span>
          <span className="stat-label">palavras novas</span>
        </div>
        <div className="card stat">
          <span className="stat-value">0</span>
          <span className="stat-label">revisões</span>
        </div>
      </div>

      <button className="button primary" type="button" disabled>
        Começar quiz
      </button>

      <div className="card empty-state">
        <p>Você ainda não tem palavras para estudar.</p>
        <Link className="button secondary" to="/add">
          Adicionar palavras
        </Link>
      </div>

      <ServerStatus />
    </section>
  );
}
