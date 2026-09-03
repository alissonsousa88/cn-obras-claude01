/**
 * MOTOR DE ATENÇÃO
 *
 * Camada acima do Motor de Sinais. Os sinais dizem "existe uma situação";
 * o Motor de Atenção responde:
 *
 *    "O que merece SUA atenção agora, e nesta ordem."
 *
 * Ele não inventa dados: pondera sinais reais por nível, atraso, prioridade da
 * demanda e proximidade com o usuário (é responsável? é o aprovador? abriu a
 * demanda?), e agrupa em blocos que espelham a decisão que a pessoa precisa
 * tomar.
 */
import { NIVEL_PRIORIDADE_ORDEM, NIVEL_SINAL_ORDEM, HORA, REGRAS, DIA } from "./regras";
import type {
  Demanda,
  ID,
  Instante,
  Movimento,
  Sinal,
  SnapshotOperacional,
  Usuario,
} from "./tipos";

// ---------------------------------------------------------------------------
// Item de atenção
// ---------------------------------------------------------------------------

export interface ItemAtencao {
  sinal: Sinal;
  demanda?: Demanda;
  movimento?: Movimento;
  /** Pontuação de urgência. Quanto maior, mais acima aparece. */
  peso: number;
  /** Frase curta de ação: "Concluir triagem", "Aprovar orçamento". */
  chamadaAcao: string;
  /** Quem precisa agir. Invariante de UX: nunca fica vazio quando há alguém. */
  responsavel?: Usuario;
  /** Verdadeiro quando este item é do próprio usuário. */
  meu: boolean;
  href: string;
  /**
   * Outros sinais ativos da mesma demanda, absorvidos por este item.
   * Uma demanda bloqueada costuma gerar prazo vencido + bloqueio prolongado +
   * impedimento sem revisão: são três leituras do mesmo fato, e mostrar três
   * cartões seria o ruído que o produto existe para eliminar.
   */
  relacionados: Sinal[];
}

export type BlocoAtencao =
  | "PRECISA_DE_VOCE"
  | "PROXIMAS_48H"
  | "AGUARDANDO_TERCEIROS"
  | "OPERACAO";

export interface PainelAtencao {
  /** Exige decisão ou ação do usuário agora. */
  precisaDeVoce: ItemAtencao[];
  /** Vai exigir atenção em breve — janela preventiva. */
  proximas48h: ItemAtencao[];
  /** Depende de outra pessoa; o usuário acompanha, não executa. */
  aguardandoTerceiros: ItemAtencao[];
  /** Situações da operação que não são do usuário, para quem enxerga tudo. */
  operacao: ItemAtencao[];
  /** Nenhuma situação relevante encontrada. */
  saudavel: boolean;
  resumo: ResumoAtencao;
}

export interface ResumoAtencao {
  acoesVencidas: number;
  aprovacoesAguardando: number;
  prazosProximos: number;
  demandasBloqueadas: number;
  semProximoMovimento: number;
  aguardandoTriagem: number;
}

// ---------------------------------------------------------------------------
// Peso
// ---------------------------------------------------------------------------

const PESO_NIVEL: Record<Sinal["nivel"], number> = {
  CRITICO: 1000,
  ALTO: 600,
  MEDIO: 300,
  INFO: 100,
};

/**
 * O peso combina, nesta ordem de importância:
 *   1. criticidade do sinal;
 *   2. atraso acumulado;
 *   3. prioridade da demanda;
 *   4. proximidade com o usuário.
 */
function calcularPeso(
  sinal: Sinal,
  demanda: Demanda | undefined,
  movimento: Movimento | undefined,
  usuario: Usuario,
  agora: Instante,
): number {
  let peso = PESO_NIVEL[sinal.nivel];

  if (movimento && movimento.prazo < agora) {
    const horasAtraso = (agora - movimento.prazo) / HORA;
    peso += Math.min(horasAtraso * 4, 300);
  }

  if (demanda) {
    peso += (3 - NIVEL_PRIORIDADE_ORDEM[demanda.prioridade.nivel]) * 60;
    const diasParado = (agora - demanda.ultimoAvancoEm) / DIA;
    peso += Math.min(diasParado * 12, 120);
  }

  // Itens endereçados ao usuário sobem: é ele quem pode agir.
  if (sinal.destinatarioId === usuario.id) peso += 250;
  else if (demanda?.responsavelId === usuario.id) peso += 120;
  else if (demanda?.solicitanteId === usuario.id) peso += 40;

  // Sinais mais antigos sobem levemente, para não ficarem no fim para sempre.
  peso += Math.min((agora - sinal.criadoEm) / DIA, 5) * 8;

  return Math.round(peso);
}

// ---------------------------------------------------------------------------
// Chamada de ação por tipo de sinal
// ---------------------------------------------------------------------------

function chamadaAcao(sinal: Sinal, movimento: Movimento | undefined): string {
  switch (sinal.tipo) {
    case "TRIAGEM_PENDENTE":
      return "Fazer a triagem";
    case "PRAZO_VENCIDO":
    case "PRAZO_PROXIMO":
      return movimento ? movimento.acao : "Concluir o passo";
    case "SEM_PROXIMO_MOVIMENTO":
      return "Definir o próximo passo";
    case "SEM_RESPONSAVEL":
      return "Definir responsável";
    case "DEMANDA_PARADA":
      return "Retomar a demanda";
    case "IMPEDIMENTO_PROLONGADO":
    case "IMPEDIMENTO_SEM_REVISAO":
      return "Tratar o impedimento";
    case "APROVACAO_PENDENTE":
      return "Decidir aprovação";
    case "RETORNO_NECESSARIO":
      return "Registrar o retorno";
    case "RECORRENCIA_PROXIMA":
    case "RECORRENCIA_ATRASADA":
      return "Programar a execução";
    case "REINCIDENCIA":
      return "Analisar a causa recorrente";
  }
}

function destino(sinal: Sinal): string {
  if (sinal.demandaId) return `/demandas/${sinal.demandaId}`;
  if (sinal.recorrenciaId) return `/recorrencias`;
  return "/atencao";
}

// ---------------------------------------------------------------------------
// Classificação em blocos
// ---------------------------------------------------------------------------

/** Sinais que representam algo que o usuário precisa fazer/decidir ele mesmo. */
const EXIGE_ACAO_DIRETA: ReadonlySet<Sinal["tipo"]> = new Set([
  "PRAZO_VENCIDO",
  "SEM_PROXIMO_MOVIMENTO",
  "SEM_RESPONSAVEL",
  "TRIAGEM_PENDENTE",
  "APROVACAO_PENDENTE",
  "RETORNO_NECESSARIO",
  "DEMANDA_PARADA",
  "RECORRENCIA_ATRASADA",
]);

/** Sinais preventivos: ainda não são problema, mas serão. */
const PREVENTIVO: ReadonlySet<Sinal["tipo"]> = new Set([
  "PRAZO_PROXIMO",
  "RECORRENCIA_PROXIMA",
]);

/** Situações em que a bola está com outra pessoa. */
const DEPENDE_DE_TERCEIRO: ReadonlySet<Sinal["tipo"]> = new Set([
  "IMPEDIMENTO_PROLONGADO",
  "IMPEDIMENTO_SEM_REVISAO",
]);

function bloco(item: ItemAtencao, usuario: Usuario): BlocoAtencao {
  const { sinal, meu } = item;

  if (DEPENDE_DE_TERCEIRO.has(sinal.tipo)) {
    // Se o desbloqueio é comigo, é ação minha; senão, estou aguardando alguém.
    return meu ? "PRECISA_DE_VOCE" : "AGUARDANDO_TERCEIROS";
  }
  if (meu && EXIGE_ACAO_DIRETA.has(sinal.tipo)) return "PRECISA_DE_VOCE";
  if (meu && PREVENTIVO.has(sinal.tipo)) return "PROXIMAS_48H";

  // Liderança enxerga a operação inteira; os demais só o que os toca.
  if (usuario.papel === "LIDERANCA") {
    if (PREVENTIVO.has(sinal.tipo)) return "PROXIMAS_48H";
    return "OPERACAO";
  }
  return "OPERACAO";
}

// ---------------------------------------------------------------------------
// Montagem do painel
// ---------------------------------------------------------------------------

export interface OpcoesAtencao {
  /** Limita cada bloco. `undefined` = sem limite (usado na Central de Atenção). */
  limitePorBloco?: number;
  /** Quando falso, blocos de operação geral são omitidos (visão do solicitante). */
  incluirOperacao?: boolean;
}

export function montarAtencao(
  snap: SnapshotOperacional,
  usuario: Usuario,
  opcoes: OpcoesAtencao = {},
): PainelAtencao {
  const { agora } = snap;
  const demandaPorId = new Map(snap.demandas.map((d) => [d.id, d]));
  const movPorId = new Map(snap.movimentos.map((m) => [m.id, m]));
  const usuarioPorId = new Map(snap.usuarios.map((u) => [u.id, u]));

  // A visibilidade é aplicada antes de tudo: o resumo, os blocos e as
  // contagens precisam falar da mesma operação que o usuário enxerga. Mostrar
  // ao solicitante os números da operação inteira o obrigaria a entender um
  // fluxo interno que não é dele.
  const visiveis = snap.sinais.filter(
    (s) => s.estado === "ATIVO" && visivelPara(s, demandaPorId, usuario),
  );

  const itens: ItemAtencao[] = visiveis
    .map((sinal) => {
      const demanda = sinal.demandaId ? demandaPorId.get(sinal.demandaId) : undefined;
      const movimento = sinal.movimentoId ? movPorId.get(sinal.movimentoId) : undefined;
      const meu =
        sinal.destinatarioId === usuario.id ||
        (!sinal.destinatarioId && demanda?.responsavelId === usuario.id);
      return {
        sinal,
        demanda,
        movimento,
        peso: calcularPeso(sinal, demanda, movimento, usuario, agora),
        chamadaAcao: chamadaAcao(sinal, movimento),
        responsavel: sinal.destinatarioId
          ? usuarioPorId.get(sinal.destinatarioId)
          : demanda?.responsavelId
            ? usuarioPorId.get(demanda.responsavelId)
            : undefined,
        meu,
        href: destino(sinal),
        relacionados: [],
      };
    })
    .sort((a, b) => b.peso - a.peso);

  const painel: Record<BlocoAtencao, ItemAtencao[]> = {
    PRECISA_DE_VOCE: [],
    PROXIMAS_48H: [],
    AGUARDANDO_TERCEIROS: [],
    OPERACAO: [],
  };
  for (const item of itens) {
    painel[bloco(item, usuario)].push(item);
  }

  // Consolida por demanda dentro de cada bloco: um cartão por situação, com os
  // demais sinais anexados. A ordenação já garante que o sobrevivente é o mais
  // urgente — e é a ação dele que resolve o conjunto.
  for (const chave of Object.keys(painel) as BlocoAtencao[]) {
    painel[chave] = consolidarPorDemanda(painel[chave]);
  }

  const limitar = (lista: ItemAtencao[]) =>
    opcoes.limitePorBloco ? lista.slice(0, opcoes.limitePorBloco) : lista;

  const resumo = resumirOperacao(snap, visiveis, usuario);

  return {
    precisaDeVoce: limitar(painel.PRECISA_DE_VOCE),
    proximas48h: limitar(painel.PROXIMAS_48H),
    aguardandoTerceiros: limitar(painel.AGUARDANDO_TERCEIROS),
    operacao:
      opcoes.incluirOperacao === false ? [] : limitar(painel.OPERACAO),
    saudavel:
      painel.PRECISA_DE_VOCE.length === 0 && painel.PROXIMAS_48H.length === 0,
    resumo,
  };
}

function consolidarPorDemanda(itens: ItemAtencao[]): ItemAtencao[] {
  const principais = new Map<ID, ItemAtencao>();
  const resultado: ItemAtencao[] = [];

  for (const item of itens) {
    // Sinais sem demanda (recorrências) não têm o que consolidar.
    if (!item.sinal.demandaId) {
      resultado.push(item);
      continue;
    }
    const principal = principais.get(item.sinal.demandaId);
    if (principal) {
      principal.relacionados.push(item.sinal);
      continue;
    }
    principais.set(item.sinal.demandaId, item);
    resultado.push(item);
  }

  return resultado;
}

/**
 * Solicitantes veem apenas o que se refere às próprias solicitações. Equipe e
 * liderança veem a operação.
 */
function visivelPara(
  sinal: Sinal,
  demandas: Map<ID, Demanda>,
  usuario: Usuario,
): boolean {
  if (usuario.papel !== "SOLICITANTE") return true;
  if (sinal.destinatarioId === usuario.id) return true;
  if (!sinal.demandaId) return false;
  return demandas.get(sinal.demandaId)?.solicitanteId === usuario.id;
}

function resumirOperacao(
  snap: SnapshotOperacional,
  visiveis: Sinal[],
  usuario: Usuario,
): ResumoAtencao {
  const contar = (tipo: Sinal["tipo"]) =>
    visiveis.filter((s) => s.tipo === tipo).length;
  const bloqueadas = snap.demandas.filter(
    (d) =>
      d.estado === "BLOQUEADA" &&
      (usuario.papel !== "SOLICITANTE" || d.solicitanteId === usuario.id),
  );
  return {
    acoesVencidas: contar("PRAZO_VENCIDO"),
    aprovacoesAguardando: contar("APROVACAO_PENDENTE"),
    prazosProximos: contar("PRAZO_PROXIMO"),
    demandasBloqueadas: bloqueadas.length,
    semProximoMovimento: contar("SEM_PROXIMO_MOVIMENTO"),
    aguardandoTriagem: contar("TRIAGEM_PENDENTE"),
  };
}

// ---------------------------------------------------------------------------
// Minha operação — inbox individual
// ---------------------------------------------------------------------------

export interface MinhaOperacao {
  /** Movimentos meus, vencidos ou vencendo hoje. */
  fazerAgora: MovimentoComContexto[];
  /** Movimentos meus com prazo futuro. */
  proximas: MovimentoComContexto[];
  /** Minhas demandas travadas por outra pessoa. */
  aguardandoTerceiros: { demanda: Demanda; motivo: string; responsavel?: Usuario }[];
  /** Aprovações endereçadas a mim. */
  precisaMinhaDecisao: MovimentoComContexto[];
  /** Feedback: o que avançou por minhas mãos recentemente. */
  concluidoRecentemente: MovimentoComContexto[];
}

export interface MovimentoComContexto {
  movimento: Movimento;
  demanda: Demanda;
  atrasado: boolean;
  horasParaPrazo: number;
  sinais: Sinal[];
}

export function montarMinhaOperacao(
  snap: SnapshotOperacional,
  usuario: Usuario,
): MinhaOperacao {
  const { agora } = snap;
  const demandaPorId = new Map(snap.demandas.map((d) => [d.id, d]));
  const sinaisPorMovimento = new Map<ID, Sinal[]>();
  for (const s of snap.sinais) {
    if (s.estado !== "ATIVO" || !s.movimentoId) continue;
    const lista = sinaisPorMovimento.get(s.movimentoId);
    if (lista) lista.push(s);
    else sinaisPorMovimento.set(s.movimentoId, [s]);
  }

  const contexto = (m: Movimento): MovimentoComContexto | undefined => {
    const demanda = demandaPorId.get(m.demandaId);
    if (!demanda) return undefined;
    return {
      movimento: m,
      demanda,
      atrasado: m.prazo < agora,
      horasParaPrazo: (m.prazo - agora) / HORA,
      sinais: sinaisPorMovimento.get(m.id) ?? [],
    };
  };

  const meus = snap.movimentos.filter((m) => m.responsavelId === usuario.id);
  const pendentes = meus
    .filter((m) => m.estado === "PENDENTE")
    .map(contexto)
    .filter((c): c is MovimentoComContexto => !!c)
    .sort((a, b) => a.movimento.prazo - b.movimento.prazo);

  const aprovacoesMinhas = new Set(
    snap.aprovacoes
      .filter((a) => a.estado === "PENDENTE" && a.aprovadorId === usuario.id)
      .map((a) => a.movimentoId),
  );

  const decisao = pendentes.filter((c) => aprovacoesMinhas.has(c.movimento.id));
  const execucao = pendentes.filter((c) => !aprovacoesMinhas.has(c.movimento.id));

  const limiteAgora = agora + REGRAS.prazoProximoHoras * HORA;

  const impedimentosAtivos = snap.impedimentos.filter((i) => i.estado === "ATIVO");
  const usuarioPorId = new Map(snap.usuarios.map((u) => [u.id, u]));
  const aguardando = impedimentosAtivos
    .filter((i) => {
      const d = demandaPorId.get(i.demandaId);
      if (!d) return false;
      const meuInteresse =
        d.responsavelId === usuario.id || d.solicitanteId === usuario.id;
      return meuInteresse && i.responsavelDesbloqueioId !== usuario.id;
    })
    .map((i) => ({
      demanda: demandaPorId.get(i.demandaId)!,
      motivo: i.descricao,
      responsavel: usuarioPorId.get(i.responsavelDesbloqueioId),
    }));

  const limiteRecente = agora - REGRAS.concluidoRecenteDias * DIA;
  const concluidos = meus
    .filter((m) => m.estado === "CONCLUIDO" && (m.concluidoEm ?? 0) >= limiteRecente)
    .map(contexto)
    .filter((c): c is MovimentoComContexto => !!c)
    .sort((a, b) => (b.movimento.concluidoEm ?? 0) - (a.movimento.concluidoEm ?? 0));

  return {
    fazerAgora: execucao.filter((c) => c.movimento.prazo <= limiteAgora),
    proximas: execucao.filter((c) => c.movimento.prazo > limiteAgora),
    aguardandoTerceiros: aguardando,
    precisaMinhaDecisao: decisao,
    concluidoRecentemente: concluidos.slice(0, 8),
  };
}

// ---------------------------------------------------------------------------
// Demandas em destaque
// ---------------------------------------------------------------------------

export interface DemandaDestaque {
  demanda: Demanda;
  sinais: Sinal[];
  proximoMovimento?: Movimento;
  responsavel?: Usuario;
  peso: number;
}

/**
 * Só entram demandas com *algo acontecendo*. Uma lista completa não é destaque.
 */
export function demandasEmDestaque(
  snap: SnapshotOperacional,
  usuario: Usuario,
  limite = 6,
): DemandaDestaque[] {
  const usuarioPorId = new Map(snap.usuarios.map((u) => [u.id, u]));
  const sinaisPorDemanda = new Map<ID, Sinal[]>();
  for (const s of snap.sinais) {
    if (s.estado !== "ATIVO" || !s.demandaId) continue;
    const lista = sinaisPorDemanda.get(s.demandaId);
    if (lista) lista.push(s);
    else sinaisPorDemanda.set(s.demandaId, [s]);
  }

  const movPorDemanda = new Map<ID, Movimento[]>();
  for (const m of snap.movimentos) {
    if (m.estado !== "PENDENTE") continue;
    const lista = movPorDemanda.get(m.demandaId);
    if (lista) lista.push(m);
    else movPorDemanda.set(m.demandaId, [m]);
  }

  return snap.demandas
    .filter((d) => d.estado !== "CONCLUIDA" && d.estado !== "CANCELADA")
    .filter(
      (d) =>
        usuario.papel !== "SOLICITANTE" || d.solicitanteId === usuario.id,
    )
    .map((demanda) => {
      const sinais = (sinaisPorDemanda.get(demanda.id) ?? []).sort(
        (a, b) => NIVEL_SINAL_ORDEM[a.nivel] - NIVEL_SINAL_ORDEM[b.nivel],
      );
      const proximo = (movPorDemanda.get(demanda.id) ?? []).sort(
        (a, b) => a.prazo - b.prazo,
      )[0];
      const pesoSinais = sinais.reduce((s, x) => s + PESO_NIVEL[x.nivel], 0);
      const peso =
        pesoSinais + (3 - NIVEL_PRIORIDADE_ORDEM[demanda.prioridade.nivel]) * 80;
      return {
        demanda,
        sinais,
        proximoMovimento: proximo,
        responsavel: demanda.responsavelId
          ? usuarioPorId.get(demanda.responsavelId)
          : undefined,
        peso,
      };
    })
    .filter((d) => d.sinais.length > 0)
    .sort((a, b) => b.peso - a.peso)
    .slice(0, limite);
}
