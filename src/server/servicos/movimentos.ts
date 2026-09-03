/**
 * SERVIÇO DE MOVIMENTOS (Motor de Fluxo aplicado)
 *
 * Aqui vive a regra mais importante do produto:
 *
 *   concluir um movimento SEMPRE provoca a análise do próximo movimento.
 *
 * Quando o Motor de Fluxo consegue decidir sozinho, o próximo passo é criado
 * automaticamente (origem AUTOMATICO). Quando o fluxo chega ao ponto de
 * conclusão, o sistema sinaliza que falta registrar o resultado. Em nenhum
 * caminho a demanda fica "em andamento" sem que se saiba o que vem depois.
 */
import {
  estadoDerivado,
  prazoDe,
  sugerirProximoMovimento,
  type ConclusaoMovimento,
  type DecisaoFluxo,
} from "@/domain/motorFluxo";
import type {
  Demanda,
  ID,
  Instante,
  Movimento,
  OrigemMovimento,
  TipoMovimento,
  Usuario,
} from "@/domain/tipos";
import type { BaseDados } from "../store/port";
import {
  acharDemanda,
  agora as agoraFn,
  contextoDemanda,
  marcarAvanco,
  novoId,
  registrarEvento,
} from "./comum";
import { reconciliarSinais } from "./sinais";

export interface EntradaMovimento {
  tipo: TipoMovimento;
  acao: string;
  resultadoEsperado: string;
  prazo: Instante;
  responsavelId?: ID;
  origem: OrigemMovimento;
  /** Explicação de por que este passo existe — entra no histórico. */
  motivo?: string;
}

export function criarMovimento(
  base: BaseDados,
  demanda: Demanda,
  entrada: EntradaMovimento,
  autor: Usuario | undefined,
  instante: Instante = agoraFn(),
): Movimento {
  if (entrada.acao.trim().length < 3) {
    throw new Error("Descreva a ação do próximo passo.");
  }
  if (entrada.resultadoEsperado.trim().length < 3) {
    throw new Error(
      "Descreva o resultado esperado: é assim que saberemos se o passo funcionou.",
    );
  }
  const sequencia =
    base.movimentos.filter((m) => m.demandaId === demanda.id).length + 1;

  const movimento: Movimento = {
    id: novoId(),
    demandaId: demanda.id,
    tipo: entrada.tipo,
    acao: entrada.acao.trim(),
    responsavelId: entrada.responsavelId,
    prazo: entrada.prazo,
    resultadoEsperado: entrada.resultadoEsperado.trim(),
    estado: "PENDENTE",
    origem: entrada.origem,
    criadoEm: instante,
    sequencia,
  };
  base.movimentos.push(movimento);

  registrarEvento(base, {
    demandaId: demanda.id,
    tipo: "MOVIMENTO_CRIADO",
    descricao: entrada.motivo
      ? `Próximo passo: ${movimento.acao} — ${entrada.motivo}`
      : `Próximo passo: ${movimento.acao}`,
    autorId: autor?.id,
    dados: {
      tipo: movimento.tipo,
      origem: movimento.origem,
      prazo: movimento.prazo,
      responsavelId: movimento.responsavelId ?? null,
    },
    em: instante,
  });

  return movimento;
}

/** Dados adicionais que a triagem produz. */
export interface DadosTriagem {
  responsavelId?: ID;
  prazoDemanda?: Instante;
  custoEstimado?: number;
  /** Ajuste dos fatores de prioridade percebidos na inspeção. */
  fatores?: Partial<Demanda["fatores"]>;
}

export interface ResultadoConclusao {
  movimento: Movimento;
  decisao: DecisaoFluxo;
  criado?: Movimento;
}

/**
 * Conclusão de um movimento.
 *
 * Sequência garantida:
 *   1. registra o relato e o instante da conclusão;
 *   2. marca avanço real na demanda;
 *   3. chama o Motor de Fluxo para decidir o próximo movimento;
 *   4. cria o próximo movimento (ou marca a demanda como pronta para conclusão);
 *   5. reconcilia sinais.
 */
export function concluirMovimento(
  base: BaseDados,
  autor: Usuario,
  movimentoId: ID,
  conclusao: ConclusaoMovimento,
  triagem?: DadosTriagem,
  instante: Instante = agoraFn(),
): ResultadoConclusao {
  const movimento = base.movimentos.find((m) => m.id === movimentoId);
  if (!movimento) throw new Error("Passo não encontrado.");
  if (movimento.estado === "CONCLUIDO") throw new Error("Este passo já foi concluído.");
  if (movimento.estado === "SUSPENSO") {
    throw new Error(
      "Este passo está suspenso por um impedimento. Resolva o impedimento antes de concluí-lo.",
    );
  }
  if (conclusao.relato.trim().length < 3) {
    throw new Error("Registre o que aconteceu neste passo.");
  }

  const demanda = acharDemanda(base, movimento.demandaId);

  // A triagem é o momento em que a demanda ganha direção: responsável, prazo,
  // custo estimado e fatores de prioridade revisados.
  if (movimento.tipo === "TRIAGEM" && triagem) {
    if (triagem.responsavelId) demanda.responsavelId = triagem.responsavelId;
    if (triagem.prazoDemanda) demanda.prazo = triagem.prazoDemanda;
    if (triagem.custoEstimado !== undefined) {
      demanda.custoEstimado = triagem.custoEstimado;
    }
    if (triagem.fatores) demanda.fatores = { ...demanda.fatores, ...triagem.fatores };
  }
  if (conclusao.custoEstimado !== undefined) {
    demanda.custoEstimado = conclusao.custoEstimado;
  }

  movimento.estado = "CONCLUIDO";
  movimento.concluidoEm = instante;
  movimento.concluidoPor = autor.id;
  movimento.relato = conclusao.relato.trim();
  marcarAvanco(demanda, instante);

  registrarEvento(base, {
    demandaId: demanda.id,
    tipo: movimento.tipo === "TRIAGEM" ? "TRIAGEM_REALIZADA" : "MOVIMENTO_CONCLUIDO",
    descricao: `${movimento.acao} — ${movimento.relato}`,
    autorId: autor.id,
    dados: {
      tipo: movimento.tipo,
      dentroDoPrazo: instante <= movimento.prazo,
      atrasoHoras:
        instante > movimento.prazo
          ? Math.round((instante - movimento.prazo) / (60 * 60 * 1000))
          : 0,
    },
    em: instante,
  });

  // Regra 3: concluir uma ação provoca a análise do próximo movimento.
  const ctx = contextoDemanda(base, demanda.id);
  const decisao = sugerirProximoMovimento(ctx, movimento, conclusao);

  let criado: Movimento | undefined;
  if (decisao.sugestao) {
    const sugestao = decisao.sugestao;
    criado = criarMovimento(
      base,
      demanda,
      {
        tipo: sugestao.tipo,
        acao: sugestao.acao,
        resultadoEsperado: sugestao.resultadoEsperado,
        prazo: prazoDe(sugestao, instante),
        responsavelId: sugestao.responsavelId ?? demanda.responsavelId,
        origem: "AUTOMATICO",
        motivo: sugestao.motivo,
      },
      undefined,
      instante,
    );

    // Aprovação é um movimento com decisão registrada à parte.
    if (sugestao.tipo === "APROVACAO") {
      abrirAprovacao(base, demanda, criado, instante);
    }
  }

  atualizarEstado(base, demanda.id);
  reconciliarSinais(base, instante);

  return { movimento, decisao, criado };
}

function abrirAprovacao(
  base: BaseDados,
  demanda: Demanda,
  movimento: Movimento,
  instante: Instante,
): void {
  const aprovador =
    movimento.responsavelId && ehLideranca(base, movimento.responsavelId)
      ? movimento.responsavelId
      : base.usuarios.find((u) => u.papel === "LIDERANCA" && u.ativo)?.id;
  if (!aprovador) {
    throw new Error("Não há liderança cadastrada para decidir a aprovação.");
  }
  movimento.responsavelId = aprovador;

  base.aprovacoes.push({
    id: novoId(),
    demandaId: demanda.id,
    movimentoId: movimento.id,
    descricao: movimento.acao,
    valor: demanda.custoEstimado,
    aprovadorId: aprovador,
    estado: "PENDENTE",
    solicitadoEm: instante,
  });

  registrarEvento(base, {
    demandaId: demanda.id,
    tipo: "APROVACAO_SOLICITADA",
    descricao: `${movimento.acao} — aguardando decisão`,
    dados: { valor: demanda.custoEstimado ?? 0, aprovadorId: aprovador },
    em: instante,
  });
}

function ehLideranca(base: BaseDados, id: ID): boolean {
  return base.usuarios.find((u) => u.id === id)?.papel === "LIDERANCA";
}

/**
 * Sincroniza o estado da demanda com o que realmente existe (movimentos,
 * impedimentos, aprovações). O estado é sempre derivado, nunca digitado.
 */
export function atualizarEstado(base: BaseDados, demandaId: ID): void {
  const ctx = contextoDemanda(base, demandaId);
  if (ctx.demanda.estado === "CONCLUIDA" || ctx.demanda.estado === "CANCELADA") return;
  ctx.demanda.estado = estadoDerivado(ctx);
}

/** Repactuação de prazo — sempre registrada. */
export function alterarPrazoMovimento(
  base: BaseDados,
  autor: Usuario,
  movimentoId: ID,
  novoPrazo: Instante,
  motivo: string,
  instante: Instante = agoraFn(),
): void {
  const movimento = base.movimentos.find((m) => m.id === movimentoId);
  if (!movimento) throw new Error("Passo não encontrado.");
  if (motivo.trim().length < 5) {
    throw new Error("Explique por que o prazo está sendo alterado.");
  }
  const anterior = movimento.prazo;
  movimento.prazo = novoPrazo;
  registrarEvento(base, {
    demandaId: movimento.demandaId,
    tipo: "PRAZO_ALTERADO",
    descricao: `Prazo de "${movimento.acao}" alterado: ${motivo.trim()}`,
    autorId: autor.id,
    dados: { de: anterior, para: novoPrazo },
    em: instante,
  });
  reconciliarSinais(base, instante);
}

/** Criação manual de próximo passo (usada quando o sistema não decide sozinho). */
export function definirProximoMovimento(
  base: BaseDados,
  autor: Usuario,
  demandaId: ID,
  entrada: Omit<EntradaMovimento, "origem"> & { origem?: OrigemMovimento },
  instante: Instante = agoraFn(),
): Movimento {
  const demanda = acharDemanda(base, demandaId);
  const movimento = criarMovimento(
    base,
    demanda,
    { ...entrada, origem: entrada.origem ?? "MANUAL" },
    autor,
    instante,
  );
  marcarAvanco(demanda, instante);
  atualizarEstado(base, demandaId);
  reconciliarSinais(base, instante);
  return movimento;
}
