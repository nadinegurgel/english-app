import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type QuizMode, type Settings } from "../api/client";

export function SettingsScreen() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [limit, setLimit] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    api
      .getSettings()
      .then((loaded) => {
        setSettings(loaded);
        setLimit(String(loaded.dailyNewLimit));
      })
      .catch(() => setStatus("error"));
  }, []);

  const save = async (changes: Partial<Settings>) => {
    if (!settings) return;
    setStatus("saving");
    try {
      const updated = await api.updateSettings({ ...settings, ...changes });
      setSettings(updated);
      setLimit(String(updated.dailyNewLimit));
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  };

  const parsedLimit = Number(limit);
  const limitValid = Number.isInteger(parsedLimit) && parsedLimit >= 1 && parsedLimit <= 50;

  return (
    <section className="screen">
      <header className="screen-header quiz-header">
        <div>
          <p className="eyebrow">Ajustes</p>
          <h1>Como você estuda</h1>
        </div>
        <Link className="link-button" to="/">
          Voltar
        </Link>
      </header>

      {settings && (
        <>
          <div className="card form">
            <label className="field">
              <span className="field-label">Palavras novas por dia</span>
              <input
                type="text"
                inputMode="numeric"
                value={limit}
                onChange={(event) => setLimit(event.target.value.replace(/\D/g, ""))}
              />
            </label>
            <p className="hint">
              De 1 a 50. As palavras que passarem do limite entram nos próximos dias. Com mais
              palavras novas, você também terá mais revisões no Dia 3 e no Dia 7.
            </p>
            <button
              className="button secondary"
              type="button"
              onClick={() => save({ dailyNewLimit: parsedLimit })}
              disabled={!limitValid || parsedLimit === settings.dailyNewLimit}
            >
              Salvar limite
            </button>
          </div>

          <div className="card form">
            <span className="field-label">Formato do quiz</span>
            <div className="segmented" role="radiogroup" aria-label="Formato do quiz">
              {(
                [
                  ["one", "Uma pergunta por vez"],
                  ["all", "Todas na mesma tela"],
                ] as [QuizMode, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={settings.quizMode === value}
                  className={settings.quizMode === value ? "active" : ""}
                  onClick={() => save({ quizMode: value })}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="hint">Você também pode trocar no começo de cada quiz.</p>
          </div>
        </>
      )}

      {status === "saved" && <p className="message success">Ajustes salvos.</p>}
      {status === "error" && (
        <p className="message error">Não foi possível salvar. Tente de novo.</p>
      )}
    </section>
  );
}
