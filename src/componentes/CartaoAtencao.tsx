import Link from "next/link";
import type { ItemAtencao } from "@/domain/motorAtencao";
import { ROTULO_SINAL } from "@/domain/rotulos";
import { PontoSinal, QuemAge, SeloPrioridade } from "./primitivos";

/**
 * Cartão de uma situação que merece atenção.
 *
 * A hierarquia responde às três perguntas de UX do produto, e cada linha
 * responde uma só vez:
 *
 *   O que eu preciso perceber?  -> tipo do sinal (etiqueta) + assunto (título)
 *   O que mudou?                -> a mensagem, que é só a novidade
 *   Quem age?                   -> responsável e código, discretos
 *
 * A chamada de ação só aparece quando diz algo que o assunto não diz — para um
 * prazo vencido, "→ Aprovar orçamento" repetiria o título e viraria ruído.
 */
export function CartaoAtencao({ item }: { item: ItemAtencao }) {
  const { sinal, demanda } = item;
  const acaoRedundante =
    item.chamadaAcao.trim().toLowerCase() === sinal.assunto.trim().toLowerCase();

  return (
    <Link
      href={item.href}
      className="foco-visivel block rounded-xl border border-tinta-200 bg-white p-3.5 transition hover:border-tinta-300 hover:shadow-sm"
      style={{
        boxShadow: `inset 3px 0 0 0 ${
          { CRITICO: "#dc2626", ALTO: "#ea580c", MEDIO: "#ca8a04", INFO: "#2563eb" }[
            sinal.nivel
          ]
        }`,
      }}
    >
      <div className="flex items-center gap-2">
        <PontoSinal nivel={sinal.nivel} />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-tinta-500">
          {ROTULO_SINAL[sinal.tipo]}
        </span>
        {demanda && <SeloPrioridade nivel={demanda.prioridade.nivel} />}
      </div>

      <p className="mt-1.5 text-sm font-semibold leading-snug text-tinta-900">
        {sinal.assunto}
      </p>
      <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-tinta-600">
        {sinal.mensagem}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <QuemAge nome={item.responsavel?.nome} id={item.responsavel?.id} />
        {!acaoRedundante && (
          <span className="text-xs font-medium text-obra-700">→ {item.chamadaAcao}</span>
        )}
        {demanda && <span className="text-[11px] text-tinta-400">{demanda.codigo}</span>}
      </div>

      {item.relacionados.length > 0 && (
        <p className="mt-1.5 text-[11px] text-tinta-400">
          Também aqui: {item.relacionados.map((s) => ROTULO_SINAL[s.tipo].toLowerCase()).join(", ")}
        </p>
      )}
    </Link>
  );
}
