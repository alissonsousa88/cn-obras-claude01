/**
 * SERVIÇO DE DEMANDAS
 *
 * Orquestra os motores e aplica as regras invioláveis do domínio em cada
 * transação. Nenhuma escrita de demanda passa por fora daqui.
 */
import {
  contextoDemanda as ctxFluxo,
  movimentoDeTriagem,
  podeConcluir,
  prazoDe,
} from "@/domain/motorFluxo";
import {
  calcularPrioridade,
  prioridadeCalculada,
  reconciliarPrioridade,
} from "@/domain/motorPrioridade";
import { contarReincidencias } from "@/domain/analiseHistorico";
import { DIA } from "@/domain/regras";
import type {
  Demanda,
  FatoresPrioridade,
  ID,
  Instante,
  NivelPrioridade,
  ResultadoDemanda,
  Usuario,
} from "@/domain/tipos";
import type { BaseDados } from "../store/port";
import {
  acharCategoria,
  acharDemanda,
  agora as agoraFn,
  contextoDemanda,
  marcarAvanco,
  novoId,
  proximoCodigo,
  registrarEvento,
} from "./comum";
import { criarMovimento } from "./movimentos";
import { reconciliarSinais } from "./sinais";

export interface EntradaNovaDemanda {
  titulo: string;
  descricao: string;
  localId: ID;
  categoriaId: ID;
  /** Fatores opcionais. O cadastro inicial é deliberadamente curto. */
  fatores?: Partial<FatoresPrioridade>;
  /** Quando a demanda nasce de uma recorrência. */
  recorrenciaId?: ID;
  /** Responsável já conhecido (recorrências trazem o responsável padrão). */
  responsavelId?: ID;
  solicitanteId?: ID;
}

/**
 * Abertura de demanda.
 *
 * Regras aplicadas aqui:
 *  - prioridade é CALCULADA, nunca digitada;
 *  - a demanda nasce com um movimento de triagem de 24h (nunca sem direção);
 *  - o evento de criação entra no histórico.
 */
export function abrirDemanda(
  base: BaseDados,
  autor: Usuario,
  entrada: EntradaNovaDemanda,
  instante: Instante = agoraFn(),
): Demanda {
  const titulo = entrada.titulo.trim();
  if (titulo.length < 4) {
    throw new Error("Descreva a demanda em pelo menos 4 caracteres.");
  }
  const categoria = acharCategoria(base, entrada.categoriaId);
  const local = base.locais.find((l) => l.id === entrada.localId);
  if (!local) throw new Error("Local não encontrado.");

  const fatores: FatoresPrioridade = {
    risco: entrada.fatores?.risco ?? false,
    operacaoComprometida: entrada.fatores?.operacaoComprometida ?? false,
    seguranca: entrada.fatores?.seguranca ?? false,
    pessoasAfetadas: entrada.fatores?.pessoasAfetadas ?? 0,
    eventoProximoEm: entrada.fatores?.eventoProximoEm,
  };

  const demandaParcial = {
    id: novoId(),
    localId: entrada.localId,
    categoriaId: entrada.categoriaId,
    criadoEm: instante,
  };
  const reincidencias = contarReincidencias(
    demandaParcial as Demanda,
    base.demandas,
    instante,
  );

  const calculo = calcularPrioridade({
    fatores,
    categoria,
    local,
    abertaEm: instante,
    agora: instante,
    reincidencias,
  });

  const demanda: Demanda = {
    id: demandaParcial.id,
    codigo: proximoCodigo(base, instante),
    titulo,
    descricao: entrada.descricao.trim(),
    localId: entrada.localId,
    categoriaId: entrada.categoriaId,
    solicitanteId: entrada.solicitanteId ?? autor.id,
    responsavelId: entrada.responsavelId,
    estado: "NOVA",
    prioridade: prioridadeCalculada(calculo, instante),
    fatores,
    criadoEm: instante,
    ultimoAvancoEm: instante,
    recorrenciaId: entrada.recorrenciaId,
    reaberturas: 0,
  };
  base.demandas.push(demanda);

  registrarEvento(base, {
    demandaId: demanda.id,
    tipo: "DEMANDA_CRIADA",
    descricao: `${demanda.codigo} aberta: ${demanda.titulo}`,
    autorId: autor.id,
    dados: {
      prioridade: demanda.prioridade.nivel,
      score: demanda.prioridade.score,
      justificativa: demanda.prioridade.justificativa,
      reincidencias,
    },
    em: instante,
  });

  // Invariante 1 e 2: nenhuma demanda entra sem próximo movimento.
  const triador = entrada.responsavelId ?? sugerirTriador(base, categoria.slug);
  const sugestao = movimentoDeTriagem(demanda, triador, instante);
  criarMovimento(
    base,
    demanda,
    {
      tipo: sugestao.tipo,
      acao: sugestao.acao,
      resultadoEsperado: sugestao.resultadoEsperado,
      prazo: prazoDe(sugestao, instante),
      responsavelId: sugestao.responsavelId,
      origem: "AUTOMATICO",
      motivo: sugestao.motivo,
    },
    undefined,
    instante,
  );
  demanda.estado = "EM_TRIAGEM";

  reconciliarSinais(base, instante);
  return demanda;
}

/** Escolhe quem triará: alguém da operação com a especialidade da categoria. */
function sugerirTriador(base: BaseDados, slug: string): ID | undefined {
  const candidatos = base.usuarios.filter(
    (u) => u.ativo && (u.papel === "OPERACAO" || u.papel === "LIDERANCA"),
  );
  const especialista = candidatos.find((u) =>
    u.especialidades.includes(slug as never),
  );
  return (especialista ?? candidatos.find((u) => u.papel === "OPERACAO") ?? candidatos[0])
    ?.id;
}

// ---------------------------------------------------------------------------
// Responsável e prioridade
// ---------------------------------------------------------------------------

export function atribuirResponsavel(
  base: BaseDados,
  autor: Usuario,
  demandaId: ID,
  responsavelId: ID | undefined,
  instante: Instante = agoraFn(),
): void {
  const demanda = acharDemanda(base, demandaId);
  const anterior = demanda.responsavelId;
  if (anterior === responsavelId) return;
  const novo = responsavelId
    ? base.usuarios.find((u) => u.id === responsavelId)
    : undefined;
  if (responsavelId && !novo) throw new Error("Responsável não encontrado.");

  demanda.responsavelId = responsavelId;

  // Movimentos pendentes sem dono passam a ter dono: o próximo passo nunca
  // pode ficar órfão depois que a demanda ganhou responsável.
  for (const m of base.movimentos) {
    if (m.demandaId !== demandaId) continue;
    if (m.estado !== "PENDENTE") continue;
    if (!m.responsavelId) m.responsavelId = responsavelId;
  }

  registrarEvento(base, {
    demandaId,
    tipo: "RESPONSAVEL_ALTERADO",
    descricao: novo
      ? `Responsável passou a ser ${novo.nome}`
      : "Responsável removido",
    autorId: autor.id,
    dados: { de: anterior ?? null, para: responsavelId ?? null },
    em: instante,
  });
  reconciliarSinais(base, instante);
}

/**
 * Ajuste manual de prioridade.
 *
 * Regra: alteração significativa exige justificativa e fica no histórico —
 * a decisão humana é preservada, mas nunca fica sem rastro.
 */
export function ajustarPrioridade(
  base: BaseDados,
  autor: Usuario,
  demandaId: ID,
  nivel: NivelPrioridade,
  justificativa: string,
  instante: Instante = agoraFn(),
): void {
  const demanda = acharDemanda(base, demandaId);
  if (justificativa.trim().length < 5) {
    throw new Error(
      "Explique o motivo do ajuste de prioridade: essa decisão fica no histórico.",
    );
  }
  const anterior = demanda.prioridade;
  demanda.prioridade = {
    nivel,
    score: anterior.score,
    origem: "AJUSTE_MANUAL",
    justificativa: justificativa.trim(),
    definidoEm: instante,
    definidoPor: autor.id,
  };
  registrarEvento(base, {
    demandaId,
    tipo: "PRIORIDADE_ALTERADA",
    descricao: `Prioridade alterada de ${anterior.nivel} para ${nivel} por ${autor.nome}`,
    autorId: autor.id,
    dados: {
      de: anterior.nivel,
      para: nivel,
      justificativa: justificativa.trim(),
      scoreCalculado: anterior.score,
    },
    em: instante,
  });
  reconciliarSinais(base, instante);
}

/**
 * Recalcula prioridades de todas as demandas ativas (espera e reincidência
 * mudam com o tempo). Ajustes manuais são preservados.
 */
export function recalcularPrioridades(base: BaseDados, instante: Instante): number {
  let alteradas = 0;
  for (const demanda of base.demandas) {
    if (demanda.estado === "CONCLUIDA" || demanda.estado === "CANCELADA") continue;
    const categoria = base.categorias.find((c) => c.id === demanda.categoriaId);
    const local = base.locais.find((l) => l.id === demanda.localId);
    if (!categoria || !local) continue;
    const calculo = calcularPrioridade({
      fatores: demanda.fatores,
      categoria,
      local,
      abertaEm: demanda.criadoEm,
      agora: instante,
      reincidencias: contarReincidencias(demanda, base.demandas, instante),
    });
    const nova = reconciliarPrioridade(demanda, calculo, instante);
    if (nova.nivel !== demanda.prioridade.nivel) {
      registrarEvento(base, {
        demandaId: demanda.id,
        tipo: "PRIORIDADE_ALTERADA",
        descricao: `Prioridade recalculada de ${demanda.prioridade.nivel} para ${nova.nivel}: ${calculo.justificativa}`,
        dados: { de: demanda.prioridade.nivel, para: nova.nivel, score: calculo.score },
        em: instante,
      });
      alteradas += 1;
    }
    demanda.prioridade = nova;
  }
  return alteradas;
}

// ---------------------------------------------------------------------------
// Conclusão orientada a resultado
// ---------------------------------------------------------------------------

export interface EntradaConclusao {
  oQueFoiFeito: string;
  problemaResolvido: boolean;
  resultadoObtido: string;
  observacoesFinais?: string;
  anexoIds?: ID[];
}

/**
 * Regra: não basta mudar o status. Concluir exige resultado registrado e
 * ausência de pendências. Se o problema NÃO foi resolvido, o sistema recusa a
 * conclusão e devolve a demanda ao fluxo — atividade executada não é resultado
 * alcançado.
 */
export function concluirDemanda(
  base: BaseDados,
  autor: Usuario,
  demandaId: ID,
  entrada: EntradaConclusao,
  instante: Instante = agoraFn(),
): void {
  const ctx = contextoDemanda(base, demandaId);
  const checagem = podeConcluir(ctx);
  if (!checagem.pode) {
    throw new Error(checagem.pendencias.join(" • "));
  }
  if (entrada.oQueFoiFeito.trim().length < 5) {
    throw new Error("Descreva o que foi realizado.");
  }
  if (entrada.resultadoObtido.trim().length < 5) {
    throw new Error("Descreva o resultado obtido.");
  }
  if (!entrada.problemaResolvido) {
    throw new Error(
      "Se o problema não foi resolvido, a demanda não pode ser concluída. Registre um novo passo ou um impedimento.",
    );
  }

  const demanda = ctx.demanda;
  const resultado: ResultadoDemanda = {
    oQueFoiFeito: entrada.oQueFoiFeito.trim(),
    problemaResolvido: entrada.problemaResolvido,
    resultadoObtido: entrada.resultadoObtido.trim(),
    observacoesFinais: entrada.observacoesFinais?.trim() || undefined,
    registradoPor: autor.id,
    registradoEm: instante,
    anexoIds: entrada.anexoIds ?? [],
  };
  demanda.resultado = resultado;
  demanda.estado = "CONCLUIDA";
  demanda.concluidoEm = instante;
  marcarAvanco(demanda, instante);

  // Cancela movimentos de validação remanescentes (o resultado já foi validado).
  for (const m of base.movimentos) {
    if (m.demandaId !== demandaId) continue;
    if (m.estado === "PENDENTE" || m.estado === "SUSPENSO") {
      m.estado = "CANCELADO";
      registrarEvento(base, {
        demandaId,
        tipo: "MOVIMENTO_CANCELADO",
        descricao: `"${m.acao}" encerrado com a conclusão da demanda`,
        autorId: autor.id,
        em: instante,
      });
    }
  }

  // Regra 9: concluir uma ocorrência recorrente programa a próxima.
  reprogramarRecorrencia(base, demanda, instante);

  registrarEvento(base, {
    demandaId,
    tipo: "DEMANDA_CONCLUIDA",
    descricao: `Concluída: ${resultado.resultadoObtido}`,
    autorId: autor.id,
    dados: {
      oQueFoiFeito: resultado.oQueFoiFeito,
      problemaResolvido: true,
      duracaoHoras: Math.round((instante - demanda.criadoEm) / (60 * 60 * 1000)),
      dentroDoPrazo: demanda.prazo ? instante <= demanda.prazo : null,
    },
    em: instante,
  });

  reconciliarSinais(base, instante);
}

/**
 * Regra 9: a conclusão de uma demanda recorrente programa a próxima ocorrência.
 * Vive aqui (e não no serviço de recorrências) para manter a dependência em uma
 * única direção: recorrências abrem demandas, demandas não importam recorrências.
 */
function reprogramarRecorrencia(
  base: BaseDados,
  demanda: Demanda,
  instante: Instante,
): void {
  if (!demanda.recorrenciaId) return;
  const rec = base.recorrencias.find((r) => r.id === demanda.recorrenciaId);
  if (!rec || !rec.ativo) return;

  rec.ultimaExecucao = instante;
  rec.proximaExecucao = instante + rec.intervaloDias * DIA;

  registrarEvento(base, {
    demandaId: demanda.id,
    tipo: "RECORRENCIA_GERADA",
    descricao: `${rec.titulo} concluída. Próxima execução programada para ${new Date(
      rec.proximaExecucao,
    ).toLocaleDateString("pt-BR")}`,
    dados: { recorrenciaId: rec.id, proximaExecucao: rec.proximaExecucao },
    em: instante,
  });
}

/** Reabertura: o problema voltou. Volta ao fluxo com diagnóstico. */
export function reabrirDemanda(
  base: BaseDados,
  autor: Usuario,
  demandaId: ID,
  motivo: string,
  instante: Instante = agoraFn(),
): void {
  const demanda = acharDemanda(base, demandaId);
  if (demanda.estado !== "CONCLUIDA") {
    throw new Error("Só é possível reabrir uma demanda concluída.");
  }
  if (motivo.trim().length < 5) throw new Error("Explique por que está reabrindo.");

  demanda.estado = "EM_DIAGNOSTICO";
  demanda.concluidoEm = undefined;
  demanda.reaberturas += 1;
  marcarAvanco(demanda, instante);

  registrarEvento(base, {
    demandaId,
    tipo: "DEMANDA_REABERTA",
    descricao: `Reaberta: ${motivo.trim()}`,
    autorId: autor.id,
    dados: { reaberturas: demanda.reaberturas },
    em: instante,
  });

  criarMovimento(
    base,
    demanda,
    {
      tipo: "DIAGNOSTICO",
      acao: `Reavaliar: ${demanda.titulo}`,
      resultadoEsperado: "Nova causa identificada e solução proposta",
      prazo: instante + 48 * 60 * 60 * 1000,
      responsavelId: demanda.responsavelId,
      origem: "AUTOMATICO",
      motivo: "A demanda foi reaberta e precisa de nova avaliação",
    },
    autor,
    instante,
  );

  reconciliarSinais(base, instante);
}

export function cancelarDemanda(
  base: BaseDados,
  autor: Usuario,
  demandaId: ID,
  motivo: string,
  instante: Instante = agoraFn(),
): void {
  const demanda = acharDemanda(base, demandaId);
  if (motivo.trim().length < 5) throw new Error("Explique o motivo do cancelamento.");
  demanda.estado = "CANCELADA";
  for (const m of base.movimentos) {
    if (m.demandaId === demandaId && (m.estado === "PENDENTE" || m.estado === "SUSPENSO")) {
      m.estado = "CANCELADO";
    }
  }
  registrarEvento(base, {
    demandaId,
    tipo: "DEMANDA_CANCELADA",
    descricao: `Cancelada: ${motivo.trim()}`,
    autorId: autor.id,
    em: instante,
  });
  reconciliarSinais(base, instante);
}

export { ctxFluxo };
