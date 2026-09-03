/**
 * MOTOR DE FLUXO
 *
 * Responde à pergunta central do produto:
 *
 *    "Qual é o próximo movimento necessário para essa demanda avançar?"
 *
 * Não é uma máquina de estados rígida. O estado da demanda é *derivado* do que
 * realmente existe (movimentos pendentes, impedimentos ativos, aprovações), e o
 * próximo movimento é decidido a partir do movimento que acabou de ser concluído
 * somada ao contexto (custo, necessidade de aprovação, resultado do diagnóstico).
 *
 * Invariantes que este motor sustenta:
 *   - toda demanda aberta nasce com um movimento de triagem (24h);
 *   - concluir um movimento sempre provoca a análise do próximo;
 *   - execução concluída nunca conclui a demanda: exige validação;
 *   - demanda ativa sem movimento pendente é uma anomalia (vira sinal).
 */
import { HORA, REGRAS } from "./regras";
import type {
  Aprovacao,
  Categoria,
  Demanda,
  EstadoDemanda,
  ID,
  Impedimento,
  Instante,
  Movimento,
  MovimentoSugerido,
  TipoMovimento,
} from "./tipos";

// ---------------------------------------------------------------------------
// Contexto operacional de uma demanda
// ---------------------------------------------------------------------------

export interface ContextoDemanda {
  demanda: Demanda;
  movimentos: Movimento[];
  impedimentos: Impedimento[];
  aprovacoes: Aprovacao[];
  categoria: Categoria;
}

export function movimentosAbertos(movimentos: Movimento[]): Movimento[] {
  return movimentos.filter(
    (m) => m.estado === "PENDENTE" || m.estado === "SUSPENSO",
  );
}

/** O movimento que a equipe deve olhar primeiro: pendente, mais urgente. */
export function movimentoAtual(movimentos: Movimento[]): Movimento | undefined {
  const pendentes = movimentos.filter((m) => m.estado === "PENDENTE");
  if (pendentes.length === 0) {
    return movimentos.find((m) => m.estado === "SUSPENSO");
  }
  return pendentes.sort((a, b) => a.prazo - b.prazo)[0];
}

export function impedimentosAtivos(impedimentos: Impedimento[]): Impedimento[] {
  return impedimentos.filter((i) => i.estado === "ATIVO");
}

export function aprovacoesPendentes(aprovacoes: Aprovacao[]): Aprovacao[] {
  return aprovacoes.filter((a) => a.estado === "PENDENTE");
}

// ---------------------------------------------------------------------------
// Estado derivado
// ---------------------------------------------------------------------------

/**
 * O estado nunca é escolhido livremente por um formulário — ele descreve o que
 * de fato está acontecendo. Isso impede a fraude clássica de "mover o card"
 * sem que nada tenha avançado.
 */
export function estadoDerivado(ctx: ContextoDemanda): EstadoDemanda {
  const { demanda, movimentos, impedimentos, aprovacoes } = ctx;

  if (demanda.estado === "CANCELADA") return "CANCELADA";
  if (demanda.estado === "CONCLUIDA") return "CONCLUIDA";

  if (impedimentosAtivos(impedimentos).length > 0) return "BLOQUEADA";
  if (aprovacoesPendentes(aprovacoes).length > 0) return "AGUARDANDO_APROVACAO";

  const atual = movimentoAtual(movimentos);
  if (!atual) {
    // Sem próximo movimento: o estado anterior é preservado, mas o Motor de
    // Sinais tratará isso como anomalia crítica.
    return demanda.estado === "NOVA" ? "NOVA" : demanda.estado;
  }

  const porTipo: Record<TipoMovimento, EstadoDemanda> = {
    TRIAGEM: "EM_TRIAGEM",
    DIAGNOSTICO: "EM_DIAGNOSTICO",
    ORCAMENTO: "EM_PLANEJAMENTO",
    APROVACAO: "AGUARDANDO_APROVACAO",
    EXECUCAO: "EM_EXECUCAO",
    VALIDACAO: "EM_VALIDACAO",
    RETORNO_SOLICITANTE: "EM_VALIDACAO",
    DESBLOQUEIO: "BLOQUEADA",
  };
  return porTipo[atual.tipo];
}

// ---------------------------------------------------------------------------
// Movimento de abertura
// ---------------------------------------------------------------------------

/**
 * Regra de domínio: uma demanda aberta gera automaticamente um movimento de
 * triagem com prazo de referência de 24 horas. Nenhuma demanda entra no sistema
 * sem direção.
 */
export function movimentoDeTriagem(
  demanda: Demanda,
  responsavelId: ID | undefined,
  agora: Instante,
): MovimentoSugerido {
  return {
    tipo: "TRIAGEM",
    acao: `Triar: ${demanda.titulo}`,
    resultadoEsperado:
      "Prioridade confirmada, responsável definido e próximo passo operacional criado",
    prazoHoras: REGRAS.triagemHoras,
    responsavelId,
    motivo: "Toda demanda nova precisa de uma primeira leitura em até 24 horas",
  };
}

// ---------------------------------------------------------------------------
// Decisão do próximo movimento
// ---------------------------------------------------------------------------

/** Informação que a pessoa registra ao concluir um movimento. */
export interface ConclusaoMovimento {
  /** O que aconteceu. Alimenta a decisão do próximo passo. */
  relato: string;
  /** Preenchido ao concluir triagem/diagnóstico: a causa já é conhecida? */
  causaIdentificada?: boolean;
  /** A solução exige compra/contratação? */
  exigeOrcamento?: boolean;
  /** Custo estimado da solução, quando conhecido. */
  custoEstimado?: number;
  /** Execução: o serviço foi realmente concluído? */
  servicoConcluido?: boolean;
  /** Validação: o problema original foi resolvido? */
  problemaResolvido?: boolean;
  /** Falta informação do solicitante para prosseguir. */
  precisaRetornoSolicitante?: boolean;
  /** Responsável indicado para o próximo passo. */
  proximoResponsavelId?: ID;
}

export interface DecisaoFluxo {
  /** Próximo movimento sugerido, quando o fluxo deve continuar. */
  sugestao?: MovimentoSugerido;
  /** Verdadeiro quando o fluxo chegou ao ponto de registrar o resultado final. */
  prontoParaConclusao: boolean;
  /** Explicação exibida ao usuário sobre por que o sistema decidiu assim. */
  motivo: string;
}

function exigeAprovacao(custo: number | undefined, categoria: Categoria): boolean {
  if (custo === undefined) return false;
  return custo > categoria.tetoSemAprovacao;
}

/**
 * Núcleo do Motor de Fluxo: dado o movimento que acabou de ser concluído e o
 * que foi relatado, qual é o próximo movimento?
 *
 * Retorna sugestão — quem decide criar é o serviço, que registra a origem
 * (AUTOMATICO quando o sistema cria sozinho, SUGESTAO_ACEITA quando a pessoa
 * confirma).
 */
export function sugerirProximoMovimento(
  ctx: ContextoDemanda,
  concluido: Movimento,
  conclusao: ConclusaoMovimento,
): DecisaoFluxo {
  const { demanda, categoria } = ctx;
  const resp = conclusao.proximoResponsavelId ?? demanda.responsavelId;
  const custo = conclusao.custoEstimado ?? demanda.custoEstimado;

  // Falta informação do solicitante: nada avança sem isso, em qualquer etapa.
  if (conclusao.precisaRetornoSolicitante) {
    return {
      sugestao: {
        tipo: "RETORNO_SOLICITANTE",
        acao: "Obter informação faltante com o solicitante",
        resultadoEsperado: "Informação necessária registrada na demanda",
        prazoHoras: REGRAS.prazoPadraoHoras.RETORNO_SOLICITANTE,
        responsavelId: resp,
        motivo: "O próximo passo depende de uma informação que ainda não temos",
      },
      prontoParaConclusao: false,
      motivo: "Falta informação para prosseguir",
    };
  }

  switch (concluido.tipo) {
    case "TRIAGEM": {
      if (conclusao.causaIdentificada === false) {
        return {
          sugestao: {
            tipo: "DIAGNOSTICO",
            acao: `Diagnosticar causa: ${demanda.titulo}`,
            resultadoEsperado: "Causa identificada e solução proposta",
            prazoHoras: REGRAS.prazoPadraoHoras.DIAGNOSTICO,
            responsavelId: resp,
            motivo: "A triagem não conseguiu identificar a causa",
          },
          prontoParaConclusao: false,
          motivo: "Triagem concluída sem causa identificada",
        };
      }
      if (conclusao.exigeOrcamento) {
        return {
          sugestao: {
            tipo: "ORCAMENTO",
            acao: "Levantar orçamento da solução",
            resultadoEsperado: "Orçamento registrado com valor e fornecedor",
            prazoHoras: REGRAS.prazoPadraoHoras.ORCAMENTO,
            responsavelId: resp,
            motivo: "A solução exige compra ou contratação",
          },
          prontoParaConclusao: false,
          motivo: "Triagem indicou necessidade de orçamento",
        };
      }
      if (exigeAprovacao(custo, categoria)) {
        return { ...movimentoAprovacao(custo!, categoria, resp), prontoParaConclusao: false };
      }
      return {
        sugestao: {
          tipo: "EXECUCAO",
          acao: `Executar: ${demanda.titulo}`,
          resultadoEsperado: "Serviço realizado e registrado com evidência",
          prazoHoras: prazoExecucao(categoria),
          responsavelId: resp,
          motivo: "Causa conhecida e solução dentro da alçada da equipe",
        },
        prontoParaConclusao: false,
        motivo: "Triagem concluída: pode executar direto",
      };
    }

    case "DIAGNOSTICO": {
      if (conclusao.exigeOrcamento) {
        return {
          sugestao: {
            tipo: "ORCAMENTO",
            acao: "Levantar orçamento da solução diagnosticada",
            resultadoEsperado: "Orçamento registrado com valor e fornecedor",
            prazoHoras: REGRAS.prazoPadraoHoras.ORCAMENTO,
            responsavelId: resp,
            motivo: "O diagnóstico indicou necessidade de compra ou contratação",
          },
          prontoParaConclusao: false,
          motivo: "Diagnóstico concluído com necessidade de orçamento",
        };
      }
      if (exigeAprovacao(custo, categoria)) {
        return { ...movimentoAprovacao(custo!, categoria, resp), prontoParaConclusao: false };
      }
      return {
        sugestao: {
          tipo: "EXECUCAO",
          acao: `Executar solução: ${demanda.titulo}`,
          resultadoEsperado: "Serviço realizado e registrado com evidência",
          prazoHoras: prazoExecucao(categoria),
          responsavelId: resp,
          motivo: "Causa identificada e solução dentro da alçada da equipe",
        },
        prontoParaConclusao: false,
        motivo: "Diagnóstico concluído",
      };
    }

    case "ORCAMENTO": {
      if (exigeAprovacao(custo, categoria)) {
        return { ...movimentoAprovacao(custo ?? 0, categoria, resp), prontoParaConclusao: false };
      }
      return {
        sugestao: {
          tipo: "EXECUCAO",
          acao: `Executar serviço orçado: ${demanda.titulo}`,
          resultadoEsperado: "Serviço realizado e registrado com evidência",
          prazoHoras: prazoExecucao(categoria),
          responsavelId: resp,
          motivo: "Valor dentro da alçada da equipe, não precisa de aprovação",
        },
        prontoParaConclusao: false,
        motivo: "Orçamento concluído dentro da alçada",
      };
    }

    case "APROVACAO": {
      return {
        sugestao: {
          tipo: "EXECUCAO",
          acao: `Executar serviço aprovado: ${demanda.titulo}`,
          resultadoEsperado: "Serviço realizado e registrado com evidência",
          prazoHoras: prazoExecucao(categoria),
          responsavelId: resp,
          motivo: "Aprovação concedida, execução liberada",
        },
        prontoParaConclusao: false,
        motivo: "Aprovação decidida",
      };
    }

    case "EXECUCAO": {
      if (conclusao.servicoConcluido === false) {
        return {
          sugestao: {
            tipo: "EXECUCAO",
            acao: `Continuar execução: ${demanda.titulo}`,
            resultadoEsperado: "Serviço concluído",
            prazoHoras: REGRAS.prazoPadraoHoras.EXECUCAO,
            responsavelId: resp,
            motivo: "A execução ainda não terminou",
          },
          prontoParaConclusao: false,
          motivo: "Execução parcial",
        };
      }
      // Invariante do domínio: atividade executada ≠ resultado alcançado.
      return {
        sugestao: {
          tipo: "VALIDACAO",
          acao: "Validar se o problema foi realmente resolvido",
          resultadoEsperado:
            "Confirmação de que o problema original deixou de existir",
          prazoHoras: REGRAS.prazoPadraoHoras.VALIDACAO,
          responsavelId: demanda.solicitanteId,
          motivo:
            "A execução foi concluída, mas ainda falta validar se o problema foi resolvido",
        },
        prontoParaConclusao: false,
        motivo: "Execução concluída: falta validar o resultado",
      };
    }

    case "VALIDACAO": {
      if (conclusao.problemaResolvido === false) {
        return {
          sugestao: {
            tipo: "DIAGNOSTICO",
            acao: `Reavaliar: a solução aplicada não resolveu`,
            resultadoEsperado: "Nova causa identificada e nova solução proposta",
            prazoHoras: REGRAS.prazoPadraoHoras.DIAGNOSTICO,
            responsavelId: resp,
            motivo: "A validação apontou que o problema continua",
          },
          prontoParaConclusao: false,
          motivo: "Validação reprovada: o problema persiste",
        };
      }
      return {
        prontoParaConclusao: true,
        motivo:
          "Problema confirmado como resolvido: registre o resultado para concluir",
      };
    }

    case "RETORNO_SOLICITANTE": {
      return {
        sugestao: {
          tipo: "TRIAGEM",
          acao: `Retomar triagem com a nova informação`,
          resultadoEsperado: "Próximo passo operacional definido",
          prazoHoras: REGRAS.prazoPadraoHoras.TRIAGEM,
          responsavelId: resp,
          motivo: "Com a informação em mãos, a demanda pode ser direcionada",
        },
        prontoParaConclusao: false,
        motivo: "Informação obtida",
      };
    }

    case "DESBLOQUEIO": {
      return {
        prontoParaConclusao: false,
        motivo:
          "Impedimento tratado. Os passos suspensos voltam a ficar disponíveis",
      };
    }
  }
}

function movimentoAprovacao(
  custo: number,
  categoria: Categoria,
  responsavelId: ID | undefined,
): { sugestao: MovimentoSugerido; motivo: string } {
  const valor = custo.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  return {
    sugestao: {
      tipo: "APROVACAO",
      acao: `Aprovar orçamento de ${valor}`,
      resultadoEsperado: "Orçamento aprovado ou recusado, com justificativa",
      prazoHoras: REGRAS.prazoPadraoHoras.APROVACAO,
      responsavelId,
      motivo: `Valor acima do limite de ${categoria.tetoSemAprovacao.toLocaleString(
        "pt-BR",
        { style: "currency", currency: "BRL" },
      )} da categoria ${categoria.nome}`,
    },
    motivo: "Valor exige decisão da liderança",
  };
}

function prazoExecucao(categoria: Categoria): number {
  return Math.min(categoria.prazoResolucaoHoras, REGRAS.prazoPadraoHoras.EXECUCAO * 2);
}

/** Converte uma sugestão em prazo absoluto. */
export function prazoDe(sugestao: MovimentoSugerido, agora: Instante): Instante {
  return agora + sugestao.prazoHoras * HORA;
}

// ---------------------------------------------------------------------------
// Guardas de conclusão
// ---------------------------------------------------------------------------

export interface ChecagemConclusao {
  pode: boolean;
  /** Motivos legíveis que impedem a conclusão. */
  pendencias: string[];
}

/**
 * Regra de domínio: uma demanda não é concluída só porque alguém mudou o
 * status. É preciso não haver pendências abertas e existir resultado registrado.
 */
export function podeConcluir(ctx: ContextoDemanda): ChecagemConclusao {
  const pendencias: string[] = [];

  if (ctx.demanda.estado === "CONCLUIDA") {
    pendencias.push("Esta demanda já está concluída");
  }
  const ativos = impedimentosAtivos(ctx.impedimentos);
  if (ativos.length > 0) {
    pendencias.push(
      `Existe ${ativos.length} impedimento(s) ativo(s) que precisam ser resolvidos`,
    );
  }
  const abertos = movimentosAbertos(ctx.movimentos).filter(
    (m) => m.tipo !== "VALIDACAO",
  );
  if (abertos.length > 0) {
    pendencias.push(
      `${abertos.length} passo(s) ainda em aberto: ${abertos
        .map((m) => m.acao)
        .join("; ")}`,
    );
  }
  // O coração da regra "atividade executada ≠ resultado alcançado": só é
  // possível concluir depois que alguém validou que o problema original
  // deixou de existir. Sem esse passo, "concluído" seria apenas um status.
  const temValidacao = ctx.movimentos.some(
    (m) => m.tipo === "VALIDACAO" && m.estado === "CONCLUIDO",
  );
  if (!temValidacao) {
    const temExecucao = ctx.movimentos.some(
      (m) => m.tipo === "EXECUCAO" && m.estado === "CONCLUIDO",
    );
    pendencias.push(
      temExecucao
        ? "A execução foi concluída, mas ainda falta validar se o problema foi resolvido"
        : "Ninguém validou ainda que o problema foi resolvido",
    );
  }

  return { pode: pendencias.length === 0, pendencias };
}

/**
 * Uma demanda ativa sem nenhum movimento aberto está sem direção — exceto
 * quando o fluxo já chegou ao fim e só falta registrar o resultado. Confundir
 * as duas situações levaria a interface a pedir "defina o próximo passo"
 * quando o passo certo é concluir.
 */
export function semDirecao(ctx: ContextoDemanda): boolean {
  if (ctx.demanda.estado === "CONCLUIDA" || ctx.demanda.estado === "CANCELADA") {
    return false;
  }
  if (impedimentosAtivos(ctx.impedimentos).length > 0) return false;
  if (movimentosAbertos(ctx.movimentos).length > 0) return false;
  return !podeConcluir(ctx).pode;
}
