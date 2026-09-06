/**
 * Estado de carregamento.
 *
 * O esqueleto tem a forma do painel — cabeçalho, dois cartões de atenção, uma
 * lista — para que a troca de tela não desloque o conteúdo quando os dados
 * chegarem. Tela branca faria a navegação parecer travada.
 */
export default function Carregando() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando a operação…</span>

      <header className="space-y-2">
        <div className="h-7 w-56 animate-pulse rounded-md bg-tinta-200" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-tinta-100" />
      </header>

      <section className="space-y-3">
        <div className="h-3 w-40 animate-pulse rounded bg-tinta-100" />
        <div className="grid gap-2.5 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="cartao space-y-2.5 p-3.5">
              <div className="h-3 w-32 animate-pulse rounded bg-tinta-100" />
              <div className="h-4 w-56 max-w-full animate-pulse rounded bg-tinta-200" />
              <div className="h-3 w-24 animate-pulse rounded bg-tinta-100" />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="h-3 w-48 animate-pulse rounded bg-tinta-100" />
        <div className="cartao divide-y divide-tinta-100">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3.5">
              <div className="size-2 shrink-0 animate-pulse rounded-full bg-tinta-200" />
              <div className="h-4 flex-1 animate-pulse rounded bg-tinta-100" />
              <div className="h-3 w-20 animate-pulse rounded bg-tinta-100" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
