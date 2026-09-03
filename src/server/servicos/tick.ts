/**
 * TICK OPERACIONAL
 *
 * O sistema não espera alguém abrir uma tela para perceber que algo mudou.
 * Este tick roda antes de cada leitura (com throttle) e também pode ser
 * disparado por um agendador externo (cron da Vercel chamando /api/tick).
 *
 * Ele faz o que o tempo faz com a operação:
 *   - abre ocorrências de recorrências que venceram;
 *   - recalcula prioridades (espera e reincidência mudam sozinhas);
 *   - reconcilia sinais (abre os novos, resolve os que deixaram de valer).
 */
import type { Instante } from "@/domain/tipos";
import type { BaseDados } from "../store/port";
import { recalcularPrioridades } from "./demandas";
import { gerarOcorrencia } from "./recorrencias";
import { reconciliarSinais } from "./sinais";

export interface ResultadoTick {
  ocorrenciasAbertas: number;
  prioridadesAlteradas: number;
  sinaisAbertos: number;
  sinaisResolvidos: number;
}

export function executarTick(base: BaseDados, instante: Instante): ResultadoTick {
  // Recorrências vencidas viram demandas reais, com triagem e prazo.
  let ocorrenciasAbertas = 0;
  const sistema =
    base.usuarios.find((u) => u.papel === "LIDERANCA" && u.ativo) ?? base.usuarios[0];
  if (sistema) {
    for (const rec of base.recorrencias) {
      if (!rec.ativo || rec.proximaExecucao > instante) continue;
      // Não duplica: se já existe ocorrência ativa desta rotina, espera.
      const jaAberta = base.demandas.some(
        (d) =>
          d.recorrenciaId === rec.id &&
          d.estado !== "CONCLUIDA" &&
          d.estado !== "CANCELADA",
      );
      if (jaAberta) continue;
      gerarOcorrencia(base, sistema, rec.id, instante);
      ocorrenciasAbertas += 1;
    }
  }

  const prioridadesAlteradas = recalcularPrioridades(base, instante);
  const sinais = reconciliarSinais(base, instante);

  return {
    ocorrenciasAbertas,
    prioridadesAlteradas,
    sinaisAbertos: sinais.abertos,
    sinaisResolvidos: sinais.resolvidos,
  };
}
