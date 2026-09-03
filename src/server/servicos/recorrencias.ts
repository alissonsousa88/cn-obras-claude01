/**
 * SERVIÇO DE RECORRÊNCIAS
 *
 * Manutenção preventiva não pode depender da memória de ninguém.
 *
 * Regra: quando a ocorrência gerada por uma recorrência é concluída, a próxima
 * é automaticamente programada. E, quando a data chega, o sistema abre a
 * demanda sozinho (ver `tick.ts`) — o usuário não precisa lembrar de nada.
 */
import { DIA } from "@/domain/regras";
import type { ID, Instante, Recorrencia, Usuario } from "@/domain/tipos";
import type { BaseDados } from "../store/port";
import { agora as agoraFn, novoId, registrarEvento } from "./comum";
import { abrirDemanda } from "./demandas";
import { reconciliarSinais } from "./sinais";

export interface EntradaRecorrencia {
  titulo: string;
  descricao: string;
  categoriaId: ID;
  localId: ID;
  responsavelPadraoId?: ID;
  intervaloDias: number;
  avisarAntesDias?: number;
  primeiraExecucao: Instante;
}

export function criarRecorrencia(
  base: BaseDados,
  autor: Usuario,
  entrada: EntradaRecorrencia,
  instante: Instante = agoraFn(),
): Recorrencia {
  if (entrada.intervaloDias < 1) {
    throw new Error("O intervalo precisa ser de pelo menos 1 dia.");
  }
  const recorrencia: Recorrencia = {
    id: novoId(),
    titulo: entrada.titulo.trim(),
    descricao: entrada.descricao.trim(),
    categoriaId: entrada.categoriaId,
    localId: entrada.localId,
    responsavelPadraoId: entrada.responsavelPadraoId,
    intervaloDias: entrada.intervaloDias,
    avisarAntesDias: entrada.avisarAntesDias ?? Math.min(7, entrada.intervaloDias),
    proximaExecucao: entrada.primeiraExecucao,
    ativo: true,
    criadoEm: instante,
  };
  base.recorrencias.push(recorrencia);
  registrarEvento(base, {
    tipo: "RECORRENCIA_GERADA",
    descricao: `Rotina criada: ${recorrencia.titulo} a cada ${recorrencia.intervaloDias} dias`,
    autorId: autor.id,
    dados: { recorrenciaId: recorrencia.id },
    em: instante,
  });
  reconciliarSinais(base, instante);
  return recorrencia;
}

/**
 * Gera a ocorrência (uma demanda real) de uma recorrência vencida e reprograma
 * a próxima. Chamado pelo tick e pela ação manual "executar agora".
 */
export function gerarOcorrencia(
  base: BaseDados,
  autor: Usuario,
  recorrenciaId: ID,
  instante: Instante = agoraFn(),
): ID {
  const rec = base.recorrencias.find((r) => r.id === recorrenciaId);
  if (!rec) throw new Error("Rotina não encontrada.");

  const demanda = abrirDemanda(
    base,
    autor,
    {
      titulo: rec.titulo,
      descricao: rec.descricao,
      localId: rec.localId,
      categoriaId: rec.categoriaId,
      recorrenciaId: rec.id,
      responsavelId: rec.responsavelPadraoId,
      solicitanteId: rec.responsavelPadraoId ?? autor.id,
    },
    instante,
  );

  rec.ultimaExecucao = instante;
  // Ancora no que estava previsto, não no dia em que rodou: uma execução
  // atrasada não empurra todo o calendário para frente.
  const base_ = Math.max(rec.proximaExecucao, instante - rec.intervaloDias * DIA);
  rec.proximaExecucao = base_ + rec.intervaloDias * DIA;

  registrarEvento(base, {
    demandaId: demanda.id,
    tipo: "RECORRENCIA_GERADA",
    descricao: `${rec.titulo}: ocorrência aberta automaticamente. Próxima em ${new Date(
      rec.proximaExecucao,
    ).toLocaleDateString("pt-BR")}`,
    dados: { recorrenciaId: rec.id, proximaExecucao: rec.proximaExecucao },
    em: instante,
  });

  reconciliarSinais(base, instante);
  return demanda.id;
}

export function alternarRecorrencia(
  base: BaseDados,
  autor: Usuario,
  recorrenciaId: ID,
  ativo: boolean,
  instante: Instante = agoraFn(),
): void {
  const rec = base.recorrencias.find((r) => r.id === recorrenciaId);
  if (!rec) throw new Error("Rotina não encontrada.");
  rec.ativo = ativo;
  registrarEvento(base, {
    tipo: "RECORRENCIA_GERADA",
    descricao: `${rec.titulo} ${ativo ? "reativada" : "pausada"} por ${autor.nome}`,
    autorId: autor.id,
    dados: { recorrenciaId: rec.id, ativo },
    em: instante,
  });
  reconciliarSinais(base, instante);
}
