/**
 * Utilidades compartilhadas pelos serviços: geração de ids, registro de eventos
 * (append-only) e montagem de snapshots para os motores.
 */
import { randomUUID } from "node:crypto";
import type {
  Categoria,
  Demanda,
  Evento,
  ID,
  Instante,
  SnapshotOperacional,
  TipoEvento,
} from "@/domain/tipos";
import type { BaseDados } from "../store/port";

export function novoId(): ID {
  return randomUUID();
}

export function agora(): Instante {
  return Date.now();
}

/**
 * Histórico é append-only. Não existe função de remoção de evento em lugar
 * nenhum do sistema — a regra "não excluir silenciosamente histórico
 * operacional" é sustentada pela ausência dessa operação.
 */
export function registrarEvento(
  base: BaseDados,
  evento: {
    demandaId?: ID;
    tipo: TipoEvento;
    descricao: string;
    autorId?: ID;
    dados?: Record<string, unknown>;
    em?: Instante;
  },
): Evento {
  const registro: Evento = {
    id: novoId(),
    demandaId: evento.demandaId,
    tipo: evento.tipo,
    descricao: evento.descricao,
    autorId: evento.autorId,
    criadoEm: evento.em ?? agora(),
    dados: evento.dados ?? {},
  };
  base.eventos.push(registro);
  return registro;
}

/** Marca que a demanda avançou de fato — insumo do sinal "demanda parada". */
export function marcarAvanco(demanda: Demanda, em: Instante): void {
  demanda.ultimoAvancoEm = em;
}

export function snapshotDe(base: BaseDados, instante: Instante): SnapshotOperacional {
  return {
    agora: instante,
    usuarios: base.usuarios,
    categorias: base.categorias,
    locais: base.locais,
    demandas: base.demandas,
    movimentos: base.movimentos,
    impedimentos: base.impedimentos,
    aprovacoes: base.aprovacoes,
    recorrencias: base.recorrencias,
    comentarios: base.comentarios,
    sinais: base.sinais,
  };
}

export function acharDemanda(base: BaseDados, id: ID): Demanda {
  const d = base.demandas.find((x) => x.id === id);
  if (!d) throw new Error("Demanda não encontrada.");
  return d;
}

export function acharCategoria(base: BaseDados, id: ID): Categoria {
  const c = base.categorias.find((x) => x.id === id);
  if (!c) throw new Error("Categoria não encontrada.");
  return c;
}

export function contextoDemanda(base: BaseDados, demandaId: ID) {
  const demanda = acharDemanda(base, demandaId);
  return {
    demanda,
    movimentos: base.movimentos.filter((m) => m.demandaId === demandaId),
    impedimentos: base.impedimentos.filter((i) => i.demandaId === demandaId),
    aprovacoes: base.aprovacoes.filter((a) => a.demandaId === demandaId),
    categoria: acharCategoria(base, demanda.categoriaId),
  };
}

export function proximoCodigo(base: BaseDados, instante: Instante): string {
  base.sequenciaDemanda += 1;
  const ano = new Date(instante).getFullYear();
  return `OB-${ano}-${String(base.sequenciaDemanda).padStart(3, "0")}`;
}
