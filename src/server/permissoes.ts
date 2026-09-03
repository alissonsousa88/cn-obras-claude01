/**
 * PERMISSÕES POR CAPACIDADE
 *
 * O código nunca pergunta "é liderança?" espalhado por aí; pergunta "pode
 * aprovar?". Assim, incluir um novo papel (ex.: "FORNECEDOR", "PASTOR") é
 * acrescentar uma linha nesta tabela.
 */
import type { Demanda, Papel, Usuario } from "@/domain/tipos";

export type Capacidade =
  | "abrir_demanda"
  | "ver_toda_operacao"
  | "triar"
  | "executar"
  | "registrar_impedimento"
  | "resolver_impedimento"
  | "atribuir_responsavel"
  | "ajustar_prioridade"
  | "aprovar"
  | "concluir_demanda"
  | "gerenciar_recorrencias"
  | "ver_metricas";

const MATRIZ: Record<Papel, Capacidade[]> = {
  SOLICITANTE: ["abrir_demanda"],
  OPERACAO: [
    "abrir_demanda",
    "ver_toda_operacao",
    "triar",
    "executar",
    "registrar_impedimento",
    "resolver_impedimento",
    "concluir_demanda",
    "gerenciar_recorrencias",
  ],
  LIDERANCA: [
    "abrir_demanda",
    "ver_toda_operacao",
    "triar",
    "executar",
    "registrar_impedimento",
    "resolver_impedimento",
    "atribuir_responsavel",
    "ajustar_prioridade",
    "aprovar",
    "concluir_demanda",
    "gerenciar_recorrencias",
    "ver_metricas",
  ],
};

export function pode(usuario: Usuario, capacidade: Capacidade): boolean {
  return MATRIZ[usuario.papel].includes(capacidade);
}

export function exigir(usuario: Usuario, capacidade: Capacidade): void {
  if (!pode(usuario, capacidade)) {
    throw new Error(`Seu perfil não permite esta ação (${capacidade}).`);
  }
}

/** Solicitante só enxerga as próprias demandas. */
export function podeVerDemanda(usuario: Usuario, demanda: Demanda): boolean {
  if (pode(usuario, "ver_toda_operacao")) return true;
  return demanda.solicitanteId === usuario.id;
}
