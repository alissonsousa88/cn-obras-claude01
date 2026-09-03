/**
 * ANÁLISE DE HISTÓRICO
 *
 * Base do aprendizado operacional. Hoje alimenta o Motor de Prioridade
 * (reincidência) e o Motor de Sinais; amanhã responde perguntas como
 * "quais locais geram mais demandas" sem alteração estrutural.
 */
import { DIA, REGRAS } from "./regras";
import type { Demanda, ID, Instante, Movimento } from "./tipos";

export interface GrupoReincidencia {
  localId: ID;
  categoriaId: ID;
  ocorrencias: number;
  demandaIds: ID[];
  primeiraEm: Instante;
  ultimaEm: Instante;
}

/**
 * Reincidência = mesmo tipo de problema, mesmo local, dentro da janela.
 * Só conta se houver ao menos o mínimo de ocorrências configurado.
 */
export function detectarReincidencias(
  demandas: Demanda[],
  agora: Instante,
): GrupoReincidencia[] {
  const limite = agora - REGRAS.reincidencia.janelaDias * DIA;
  const grupos = new Map<string, GrupoReincidencia>();

  for (const d of demandas) {
    if (d.criadoEm < limite) continue;
    if (d.estado === "CANCELADA") continue;
    const chave = `${d.localId}::${d.categoriaId}`;
    const g = grupos.get(chave);
    if (g) {
      g.ocorrencias += 1;
      g.demandaIds.push(d.id);
      g.primeiraEm = Math.min(g.primeiraEm, d.criadoEm);
      g.ultimaEm = Math.max(g.ultimaEm, d.criadoEm);
    } else {
      grupos.set(chave, {
        localId: d.localId,
        categoriaId: d.categoriaId,
        ocorrencias: 1,
        demandaIds: [d.id],
        primeiraEm: d.criadoEm,
        ultimaEm: d.criadoEm,
      });
    }
  }

  return [...grupos.values()]
    .filter((g) => g.ocorrencias >= REGRAS.reincidencia.ocorrenciasMinimas)
    .sort((a, b) => b.ocorrencias - a.ocorrencias);
}

/** Quantas ocorrências semelhantes existem para uma demanda (excluindo ela). */
export function contarReincidencias(
  demanda: Demanda,
  demandas: Demanda[],
  agora: Instante,
): number {
  const limite = agora - REGRAS.reincidencia.janelaDias * DIA;
  return demandas.filter(
    (d) =>
      d.id !== demanda.id &&
      d.localId === demanda.localId &&
      d.categoriaId === demanda.categoriaId &&
      d.criadoEm >= limite &&
      d.estado !== "CANCELADA",
  ).length;
}

// ---------------------------------------------------------------------------
// Métricas operacionais
// ---------------------------------------------------------------------------

export interface MetricasOperacionais {
  totalAtivas: number;
  concluidasNoPeriodo: number;
  /** Horas entre abertura e triagem concluída. */
  tempoMedioAteTriagemHoras: number | null;
  /** Horas entre abertura e conclusão. */
  tempoMedioResolucaoHoras: number | null;
  percentualNoPrazo: number | null;
  /** Demandas que exigiram nova execução após validação reprovada. */
  retrabalhos: number;
  demandasSemProximoMovimento: number;
  reincidencias: GrupoReincidencia[];
  porLocal: { localId: ID; total: number }[];
  porCategoria: { categoriaId: ID; total: number }[];
}

function media(valores: number[]): number | null {
  if (valores.length === 0) return null;
  return Math.round(valores.reduce((s, v) => s + v, 0) / valores.length);
}

export function calcularMetricas(
  demandas: Demanda[],
  movimentos: Movimento[],
  agora: Instante,
  janelaDias = 90,
): MetricasOperacionais {
  const limite = agora - janelaDias * DIA;
  const noPeriodo = demandas.filter((d) => d.criadoEm >= limite);
  const porDemanda = new Map<ID, Movimento[]>();
  for (const m of movimentos) {
    const lista = porDemanda.get(m.demandaId);
    if (lista) lista.push(m);
    else porDemanda.set(m.demandaId, [m]);
  }

  const temposTriagem: number[] = [];
  const temposResolucao: number[] = [];
  let noPrazo = 0;
  let comPrazo = 0;
  let retrabalhos = 0;
  let semMovimento = 0;

  for (const d of noPeriodo) {
    const movs = porDemanda.get(d.id) ?? [];
    const triagem = movs.find(
      (m) => m.tipo === "TRIAGEM" && m.estado === "CONCLUIDO" && m.concluidoEm,
    );
    if (triagem?.concluidoEm) {
      temposTriagem.push((triagem.concluidoEm - d.criadoEm) / (60 * 60 * 1000));
    }
    if (d.concluidoEm) {
      temposResolucao.push((d.concluidoEm - d.criadoEm) / (60 * 60 * 1000));
      if (d.prazo !== undefined) {
        comPrazo += 1;
        if (d.concluidoEm <= d.prazo) noPrazo += 1;
      }
    }
    const execucoes = movs.filter((m) => m.tipo === "EXECUCAO");
    if (execucoes.length > 1) retrabalhos += 1;
    const ativa = d.estado !== "CONCLUIDA" && d.estado !== "CANCELADA";
    if (ativa && !movs.some((m) => m.estado === "PENDENTE" || m.estado === "SUSPENSO")) {
      semMovimento += 1;
    }
  }

  const agrupar = (chave: (d: Demanda) => ID) => {
    const mapa = new Map<ID, number>();
    for (const d of noPeriodo) {
      const k = chave(d);
      mapa.set(k, (mapa.get(k) ?? 0) + 1);
    }
    return [...mapa.entries()]
      .map(([id, total]) => ({ id, total }))
      .sort((a, b) => b.total - a.total);
  };

  return {
    totalAtivas: demandas.filter(
      (d) => d.estado !== "CONCLUIDA" && d.estado !== "CANCELADA",
    ).length,
    concluidasNoPeriodo: noPeriodo.filter((d) => d.estado === "CONCLUIDA").length,
    tempoMedioAteTriagemHoras: media(temposTriagem),
    tempoMedioResolucaoHoras: media(temposResolucao),
    percentualNoPrazo: comPrazo > 0 ? Math.round((noPrazo / comPrazo) * 100) : null,
    retrabalhos,
    demandasSemProximoMovimento: semMovimento,
    reincidencias: detectarReincidencias(demandas, agora),
    porLocal: agrupar((d) => d.localId).map((x) => ({ localId: x.id, total: x.total })),
    porCategoria: agrupar((d) => d.categoriaId).map((x) => ({
      categoriaId: x.id,
      total: x.total,
    })),
  };
}
