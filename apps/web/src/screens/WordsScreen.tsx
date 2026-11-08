import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Word, type WordSet } from "../api/client";
import { SetCard } from "../components/SetCard";

/** Lowercases and strips accents, so "proposito" finds "propósito". */
function searchKey(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

export function WordsScreen() {
  const [sets, setSets] = useState<WordSet[]>([]);
  const [words, setWords] = useState<Word[]>([]);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [query, setQuery] = useState("");
  const [expandedSetIds, setExpandedSetIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.listSets(), api.listWords()])
      .then(([setList, wordList]) => {
        setSets(setList);
        setWords(wordList);
      })
      .catch(() => setError("Não foi possível carregar suas palavras."))
      .finally(() => setLoading(false));
    api
      .health()
      .then((health) => setAiEnabled(health.ai))
      .catch(() => setAiEnabled(false));
  }, []);

  const key = searchKey(query);

  const wordsBySet = useMemo(() => {
    const map = new Map<number, Word[]>();
    for (const word of words) {
      if (
        key &&
        !searchKey(word.term).includes(key) &&
        !searchKey(word.meaningPt ?? "").includes(key)
      ) {
        continue;
      }
      map.set(word.setId, [...(map.get(word.setId) ?? []), word]);
    }
    return map;
  }, [words, key]);

  const visibleSets = key ? sets.filter((set) => wordsBySet.has(set.id)) : sets;

  const toggle = (id: number) =>
    setExpandedSetIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (loading) {
    return (
      <section className="screen">
        <p className="hint">Carregando…</p>
      </section>
    );
  }

  return (
    <section className="screen">
      <header className="screen-header">
        <p className="eyebrow">Palavras</p>
        <h1>Seus conjuntos</h1>
      </header>

      {error && <p className="message error">{error}</p>}

      {sets.length === 0 && !error ? (
        <div className="card empty-state">
          <p>Nenhum conjunto ainda. As palavras que você salvar aparecem aqui.</p>
          <Link className="button secondary" to="/add">
            Adicionar palavras
          </Link>
        </div>
      ) : (
        <>
          <input
            className="search-input"
            type="search"
            placeholder="Buscar palavra ou significado"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Buscar palavra ou significado"
          />

          {key && visibleSets.length === 0 && (
            <p className="hint">Nenhuma palavra encontrada para “{query.trim()}”.</p>
          )}

          <ul className="set-list">
            {visibleSets.map((set) => (
              <SetCard
                key={set.id}
                set={set}
                words={wordsBySet.get(set.id) ?? []}
                // While searching, every set with matches opens automatically.
                expanded={Boolean(key) || expandedSetIds.has(set.id)}
                aiEnabled={aiEnabled}
                onToggle={() => toggle(set.id)}
                onRenamed={(id, name) =>
                  setSets((current) =>
                    current
                      .map((s) => (s.id === id ? { ...s, name } : s))
                      .sort((a, b) => a.name.localeCompare(b.name)),
                  )
                }
                onDeleted={(id) => {
                  setSets((current) => current.filter((s) => s.id !== id));
                  setWords((current) => current.filter((w) => w.setId !== id));
                }}
                onWordSaved={(updated) =>
                  setWords((current) => current.map((w) => (w.id === updated.id ? updated : w)))
                }
                onWordDeleted={(id) => setWords((current) => current.filter((w) => w.id !== id))}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
