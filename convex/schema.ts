/**
 * Schema Convex do CN Obras.
 *
 * Este arquivo NÃO está em uso na aplicação atual — ele documenta o modelo de
 * dados no formato do Convex para que a migração seja mecânica.
 *
 * O ponto que torna a migração barata é arquitetural: as regras de negócio
 * vivem em `src/domain/` (TypeScript puro, sem I/O) e em `src/server/servicos/`
 * (funções que recebem a base e a modificam). As mutations do Convex chamariam
 * exatamente essas funções. Ver docs/PORTAR-PARA-CONVEX.md.
 */
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const papel = v.union(
  v.literal("SOLICITANTE"),
  v.literal("OPERACAO"),
  v.literal("LIDERANCA"),
);

const nivelPrioridade = v.union(
  v.literal("CRITICA"),
  v.literal("ALTA"),
  v.literal("MEDIA"),
  v.literal("BAIXA"),
);

const estadoDemanda = v.union(
  v.literal("NOVA"),
  v.literal("EM_TRIAGEM"),
  v.literal("EM_DIAGNOSTICO"),
  v.literal("EM_PLANEJAMENTO"),
  v.literal("AGUARDANDO_APROVACAO"),
  v.literal("EM_EXECUCAO"),
  v.literal("EM_VALIDACAO"),
  v.literal("BLOQUEADA"),
  v.literal("CONCLUIDA"),
  v.literal("CANCELADA"),
);

const tipoMovimento = v.union(
  v.literal("TRIAGEM"),
  v.literal("DIAGNOSTICO"),
  v.literal("ORCAMENTO"),
  v.literal("APROVACAO"),
  v.literal("EXECUCAO"),
  v.literal("VALIDACAO"),
  v.literal("RETORNO_SOLICITANTE"),
  v.literal("DESBLOQUEIO"),
);

export default defineSchema({
  usuarios: defineTable({
    nome: v.string(),
    email: v.string(),
    papel,
    especialidades: v.array(v.string()),
    senhaHash: v.string(),
    ativo: v.boolean(),
    criadoEm: v.number(),
  }).index("por_email", ["email"]),

  categorias: defineTable({
    slug: v.string(),
    nome: v.string(),
    prazoResolucaoHoras: v.number(),
    tetoSemAprovacao: v.number(),
    pesoRisco: v.number(),
  }),

  locais: defineTable({
    nome: v.string(),
    publicoTipico: v.number(),
    critico: v.boolean(),
    ativo: v.boolean(),
  }),

  demandas: defineTable({
    codigo: v.string(),
    titulo: v.string(),
    descricao: v.string(),
    localId: v.id("locais"),
    categoriaId: v.id("categorias"),
    solicitanteId: v.id("usuarios"),
    responsavelId: v.optional(v.id("usuarios")),
    estado: estadoDemanda,
    prioridade: v.object({
      nivel: nivelPrioridade,
      score: v.number(),
      origem: v.union(v.literal("CALCULADA"), v.literal("AJUSTE_MANUAL")),
      justificativa: v.string(),
      definidoEm: v.number(),
      definidoPor: v.optional(v.id("usuarios")),
    }),
    fatores: v.object({
      risco: v.boolean(),
      operacaoComprometida: v.boolean(),
      seguranca: v.boolean(),
      pessoasAfetadas: v.number(),
      eventoProximoEm: v.optional(v.number()),
    }),
    criadoEm: v.number(),
    prazo: v.optional(v.number()),
    // Indexado: é a entrada do sinal "demanda parada".
    ultimoAvancoEm: v.number(),
    concluidoEm: v.optional(v.number()),
    resultado: v.optional(
      v.object({
        oQueFoiFeito: v.string(),
        problemaResolvido: v.boolean(),
        resultadoObtido: v.string(),
        observacoesFinais: v.optional(v.string()),
        registradoPor: v.id("usuarios"),
        registradoEm: v.number(),
        anexoIds: v.array(v.id("anexos")),
      }),
    ),
    recorrenciaId: v.optional(v.id("recorrencias")),
    custoEstimado: v.optional(v.number()),
    reaberturas: v.number(),
  })
    .index("por_estado", ["estado"])
    .index("por_responsavel", ["responsavelId"])
    .index("por_solicitante", ["solicitanteId"])
    // Suporta a detecção de reincidência sem varrer a tabela inteira.
    .index("por_local_categoria", ["localId", "categoriaId"])
    .index("por_avanco", ["ultimoAvancoEm"]),

  movimentos: defineTable({
    demandaId: v.id("demandas"),
    tipo: tipoMovimento,
    acao: v.string(),
    responsavelId: v.optional(v.id("usuarios")),
    prazo: v.number(),
    resultadoEsperado: v.string(),
    estado: v.union(
      v.literal("PENDENTE"),
      v.literal("SUSPENSO"),
      v.literal("CONCLUIDO"),
      v.literal("CANCELADO"),
    ),
    origem: v.union(
      v.literal("AUTOMATICO"),
      v.literal("SUGESTAO_ACEITA"),
      v.literal("MANUAL"),
    ),
    criadoEm: v.number(),
    concluidoEm: v.optional(v.number()),
    concluidoPor: v.optional(v.id("usuarios")),
    relato: v.optional(v.string()),
    suspensoPor: v.optional(v.id("impedimentos")),
    sequencia: v.number(),
  })
    .index("por_demanda", ["demandaId"])
    // O Motor de Sinais varre movimentos pendentes por prazo.
    .index("por_estado_prazo", ["estado", "prazo"])
    .index("por_responsavel_estado", ["responsavelId", "estado"]),

  impedimentos: defineTable({
    demandaId: v.id("demandas"),
    tipo: v.string(),
    descricao: v.string(),
    responsavelDesbloqueioId: v.id("usuarios"),
    dataInicio: v.number(),
    dataRevisao: v.number(),
    estado: v.union(v.literal("ATIVO"), v.literal("RESOLVIDO")),
    resolucao: v.optional(v.string()),
    resolvidoEm: v.optional(v.number()),
    resolvidoPor: v.optional(v.id("usuarios")),
    movimentosSuspensos: v.array(v.id("movimentos")),
  })
    .index("por_demanda", ["demandaId"])
    .index("por_estado", ["estado"])
    .index("por_responsavel_desbloqueio", ["responsavelDesbloqueioId", "estado"]),

  aprovacoes: defineTable({
    demandaId: v.id("demandas"),
    movimentoId: v.id("movimentos"),
    descricao: v.string(),
    valor: v.optional(v.number()),
    aprovadorId: v.id("usuarios"),
    estado: v.union(
      v.literal("PENDENTE"),
      v.literal("APROVADA"),
      v.literal("RECUSADA"),
    ),
    solicitadoEm: v.number(),
    decididoEm: v.optional(v.number()),
    justificativa: v.optional(v.string()),
  })
    .index("por_demanda", ["demandaId"])
    .index("por_aprovador_estado", ["aprovadorId", "estado"]),

  sinais: defineTable({
    // A chave lógica é o que permite reconciliar sem duplicar.
    chave: v.string(),
    tipo: v.string(),
    nivel: v.union(
      v.literal("CRITICO"),
      v.literal("ALTO"),
      v.literal("MEDIO"),
      v.literal("INFO"),
    ),
    mensagem: v.string(),
    demandaId: v.optional(v.id("demandas")),
    movimentoId: v.optional(v.id("movimentos")),
    impedimentoId: v.optional(v.id("impedimentos")),
    recorrenciaId: v.optional(v.id("recorrencias")),
    destinatarioId: v.optional(v.id("usuarios")),
    estado: v.union(v.literal("ATIVO"), v.literal("RESOLVIDO")),
    criadoEm: v.number(),
    resolvidoEm: v.optional(v.number()),
    dados: v.any(),
  })
    .index("por_chave_estado", ["chave", "estado"])
    .index("por_estado", ["estado"])
    .index("por_destinatario_estado", ["destinatarioId", "estado"])
    .index("por_demanda_estado", ["demandaId", "estado"]),

  recorrencias: defineTable({
    titulo: v.string(),
    descricao: v.string(),
    categoriaId: v.id("categorias"),
    localId: v.id("locais"),
    responsavelPadraoId: v.optional(v.id("usuarios")),
    intervaloDias: v.number(),
    avisarAntesDias: v.number(),
    proximaExecucao: v.number(),
    ultimaExecucao: v.optional(v.number()),
    ativo: v.boolean(),
    criadoEm: v.number(),
  }).index("por_ativo_proxima", ["ativo", "proximaExecucao"]),

  // Append-only. Nenhuma mutation deve remover documentos desta tabela.
  eventos: defineTable({
    demandaId: v.optional(v.id("demandas")),
    tipo: v.string(),
    descricao: v.string(),
    autorId: v.optional(v.id("usuarios")),
    criadoEm: v.number(),
    dados: v.any(),
  })
    .index("por_demanda", ["demandaId", "criadoEm"])
    .index("por_tipo", ["tipo", "criadoEm"]),

  comentarios: defineTable({
    demandaId: v.id("demandas"),
    autorId: v.id("usuarios"),
    texto: v.string(),
    criadoEm: v.number(),
    visivelSolicitante: v.boolean(),
    perguntaPara: v.optional(v.id("usuarios")),
    respondidoEm: v.optional(v.number()),
  }).index("por_demanda", ["demandaId"]),

  anexos: defineTable({
    demandaId: v.id("demandas"),
    movimentoId: v.optional(v.id("movimentos")),
    nome: v.string(),
    mimeType: v.string(),
    tamanho: v.number(),
    // No Convex, trocar por v.id("_storage") e usar o file storage nativo.
    storageId: v.optional(v.string()),
    conteudo: v.optional(v.string()),
    autorId: v.id("usuarios"),
    criadoEm: v.number(),
    legenda: v.optional(v.string()),
  }).index("por_demanda", ["demandaId"]),
});
