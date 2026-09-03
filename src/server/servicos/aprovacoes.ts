/**
 * SERVIÇO DE APROVAÇÕES
 *
 * Uma aprovação é uma decisão com dono e prazo, não um status. Aprovar libera a
 * execução (o Motor de Fluxo cria o passo seguinte); recusar não deixa a demanda
 * no limbo: exige um encaminhamento explícito.
 */
import { REGRAS } from "@/domain/regras";
import { HORA } from "@/domain/regras";
import type { ID, Instante, Usuario } from "@/domain/tipos";
import type { BaseDados } from "../store/port";
import { agora as agoraFn, marcarAvanco, registrarEvento, acharDemanda } from "./comum";
import { atualizarEstado, concluirMovimento, criarMovimento } from "./movimentos";
import { reconciliarSinais } from "./sinais";

export function decidirAprovacao(
  base: BaseDados,
  autor: Usuario,
  aprovacaoId: ID,
  aprovada: boolean,
  justificativa: string,
  instante: Instante = agoraFn(),
): void {
  const aprovacao = base.aprovacoes.find((a) => a.id === aprovacaoId);
  if (!aprovacao) throw new Error("Aprovação não encontrada.");
  if (aprovacao.estado !== "PENDENTE") {
    throw new Error("Esta aprovação já foi decidida.");
  }
  if (aprovacao.aprovadorId !== autor.id && autor.papel !== "LIDERANCA") {
    throw new Error("Esta decisão está endereçada a outra pessoa.");
  }
  if (!aprovada && justificativa.trim().length < 5) {
    throw new Error("Ao recusar, registre o motivo para orientar o próximo passo.");
  }

  aprovacao.estado = aprovada ? "APROVADA" : "RECUSADA";
  aprovacao.decididoEm = instante;
  aprovacao.justificativa = justificativa.trim() || undefined;

  const demanda = acharDemanda(base, aprovacao.demandaId);
  marcarAvanco(demanda, instante);

  registrarEvento(base, {
    demandaId: aprovacao.demandaId,
    tipo: "APROVACAO_DECIDIDA",
    descricao: aprovada
      ? `Aprovado por ${autor.nome}${justificativa.trim() ? `: ${justificativa.trim()}` : ""}`
      : `Recusado por ${autor.nome}: ${justificativa.trim()}`,
    autorId: autor.id,
    dados: { aprovada, valor: aprovacao.valor ?? 0 },
    em: instante,
  });

  if (aprovada) {
    // Concluir o movimento de aprovação faz o Motor de Fluxo liberar a execução.
    concluirMovimento(
      base,
      autor,
      aprovacao.movimentoId,
      { relato: `Aprovado: ${justificativa.trim() || "sem observações"}` },
      undefined,
      instante,
    );
    return;
  }

  // Recusa: o passo de aprovação encerra, mas a demanda não pode ficar sem
  // direção — cai em replanejamento com prazo.
  const movimento = base.movimentos.find((m) => m.id === aprovacao.movimentoId);
  if (movimento && movimento.estado === "PENDENTE") {
    movimento.estado = "CONCLUIDO";
    movimento.concluidoEm = instante;
    movimento.concluidoPor = autor.id;
    movimento.relato = `Recusado: ${justificativa.trim()}`;
  }
  criarMovimento(
    base,
    demanda,
    {
      tipo: "ORCAMENTO",
      acao: "Revisar solução após recusa do orçamento",
      resultadoEsperado: "Nova proposta de solução ou encerramento justificado",
      prazo: instante + REGRAS.prazoPadraoHoras.ORCAMENTO * HORA,
      responsavelId: demanda.responsavelId,
      origem: "AUTOMATICO",
      motivo: "A recusa não pode deixar a demanda parada sem encaminhamento",
    },
    undefined,
    instante,
  );

  atualizarEstado(base, aprovacao.demandaId);
  reconciliarSinais(base, instante);
}
