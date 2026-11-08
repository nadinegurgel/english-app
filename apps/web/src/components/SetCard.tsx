import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api, type Word, type WordSet } from "../api/client";
import { WordEditor } from "./WordEditor";

type Props = {
  set: WordSet;
  words: Word[];
  expanded: boolean;
  aiEnabled: boolean;
  onToggle: () => void;
  onRenamed: (id: number, name: string) => void;
  onDeleted: (id: number) => void;
  onWordSaved: (word: Word) => void;
  onWordDeleted: (id: number) => void;
};

type Mode = "view" | "rename" | "confirm-delete";

// For example: "7 de nov. de 2026".
const createdDateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" });

export function SetCard({
  set,
  words,
  expanded,
  aiEnabled,
  onToggle,
  onRenamed,
  onDeleted,
  onWordSaved,
  onWordDeleted,
}: Props) {
  const [mode, setMode] = useState<Mode>("view");
  const [name, setName] = useState(set.name);
  const [editingWordId, setEditingWordId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rename = async () => {
    setError(null);
    setBusy(true);
    try {
      const updated = await api.renameSet(set.id, name.trim());
      onRenamed(updated.id, updated.name);
      setMode("view");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? "Já existe um conjunto com esse nome."
          : "Não foi possível renomear. Tente de novo.",
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setError(null);
    setBusy(true);
    try {
      await api.deleteSet(set.id);
      onDeleted(set.id);
    } catch {
      setError("Não foi possível apagar o conjunto. Tente de novo.");
      setBusy(false);
    }
  };

  return (
    <li className="card set-card">
      {mode === "rename" ? (
        <div className="form">
          <label className="field">
            <span className="field-label">Novo nome do conjunto</span>
            <input
              type="text"
              value={name}
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <div className="row">
            <button
              className="button primary compact"
              type="button"
              onClick={rename}
              disabled={busy || !name.trim()}
            >
              Salvar nome
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                setMode("view");
                setName(set.name);
                setError(null);
              }}
              disabled={busy}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button className="set-header" type="button" onClick={onToggle} aria-expanded={expanded}>
          <span>
            <span className="set-name">{set.name}</span>
            <span className="set-count">
              {words.length === 1 ? "1 palavra" : `${words.length} palavras`} · criado em{" "}
              {createdDateFormat.format(new Date(set.createdAt))}
            </span>
          </span>
          <span className="chevron" aria-hidden="true">
            {expanded ? "▴" : "▾"}
          </span>
        </button>
      )}

      {mode === "confirm-delete" && (
        <div className="confirm-box">
          <p>
            Apagar o conjunto “{set.name}” e{" "}
            {words.length === 1 ? "a 1 palavra dele" : `as ${words.length} palavras dele`}? Isso não
            pode ser desfeito.
          </p>
          <div className="row">
            <button className="button danger" type="button" onClick={remove} disabled={busy}>
              Sim, apagar tudo
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => setMode("view")}
              disabled={busy}
            >
              Não
            </button>
          </div>
        </div>
      )}

      {error && <p className="message error">{error}</p>}

      {expanded && mode === "view" && (
        <>
          <div className="row set-actions">
            {words.some((word) => word.exampleSentence) ? (
              <Link className="button secondary" to={`/practice/${set.id}`}>
                Praticar
              </Link>
            ) : (
              <button className="button secondary" type="button" disabled>
                Praticar
              </button>
            )}
            <button className="link-button" type="button" onClick={() => setMode("rename")}>
              Renomear
            </button>
            <button
              className="link-button danger-text"
              type="button"
              onClick={() => setMode("confirm-delete")}
            >
              Apagar conjunto
            </button>
          </div>

          {words.length === 0 ? (
            <p className="hint">Nenhuma palavra neste conjunto.</p>
          ) : (
            <ul className="word-list">
              {words.map((word) =>
                editingWordId === word.id ? (
                  <li key={word.id} className="word-item editing">
                    <WordEditor
                      word={word}
                      aiEnabled={aiEnabled}
                      onSaved={(updated) => {
                        onWordSaved(updated);
                        setEditingWordId(null);
                      }}
                      onDeleted={(id) => {
                        onWordDeleted(id);
                        setEditingWordId(null);
                      }}
                      onClose={() => setEditingWordId(null)}
                    />
                  </li>
                ) : (
                  <li key={word.id} className="word-item">
                    <button
                      className="word-row"
                      type="button"
                      onClick={() => setEditingWordId(word.id)}
                    >
                      <span className="word-term">{word.term}</span>
                      <span className="word-meaning">{word.meaningPt || "sem significado"}</span>
                    </button>
                  </li>
                ),
              )}
            </ul>
          )}
        </>
      )}
    </li>
  );
}
