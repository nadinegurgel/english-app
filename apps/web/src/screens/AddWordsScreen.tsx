import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api, type WordSet } from "../api/client";
import { parseTerms, sentenceContainsTerm } from "../lib/terms";

const NEW_SET = "new";
const SUGGESTION_BATCH_SIZE = 20;

type DraftWord = {
  key: string;
  term: string;
  meaningPt: string;
  exampleSentence: string;
  existingSetName: string | null;
  loading: boolean;
};

type Step = "input" | "preview" | "saved";

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 503) {
    return "A geração automática não está configurada. Preencha o significado e a frase à mão.";
  }
  if (error instanceof ApiError && error.status === 429) {
    return "Muitas gerações seguidas. Espere um minuto e tente de novo.";
  }
  return "Não foi possível falar com o servidor. Tente de novo.";
}

export function AddWordsScreen() {
  const [sets, setSets] = useState<WordSet[]>([]);
  const [selectedSet, setSelectedSet] = useState<string>(NEW_SET);
  const [newSetName, setNewSetName] = useState("");
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<DraftWord[]>([]);
  const [step, setStep] = useState<Step>("input");
  const [aiEnabled, setAiEnabled] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [savedSetName, setSavedSetName] = useState("");

  useEffect(() => {
    api
      .listSets()
      .then((list) => {
        setSets(list);
        if (list[0]) setSelectedSet(String(list[0].id));
      })
      .catch(() => setError("Não foi possível carregar seus conjuntos."));
    api
      .health()
      .then((health) => setAiEnabled(health.ai))
      .catch(() => setAiEnabled(false));
  }, []);

  const updateDraft = (key: string, changes: Partial<DraftWord>) =>
    setDrafts((current) => current.map((d) => (d.key === key ? { ...d, ...changes } : d)));

  const fillSuggestions = async (terms: string[], keys: string[]) => {
    for (let i = 0; i < terms.length; i += SUGGESTION_BATCH_SIZE) {
      const batchTerms = terms.slice(i, i + SUGGESTION_BATCH_SIZE);
      const batchKeys = keys.slice(i, i + SUGGESTION_BATCH_SIZE);
      try {
        const suggestions = await api.suggest(batchTerms);
        suggestions.forEach((suggestion, index) => {
          const key = batchKeys[index];
          if (!key) return;
          setDrafts((current) =>
            current.map((d) =>
              d.key === key
                ? {
                    ...d,
                    // Keep anything the user already typed while the suggestion was loading.
                    meaningPt: d.meaningPt || suggestion.meaningPt,
                    exampleSentence: d.exampleSentence || suggestion.exampleSentence,
                    loading: false,
                  }
                : d,
            ),
          );
        });
      } catch (err) {
        setError(errorMessage(err));
        setDrafts((current) =>
          current.map((d) => (batchKeys.includes(d.key) ? { ...d, loading: false } : d)),
        );
        return;
      }
    }
  };

  const handlePreview = async () => {
    setError(null);
    setNotice(null);
    const { terms, repeatedInPaste } = parseTerms(text);
    if (terms.length === 0) {
      setError("Cole pelo menos uma palavra, uma por linha.");
      return;
    }
    if (selectedSet === NEW_SET && !newSetName.trim()) {
      setError("Dê um nome para o novo conjunto.");
      return;
    }

    setBusy(true);
    try {
      const checks = await api.checkDuplicates(terms);
      const next: DraftWord[] = checks.map((check, index) => ({
        key: `${index}-${check.term}`,
        term: check.term,
        meaningPt: "",
        exampleSentence: "",
        existingSetName: check.existing?.setName ?? null,
        loading: aiEnabled && !check.existing,
      }));
      setDrafts(next);
      setStep("preview");
      if (repeatedInPaste > 0) {
        setNotice(
          repeatedInPaste === 1
            ? "1 linha repetida foi ignorada."
            : `${repeatedInPaste} linhas repetidas foram ignoradas.`,
        );
      }
      const toSuggest = next.filter((d) => !d.existingSetName);
      if (aiEnabled && toSuggest.length > 0) {
        await fillSuggestions(
          toSuggest.map((d) => d.term),
          toSuggest.map((d) => d.key),
        );
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async (draft: DraftWord) => {
    setError(null);
    updateDraft(draft.key, { loading: true });
    try {
      const [suggestion] = await api.suggest([draft.term]);
      updateDraft(draft.key, {
        meaningPt: draft.meaningPt || suggestion?.meaningPt || "",
        exampleSentence: suggestion?.exampleSentence ?? draft.exampleSentence,
        loading: false,
      });
    } catch (err) {
      setError(errorMessage(err));
      updateDraft(draft.key, { loading: false });
    }
  };

  const toSave = drafts.filter((d) => !d.existingSetName && d.term.trim());
  const missingSentenceTerm = toSave.some(
    (d) => d.exampleSentence.trim() && !sentenceContainsTerm(d.exampleSentence, d.term),
  );

  const handleSave = async () => {
    setError(null);
    setBusy(true);
    try {
      let setId = Number(selectedSet);
      let setName = sets.find((set) => set.id === setId)?.name ?? "";
      if (selectedSet === NEW_SET) {
        const created = await api.createSet(newSetName.trim());
        setSets((current) => [...current, created]);
        setSelectedSet(String(created.id));
        setNewSetName("");
        setId = created.id;
        setName = created.name;
      }
      const result = await api.saveWords(
        setId,
        toSave.map((d) => ({
          term: d.term.trim(),
          meaningPt: d.meaningPt.trim() || undefined,
          exampleSentence: d.exampleSentence.trim() || undefined,
        })),
      );
      setSavedCount(result.created);
      setSavedSetName(setName);
      setSets((current) =>
        current.map((set) =>
          set.id === setId ? { ...set, wordCount: set.wordCount + result.created } : set,
        ),
      );
      setStep("saved");
      setText("");
      setDrafts([]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("Já existe um conjunto com esse nome. Escolha-o na lista ou use outro nome.");
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  };

  if (step === "saved") {
    return (
      <section className="screen">
        <header className="screen-header">
          <p className="eyebrow">Adicionar</p>
          <h1>Palavras salvas</h1>
        </header>
        <div className="card empty-state">
          <p>
            {savedCount === 1
              ? `1 palavra foi salva em “${savedSetName}”.`
              : `${savedCount} palavras foram salvas em “${savedSetName}”.`}
          </p>
          <div className="row">
            <button className="button secondary" type="button" onClick={() => setStep("input")}>
              Adicionar mais
            </button>
            <Link className="button secondary" to="/">
              Ir para Hoje
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="screen">
      <header className="screen-header">
        <p className="eyebrow">Adicionar</p>
        <h1>Novas palavras</h1>
      </header>

      <div className="card form">
        <label className="field">
          <span className="field-label">Conjunto</span>
          <select
            value={selectedSet}
            onChange={(event) => setSelectedSet(event.target.value)}
            disabled={step === "preview"}
          >
            {sets.map((set) => (
              <option key={set.id} value={set.id}>
                {set.name} ({set.wordCount})
              </option>
            ))}
            <option value={NEW_SET}>+ Novo conjunto</option>
          </select>
        </label>

        {selectedSet === NEW_SET && (
          <label className="field">
            <span className="field-label">Nome do novo conjunto</span>
            <input
              type="text"
              value={newSetName}
              maxLength={60}
              placeholder="Ex.: Faculdade"
              onChange={(event) => setNewSetName(event.target.value)}
              disabled={step === "preview"}
            />
          </label>
        )}

        {step === "input" && (
          <>
            <label className="field">
              <span className="field-label">Palavras ou expressões (uma por linha)</span>
              <textarea
                rows={8}
                value={text}
                onChange={(event) => setText(event.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </label>
            {!aiEnabled && (
              <p className="hint">
                A geração automática de frases está desligada. Você poderá escrever o significado e
                a frase na prévia.
              </p>
            )}
            <button className="button primary" type="button" onClick={handlePreview} disabled={busy}>
              {busy ? "Preparando…" : "Ver prévia"}
            </button>
          </>
        )}
      </div>

      {error && <p className="message error">{error}</p>}
      {notice && <p className="message">{notice}</p>}

      {step === "preview" && (
        <>
          <ul className="draft-list">
            {drafts.map((draft) => {
              const sentenceOk =
                !draft.exampleSentence.trim() ||
                sentenceContainsTerm(draft.exampleSentence, draft.term);
              return (
                <li key={draft.key} className={`card draft ${draft.existingSetName ? "muted" : ""}`}>
                  <div className="draft-header">
                    <input
                      className="draft-term"
                      type="text"
                      value={draft.term}
                      aria-label="Palavra"
                      onChange={(event) => updateDraft(draft.key, { term: event.target.value })}
                      disabled={Boolean(draft.existingSetName)}
                    />
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={`Remover ${draft.term}`}
                      onClick={() =>
                        setDrafts((current) => current.filter((d) => d.key !== draft.key))
                      }
                    >
                      ×
                    </button>
                  </div>

                  {draft.existingSetName ? (
                    <p className="message warning">
                      Já cadastrada no conjunto “{draft.existingSetName}”. Não será salva de novo.
                    </p>
                  ) : (
                    <>
                      <label className="field">
                        <span className="field-label">Significado em português</span>
                        <input
                          type="text"
                          value={draft.meaningPt}
                          placeholder={draft.loading ? "Gerando…" : ""}
                          onChange={(event) =>
                            updateDraft(draft.key, { meaningPt: event.target.value })
                          }
                        />
                      </label>
                      <label className="field">
                        <span className="field-label">Frase de exemplo (B1)</span>
                        <textarea
                          rows={2}
                          value={draft.exampleSentence}
                          placeholder={draft.loading ? "Gerando…" : ""}
                          onChange={(event) =>
                            updateDraft(draft.key, { exampleSentence: event.target.value })
                          }
                        />
                      </label>
                      {!sentenceOk && (
                        <p className="message warning">
                          A frase precisa conter “{draft.term}” exatamente assim, para virar
                          pergunta do quiz.
                        </p>
                      )}
                      {aiEnabled && (
                        <button
                          className="link-button"
                          type="button"
                          onClick={() => regenerate(draft)}
                          disabled={draft.loading}
                        >
                          {draft.loading ? "Gerando…" : "↻ Gerar outra frase"}
                        </button>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="sticky-actions">
            <button
              className="button primary"
              type="button"
              onClick={handleSave}
              disabled={busy || toSave.length === 0 || missingSentenceTerm}
            >
              {toSave.length === 1 ? "Salvar 1 palavra" : `Salvar ${toSave.length} palavras`}
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                setStep("input");
                setError(null);
                setNotice(null);
              }}
              disabled={busy}
            >
              Voltar e editar a lista
            </button>
          </div>
        </>
      )}
    </section>
  );
}
