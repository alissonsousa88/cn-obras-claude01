/**
 * RECONCILIADOR DE SINAIS
 *
 * O Motor de Sinais é puro: diz quais sinais *deveriam* existir agora.
 * Este reconciliador confronta esse conjunto com o que está persistido:
 *
 *   - sinal desejado que não existe        -> abre (evento SINAL_ABERTO)
 *   - sinal ativo que deixou de ser desejado -> resolve (evento SINAL_RESOLVIDO)
 *   - sinal que continua valendo           -> atualiza nível/mensagem, preserva criadoEm
 *
 * É isso que sustenta a regra: "sinais resolvidos não devem continuar
 * aparecendo como ativos" — e também impede o acúmulo de ruído.
 */
import { avaliarSinais } from "@/domain/motorSinais";
import type { Instante, Sinal } from "@/domain/tipos";
import type { BaseDados } from "../store/port";
import { novoId, registrarEvento, snapshotDe } from "./comum";

export interface ResultadoReconciliacao {
  abertos: number;
  resolvidos: number;
  atualizados: number;
}

export function reconciliarSinais(
  base: BaseDados,
  instante: Instante,
): ResultadoReconciliacao {
  const desejados = avaliarSinais(snapshotDe(base, instante));
  const porChave = new Map(desejados.map((s) => [s.chave, s]));

  let abertos = 0;
  let resolvidos = 0;
  let atualizados = 0;

  // 1. Resolve o que não é mais desejado.
  for (const sinal of base.sinais) {
    if (sinal.estado !== "ATIVO") continue;
    if (porChave.has(sinal.chave)) continue;
    sinal.estado = "RESOLVIDO";
    sinal.resolvidoEm = instante;
    resolvidos += 1;
    registrarEvento(base, {
      demandaId: sinal.demandaId,
      tipo: "SINAL_RESOLVIDO",
      descricao: `Situação normalizada — ${sinal.assunto}: ${sinal.mensagem}`,
      dados: { tipoSinal: sinal.tipo, chave: sinal.chave },
      em: instante,
    });
  }

  // 2. Abre ou atualiza os desejados.
  const ativosPorChave = new Map(
    base.sinais.filter((s) => s.estado === "ATIVO").map((s) => [s.chave, s]),
  );
  for (const desejado of desejados) {
    const existente = ativosPorChave.get(desejado.chave);
    if (existente) {
      // Mantém criadoEm — a idade do sinal é informação operacional relevante.
      if (
        existente.nivel !== desejado.nivel ||
        existente.assunto !== desejado.assunto ||
        existente.mensagem !== desejado.mensagem ||
        existente.destinatarioId !== desejado.destinatarioId
      ) {
        existente.nivel = desejado.nivel;
        existente.assunto = desejado.assunto;
        existente.mensagem = desejado.mensagem;
        existente.destinatarioId = desejado.destinatarioId;
        existente.dados = desejado.dados;
        atualizados += 1;
      }
      continue;
    }
    const sinal: Sinal = {
      ...desejado,
      id: novoId(),
      estado: "ATIVO",
      criadoEm: instante,
    };
    base.sinais.push(sinal);
    abertos += 1;
    registrarEvento(base, {
      demandaId: sinal.demandaId,
      tipo: sinal.tipo === "REINCIDENCIA" ? "REINCIDENCIA_IDENTIFICADA" : "SINAL_ABERTO",
      descricao: `${sinal.assunto}: ${sinal.mensagem}`,
      dados: { tipoSinal: sinal.tipo, nivel: sinal.nivel, chave: sinal.chave },
      em: instante,
    });
  }

  return { abertos, resolvidos, atualizados };
}
