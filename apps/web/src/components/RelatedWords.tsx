import { useEffect, useRef, useState } from "react";
import { api, type RelatedWord } from "../api/client";

type Props = {
  setId: number | undefined;
  // Terms currently in the preview; used as context and never suggested.
  terms: string[];
  onAdd: (words: RelatedWord[]) => void;
};

export function RelatedWords({ setId, terms, onAdd }: Props) {
  const [suggestions, setSuggestions] = useState<RelatedWord[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  // Every suggestion shown so far, so "Mais sugestões" always brings new words.
  const shown = useRef<string[]>([]);
  const loadedOnce = useRef(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const next = await api.relatedWords({ setId, terms, exclude: shown.current });
      shown.current = [...shown.current, ...next.map((word) => word.term)];
      setSuggestions(next);
      setSelected(new Set());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (loadedOnce.current || terms.length === 0) return;
    loadedOnce.current = true;
    void load();
    // Loads once when the preview opens; later changes to the preview do not reload.
  }, []);

  const toggle = (term: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(term)) next.delete(term);
      else next.add(term);
      return next;
    });

  const add = () => {
    onAdd(suggestions.filter((word) => selected.has(word.term)));
    const remaining = suggestions.filter((word) => !selected.has(word.term));
    setSuggestions(remaining);
    setSelected(new Set());
  };

  return (
    <div className="card related">
      <p className="card-title">Sugestões para este conjunto</p>

      {loading && <p className="hint">Buscando palavras parecidas…</p>}
      {error && <p className="message error">Não foi possível buscar sugestões agora.</p>}
      {!loading && !error && suggestions.length === 0 && (
        <p className="hint">Toque em “Mais sugestões” para ver outras palavras.</p>
      )}

      {!loading && suggestions.length > 0 && (
        <ul className="related-list">
          {suggestions.map((word) => (
            <li key={word.term}>
              <label className={`related-item ${selected.has(word.term) ? "checked" : ""}`}>
                <input
                  type="checkbox"
                  checked={selected.has(word.term)}
                  onChange={() => toggle(word.term)}
                />
                <span className="word-term">{word.term}</span>
                <span className="word-meaning">{word.meaningPt}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      <div className="row">
        <button
          className="button secondary"
          type="button"
          onClick={add}
          disabled={selected.size === 0}
        >
          {selected.size <= 1 ? "Adicionar à prévia" : `Adicionar ${selected.size} à prévia`}
        </button>
        <button className="link-button" type="button" onClick={load} disabled={loading}>
          Mais sugestões
        </button>
      </div>
    </div>
  );
}
