import { useState } from "react";
import { ApiError, api, type Word } from "../api/client";
import { sentenceContainsTerm } from "../lib/terms";

type Props = {
  word: Word;
  aiEnabled: boolean;
  onSaved: (word: Word) => void;
  onDeleted: (id: number) => void;
  onClose: () => void;
};

export function WordEditor({ word, aiEnabled, onSaved, onDeleted, onClose }: Props) {
  const [term, setTerm] = useState(word.term);
  const [meaningPt, setMeaningPt] = useState(word.meaningPt ?? "");
  const [exampleSentence, setExampleSentence] = useState(word.exampleSentence ?? "");
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Sentences shown while editing, so "Gerar outra frase" brings a different one each time.
  const [seen, setSeen] = useState<string[]>(word.exampleSentence ? [word.exampleSentence] : []);
  const [error, setError] = useState<string | null>(null);

  const sentenceOk = !exampleSentence.trim() || sentenceContainsTerm(exampleSentence, term);
  const canSave = term.trim() !== "" && sentenceOk && !busy;

  const regenerate = async () => {
    setError(null);
    setGenerating(true);
    try {
      const shown = [...new Set([...seen, exampleSentence.trim()].filter(Boolean))];
      const [suggestion] = await api.suggest([{ term: term.trim(), seen: shown }]);
      const next = suggestion?.exampleSentence;
      if (next) {
        setExampleSentence(next);
        setSeen([...shown.filter((s) => s !== next), next]);
      }
      if (!meaningPt.trim() && suggestion?.meaningPt) setMeaningPt(suggestion.meaningPt);
    } catch {
      setError("Não foi possível gerar uma frase agora. Tente de novo.");
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    setError(null);
    setBusy(true);
    try {
      const updated = await api.updateWord(word.id, {
        term: term.trim(),
        meaningPt: meaningPt.trim(),
        exampleSentence: exampleSentence.trim(),
      });
      onSaved(updated);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? "Já existe outra palavra escrita assim."
          : "Não foi possível salvar. Tente de novo.",
      );
      setBusy(false);
    }
  };

  const remove = async () => {
    setError(null);
    setBusy(true);
    try {
      await api.deleteWord(word.id);
      onDeleted(word.id);
    } catch {
      setError("Não foi possível apagar. Tente de novo.");
      setBusy(false);
    }
  };

  return (
    <div className="word-editor">
      <label className="field">
        <span className="field-label">Palavra ou expressão</span>
        <input type="text" value={term} onChange={(event) => setTerm(event.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Significado em português</span>
        <input
          type="text"
          value={meaningPt}
          onChange={(event) => setMeaningPt(event.target.value)}
        />
      </label>
      <label className="field">
        <span className="field-label">Frase de exemplo (B1)</span>
        <textarea
          rows={3}
          value={exampleSentence}
          placeholder={generating ? "Gerando…" : ""}
          onChange={(event) => setExampleSentence(event.target.value)}
        />
      </label>
      {!sentenceOk && (
        <p className="message warning">
          A frase precisa conter “{term.trim()}” exatamente assim, para virar pergunta do quiz.
        </p>
      )}
      {aiEnabled && (
        <button
          className="link-button"
          type="button"
          onClick={regenerate}
          disabled={generating || !term.trim()}
        >
          {generating ? "Gerando…" : "↻ Gerar outra frase"}
        </button>
      )}

      {error && <p className="message error">{error}</p>}

      {confirmingDelete ? (
        <div className="confirm-box">
          <p>Apagar “{word.term}”? Isso não pode ser desfeito.</p>
          <div className="row">
            <button className="button danger" type="button" onClick={remove} disabled={busy}>
              Sim, apagar
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={busy}
            >
              Não
            </button>
          </div>
        </div>
      ) : (
        <div className="row editor-actions">
          <button className="button primary compact" type="button" onClick={save} disabled={!canSave}>
            {busy ? "Salvando…" : "Salvar"}
          </button>
          <button className="button secondary" type="button" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            className="link-button danger-text"
            type="button"
            onClick={() => setConfirmingDelete(true)}
            disabled={busy}
          >
            Apagar
          </button>
        </div>
      )}
    </div>
  );
}
