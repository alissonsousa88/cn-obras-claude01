/**
 * Modelo de domínio do CN Obras.
 *
 * Este arquivo é TypeScript puro: nenhuma dependência de framework, banco ou I/O.
 * Os motores (fluxo, sinais, atenção, prioridade) operam exclusivamente sobre
 * estes tipos, de forma que possam ser executados no servidor Next, dentro de
 * funções Convex ou em testes, sem alteração.
 */

export type ID = string;

/** Instante em milissegundos (epoch). Escolhido por ser serializável em qualquer store. */
export type Instante = number;

// ---------------------------------------------------------------------------
// Pessoas e papéis
// ---------------------------------------------------------------------------

/**
 * Papéis previstos no MVP. A arquitetura admite novos papéis: as permissões são
 * resolvidas por capacidade (ver `permissoes.ts`), nunca por comparação direta
 * com o papel espalhada pelo código.
 */
export type Papel = "SOLICITANTE" | "OPERACAO" | "LIDERANCA";

export interface Usuario {
  id: ID;
  nome: string;
  email: string;
  papel: Papel;
  /** Especialidades usadas pela triagem para sugerir responsável. */
  especialidades: CategoriaSlug[];
  senhaHash: string;
  ativo: boolean;
  criadoEm: Instante;
}

// ---------------------------------------------------------------------------
// Cadastros de apoio
// ---------------------------------------------------------------------------

export type CategoriaSlug =
  | "eletrica"
  | "hidraulica"
  | "climatizacao"
  | "pintura"
  | "mobiliario"
  | "equipamentos"
  | "estrutural"
  | "manutencao"
  | "inspecao";

export interface Categoria {
  id: ID;
  slug: CategoriaSlug;
  nome: string;
  /** Prazo de referência, em horas, entre triagem concluída e resolução esperada. */
  prazoResolucaoHoras: number;
  /** Acima deste valor (R$) a solução exige aprovação da liderança. 0 = sempre aprova. */
  tetoSemAprovacao: number;
  /** Risco intrínseco da categoria (0-3), insumo do Motor de Prioridade. */
  pesoRisco: number;
}

export interface Local {
  id: ID;
  nome: string;
  /** Quantidade típica de pessoas impactadas quando o local fica comprometido. */
  publicoTipico: number;
  /** Local crítico para o funcionamento dos cultos/eventos. */
  critico: boolean;
  ativo: boolean;
}

// ---------------------------------------------------------------------------
// Demanda
// ---------------------------------------------------------------------------

/**
 * Estados do ciclo operacional. São derivados do fluxo real (movimentos e
 * impedimentos) e não editados livremente — ver `motorFluxo.estadoDerivado`.
 */
export type EstadoDemanda =
  | "NOVA"
  | "EM_TRIAGEM"
  | "EM_DIAGNOSTICO"
  | "EM_PLANEJAMENTO"
  | "AGUARDANDO_APROVACAO"
  | "EM_EXECUCAO"
  | "EM_VALIDACAO"
  | "BLOQUEADA"
  | "CONCLUIDA"
  | "CANCELADA";

export const ESTADOS_ATIVOS: readonly EstadoDemanda[] = [
  "NOVA",
  "EM_TRIAGEM",
  "EM_DIAGNOSTICO",
  "EM_PLANEJAMENTO",
  "AGUARDANDO_APROVACAO",
  "EM_EXECUCAO",
  "EM_VALIDACAO",
  "BLOQUEADA",
];

export type NivelPrioridade = "CRITICA" | "ALTA" | "MEDIA" | "BAIXA";

/**
 * Fatores declarados na abertura/triagem. O Motor de Prioridade converte estes
 * fatores em score; o campo `prioridade` guarda o resultado. Nunca é um enum
 * digitado à mão sem rastro.
 */
export interface FatoresPrioridade {
  /** Há risco de dano a pessoas ou ao patrimônio. */
  risco: boolean;
  /** Impede o uso normal do espaço. */
  operacaoComprometida: boolean;
  /** Envolve segurança (elétrica exposta, estrutura, incêndio). */
  seguranca: boolean;
  /** Quantidade de pessoas afetadas (informada ou herdada do local). */
  pessoasAfetadas: number;
  /** Existe evento/culto próximo que depende deste local. */
  eventoProximoEm?: Instante;
}

export type OrigemPrioridade = "CALCULADA" | "AJUSTE_MANUAL";

export interface Prioridade {
  nivel: NivelPrioridade;
  score: number;
  origem: OrigemPrioridade;
  /** Explicação legível dos fatores que produziram o nível. */
  justificativa: string;
  definidoEm: Instante;
  definidoPor?: ID;
}

export interface ResultadoDemanda {
  /** O que efetivamente foi realizado. */
  oQueFoiFeito: string;
  /** O problema que originou a demanda foi resolvido? */
  problemaResolvido: boolean;
  /** Resultado obtido, na perspectiva de quem solicitou. */
  resultadoObtido: string;
  observacoesFinais?: string;
  registradoPor: ID;
  registradoEm: Instante;
  anexoIds: ID[];
}

export interface Demanda {
  id: ID;
  codigo: string;
  titulo: string;
  descricao: string;
  localId: ID;
  categoriaId: ID;
  solicitanteId: ID;
  responsavelId?: ID;
  estado: EstadoDemanda;
  prioridade: Prioridade;
  fatores: FatoresPrioridade;
  criadoEm: Instante;
  /** Prazo alvo de resolução da demanda como um todo (definido na triagem). */
  prazo?: Instante;
  /** Última vez que algo realmente avançou (movimento concluído, diagnóstico, etc). */
  ultimoAvancoEm: Instante;
  concluidoEm?: Instante;
  resultado?: ResultadoDemanda;
  /** Preenchido quando a demanda nasceu de uma recorrência. */
  recorrenciaId?: ID;
  /** Custo estimado da solução, definido no planejamento. Dirige a necessidade de aprovação. */
  custoEstimado?: number;
  reaberturas: number;
}

// ---------------------------------------------------------------------------
// Motor de Fluxo — próximos movimentos
// ---------------------------------------------------------------------------

/**
 * Tipos de movimento. Cada tipo carrega semântica operacional: o Motor de Fluxo
 * usa o tipo concluído + seu resultado para decidir o que vem depois.
 */
export type TipoMovimento =
  | "TRIAGEM"
  | "DIAGNOSTICO"
  | "ORCAMENTO"
  | "APROVACAO"
  | "EXECUCAO"
  | "VALIDACAO"
  | "RETORNO_SOLICITANTE"
  | "DESBLOQUEIO";

export type EstadoMovimento =
  | "PENDENTE"
  | "SUSPENSO"
  | "CONCLUIDO"
  | "CANCELADO";

export type OrigemMovimento =
  | "AUTOMATICO"
  | "SUGESTAO_ACEITA"
  | "MANUAL";

export interface Movimento {
  id: ID;
  demandaId: ID;
  tipo: TipoMovimento;
  /** Frase no imperativo: "Verificar origem do vazamento". */
  acao: string;
  responsavelId?: ID;
  prazo: Instante;
  /** O que deve existir quando este movimento terminar. */
  resultadoEsperado: string;
  estado: EstadoMovimento;
  origem: OrigemMovimento;
  criadoEm: Instante;
  concluidoEm?: Instante;
  concluidoPor?: ID;
  /** Relato do que aconteceu — alimenta o Motor de Fluxo na decisão do próximo. */
  relato?: string;
  /** Impedimento que suspendeu este movimento, quando aplicável. */
  suspensoPor?: ID;
  sequencia: number;
}

/** Sugestão emitida pelo Motor de Fluxo. Ainda não é um movimento persistido. */
export interface MovimentoSugerido {
  tipo: TipoMovimento;
  acao: string;
  resultadoEsperado: string;
  /** Horas a partir de agora para o prazo sugerido. */
  prazoHoras: number;
  responsavelId?: ID;
  /** Por que o sistema está sugerindo isso. Exibido ao usuário. */
  motivo: string;
}

// ---------------------------------------------------------------------------
// Impedimentos
// ---------------------------------------------------------------------------

export type TipoImpedimento =
  | "AGUARDANDO_APROVACAO"
  | "AGUARDANDO_FORNECEDOR"
  | "AGUARDANDO_MATERIAL"
  | "AGUARDANDO_ACESSO"
  | "FALTA_INFORMACAO"
  | "DEPENDENCIA"
  | "RESTRICAO_FINANCEIRA";

export interface Impedimento {
  id: ID;
  demandaId: ID;
  tipo: TipoImpedimento;
  descricao: string;
  /** Invariante de domínio: todo impedimento tem um responsável pelo desbloqueio. */
  responsavelDesbloqueioId: ID;
  dataInicio: Instante;
  /** Quando revisitar este impedimento. Obrigatório: bloqueio sem revisão vira esquecimento. */
  dataRevisao: Instante;
  estado: "ATIVO" | "RESOLVIDO";
  resolucao?: string;
  resolvidoEm?: Instante;
  resolvidoPor?: ID;
  /** Movimentos suspensos por este impedimento, para retomada automática. */
  movimentosSuspensos: ID[];
}

// ---------------------------------------------------------------------------
// Aprovações
// ---------------------------------------------------------------------------

export interface Aprovacao {
  id: ID;
  demandaId: ID;
  movimentoId: ID;
  descricao: string;
  valor?: number;
  aprovadorId: ID;
  estado: "PENDENTE" | "APROVADA" | "RECUSADA";
  solicitadoEm: Instante;
  decididoEm?: Instante;
  justificativa?: string;
}

// ---------------------------------------------------------------------------
// Motor de Sinais
// ---------------------------------------------------------------------------

export type TipoSinal =
  | "TRIAGEM_PENDENTE"
  | "PRAZO_PROXIMO"
  | "PRAZO_VENCIDO"
  | "DEMANDA_PARADA"
  | "SEM_PROXIMO_MOVIMENTO"
  | "IMPEDIMENTO_PROLONGADO"
  | "IMPEDIMENTO_SEM_REVISAO"
  | "APROVACAO_PENDENTE"
  | "RETORNO_NECESSARIO"
  | "RECORRENCIA_PROXIMA"
  | "RECORRENCIA_ATRASADA"
  | "REINCIDENCIA"
  | "SEM_RESPONSAVEL";

export type NivelSinal = "CRITICO" | "ALTO" | "MEDIO" | "INFO";

export interface Sinal {
  id: ID;
  /** Chave de identidade lógica do sinal — garante que o mesmo sinal não duplique. */
  chave: string;
  tipo: TipoSinal;
  nivel: NivelSinal;
  /** Texto operacional, na linguagem da equipe. */
  mensagem: string;
  demandaId?: ID;
  movimentoId?: ID;
  impedimentoId?: ID;
  recorrenciaId?: ID;
  /** Quem precisa agir sobre este sinal. Invariante: sempre que possível, preenchido. */
  destinatarioId?: ID;
  estado: "ATIVO" | "RESOLVIDO";
  criadoEm: Instante;
  resolvidoEm?: Instante;
  /** Dados estruturados para futura análise (métricas e aprendizado). */
  dados: Record<string, number | string | boolean>;
}

/** Sinal calculado pelo motor, antes da reconciliação com o que já está persistido. */
export type SinalDesejado = Omit<
  Sinal,
  "id" | "estado" | "criadoEm" | "resolvidoEm"
>;

// ---------------------------------------------------------------------------
// Recorrências
// ---------------------------------------------------------------------------

export interface Recorrencia {
  id: ID;
  titulo: string;
  descricao: string;
  categoriaId: ID;
  localId: ID;
  responsavelPadraoId?: ID;
  intervaloDias: number;
  /** Quantos dias antes o sistema deve avisar. */
  avisarAntesDias: number;
  proximaExecucao: Instante;
  ultimaExecucao?: Instante;
  ativo: boolean;
  criadoEm: Instante;
}

// ---------------------------------------------------------------------------
// Histórico (append-only)
// ---------------------------------------------------------------------------

export type TipoEvento =
  | "DEMANDA_CRIADA"
  | "TRIAGEM_REALIZADA"
  | "RESPONSAVEL_ALTERADO"
  | "PRIORIDADE_ALTERADA"
  | "MOVIMENTO_CRIADO"
  | "MOVIMENTO_CONCLUIDO"
  | "MOVIMENTO_SUSPENSO"
  | "MOVIMENTO_RETOMADO"
  | "MOVIMENTO_CANCELADO"
  | "IMPEDIMENTO_REGISTRADO"
  | "IMPEDIMENTO_RESOLVIDO"
  | "PRAZO_ALTERADO"
  | "APROVACAO_SOLICITADA"
  | "APROVACAO_DECIDIDA"
  | "COMENTARIO_ADICIONADO"
  | "ANEXO_ADICIONADO"
  | "DEMANDA_CONCLUIDA"
  | "DEMANDA_REABERTA"
  | "DEMANDA_CANCELADA"
  | "SINAL_ABERTO"
  | "SINAL_RESOLVIDO"
  | "RECORRENCIA_GERADA"
  | "REINCIDENCIA_IDENTIFICADA";

export interface Evento {
  id: ID;
  demandaId?: ID;
  tipo: TipoEvento;
  /** Descrição legível, escrita para quem lê a timeline. */
  descricao: string;
  /** `undefined` = executado pelo próprio sistema (automação). */
  autorId?: ID;
  criadoEm: Instante;
  dados: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Conversa e anexos
// ---------------------------------------------------------------------------

export interface Comentario {
  id: ID;
  demandaId: ID;
  autorId: ID;
  texto: string;
  criadoEm: Instante;
  /** Comentários internos não aparecem para o solicitante. */
  visivelSolicitante: boolean;
  /** Marca perguntas dirigidas ao solicitante — geram sinal de retorno necessário. */
  perguntaPara?: ID;
  respondidoEm?: Instante;
}

export interface Anexo {
  id: ID;
  demandaId: ID;
  movimentoId?: ID;
  nome: string;
  mimeType: string;
  tamanho: number;
  /** Conteúdo em data URL. No MVP evita dependência de storage externo. */
  conteudo: string;
  autorId: ID;
  criadoEm: Instante;
  legenda?: string;
}

// ---------------------------------------------------------------------------
// Snapshot operacional — entrada dos motores
// ---------------------------------------------------------------------------

/**
 * Visão consistente do estado operacional em um instante. Os motores recebem um
 * snapshot e devolvem conclusões; não conhecem o store.
 */
export interface SnapshotOperacional {
  agora: Instante;
  usuarios: Usuario[];
  categorias: Categoria[];
  locais: Local[];
  demandas: Demanda[];
  movimentos: Movimento[];
  impedimentos: Impedimento[];
  aprovacoes: Aprovacao[];
  recorrencias: Recorrencia[];
  comentarios: Comentario[];
  sinais: Sinal[];
}
