export function WordsScreen() {
  return (
    <section className="screen">
      <header className="screen-header">
        <p className="eyebrow">Palavras</p>
        <h1>Seus conjuntos</h1>
      </header>
      <div className="card empty-state">
        <p>Nenhum conjunto ainda. As palavras que você salvar aparecem aqui.</p>
      </div>
    </section>
  );
}
