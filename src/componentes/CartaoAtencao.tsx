import Link from "next/link";
import type { ItemAtencao } from "@/domain/motorAtencao";
import { ROTULO_SINAL } from "@/domain/rotulos";
import { prazoLegivel, relativo } from "@/lib/formato";
import { PontoSinal, QuemAge, SeloPrioridade } from "./primitivos";

/**
 * Cartão de uma situação que merece atenção.
 *
 * A hierarquia responde, nesta ordem, às três perguntas de UX do produto:
 *   1. O que eu preciso perceber?  -> a mensagem do sinal, em destaque
 *   2. Que decisão está em jogo?   -> a demanda e sua prioridade
 *   3. Que ação está disponível?   -> a chamada de ação e quem precisa agir
 */
export function CartaoAtencao({ item }: { item: ItemAtencao }) {
  const { sinal, demanda, movimento } = item;

  return (
    <Link
      href={item.href}
      className="foco-visivel block rounded-xl border border-tinta-200 bg-white p-3.5 transition hover:border-tinta-300 hover:shadow-sm sm:p-4"
      style={{
        boxShadow: `inset 3px 0 0 0 ${
          { CRITICO: "#dc2626", ALTO: "#ea580c", MEDIO: "#ca8a04", INFO: "#2563eb" }[
            sinal.nivel
          ]
        }`,
      }}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <PontoSinal nivel={sinal.nivel} />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-tinta-500">
          {ROTULO_SINAL[sinal.tipo]}
        </span>
        {demanda && <SeloPrioridade nivel={demanda.prioridade.nivel} />}
        <span className="ml-auto shrink-0 text-[11px] text-tinta-400">
          {relativo(sinal.criadoEm)}
        </span>
      </div>

      <p className="text-sm font-medium leading-snug text-tinta-900">{sinal.mensagem}</p>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="inline-flex items-center gap-1 rounded-md bg-tinta-100 px-2 py-1 text-xs font-medium text-tinta-700">
          → {item.chamadaAcao}
        </span>
        <QuemAge nome={item.responsavel?.nome} id={item.responsavel?.id} />
        {movimento && (
          <span
            className={`text-xs ${
              movimento.prazo < Date.now() ? "font-medium text-red-600" : "text-tinta-500"
            }`}
          >
            {prazoLegivel(movimento.prazo)}
          </span>
        )}
        {demanda && (
          <span className="text-xs text-tinta-400">{demanda.codigo}</span>
        )}
      </div>
    </Link>
  );
}
