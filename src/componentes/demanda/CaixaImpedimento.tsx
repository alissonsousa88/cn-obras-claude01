"use client";

/**
 * Impedimento ativo.
 *
 * Ocupa o topo da tela e usa a cor mais forte disponível porque comunica algo
 * que os sistemas genéricos escondem: a demanda não está parada por descaso,
 * está travada por um motivo identificado — e existe uma pessoa nomeada
 * responsável por destravá-la.
 */
import { useState } from "react";
import { BotaoEnviar, Formulario } from "@/componentes/Formulario";
import { Campo, Cartao, QuemAge, classeInput } from "@/componentes/primitivos";
import { ROTULO_IMPEDIMENTO } from "@/domain/rotulos";
import type { Impedimento, Usuario } from "@/domain/tipos";
import { data, relativo } from "@/lib/formato";
import { acaoResolverImpedimento } from "@/server/acoes";

export function CaixaImpedimento({
  impedimento,
  responsavel,
  podeResolver,
  demandaId,
}: {
  impedimento: Impedimento;
  responsavel?: Usuario;
  podeResolver: boolean;
  demandaId: string;
}) {
  const [resolvendo, setResolvendo] = useState(false);
  const revisaoVencida = impedimento.dataRevisao < Date.now();

  return (
    <Cartao className="border-red-300 bg-red-50/70 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-red-600 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
          Bloqueada
        </span>
        <span className="text-xs font-medium text-red-800">
          {ROTULO_IMPEDIMENTO[impedimento.tipo]}
        </span>
        <span className="ml-auto text-[11px] text-red-700">
          bloqueada {relativo(impedimento.dataInicio)}
        </span>
      </div>

      <p className="mt-2 text-sm font-medium text-red-950">{impedimento.descricao}</p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <QuemAge
          nome={responsavel?.nome}
          id={responsavel?.id}
          prefixo="Precisa destravar: "
        />
        <span className={`text-xs ${revisaoVencida ? "font-medium text-red-700" : "text-red-800"}`}>
          {revisaoVencida ? "Revisão vencida em " : "Revisar em "}
          {data(impedimento.dataRevisao)}
        </span>
      </div>

      {podeResolver && (
        <div className="mt-4 border-t border-red-200 pt-4">
          {resolvendo ? (
            <Formulario acao={acaoResolverImpedimento} className="space-y-3">
              <input type="hidden" name="demandaId" value={demandaId} />
              <input type="hidden" name="impedimentoId" value={impedimento.id} />
              <Campo rotulo="Como o impedimento foi resolvido?" obrigatorio>
                <textarea
                  name="resolucao"
                  required
                  rows={2}
                  autoFocus
                  placeholder="Ex.: Orçamento recebido do fornecedor por telefone."
                  className={classeInput}
                />
              </Campo>
              <div className="flex gap-2">
                <BotaoEnviar>Destravar e retomar</BotaoEnviar>
                <button
                  type="button"
                  onClick={() => setResolvendo(false)}
                  className="foco-visivel rounded-lg px-3 py-2 text-sm text-red-800 hover:bg-red-100"
                >
                  Cancelar
                </button>
              </div>
              <p className="text-xs text-red-700">
                Ao destravar, os passos suspensos voltam a ficar pendentes com o prazo
                ajustado pelo tempo em que ficaram parados.
              </p>
            </Formulario>
          ) : (
            <button
              type="button"
              onClick={() => setResolvendo(true)}
              className="foco-visivel rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Registrar desbloqueio
            </button>
          )}
        </div>
      )}
    </Cartao>
  );
}
