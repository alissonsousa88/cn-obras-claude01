/**
 * Microcopy do sistema.
 *
 * Toda a linguagem visível é operacional, não técnica: "Prazo ultrapassado" em
 * vez de "SLA violation", "Impedimento" em vez de "blocker".
 */
import type {
  EstadoDemanda,
  EstadoMovimento,
  NivelPrioridade,
  NivelSinal,
  Papel,
  TipoImpedimento,
  TipoMovimento,
  TipoSinal,
  TipoEvento,
} from "./tipos";

export const ROTULO_ESTADO: Record<EstadoDemanda, string> = {
  NOVA: "Nova solicitação",
  EM_TRIAGEM: "Em triagem",
  EM_DIAGNOSTICO: "Em diagnóstico",
  EM_PLANEJAMENTO: "Definindo solução",
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  EM_EXECUCAO: "Em execução",
  EM_VALIDACAO: "Validando resultado",
  BLOQUEADA: "Bloqueada",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

export const ROTULO_PRIORIDADE: Record<NivelPrioridade, string> = {
  CRITICA: "Crítica",
  ALTA: "Alta",
  MEDIA: "Média",
  BAIXA: "Baixa",
};

export const ROTULO_TIPO_MOVIMENTO: Record<TipoMovimento, string> = {
  TRIAGEM: "Triagem",
  DIAGNOSTICO: "Diagnóstico",
  ORCAMENTO: "Orçamento",
  APROVACAO: "Aprovação",
  EXECUCAO: "Execução",
  VALIDACAO: "Validação",
  RETORNO_SOLICITANTE: "Retorno ao solicitante",
  DESBLOQUEIO: "Desbloqueio",
};

export const ROTULO_ESTADO_MOVIMENTO: Record<EstadoMovimento, string> = {
  PENDENTE: "A fazer",
  SUSPENSO: "Suspenso por impedimento",
  CONCLUIDO: "Concluído",
  CANCELADO: "Cancelado",
};

export const ROTULO_IMPEDIMENTO: Record<TipoImpedimento, string> = {
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  AGUARDANDO_FORNECEDOR: "Aguardando fornecedor",
  AGUARDANDO_MATERIAL: "Aguardando material",
  AGUARDANDO_ACESSO: "Aguardando acesso ao local",
  FALTA_INFORMACAO: "Falta informação",
  DEPENDENCIA: "Depende de outra atividade",
  RESTRICAO_FINANCEIRA: "Restrição financeira",
};

export const ROTULO_SINAL: Record<TipoSinal, string> = {
  TRIAGEM_PENDENTE: "Aguardando triagem",
  PRAZO_PROXIMO: "Prazo próximo",
  PRAZO_VENCIDO: "Prazo ultrapassado",
  DEMANDA_PARADA: "Demanda parada",
  SEM_PROXIMO_MOVIMENTO: "Sem próximo passo definido",
  IMPEDIMENTO_PROLONGADO: "Bloqueio prolongado",
  IMPEDIMENTO_SEM_REVISAO: "Impedimento sem revisão",
  APROVACAO_PENDENTE: "Aprovação aguardando decisão",
  RETORNO_NECESSARIO: "Retorno necessário",
  RECORRENCIA_PROXIMA: "Manutenção preventiva próxima",
  RECORRENCIA_ATRASADA: "Manutenção preventiva atrasada",
  REINCIDENCIA: "Problema reincidente",
  SEM_RESPONSAVEL: "Sem responsável definido",
};

export const ROTULO_NIVEL_SINAL: Record<NivelSinal, string> = {
  CRITICO: "Crítico",
  ALTO: "Alto",
  MEDIO: "Atenção",
  INFO: "Informativo",
};

export const ROTULO_PAPEL: Record<Papel, string> = {
  SOLICITANTE: "Solicitante",
  OPERACAO: "Equipe operacional",
  LIDERANCA: "Liderança",
};

export const ROTULO_EVENTO: Record<TipoEvento, string> = {
  DEMANDA_CRIADA: "Demanda aberta",
  TRIAGEM_REALIZADA: "Triagem concluída",
  RESPONSAVEL_ALTERADO: "Responsável alterado",
  PRIORIDADE_ALTERADA: "Prioridade alterada",
  MOVIMENTO_CRIADO: "Próximo passo definido",
  MOVIMENTO_CONCLUIDO: "Passo concluído",
  MOVIMENTO_SUSPENSO: "Passo suspenso",
  MOVIMENTO_RETOMADO: "Passo retomado",
  MOVIMENTO_CANCELADO: "Passo cancelado",
  IMPEDIMENTO_REGISTRADO: "Impedimento registrado",
  IMPEDIMENTO_RESOLVIDO: "Impedimento resolvido",
  PRAZO_ALTERADO: "Prazo alterado",
  APROVACAO_SOLICITADA: "Aprovação solicitada",
  APROVACAO_DECIDIDA: "Aprovação decidida",
  COMENTARIO_ADICIONADO: "Comentário",
  ANEXO_ADICIONADO: "Anexo adicionado",
  DEMANDA_CONCLUIDA: "Demanda concluída",
  DEMANDA_REABERTA: "Demanda reaberta",
  DEMANDA_CANCELADA: "Demanda cancelada",
  SINAL_ABERTO: "Sinal aberto",
  SINAL_RESOLVIDO: "Sinal resolvido",
  RECORRENCIA_GERADA: "Nova ocorrência programada",
  REINCIDENCIA_IDENTIFICADA: "Reincidência identificada",
};
