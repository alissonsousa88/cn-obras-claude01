"use client";

/**
 * Conclusão orientada a resultado.
 *
 * Concluir não é mudar um status. O formulário separa explicitamente
 * "o que foi feito" (atividade) de "resultado obtido" (efeito), e o sistema
 * recusa a conclusão enquanto houver pendências — mostrando quais são.
 */
import { useState } from "react";
import { BotaoEnviar, Formulario } from "@/componentes/Formulario";
import { Campo, Cartao, classeInput } from "@/componentes/primitivos";
import type { ChecagemConclusao } from "@/domain/motorFluxo";
import { acaoConcluirDemanda } from "@/server/acoes";

export function CaixaConcluirDemanda({
  demandaId,
  checagem,
}: {
  demandaId: string;
  checagem: ChecagemConclusao;
}) {
  const [aberto, setAberto] = useState(false);

  if (!checagem.pode) {
    return (
      <Cartao className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-tinta-500">
          Ainda não dá para concluir
        </p>
        <ul className="mt-2 space-y-1">
          {checagem.pendencias.map((p) => (
            <li key={p} className="flex gap-2 text-sm text-tinta-700">
              <span className="text-tinta-400" aria-hidden>
                •
              </span>
              {p}
            </li>
          ))}
        </ul>
      </Cartao>
    );
  }

  return (
    <Cartao className="border-emerald-300 bg-emerald-50/50 p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
        Pronta para conclusão
      </p>
      <p className="mt-1.5 text-sm text-emerald-900">
        Todos os passos foram concluídos e o resultado foi validado. Registre o que
        aconteceu para fechar a demanda.
      </p>

      {aberto ? (
        <Formulario
          acao={acaoConcluirDemanda}
          className="mt-4 space-y-3 border-t border-emerald-200 pt-4"
        >
          <input type="hidden" name="demandaId" value={demandaId} />
          <Campo rotulo="O que foi realizado?" obrigatorio dica="A atividade executada">
            <textarea
              name="oQueFoiFeito"
              required
              rows={2}
              autoFocus
              placeholder="Ex.: Engate flexível e vedação do vaso substituídos"
              className={classeInput}
            />
          </Campo>
          <Campo
            rotulo="Qual foi o resultado obtido?"
            obrigatorio
            dica="O efeito, na perspectiva de quem abriu a demanda"
          >
            <textarea
              name="resultadoObtido"
              required
              rows={2}
              placeholder="Ex.: Banheiro seco durante todo o culto de domingo"
              className={classeInput}
            />
          </Campo>
          <Campo rotulo="Observações finais">
            <textarea
              name="observacoesFinais"
              rows={2}
              placeholder="Garantia, cuidados futuros, recomendações…"
              className={classeInput}
            />
          </Campo>
          <label className="flex items-start gap-2.5 rounded-lg bg-white p-3 ring-1 ring-inset ring-emerald-200">
            <input
              type="checkbox"
              name="problemaResolvido"
              required
              className="mt-0.5 size-4 rounded border-tinta-300"
            />
            <span className="text-sm text-emerald-900">
              Confirmo que o problema que originou esta demanda foi resolvido
            </span>
          </label>
          <div className="flex gap-2">
            <BotaoEnviar>Concluir demanda</BotaoEnviar>
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="foco-visivel rounded-lg px-3 py-2 text-sm text-tinta-600 hover:bg-white"
            >
              Cancelar
            </button>
          </div>
        </Formulario>
      ) : (
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="foco-visivel mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-800"
        >
          Registrar resultado e concluir
        </button>
      )}
    </Cartao>
  );
}
