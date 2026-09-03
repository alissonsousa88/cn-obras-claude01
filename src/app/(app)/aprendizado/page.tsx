/**
 * APRENDIZADO OPERACIONAL
 *
 * Deliberadamente não é um mural de gráficos. Cada número aqui existe porque
 * responde a uma pergunta que muda uma decisão: onde os problemas se repetem,
 * onde o processo trava, o que a operação precisa melhorar.
 *
 * As métricas são calculadas sobre o histórico real (`analiseHistorico.ts`) —
 * a mesma base que alimenta o Motor de Prioridade e o sinal de reincidência.
 */
import Link from "next/link";
import { Cartao, TituloSecao, Vazio } from "@/componentes/primitivos";
import { REGRAS } from "@/domain/regras";
import { plural } from "@/domain/plural";
import { exigirUsuario } from "@/server/auth";
import { dadosAprendizado } from "@/server/consultas";
import { exigir } from "@/server/permissoes";

export default async function PaginaAprendizado() {
  const usuario = await exigirUsuario();
  exigir(usuario, "ver_metricas");
  const { metricas: m, locais, categorias } = await dadosAprendizado();

  const nomeLocal = (id: string) => locais.find((l) => l.id === id)?.nome ?? "—";
  const nomeCategoria = (id: string) => categorias.find((c) => c.id === id)?.nome ?? "—";

  return (
    <div className="space-y-8">
      <header>
        <h1 className="titulo-tela">Aprendizado</h1>
        <p className="mt-1 text-sm text-tinta-500">
          O que o histórico dos últimos 90 dias diz sobre a operação. Números que mudam
          decisões, não painéis decorativos.
        </p>
      </header>

      {/* Reincidência primeiro: é o dado que mais muda decisão. */}
      <section>
        <TituloSecao>Problemas que se repetem</TituloSecao>
        {m.reincidencias.length === 0 ? (
          <Vazio
            titulo="Nenhuma reincidência identificada"
            descricao={`Nenhum local acumulou ${REGRAS.reincidencia.ocorrenciasMinimas} demandas do mesmo tipo na janela de ${REGRAS.reincidencia.janelaDias} dias.`}
          />
        ) : (
          <div className="space-y-2.5">
            {m.reincidencias.map((r) => (
              <Cartao
                key={`${r.localId}-${r.categoriaId}`}
                className="border-amber-200 bg-amber-50/50 p-4"
              >
                <p className="text-sm font-semibold text-amber-950">
                  {nomeCategoria(r.categoriaId)} em {nomeLocal(r.localId)}
                </p>
                <p className="mt-1 text-sm text-amber-900">
                  {r.ocorrencias} demandas nos últimos {REGRAS.reincidencia.janelaDias}{" "}
                  dias. Repetição neste padrão sugere causa de fundo não resolvida —
                  considere uma rotina preventiva.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {r.demandaIds.map((id) => (
                    <Link
                      key={id}
                      href={`/demandas/${id}`}
                      className="rounded bg-white px-2 py-1 text-[11px] text-amber-900 ring-1 ring-amber-200"
                    >
                      ver ocorrência →
                    </Link>
                  ))}
                </div>
              </Cartao>
            ))}
          </div>
        )}
      </section>

      <section>
        <TituloSecao>Como a operação está funcionando</TituloSecao>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <Metrica
            rotulo="Tempo até a triagem"
            valor={m.tempoMedioAteTriagemHoras}
            sufixo="h"
            referencia={`meta: ${REGRAS.triagemHoras}h`}
            alerta={
              m.tempoMedioAteTriagemHoras !== null &&
              m.tempoMedioAteTriagemHoras > REGRAS.triagemHoras
            }
          />
          <Metrica
            rotulo="Tempo até a resolução"
            valor={
              m.tempoMedioResolucaoHoras !== null
                ? Math.round(m.tempoMedioResolucaoHoras / 24)
                : null
            }
            sufixo=" dias"
          />
          <Metrica
            rotulo="Resolvidas no prazo"
            valor={m.percentualNoPrazo}
            sufixo="%"
            alerta={m.percentualNoPrazo !== null && m.percentualNoPrazo < 70}
          />
          <Metrica rotulo="Demandas ativas" valor={m.totalAtivas} />
          <Metrica rotulo="Concluídas no período" valor={m.concluidasNoPeriodo} />
          <Metrica
            rotulo="Precisaram de retrabalho"
            valor={m.retrabalhos}
            referencia="execução repetida"
            alerta={m.retrabalhos > 0}
          />
        </div>
        {m.demandasSemProximoMovimento > 0 && (
          <Cartao className="mt-2.5 border-red-200 bg-red-50/60 p-4">
            <p className="text-sm text-red-900">
              <span className="font-semibold">
                {plural(m.demandasSemProximoMovimento, "demanda")} sem próximo passo
                definido.
              </span>{" "}
              Este é o indicador mais importante desta tela: demanda sem direção é demanda
              esquecida.
            </p>
            <Link
              href="/atencao?tipo=SEM_PROXIMO_MOVIMENTO"
              className="mt-2 inline-block text-xs font-medium text-red-800 underline underline-offset-2"
            >
              Ver quais são
            </Link>
          </Cartao>
        )}
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section>
          <TituloSecao>Onde surgem mais demandas</TituloSecao>
          <Barras
            itens={m.porLocal.slice(0, 6).map((x) => ({
              rotulo: nomeLocal(x.localId),
              valor: x.total,
            }))}
          />
        </section>
        <section>
          <TituloSecao>Que tipo de serviço mais aparece</TituloSecao>
          <Barras
            itens={m.porCategoria.slice(0, 6).map((x) => ({
              rotulo: nomeCategoria(x.categoriaId),
              valor: x.total,
            }))}
          />
        </section>
      </div>
    </div>
  );
}

function Metrica({
  rotulo,
  valor,
  sufixo = "",
  referencia,
  alerta,
}: {
  rotulo: string;
  valor: number | null;
  sufixo?: string;
  referencia?: string;
  alerta?: boolean;
}) {
  return (
    <Cartao className="p-4">
      <p
        className={`text-2xl font-semibold tabular-nums ${
          alerta ? "text-orange-600" : "text-tinta-900"
        }`}
      >
        {valor === null ? "—" : `${valor}${sufixo}`}
      </p>
      <p className="mt-0.5 text-xs leading-tight text-tinta-600">{rotulo}</p>
      {referencia && <p className="mt-0.5 text-[11px] text-tinta-400">{referencia}</p>}
    </Cartao>
  );
}

/**
 * Barras horizontais simples. Comparação de grandeza entre poucas categorias
 * não precisa de biblioteca de gráficos — precisa de leitura imediata.
 */
function Barras({ itens }: { itens: { rotulo: string; valor: number }[] }) {
  const maximo = Math.max(1, ...itens.map((i) => i.valor));
  if (itens.length === 0) {
    return <Vazio titulo="Sem dados no período" icone="◔" />;
  }
  return (
    <Cartao className="space-y-2.5 p-4">
      {itens.map((i) => (
        <div key={i.rotulo}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-tinta-700">{i.rotulo}</span>
            <span className="shrink-0 font-medium tabular-nums text-tinta-900">
              {i.valor}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-tinta-100">
            <div
              className="h-full rounded-full bg-tinta-400"
              style={{ width: `${(i.valor / maximo) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </Cartao>
  );
}
