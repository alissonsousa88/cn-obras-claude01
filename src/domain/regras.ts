/**
 * Parâmetros operacionais do CN Obras.
 *
 * Ficam concentrados aqui para que o comportamento do sistema seja auditável e
 * ajustável sem caçar números mágicos espalhados pelos motores.
 */

export const HORA = 60 * 60 * 1000;
export const DIA = 24 * HORA;

export const REGRAS = {
  /** Regra definida no domínio: toda demanda nova é triada em até 24 horas. */
  triagemHoras: 24,

  /** A partir de quantas horas antes do prazo o sistema emite sinal preventivo. */
  prazoProximoHoras: 48,

  /** Sem nenhum avanço por este período, a demanda é considerada parada. */
  paradaDias: {
    CRITICA: 1,
    ALTA: 2,
    MEDIA: 4,
    BAIXA: 7,
  } as const,

  /** Impedimento aberto por mais tempo que isto vira sinal de bloqueio prolongado. */
  impedimentoProlongadoDias: 5,

  /** Janela e limiar para detecção de reincidência (mesmo local + categoria). */
  reincidencia: {
    janelaDias: 90,
    ocorrenciasMinimas: 3,
  },

  /** Aprovação parada além disso escala de nível. */
  aprovacaoPendenteHoras: 48,

  /** Prazos-padrão sugeridos por tipo de movimento, em horas. */
  prazoPadraoHoras: {
    TRIAGEM: 24,
    DIAGNOSTICO: 48,
    ORCAMENTO: 72,
    APROVACAO: 48,
    EXECUCAO: 72,
    VALIDACAO: 48,
    RETORNO_SOLICITANTE: 24,
    DESBLOQUEIO: 48,
  } as const,

  /** Quanto tempo uma conclusão continua sendo exibida como "recente". */
  concluidoRecenteDias: 7,
} as const;

/** Pesos do Motor de Prioridade. Score final é normalizado em 0-100. */
export const PESOS_PRIORIDADE = {
  seguranca: 30,
  risco: 18,
  operacaoComprometida: 16,
  categoriaRiscoPorPonto: 5,
  localCritico: 8,
  /** Escala logarítmica: público grande pesa, mas não domina o cálculo. */
  pessoasAfetadasMax: 14,
  eventoProximoMax: 12,
  /** Espera acumulada sem conclusão: evita que demandas baixas fiquem eternas. */
  esperaMax: 10,
  reincidenciaPorOcorrencia: 4,
  reincidenciaMax: 12,
} as const;

export const LIMIARES_PRIORIDADE = {
  CRITICA: 70,
  ALTA: 48,
  MEDIA: 26,
} as const;

export const NIVEL_SINAL_ORDEM = {
  CRITICO: 0,
  ALTO: 1,
  MEDIO: 2,
  INFO: 3,
} as const;

export const NIVEL_PRIORIDADE_ORDEM = {
  CRITICA: 0,
  ALTA: 1,
  MEDIA: 2,
  BAIXA: 3,
} as const;
