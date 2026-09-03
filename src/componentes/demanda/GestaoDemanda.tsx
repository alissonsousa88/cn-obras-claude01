"use client";

/**
 * Ações de gestão da demanda: responsável, prioridade e registro de impedimento.
 *
 * Ficam recolhidas por padrão. São capacidades importantes, mas não são a
 * pergunta principal da tela — deixá-las abertas competiria com o próximo
 * movimento pela atenção.
 */
import { BotaoEnviar, Formulario, Recolhivel } from "@/componentes/Formulario";
import { Campo, Cartao, classeInput } from "@/componentes/primitivos";
import { ROTULO_IMPEDIMENTO, ROTULO_PRIORIDADE } from "@/domain/rotulos";
import type { Demanda, NivelPrioridade, Papel, TipoImpedimento } from "@/domain/tipos";
import { paraInputDateTime } from "@/lib/formato";
import {
  acaoAjustarPrioridade,
  acaoAtribuirResponsavel,
  acaoRegistrarImpedimento,
} from "@/server/acoes";

const TIPOS_IMPEDIMENTO: TipoImpedimento[] = [
  "AGUARDANDO_APROVACAO",
  "AGUARDANDO_FORNECEDOR",
  "AGUARDANDO_MATERIAL",
  "AGUARDANDO_ACESSO",
  "FALTA_INFORMACAO",
  "DEPENDENCIA",
  "RESTRICAO_FINANCEIRA",
];

export function GestaoDemanda({
  demanda,
  usuarios,
  podeAtribuir,
  podeAjustarPrioridade,
  podeRegistrarImpedimento,
}: {
  demanda: Demanda;
  usuarios: { id: string; nome: string; papel: Papel }[];
  podeAtribuir: boolean;
  podeAjustarPrioridade: boolean;
  podeRegistrarImpedimento: boolean;
}) {
  if (!podeAtribuir && !podeAjustarPrioridade && !podeRegistrarImpedimento) return null;
  const operacao = usuarios.filter((u) => u.papel !== "SOLICITANTE");
  const tresDias = paraInputDateTime(Date.now() + 3 * 24 * 60 * 60 * 1000);

  return (
    <Cartao className="divide-y divide-tinta-100">
      {podeRegistrarImpedimento && (
        <Recolhivel rotulo="Registrar um impedimento">
          <Formulario acao={acaoRegistrarImpedimento} className="space-y-3">
            <input type="hidden" name="demandaId" value={demanda.id} />
            <p className="text-xs text-tinta-500">
              Use quando não dá para avançar por um motivo concreto. Os passos de execução
              ficam suspensos até o desbloqueio — e o sistema passa a cobrar quem pode
              destravar.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="O que está travando?" obrigatorio>
                <select name="tipo" defaultValue="" required className={classeInput}>
                  <option value="" disabled>
                    Escolha
                  </option>
                  {TIPOS_IMPEDIMENTO.map((t) => (
                    <option key={t} value={t}>
                      {ROTULO_IMPEDIMENTO[t]}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Quem consegue destravar?" obrigatorio>
                <select
                  name="responsavelDesbloqueioId"
                  defaultValue=""
                  required
                  className={classeInput}
                >
                  <option value="" disabled>
                    Escolha uma pessoa
                  </option>
                  {usuarios.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
            <Campo rotulo="Descreva o impedimento" obrigatorio>
              <textarea
                name="descricao"
                required
                rows={2}
                placeholder="Ex.: Fornecedor não enviou o orçamento solicitado por e-mail"
                className={classeInput}
              />
            </Campo>
            <Campo
              rotulo="Quando revisar isso?"
              obrigatorio
              dica="Impedimento sem data de revisão vira esquecimento — o sistema vai cobrar nessa data"
            >
              <input
                name="dataRevisao"
                type="datetime-local"
                required
                defaultValue={tresDias}
                className={classeInput}
              />
            </Campo>
            <BotaoEnviar variante="perigo">Registrar impedimento</BotaoEnviar>
          </Formulario>
        </Recolhivel>
      )}

      {podeAtribuir && (
        <Recolhivel rotulo="Trocar responsável">
          <Formulario acao={acaoAtribuirResponsavel} className="space-y-3">
            <input type="hidden" name="demandaId" value={demanda.id} />
            <Campo rotulo="Responsável pela demanda">
              <select
                name="responsavelId"
                defaultValue={demanda.responsavelId ?? ""}
                className={classeInput}
              >
                <option value="">Sem responsável</option>
                {operacao.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <BotaoEnviar variante="secundario">Salvar responsável</BotaoEnviar>
          </Formulario>
        </Recolhivel>
      )}

      {podeAjustarPrioridade && (
        <Recolhivel rotulo="Ajustar prioridade">
          <Formulario acao={acaoAjustarPrioridade} className="space-y-3">
            <input type="hidden" name="demandaId" value={demanda.id} />
            <p className="rounded-lg bg-tinta-50 p-3 text-xs text-tinta-600">
              <span className="font-medium">Cálculo do sistema:</span>{" "}
              {ROTULO_PRIORIDADE[demanda.prioridade.nivel]} (score{" "}
              {demanda.prioridade.score}) — {demanda.prioridade.justificativa}
            </p>
            <Campo rotulo="Nova prioridade">
              <select
                name="nivel"
                defaultValue={demanda.prioridade.nivel}
                className={classeInput}
              >
                {(["CRITICA", "ALTA", "MEDIA", "BAIXA"] as NivelPrioridade[]).map((n) => (
                  <option key={n} value={n}>
                    {ROTULO_PRIORIDADE[n]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo
              rotulo="Por que está mudando?"
              obrigatorio
              dica="A decisão fica registrada no histórico com seu nome"
            >
              <textarea name="justificativa" required rows={2} className={classeInput} />
            </Campo>
            <BotaoEnviar variante="secundario">Salvar prioridade</BotaoEnviar>
          </Formulario>
        </Recolhivel>
      )}
    </Cartao>
  );
}
