/**
 * Timeline operacional.
 *
 * Fica no fim da página de propósito: o histórico não pode competir com a
 * situação presente. Ele existe para responder "como chegamos aqui" quando
 * alguém precisa, não para ser a primeira coisa que se vê.
 *
 * Nada é removido daqui — a regra de domínio proíbe apagar histórico.
 */
import { Cartao, TituloSecao } from "@/componentes/primitivos";
import { ROTULO_EVENTO, ROTULO_TIPO_MOVIMENTO } from "@/domain/rotulos";
import type { Evento, Movimento, TipoEvento } from "@/domain/tipos";
import { dataHora, relativo } from "@/lib/formato";

type EventoComAutor = Evento & { autorNome?: string };

/** Eventos com peso visual maior na timeline. */
const MARCOS: ReadonlySet<TipoEvento> = new Set([
  "DEMANDA_CRIADA",
  "TRIAGEM_REALIZADA",
  "IMPEDIMENTO_REGISTRADO",
  "IMPEDIMENTO_RESOLVIDO",
  "APROVACAO_DECIDIDA",
  "DEMANDA_CONCLUIDA",
  "DEMANDA_REABERTA",
]);

const COR_EVENTO: Partial<Record<TipoEvento, string>> = {
  DEMANDA_CRIADA: "bg-blue-500",
  TRIAGEM_REALIZADA: "bg-blue-500",
  MOVIMENTO_CONCLUIDO: "bg-emerald-500",
  IMPEDIMENTO_REGISTRADO: "bg-red-500",
  IMPEDIMENTO_RESOLVIDO: "bg-emerald-500",
  SINAL_ABERTO: "bg-amber-500",
  SINAL_RESOLVIDO: "bg-tinta-300",
  DEMANDA_CONCLUIDA: "bg-emerald-600",
  DEMANDA_REABERTA: "bg-orange-500",
  APROVACAO_DECIDIDA: "bg-violet-500",
  REINCIDENCIA_IDENTIFICADA: "bg-amber-600",
};

export function Historico({
  eventos,
  movimentos,
}: {
  eventos: EventoComAutor[];
  movimentos: Movimento[];
}) {
  const concluidos = movimentos.filter((m) => m.estado === "CONCLUIDO");

  return (
    <section>
      <TituloSecao contagem={eventos.length}>Histórico</TituloSecao>

      {concluidos.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-xs text-tinta-500">Passos já concluídos</p>
          <Cartao className="divide-y divide-tinta-100">
            {concluidos.map((m) => (
              <div key={m.id} className="p-3.5">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="rounded bg-tinta-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-tinta-600">
                    {ROTULO_TIPO_MOVIMENTO[m.tipo]}
                  </span>
                  <span className="text-sm font-medium text-tinta-800">{m.acao}</span>
                  <span className="ml-auto text-[11px] text-tinta-400">
                    {m.concluidoEm ? dataHora(m.concluidoEm) : ""}
                  </span>
                </div>
                {m.relato && (
                  <p className="mt-1.5 text-sm text-tinta-600">{m.relato}</p>
                )}
                {m.concluidoEm !== undefined && m.concluidoEm > m.prazo && (
                  <p className="mt-1 text-[11px] text-red-600">
                    Concluído após o prazo previsto
                  </p>
                )}
              </div>
            ))}
          </Cartao>
        </div>
      )}

      <details className="group">
        <summary className="foco-visivel cursor-pointer list-none rounded-lg px-3 py-2 text-sm text-tinta-600 hover:bg-tinta-100">
          <span className="mr-1.5 inline-block transition group-open:rotate-90">›</span>
          Ver todos os {eventos.length} registros
        </summary>
        <ol className="mt-2 space-y-0 border-l border-tinta-200 pl-4">
          {eventos.map((e) => (
            <li key={e.id} className="relative py-2">
              <span
                className={`absolute -left-[21px] top-3 size-2 rounded-full ring-2 ring-tinta-50 ${
                  COR_EVENTO[e.tipo] ?? "bg-tinta-300"
                }`}
                aria-hidden
              />
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span
                  className={`text-xs ${
                    MARCOS.has(e.tipo)
                      ? "font-semibold text-tinta-700"
                      : "text-tinta-500"
                  }`}
                >
                  {ROTULO_EVENTO[e.tipo]}
                </span>
                <span className="text-[11px] text-tinta-400" title={dataHora(e.criadoEm)}>
                  {relativo(e.criadoEm)}
                </span>
                <span className="text-[11px] text-tinta-400">
                  · {e.autorNome ?? "sistema"}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-tinta-700">{e.descricao}</p>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
