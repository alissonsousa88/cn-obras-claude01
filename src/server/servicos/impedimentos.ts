/**
 * SERVIÇO DE IMPEDIMENTOS
 *
 * Distingue as duas situações que os sistemas genéricos confundem:
 *
 *   "ninguém está trabalhando nisso"  ≠  "não conseguimos avançar porque
 *                                         existe um impedimento identificado"
 *
 * Regras aplicadas:
 *   - todo impedimento tem responsável pelo desbloqueio e data de revisão;
 *   - registrar impedimento SUSPENDE os passos que dependem dele;
 *   - resolver o impedimento RETOMA exatamente esses passos;
 *   - o desbloqueio vira, ele mesmo, um próximo movimento com dono e prazo.
 */
import { HORA } from "@/domain/regras";
import { ROTULO_IMPEDIMENTO } from "@/domain/rotulos";
import type {
  ID,
  Impedimento,
  Instante,
  TipoImpedimento,
  Usuario,
} from "@/domain/tipos";
import type { BaseDados } from "../store/port";
import {
  acharDemanda,
  agora as agoraFn,
  novoId,
  registrarEvento,
} from "./comum";
import { atualizarEstado, criarMovimento } from "./movimentos";
import { reconciliarSinais } from "./sinais";

/** Passos que não fazem sentido enquanto o impedimento existe. */
const SUSPENDIVEIS = new Set(["EXECUCAO", "VALIDACAO", "ORCAMENTO", "DIAGNOSTICO"]);

export interface EntradaImpedimento {
  tipo: TipoImpedimento;
  descricao: string;
  responsavelDesbloqueioId: ID;
  dataRevisao: Instante;
}

export function registrarImpedimento(
  base: BaseDados,
  autor: Usuario,
  demandaId: ID,
  entrada: EntradaImpedimento,
  instante: Instante = agoraFn(),
): Impedimento {
  const demanda = acharDemanda(base, demandaId);
  if (entrada.descricao.trim().length < 5) {
    throw new Error("Descreva o que está impedindo o avanço.");
  }
  // Invariante: impedimento sem responsável pelo desbloqueio é um beco sem saída.
  const responsavel = base.usuarios.find(
    (u) => u.id === entrada.responsavelDesbloqueioId && u.ativo,
  );
  if (!responsavel) {
    throw new Error("Indique quem é responsável por desbloquear esta demanda.");
  }
  if (entrada.dataRevisao <= instante) {
    throw new Error("A data de revisão precisa ser no futuro.");
  }

  const impedimento: Impedimento = {
    id: novoId(),
    demandaId,
    tipo: entrada.tipo,
    descricao: entrada.descricao.trim(),
    responsavelDesbloqueioId: entrada.responsavelDesbloqueioId,
    dataInicio: instante,
    dataRevisao: entrada.dataRevisao,
    estado: "ATIVO",
    movimentosSuspensos: [],
  };

  // Suspende os passos dependentes, guardando quais foram — para retomar depois.
  for (const m of base.movimentos) {
    if (m.demandaId !== demandaId) continue;
    if (m.estado !== "PENDENTE") continue;
    if (!SUSPENDIVEIS.has(m.tipo)) continue;
    m.estado = "SUSPENSO";
    m.suspensoPor = impedimento.id;
    impedimento.movimentosSuspensos.push(m.id);
    registrarEvento(base, {
      demandaId,
      tipo: "MOVIMENTO_SUSPENSO",
      descricao: `"${m.acao}" suspenso: ${impedimento.descricao}`,
      autorId: autor.id,
      em: instante,
    });
  }

  base.impedimentos.push(impedimento);

  registrarEvento(base, {
    demandaId,
    tipo: "IMPEDIMENTO_REGISTRADO",
    descricao: `${ROTULO_IMPEDIMENTO[impedimento.tipo]}: ${impedimento.descricao} — ${responsavel.nome} precisa destravar`,
    autorId: autor.id,
    dados: {
      tipo: impedimento.tipo,
      responsavelDesbloqueioId: impedimento.responsavelDesbloqueioId,
      dataRevisao: impedimento.dataRevisao,
      movimentosSuspensos: impedimento.movimentosSuspensos.length,
    },
    em: instante,
  });

  // O desbloqueio vira trabalho visível, com dono e prazo — não uma espera vaga.
  criarMovimento(
    base,
    demanda,
    {
      tipo: "DESBLOQUEIO",
      acao: `Destravar: ${impedimento.descricao}`,
      resultadoEsperado: "Impedimento resolvido e execução retomada",
      prazo: entrada.dataRevisao,
      responsavelId: entrada.responsavelDesbloqueioId,
      origem: "AUTOMATICO",
      motivo: "Todo impedimento precisa de alguém responsável por removê-lo",
    },
    undefined,
    instante,
  );

  atualizarEstado(base, demandaId);
  reconciliarSinais(base, instante);
  return impedimento;
}

export function resolverImpedimento(
  base: BaseDados,
  autor: Usuario,
  impedimentoId: ID,
  resolucao: string,
  instante: Instante = agoraFn(),
): void {
  const impedimento = base.impedimentos.find((i) => i.id === impedimentoId);
  if (!impedimento) throw new Error("Impedimento não encontrado.");
  if (impedimento.estado === "RESOLVIDO") {
    throw new Error("Este impedimento já foi resolvido.");
  }
  if (resolucao.trim().length < 5) {
    throw new Error("Descreva como o impedimento foi resolvido.");
  }

  impedimento.estado = "RESOLVIDO";
  impedimento.resolucao = resolucao.trim();
  impedimento.resolvidoEm = instante;
  impedimento.resolvidoPor = autor.id;

  const demanda = acharDemanda(base, impedimento.demandaId);
  demanda.ultimoAvancoEm = instante;

  // Retoma exatamente os passos que este impedimento suspendeu. Prazos que já
  // venceram durante o bloqueio ganham uma folga proporcional — cobrar atraso
  // de quem estava travado é ruído, não sinal.
  const duracao = instante - impedimento.dataInicio;
  for (const id of impedimento.movimentosSuspensos) {
    const m = base.movimentos.find((x) => x.id === id);
    if (!m || m.estado !== "SUSPENSO") continue;
    m.estado = "PENDENTE";
    m.suspensoPor = undefined;
    m.prazo = Math.max(m.prazo + duracao, instante + 4 * HORA);
    registrarEvento(base, {
      demandaId: impedimento.demandaId,
      tipo: "MOVIMENTO_RETOMADO",
      descricao: `"${m.acao}" retomado após o desbloqueio`,
      autorId: autor.id,
      dados: { novoPrazo: m.prazo },
      em: instante,
    });
  }

  // Fecha o movimento de desbloqueio correspondente.
  for (const m of base.movimentos) {
    if (m.demandaId !== impedimento.demandaId) continue;
    if (m.tipo !== "DESBLOQUEIO" || m.estado !== "PENDENTE") continue;
    m.estado = "CONCLUIDO";
    m.concluidoEm = instante;
    m.concluidoPor = autor.id;
    m.relato = impedimento.resolucao;
  }

  registrarEvento(base, {
    demandaId: impedimento.demandaId,
    tipo: "IMPEDIMENTO_RESOLVIDO",
    descricao: `Desbloqueado: ${impedimento.resolucao}`,
    autorId: autor.id,
    dados: {
      diasBloqueada: Math.round(duracao / (24 * HORA)),
      tipo: impedimento.tipo,
    },
    em: instante,
  });

  atualizarEstado(base, impedimento.demandaId);
  reconciliarSinais(base, instante);
}
