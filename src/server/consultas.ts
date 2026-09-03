/**
 * CONSULTAS
 *
 * Leitura para as telas. Monta o snapshot, roda os motores e devolve estruturas
 * já prontas para renderizar — a UI não recalcula regra de negócio.
 */
import { calcularMetricas, type MetricasOperacionais } from "@/domain/analiseHistorico";
import {
  demandasEmDestaque,
  montarAtencao,
  montarMinhaOperacao,
  type DemandaDestaque,
  type MinhaOperacao,
  type PainelAtencao,
} from "@/domain/motorAtencao";
import {
  movimentoAtual,
  podeConcluir,
  semDirecao,
  type ChecagemConclusao,
} from "@/domain/motorFluxo";
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
  SnapshotOperacional,
  Usuario,
} from "@/domain/tipos";
import { podeVerDemanda } from "./permissoes";
import { store } from "./store/arquivoStore";
import type { BaseDados } from "./store/port";
import { snapshotDe } from "./servicos/comum";
import { tickSeNecessario } from "./servicos/tickRunner";

async function carregar(): Promise<{ base: BaseDados; snap: SnapshotOperacional }> {
  await tickSeNecessario();
  const base = await store.ler();
  return { base, snap: snapshotDe(base, Date.now()) };
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DadosPainel {
  atencao: PainelAtencao;
  destaques: DemandaDestaque[];
  minhaOperacao: MinhaOperacao;
  contagens: {
    novas: number;
    emAndamento: number;
    bloqueadas: number;
    aguardandoAprovacao: number;
    concluidasRecentes: number;
  };
  usuarios: Usuario[];
  locais: Local[];
  categorias: Categoria[];
}

export async function dadosPainel(usuario: Usuario): Promise<DadosPainel> {
  const { base, snap } = await carregar();
  const seteDias = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const visiveis = base.demandas.filter((d) => podeVerDemanda(usuario, d));

  return {
    atencao: montarAtencao(snap, usuario, { limitePorBloco: 6 }),
    destaques: demandasEmDestaque(snap, usuario, 4),
    minhaOperacao: montarMinhaOperacao(snap, usuario),
    contagens: {
      novas: visiveis.filter((d) => d.estado === "NOVA" || d.estado === "EM_TRIAGEM")
        .length,
      emAndamento: visiveis.filter((d) =>
        ["EM_DIAGNOSTICO", "EM_PLANEJAMENTO", "EM_EXECUCAO", "EM_VALIDACAO"].includes(
          d.estado,
        ),
      ).length,
      bloqueadas: visiveis.filter((d) => d.estado === "BLOQUEADA").length,
      aguardandoAprovacao: visiveis.filter((d) => d.estado === "AGUARDANDO_APROVACAO")
        .length,
      concluidasRecentes: visiveis.filter(
        (d) => d.estado === "CONCLUIDA" && (d.concluidoEm ?? 0) >= seteDias,
      ).length,
    },
    usuarios: base.usuarios.filter((u) => u.ativo),
    locais: base.locais.filter((l) => l.ativo),
    categorias: base.categorias,
  };
}

export async function painelAtencaoCompleto(usuario: Usuario): Promise<PainelAtencao> {
  const { snap } = await carregar();
  return montarAtencao(snap, usuario);
}

export async function minhaOperacao(usuario: Usuario): Promise<MinhaOperacao> {
  const { snap } = await carregar();
  return montarMinhaOperacao(snap, usuario);
}

// ---------------------------------------------------------------------------
// Lista de demandas
// ---------------------------------------------------------------------------

export interface LinhaDemanda {
  demanda: Demanda;
  local?: Local;
  categoria?: Categoria;
  responsavel?: Usuario;
  proximoMovimento?: Movimento;
  sinais: Sinal[];
  impedimentoAtivo?: Impedimento;
  semDirecao: boolean;
}

export interface FiltrosDemandas {
  estado?: string;
  localId?: string;
  categoriaId?: string;
  responsavelId?: string;
  busca?: string;
  incluirConcluidas?: boolean;
}

export async function listarDemandas(
  usuario: Usuario,
  filtros: FiltrosDemandas = {},
): Promise<{ linhas: LinhaDemanda[]; locais: Local[]; categorias: Categoria[]; usuarios: Usuario[] }> {
  const { base, snap } = await carregar();
  const localPorId = new Map(base.locais.map((l) => [l.id, l]));
  const catPorId = new Map(base.categorias.map((c) => [c.id, c]));
  const userPorId = new Map(base.usuarios.map((u) => [u.id, u]));

  const busca = filtros.busca?.trim().toLowerCase();

  const linhas = base.demandas
    .filter((d) => podeVerDemanda(usuario, d))
    .filter((d) =>
      filtros.incluirConcluidas
        ? true
        : d.estado !== "CONCLUIDA" && d.estado !== "CANCELADA",
    )
    .filter((d) => !filtros.estado || d.estado === filtros.estado)
    .filter((d) => !filtros.localId || d.localId === filtros.localId)
    .filter((d) => !filtros.categoriaId || d.categoriaId === filtros.categoriaId)
    .filter((d) => !filtros.responsavelId || d.responsavelId === filtros.responsavelId)
    .filter(
      (d) =>
        !busca ||
        d.titulo.toLowerCase().includes(busca) ||
        d.codigo.toLowerCase().includes(busca) ||
        d.descricao.toLowerCase().includes(busca),
    )
    .map((demanda) => {
      const movimentos = base.movimentos.filter((m) => m.demandaId === demanda.id);
      const impedimentos = base.impedimentos.filter((i) => i.demandaId === demanda.id);
      return {
        demanda,
        local: localPorId.get(demanda.localId),
        categoria: catPorId.get(demanda.categoriaId),
        responsavel: demanda.responsavelId
          ? userPorId.get(demanda.responsavelId)
          : undefined,
        proximoMovimento: movimentoAtual(movimentos),
        sinais: base.sinais.filter(
          (s) => s.estado === "ATIVO" && s.demandaId === demanda.id,
        ),
        impedimentoAtivo: impedimentos.find((i) => i.estado === "ATIVO"),
        semDirecao: semDirecao({
          demanda,
          movimentos,
          impedimentos,
          aprovacoes: base.aprovacoes.filter((a) => a.demandaId === demanda.id),
          categoria: catPorId.get(demanda.categoriaId)!,
        }),
      };
    })
    .sort((a, b) => {
      // Ordena por relevância operacional, não por data de criação.
      const peso = (l: LinhaDemanda) =>
        l.sinais.reduce(
          (s, x) =>
            s + ({ CRITICO: 1000, ALTO: 600, MEDIO: 300, INFO: 100 }[x.nivel] ?? 0),
          0,
        );
      return peso(b) - peso(a) || b.demanda.prioridade.score - a.demanda.prioridade.score;
    });

  return {
    linhas,
    locais: base.locais.filter((l) => l.ativo),
    categorias: base.categorias,
    usuarios: base.usuarios.filter((u) => u.ativo),
  };
}

// ---------------------------------------------------------------------------
// Detalhe da demanda
// ---------------------------------------------------------------------------

export interface DetalheDemanda {
  demanda: Demanda;
  local?: Local;
  categoria: Categoria;
  solicitante?: Usuario;
  responsavel?: Usuario;
  proximoMovimento?: Movimento;
  movimentos: Movimento[];
  impedimentos: Impedimento[];
  aprovacoes: Aprovacao[];
  sinais: Sinal[];
  eventos: Evento[];
  comentarios: Comentario[];
  anexos: Anexo[];
  usuarios: Usuario[];
  checagemConclusao: ChecagemConclusao;
  semDirecao: boolean;
  /** Ocorrências anteriores do mesmo problema no mesmo local. */
  reincidencias: Demanda[];
}

export async function detalheDemanda(
  usuario: Usuario,
  demandaId: ID,
): Promise<DetalheDemanda | null> {
  const { base } = await carregar();
  const demanda = base.demandas.find((d) => d.id === demandaId);
  if (!demanda || !podeVerDemanda(usuario, demanda)) return null;

  const categoria = base.categorias.find((c) => c.id === demanda.categoriaId)!;
  const movimentos = base.movimentos
    .filter((m) => m.demandaId === demandaId)
    .sort((a, b) => a.sequencia - b.sequencia);
  const impedimentos = base.impedimentos
    .filter((i) => i.demandaId === demandaId)
    .sort((a, b) => b.dataInicio - a.dataInicio);
  const aprovacoes = base.aprovacoes.filter((a) => a.demandaId === demandaId);
  const userPorId = new Map(base.usuarios.map((u) => [u.id, u]));

  const noventaDias = Date.now() - 90 * 24 * 60 * 60 * 1000;

  return {
    demanda,
    local: base.locais.find((l) => l.id === demanda.localId),
    categoria,
    solicitante: userPorId.get(demanda.solicitanteId),
    responsavel: demanda.responsavelId ? userPorId.get(demanda.responsavelId) : undefined,
    proximoMovimento: movimentoAtual(movimentos),
    movimentos,
    impedimentos,
    aprovacoes,
    sinais: base.sinais.filter((s) => s.estado === "ATIVO" && s.demandaId === demandaId),
    eventos: base.eventos
      .filter((e) => e.demandaId === demandaId)
      .sort((a, b) => b.criadoEm - a.criadoEm),
    comentarios: base.comentarios
      .filter((c) => c.demandaId === demandaId)
      .filter((c) => usuario.papel !== "SOLICITANTE" || c.visivelSolicitante)
      .sort((a, b) => a.criadoEm - b.criadoEm),
    anexos: base.anexos.filter((a) => a.demandaId === demandaId),
    usuarios: base.usuarios.filter((u) => u.ativo),
    checagemConclusao: podeConcluir({
      demanda,
      movimentos,
      impedimentos,
      aprovacoes,
      categoria,
    }),
    semDirecao: semDirecao({ demanda, movimentos, impedimentos, aprovacoes, categoria }),
    reincidencias: base.demandas.filter(
      (d) =>
        d.id !== demandaId &&
        d.localId === demanda.localId &&
        d.categoriaId === demanda.categoriaId &&
        d.criadoEm >= noventaDias,
    ),
  };
}

// ---------------------------------------------------------------------------
// Recorrências e aprendizado
// ---------------------------------------------------------------------------

export async function listarRecorrencias(): Promise<{
  recorrencias: (Recorrencia & {
    local?: Local;
    categoria?: Categoria;
    responsavel?: Usuario;
    ocorrenciaAberta?: Demanda;
  })[];
  locais: Local[];
  categorias: Categoria[];
  usuarios: Usuario[];
}> {
  const { base } = await carregar();
  const userPorId = new Map(base.usuarios.map((u) => [u.id, u]));
  return {
    recorrencias: base.recorrencias
      .map((r) => ({
        ...r,
        local: base.locais.find((l) => l.id === r.localId),
        categoria: base.categorias.find((c) => c.id === r.categoriaId),
        responsavel: r.responsavelPadraoId
          ? userPorId.get(r.responsavelPadraoId)
          : undefined,
        ocorrenciaAberta: base.demandas.find(
          (d) =>
            d.recorrenciaId === r.id &&
            d.estado !== "CONCLUIDA" &&
            d.estado !== "CANCELADA",
        ),
      }))
      .sort((a, b) => a.proximaExecucao - b.proximaExecucao),
    locais: base.locais.filter((l) => l.ativo),
    categorias: base.categorias,
    usuarios: base.usuarios.filter((u) => u.ativo),
  };
}

export interface DadosAprendizado {
  metricas: MetricasOperacionais;
  locais: Local[];
  categorias: Categoria[];
}

export async function dadosAprendizado(): Promise<DadosAprendizado> {
  const { base } = await carregar();
  return {
    metricas: calcularMetricas(base.demandas, base.movimentos, Date.now()),
    locais: base.locais,
    categorias: base.categorias,
  };
}

export async function listarUsuarios(): Promise<Usuario[]> {
  const base = await store.ler();
  return base.usuarios.filter((u) => u.ativo);
}
