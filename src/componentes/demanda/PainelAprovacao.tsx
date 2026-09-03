"use client";

/**
 * Aprovação pendente.
 *
 * Deixa explícito de quem é a decisão. Para quem não é o aprovador, o painel
 * informa quem está segurando o fluxo — a frase que o produto queria dizer:
 * "João precisa aprovar este orçamento para que o serviço continue".
 */
import { Formulario } from "@/componentes/Formulario";
import { Campo, Cartao, QuemAge, classeInput } from "@/componentes/primitivos";
import type { Aprovacao, Usuario } from "@/domain/tipos";
import { moeda, relativo } from "@/lib/formato";
import { acaoDecidirAprovacao } from "@/server/acoes";

export function PainelAprovacao({
  aprovacao,
  aprovador,
  souOAprovador,
  podeDecidir,
  demandaId,
}: {
  aprovacao: Aprovacao;
  aprovador?: Usuario;
  souOAprovador: boolean;
  podeDecidir: boolean;
  demandaId: string;
}) {
  return (
    <Cartao className="border-violet-300 bg-violet-50/60 p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
        {souOAprovador ? "Aguardando sua decisão" : "Aguardando aprovação"}
      </p>
      <p className="mt-1.5 text-base font-semibold text-violet-950">
        {aprovacao.descricao}
      </p>
      {aprovacao.valor !== undefined && (
        <p className="mt-1 text-sm text-violet-900">Valor: {moeda(aprovacao.valor)}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <QuemAge nome={aprovador?.nome} id={aprovador?.id} prefixo="Decide: " />
        <span className="text-xs text-violet-800">
          Solicitado {relativo(aprovacao.solicitadoEm)}
        </span>
      </div>

      {!souOAprovador && (
        <p className="mt-3 text-sm text-violet-900">
          {aprovador?.nome} precisa aprovar para que o serviço continue.
        </p>
      )}

      {podeDecidir && (
        <Formulario acao={acaoDecidirAprovacao} className="mt-4 space-y-3 border-t border-violet-200 pt-4">
          <input type="hidden" name="demandaId" value={demandaId} />
          <input type="hidden" name="aprovacaoId" value={aprovacao.id} />
          <Campo
            rotulo="Justificativa"
            dica="Obrigatória ao recusar — orienta o próximo passo de quem executa"
          >
            <textarea name="justificativa" rows={2} className={classeInput} />
          </Campo>
          {/* Ambos os botões carregam a decisão: nada de estado implícito. */}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              name="decisao"
              value="aprovar"
              className="foco-visivel rounded-lg bg-tinta-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-tinta-800"
            >
              Aprovar
            </button>
            <button
              type="submit"
              name="decisao"
              value="recusar"
              className="foco-visivel rounded-lg px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-300 transition hover:bg-red-50"
            >
              Recusar
            </button>
          </div>
        </Formulario>
      )}
    </Cartao>
  );
}
