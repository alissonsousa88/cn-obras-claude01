/**
 * PORT DE PERSISTÊNCIA
 *
 * Toda a camada de serviços fala com esta interface — nunca com um banco
 * concreto. Os motores de domínio nem sequer a conhecem: recebem snapshots.
 *
 * Isso mantém o domínio portátil: trocar o adapter de arquivo por Convex,
 * Postgres ou qualquer outro store não exige tocar em uma linha de regra de
 * negócio (ver `convex/schema.ts` e `docs/PORTAR-PARA-CONVEX.md`).
 */
import type {
  Anexo,
  Aprovacao,
  Categoria,
  Comentario,
  Demanda,
  Evento,
  ID,
  Impedimento,
  Local,
  Movimento,
  Recorrencia,
  Sinal,
  Usuario,
} from "@/domain/tipos";

/** Formato completo da base. Cada coleção é uma tabela. */
export interface BaseDados {
  usuarios: Usuario[];
  categorias: Categoria[];
  locais: Local[];
  demandas: Demanda[];
  movimentos: Movimento[];
  impedimentos: Impedimento[];
  aprovacoes: Aprovacao[];
  recorrencias: Recorrencia[];
  sinais: Sinal[];
  eventos: Evento[];
  comentarios: Comentario[];
  anexos: Anexo[];
  /** Contador para gerar códigos legíveis (OB-2026-001). */
  sequenciaDemanda: number;
}

export type Colecao = Exclude<keyof BaseDados, "sequenciaDemanda">;

export interface ObrasStore {
  /** Leitura consistente de toda a base. */
  ler(): Promise<BaseDados>;
  /**
   * Executa uma transação: recebe a base, devolve a base modificada.
   * O adapter garante que escritas concorrentes sejam serializadas.
   */
  transacao<T>(fn: (base: BaseDados) => Promise<T> | T): Promise<T>;
  /** Recria a base a partir do seed. Usado apenas em desenvolvimento/demonstração. */
  redefinir(base: BaseDados): Promise<void>;
}

export function baseVazia(): BaseDados {
  return {
    usuarios: [],
    categorias: [],
    locais: [],
    demandas: [],
    movimentos: [],
    impedimentos: [],
    aprovacoes: [],
    recorrencias: [],
    sinais: [],
    eventos: [],
    comentarios: [],
    anexos: [],
    sequenciaDemanda: 0,
  };
}
