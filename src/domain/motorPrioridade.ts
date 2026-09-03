/**
 * MOTOR DE PRIORIDADE
 *
 * Prioridade não é um campo digitado à mão. É o resultado de fatores
 * observáveis da operação: segurança, risco, impacto no uso do espaço, público
 * afetado, proximidade de evento, tempo de espera e reincidência.
 *
 * O usuário mantém autoridade para sobrepor o cálculo — mas a sobreposição
 * exige justificativa e é registrada no histórico (ver serviço de demandas).
 */
import { DIA, LIMIARES_PRIORIDADE, PESOS_PRIORIDADE } from "./regras";
import type {
  Categoria,
  Demanda,
  FatoresPrioridade,
  Instante,
  Local,
  NivelPrioridade,
  Prioridade,
} from "./tipos";

export interface EntradaPrioridade {
  fatores: FatoresPrioridade;
  categoria: Categoria;
  local: Local;
  /** Desde quando a demanda espera. */
  abertaEm: Instante;
  agora: Instante;
  /** Ocorrências semelhantes na janela de reincidência. */
  reincidencias: number;
}

export interface ContribuicaoPrioridade {
  fator: string;
  pontos: number;
  /** Frase pronta para exibição: "Envolve segurança". */
  explicacao: string;
}

export interface CalculoPrioridade {
  nivel: NivelPrioridade;
  score: number;
  contribuicoes: ContribuicaoPrioridade[];
  justificativa: string;
}

function arredondar(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Converte pessoas afetadas em pontos com curva logarítmica: 10 pessoas pesam,
 * 400 pesam mais, mas não anulam os demais fatores.
 */
function pontosPublico(pessoas: number): number {
  if (pessoas <= 0) return 0;
  const escala = Math.log10(Math.min(pessoas, 1000) + 1) / 3;
  return arredondar(escala * PESOS_PRIORIDADE.pessoasAfetadasMax);
}

/** Evento em 24h pesa cheio; a mais de 7 dias, não pesa. */
function pontosEvento(eventoEm: Instante | undefined, agora: Instante): number {
  if (!eventoEm) return 0;
  const faltam = eventoEm - agora;
  if (faltam < 0) return 0;
  const dias = faltam / DIA;
  if (dias > 7) return 0;
  const proximidade = 1 - Math.min(dias, 7) / 7;
  return arredondar(proximidade * PESOS_PRIORIDADE.eventoProximoMax);
}

/** Espera acumulada: impede que demandas de baixa prioridade fiquem eternas. */
function pontosEspera(abertaEm: Instante, agora: Instante): number {
  const dias = Math.max(0, (agora - abertaEm) / DIA);
  const proporcao = Math.min(dias, 14) / 14;
  return arredondar(proporcao * PESOS_PRIORIDADE.esperaMax);
}

export function calcularPrioridade(entrada: EntradaPrioridade): CalculoPrioridade {
  const { fatores, categoria, local, abertaEm, agora, reincidencias } = entrada;
  const contribuicoes: ContribuicaoPrioridade[] = [];

  const registrar = (fator: string, pontos: number, explicacao: string) => {
    if (pontos > 0) contribuicoes.push({ fator, pontos, explicacao });
  };

  if (fatores.seguranca) {
    registrar("seguranca", PESOS_PRIORIDADE.seguranca, "Envolve segurança de pessoas");
  }
  if (fatores.risco) {
    registrar("risco", PESOS_PRIORIDADE.risco, "Há risco de dano maior se não for tratado");
  }
  if (fatores.operacaoComprometida) {
    registrar(
      "operacao",
      PESOS_PRIORIDADE.operacaoComprometida,
      "Impede o uso normal do espaço",
    );
  }

  const pontosCategoria = categoria.pesoRisco * PESOS_PRIORIDADE.categoriaRiscoPorPonto;
  registrar("categoria", pontosCategoria, `Categoria ${categoria.nome} tem risco intrínseco`);

  if (local.critico) {
    registrar("local", PESOS_PRIORIDADE.localCritico, `${local.nome} é um local crítico`);
  }

  const pessoas = fatores.pessoasAfetadas || local.publicoTipico;
  registrar("publico", pontosPublico(pessoas), `Cerca de ${pessoas} pessoas afetadas`);

  const evento = pontosEvento(fatores.eventoProximoEm, agora);
  registrar("evento", evento, "Existe evento próximo dependendo deste local");

  const espera = pontosEspera(abertaEm, agora);
  const diasEspera = Math.floor((agora - abertaEm) / DIA);
  registrar(
    "espera",
    espera,
    `Aguardando há ${diasEspera} dia${diasEspera === 1 ? "" : "s"}`,
  );

  const pontosReincidencia = Math.min(
    reincidencias * PESOS_PRIORIDADE.reincidenciaPorOcorrencia,
    PESOS_PRIORIDADE.reincidenciaMax,
  );
  registrar(
    "reincidencia",
    pontosReincidencia,
    `Problema semelhante já ocorreu ${reincidencias} vez(es) aqui`,
  );

  const bruto = contribuicoes.reduce((soma, c) => soma + c.pontos, 0);
  const score = Math.min(100, Math.round(bruto));

  let nivel: NivelPrioridade = "BAIXA";
  if (score >= LIMIARES_PRIORIDADE.CRITICA) nivel = "CRITICA";
  else if (score >= LIMIARES_PRIORIDADE.ALTA) nivel = "ALTA";
  else if (score >= LIMIARES_PRIORIDADE.MEDIA) nivel = "MEDIA";

  const principais = [...contribuicoes]
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, 3)
    .map((c) => c.explicacao);

  const justificativa =
    principais.length > 0
      ? principais.join(" · ")
      : "Sem fatores de risco ou impacto declarados";

  return { nivel, score, contribuicoes, justificativa };
}

/** Monta o objeto persistido a partir de um cálculo. */
export function prioridadeCalculada(
  calculo: CalculoPrioridade,
  agora: Instante,
): Prioridade {
  return {
    nivel: calculo.nivel,
    score: calculo.score,
    origem: "CALCULADA",
    justificativa: calculo.justificativa,
    definidoEm: agora,
  };
}

/**
 * Recalcula sem descartar um ajuste manual: se a liderança sobrepôs a
 * prioridade, o cálculo continua rodando (para exibir a divergência), mas o
 * nível vigente permanece o escolhido pela pessoa.
 */
export function reconciliarPrioridade(
  demanda: Demanda,
  calculo: CalculoPrioridade,
  agora: Instante,
): Prioridade {
  if (demanda.prioridade.origem === "AJUSTE_MANUAL") {
    return { ...demanda.prioridade, score: calculo.score };
  }
  return prioridadeCalculada(calculo, agora);
}
