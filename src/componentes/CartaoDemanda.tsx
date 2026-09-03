import Link from "next/link";
import type { Demanda, Local, Movimento, Sinal, Usuario } from "@/domain/tipos";
import { ROTULO_SINAL } from "@/domain/rotulos";
import { prazoLegivel } from "@/lib/formato";
import {
  EtiquetaSinal,
  QuemAge,
  SeloEstado,
  SeloPrioridade,
} from "./primitivos";

/**
 * Linha/cartão de demanda.
 *
 * O que aparece primeiro não é o título: é o que está acontecendo com ela.
 * O próximo movimento tem destaque próprio porque é a resposta à pergunta
 * "o que precisa acontecer agora".
 */
export function CartaoDemanda({
  demanda,
  local,
  responsavel,
  proximoMovimento,
  sinais,
  semDirecao,
}: {
  demanda: Demanda;
  local?: Local;
  responsavel?: Usuario;
  proximoMovimento?: Movimento;
  sinais: Sinal[];
  semDirecao?: boolean;
}) {
  const critico = sinais.filter((s) => s.nivel === "CRITICO" || s.nivel === "ALTO");

  return (
    <Link
      href={`/demandas/${demanda.id}`}
      className="foco-visivel block rounded-xl border border-tinta-200 bg-white p-4 transition hover:border-tinta-300 hover:shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <SeloPrioridade
          nivel={demanda.prioridade.nivel}
          titulo={demanda.prioridade.justificativa}
        />
        <SeloEstado estado={demanda.estado} />
        <span className="ml-auto text-[11px] text-tinta-400">{demanda.codigo}</span>
      </div>

      <h3 className="mt-2 text-sm font-semibold leading-snug text-tinta-900">
        {demanda.titulo}
      </h3>
      {local && <p className="mt-0.5 text-xs text-tinta-500">{local.nome}</p>}

      {critico.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {critico.slice(0, 2).map((s) => (
            <EtiquetaSinal key={s.id} nivel={s.nivel}>
              {ROTULO_SINAL[s.tipo]}
            </EtiquetaSinal>
          ))}
          {critico.length > 2 && (
            <span className="self-center text-xs text-tinta-500">
              +{critico.length - 2}
            </span>
          )}
        </div>
      )}

      {/* Próximo movimento: a informação mais acionável do cartão. */}
      <div className="mt-3 rounded-lg bg-tinta-50 px-3 py-2">
        {semDirecao || !proximoMovimento ? (
          <p className="text-xs font-medium text-red-700">
            Sem próximo passo definido — alguém precisa decidir o que vem agora
          </p>
        ) : (
          <>
            <p className="text-[11px] uppercase tracking-wide text-tinta-500">
              Próximo passo
            </p>
            <p className="mt-0.5 text-sm font-medium leading-snug text-tinta-800">
              {proximoMovimento.acao}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <QuemAge nome={responsavel?.nome} id={responsavel?.id} />
              <span
                className={`text-xs ${
                  proximoMovimento.prazo < Date.now()
                    ? "font-medium text-red-600"
                    : "text-tinta-500"
                }`}
              >
                {prazoLegivel(proximoMovimento.prazo)}
              </span>
            </div>
          </>
        )}
      </div>
    </Link>
  );
}
