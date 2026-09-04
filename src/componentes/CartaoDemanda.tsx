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
 * Cartão de demanda.
 *
 * Cada informação aparece uma vez só. Em particular, o selo de estado é
 * omitido quando há sinais ativos: "Bloqueada" ao lado de "Bloqueio prolongado"
 * é a mesma notícia duas vezes, e o próximo passo já nomeia a fase em que a
 * demanda está ("Triar:", "Executar:", "Aprovar", "Validar"). O estado volta a
 * aparecer quando não há sinal nenhum — aí ele é a única pista de situação.
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
  const relevantes = sinais.filter(
    (s) => s.nivel === "CRITICO" || s.nivel === "ALTO" || s.nivel === "MEDIO",
  );

  return (
    <Link
      href={`/demandas/${demanda.id}`}
      className="foco-visivel block rounded-xl border border-tinta-200 bg-white p-4 transition hover:border-tinta-300 hover:shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <SeloPrioridade
          nivel={demanda.prioridade.nivel}
          titulo={demanda.prioridade.justificativa}
        />
        {relevantes.length === 0 ? (
          <SeloEstado estado={demanda.estado} />
        ) : (
          relevantes.slice(0, 2).map((s) => (
            <EtiquetaSinal key={s.id} nivel={s.nivel}>
              {ROTULO_SINAL[s.tipo]}
            </EtiquetaSinal>
          ))
        )}
        {relevantes.length > 2 && (
          <span className="text-xs text-tinta-500">+{relevantes.length - 2}</span>
        )}
      </div>

      <h3 className="mt-2 text-sm font-semibold leading-snug text-tinta-900">
        {demanda.titulo}
      </h3>
      {/* O código acompanha o local: sozinho numa linha alinhada à direita, ele
          era empurrado para baixo pelos selos e virava uma linha órfã. */}
      <p className="mt-0.5 text-xs text-tinta-500">
        {local?.nome}
        {local && <span className="text-tinta-300"> · </span>}
        <span className="text-tinta-400">{demanda.codigo}</span>
      </p>

      {/* O próximo passo é a informação mais acionável: separado por uma linha,
          não por uma caixa preenchida, que pesava sem acrescentar nada.
          Numa demanda encerrada não existe próximo passo — ali o que interessa
          é o resultado. */}
      <div className="mt-3 border-t border-tinta-100 pt-2.5">
        {demanda.estado === "CONCLUIDA" ? (
          <p className="text-sm leading-snug text-emerald-800">
            <span className="text-emerald-600">✓</span>{" "}
            {demanda.resultado?.resultadoObtido ?? "Concluída"}
          </p>
        ) : demanda.estado === "CANCELADA" ? (
          <p className="text-sm text-tinta-500">Cancelada</p>
        ) : semDirecao || !proximoMovimento ? (
          <p className="text-xs font-medium text-red-700">
            Sem próximo passo definido — alguém precisa decidir o que vem agora
          </p>
        ) : (
          <>
            <p className="text-sm leading-snug text-tinta-800">
              <span className="text-tinta-400">→</span> {proximoMovimento.acao}
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
