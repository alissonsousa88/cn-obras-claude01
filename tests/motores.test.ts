/**
 * Testes das regras invioláveis do domínio.
 *
 * Cada teste corresponde a uma das regras da seção 25 do documento de produto.
 * Rodam sobre os serviços reais, não sobre mocks.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { DIA, HORA } from "../src/domain/regras";
import { podeConcluir, semDirecao } from "../src/domain/motorFluxo";
import { montarAtencao } from "../src/domain/motorAtencao";
import { avaliarSinais } from "../src/domain/motorSinais";
import { calcularPrioridade } from "../src/domain/motorPrioridade";
import type { Usuario } from "../src/domain/tipos";
import { decidirAprovacao } from "../src/server/servicos/aprovacoes";
import { contextoDemanda, snapshotDe } from "../src/server/servicos/comum";
import {
  abrirDemanda,
  ajustarPrioridade,
  concluirDemanda,
} from "../src/server/servicos/demandas";
import {
  registrarImpedimento,
  resolverImpedimento,
} from "../src/server/servicos/impedimentos";
import { concluirMovimento } from "../src/server/servicos/movimentos";
import { executarTick } from "../src/server/servicos/tick";
import { construirSeed } from "../src/server/store/seed";
import type { BaseDados } from "../src/server/store/port";

const AGORA = new Date("2026-06-01T09:00:00Z").getTime();

function cenario() {
  const base = construirSeed(AGORA);
  const por = (email: string): Usuario =>
    base.usuarios.find((u) => u.email.startsWith(email))!;
  return {
    base,
    joao: por("joao"),
    carlos: por("carlos"),
    priscila: por("priscila"),
    catId: base.categorias.find((c) => c.slug === "eletrica")!.id,
    localId: base.locais.find((l) => l.nome === "Recepção")!.id,
  };
}

function novaDemanda(c: ReturnType<typeof cenario>, titulo = "Lâmpada queimada no corredor") {
  return abrirDemanda(
    c.base,
    c.priscila,
    { titulo, descricao: "Lâmpada do corredor central parou de acender.", localId: c.localId, categoriaId: c.catId },
    AGORA,
  );
}

function pendente(base: BaseDados, demandaId: string, tipo?: string) {
  return base.movimentos.find(
    (m) => m.demandaId === demandaId && m.estado === "PENDENTE" && (!tipo || m.tipo === tipo),
  );
}

// Regra 2 -------------------------------------------------------------------
test("abrir demanda cria automaticamente um movimento de triagem com 24h", () => {
  const c = cenario();
  const d = novaDemanda(c);
  const triagem = pendente(c.base, d.id, "TRIAGEM");
  assert.ok(triagem, "a triagem deve ser criada automaticamente");
  assert.equal(triagem.origem, "AUTOMATICO");
  assert.equal(triagem.prazo - AGORA, 24 * HORA);
  assert.ok(triagem.responsavelId, "a triagem precisa ter um responsável");
});

// Regra 1 e 3 ---------------------------------------------------------------
test("concluir um movimento provoca a criação do próximo — a demanda nunca fica sem direção", () => {
  const c = cenario();
  const d = novaDemanda(c);
  const triagem = pendente(c.base, d.id, "TRIAGEM")!;

  const r = concluirMovimento(
    c.base,
    c.carlos,
    triagem.id,
    { relato: "Reator queimado, troca simples.", causaIdentificada: true, exigeOrcamento: false },
    { responsavelId: c.carlos.id },
    AGORA + HORA,
  );

  assert.ok(r.criado, "o sistema deve criar o próximo passo sozinho");
  assert.equal(r.criado.tipo, "EXECUCAO");
  assert.equal(r.criado.origem, "AUTOMATICO");
  assert.equal(semDirecao(contextoDemanda(c.base, d.id)), false);
});

// Regra 7 -------------------------------------------------------------------
test("execução concluída não conclui a demanda: exige validação do resultado", () => {
  const c = cenario();
  const d = novaDemanda(c);
  const triagem = pendente(c.base, d.id, "TRIAGEM")!;
  concluirMovimento(c.base, c.carlos, triagem.id,
    { relato: "Troca simples.", causaIdentificada: true, exigeOrcamento: false },
    { responsavelId: c.carlos.id }, AGORA + HORA);

  const exec = pendente(c.base, d.id, "EXECUCAO")!;
  const r = concluirMovimento(c.base, c.carlos, exec.id,
    { relato: "Lâmpada e reator trocados.", servicoConcluido: true }, undefined, AGORA + 2 * HORA);

  assert.equal(r.criado?.tipo, "VALIDACAO", "após executar, o próximo passo é validar");
  const check = podeConcluir(contextoDemanda(c.base, d.id));
  assert.equal(check.pode, false);
  assert.match(check.pendencias.join(" "), /validar/i);
});

// Regra 6 -------------------------------------------------------------------
test("demanda não conclui sem resultado registrado, e não conclui se o problema persiste", () => {
  const c = cenario();
  const d = novaDemanda(c);
  const triagem = pendente(c.base, d.id, "TRIAGEM")!;
  concluirMovimento(c.base, c.carlos, triagem.id,
    { relato: "Troca simples.", causaIdentificada: true, exigeOrcamento: false },
    { responsavelId: c.carlos.id }, AGORA + HORA);
  const exec = pendente(c.base, d.id, "EXECUCAO")!;
  concluirMovimento(c.base, c.carlos, exec.id,
    { relato: "Trocado.", servicoConcluido: true }, undefined, AGORA + 2 * HORA);
  const val = pendente(c.base, d.id, "VALIDACAO")!;
  concluirMovimento(c.base, c.priscila, val.id,
    { relato: "Acende normalmente.", problemaResolvido: true }, undefined, AGORA + 3 * HORA);

  assert.throws(
    () => concluirDemanda(c.base, c.carlos, d.id,
      { oQueFoiFeito: "", problemaResolvido: true, resultadoObtido: "Resolvido" }, AGORA + 4 * HORA),
    /o que foi realizado/i,
  );
  assert.throws(
    () => concluirDemanda(c.base, c.carlos, d.id,
      { oQueFoiFeito: "Troquei a lâmpada e o reator", problemaResolvido: false, resultadoObtido: "Continua apagada" },
      AGORA + 4 * HORA),
    /não pode ser concluída/i,
  );

  concluirDemanda(c.base, c.carlos, d.id, {
    oQueFoiFeito: "Lâmpada e reator substituídos",
    problemaResolvido: true,
    resultadoObtido: "Corredor iluminado normalmente",
  }, AGORA + 4 * HORA);

  const alvo = c.base.demandas.find((x) => x.id === d.id)!;
  assert.equal(alvo.estado, "CONCLUIDA");
  assert.ok(alvo.resultado?.resultadoObtido);
});

// Regra 8 (validação reprovada devolve ao fluxo) ----------------------------
test("validação reprovada devolve a demanda ao diagnóstico em vez de concluir", () => {
  const c = cenario();
  const d = novaDemanda(c);
  const triagem = pendente(c.base, d.id, "TRIAGEM")!;
  concluirMovimento(c.base, c.carlos, triagem.id,
    { relato: "Troca simples.", causaIdentificada: true, exigeOrcamento: false },
    { responsavelId: c.carlos.id }, AGORA + HORA);
  const exec = pendente(c.base, d.id, "EXECUCAO")!;
  concluirMovimento(c.base, c.carlos, exec.id,
    { relato: "Trocado.", servicoConcluido: true }, undefined, AGORA + 2 * HORA);
  const val = pendente(c.base, d.id, "VALIDACAO")!;
  const r = concluirMovimento(c.base, c.priscila, val.id,
    { relato: "Continua piscando.", problemaResolvido: false }, undefined, AGORA + 3 * HORA);

  assert.equal(r.criado?.tipo, "DIAGNOSTICO");
  assert.equal(r.decisao.prontoParaConclusao, false);
});

// Regra 4 e 5 ---------------------------------------------------------------
test("impedimento exige responsável e revisão, suspende a execução e a retoma ao ser resolvido", () => {
  const c = cenario();
  const d = novaDemanda(c);
  const triagem = pendente(c.base, d.id, "TRIAGEM")!;
  concluirMovimento(c.base, c.carlos, triagem.id,
    { relato: "Precisa de peça.", causaIdentificada: true, exigeOrcamento: false },
    { responsavelId: c.carlos.id }, AGORA + HORA);
  const exec = pendente(c.base, d.id, "EXECUCAO")!;

  assert.throws(
    () => registrarImpedimento(c.base, c.carlos, d.id,
      { tipo: "AGUARDANDO_MATERIAL", descricao: "Sem reator no estoque",
        responsavelDesbloqueioId: "inexistente", dataRevisao: AGORA + 3 * DIA }, AGORA + 2 * HORA),
    /desbloquear/i,
  );

  const imp = registrarImpedimento(c.base, c.carlos, d.id,
    { tipo: "AGUARDANDO_MATERIAL", descricao: "Sem reator no estoque",
      responsavelDesbloqueioId: c.joao.id, dataRevisao: AGORA + 3 * DIA }, AGORA + 2 * HORA);

  assert.equal(c.base.movimentos.find((m) => m.id === exec.id)!.estado, "SUSPENSO");
  assert.equal(contextoDemanda(c.base, d.id).demanda.estado, "BLOQUEADA");
  assert.ok(pendente(c.base, d.id, "DESBLOQUEIO"), "o desbloqueio vira trabalho com dono");

  resolverImpedimento(c.base, c.joao, imp.id, "Reator comprado na loja da esquina.", AGORA + 2 * DIA);
  assert.equal(c.base.movimentos.find((m) => m.id === exec.id)!.estado, "PENDENTE");
  assert.notEqual(contextoDemanda(c.base, d.id).demanda.estado, "BLOQUEADA");
});

// Regra 5/6 do Motor de Sinais ---------------------------------------------
test("prazo vencido e prazo próximo geram sinais; demanda sem movimento gera sinal crítico", () => {
  const c = cenario();
  const d = novaDemanda(c);
  const triagem = pendente(c.base, d.id, "TRIAGEM")!;

  const preventivo = avaliarSinais(snapshotDe(c.base, triagem.prazo - 6 * HORA));
  assert.ok(preventivo.some((s) => s.tipo === "PRAZO_PROXIMO" && s.movimentoId === triagem.id));

  const vencido = avaliarSinais(snapshotDe(c.base, triagem.prazo + 2 * HORA));
  assert.ok(vencido.some((s) => s.tipo === "PRAZO_VENCIDO" && s.movimentoId === triagem.id));

  triagem.estado = "CANCELADO";
  const orfa = avaliarSinais(snapshotDe(c.base, AGORA + HORA));
  const sinal = orfa.find((s) => s.tipo === "SEM_PROXIMO_MOVIMENTO" && s.demandaId === d.id);
  assert.ok(sinal, "demanda ativa sem próximo passo precisa gerar sinal");
  assert.equal(sinal.nivel, "CRITICO");
});

// Regra 10 ------------------------------------------------------------------
test("sinal resolvido deixa de aparecer como ativo", () => {
  const c = cenario();
  const d = novaDemanda(c);
  const triagem = pendente(c.base, d.id, "TRIAGEM")!;

  executarTick(c.base, triagem.prazo + 3 * HORA);
  const chave = `PRAZO_VENCIDO:${triagem.id}`;
  assert.ok(c.base.sinais.some((s) => s.chave === chave && s.estado === "ATIVO"));

  concluirMovimento(c.base, c.carlos, triagem.id,
    { relato: "Triado.", causaIdentificada: true, exigeOrcamento: false },
    { responsavelId: c.carlos.id }, triagem.prazo + 4 * HORA);

  const sinal = c.base.sinais.find((s) => s.chave === chave)!;
  assert.equal(sinal.estado, "RESOLVIDO");
  assert.ok(sinal.resolvidoEm, "o instante da resolução fica registrado");
  // Não duplica ao reprocessar.
  executarTick(c.base, triagem.prazo + 5 * HORA);
  assert.equal(c.base.sinais.filter((s) => s.chave === chave && s.estado === "ATIVO").length, 0);
});

// Aprovação -----------------------------------------------------------------
test("orçamento acima do teto exige aprovação da liderança e libera a execução ao ser aprovado", () => {
  const c = cenario();
  const d = novaDemanda(c);
  const triagem = pendente(c.base, d.id, "TRIAGEM")!;
  concluirMovimento(c.base, c.carlos, triagem.id,
    { relato: "Precisa trocar o quadro inteiro.", causaIdentificada: true, exigeOrcamento: true },
    { responsavelId: c.carlos.id }, AGORA + HORA);

  const orc = pendente(c.base, d.id, "ORCAMENTO")!;
  const r = concluirMovimento(c.base, c.carlos, orc.id,
    { relato: "Orçado com fornecedor.", custoEstimado: 2400 }, undefined, AGORA + 2 * HORA);

  assert.equal(r.criado?.tipo, "APROVACAO");
  const aprovacao = c.base.aprovacoes.find((a) => a.demandaId === d.id && a.estado === "PENDENTE");
  assert.ok(aprovacao, "a aprovação precisa existir como decisão com dono");
  assert.equal(aprovacao.aprovadorId, c.joao.id);

  decidirAprovacao(c.base, c.joao, aprovacao.id, true, "Aprovado, é questão de segurança.", AGORA + 3 * HORA);
  assert.equal(c.base.aprovacoes.find((a) => a.id === aprovacao.id)!.estado, "APROVADA");
  assert.ok(pendente(c.base, d.id, "EXECUCAO"), "aprovar libera a execução");
});

test("recusa de aprovação não deixa a demanda parada: cria replanejamento", () => {
  const c = cenario();
  const d = novaDemanda(c);
  const triagem = pendente(c.base, d.id, "TRIAGEM")!;
  concluirMovimento(c.base, c.carlos, triagem.id,
    { relato: "Precisa trocar o quadro.", causaIdentificada: true, exigeOrcamento: true },
    { responsavelId: c.carlos.id }, AGORA + HORA);
  const orc = pendente(c.base, d.id, "ORCAMENTO")!;
  concluirMovimento(c.base, c.carlos, orc.id,
    { relato: "Orçado.", custoEstimado: 2400 }, undefined, AGORA + 2 * HORA);
  const ap = c.base.aprovacoes.find((a) => a.demandaId === d.id && a.estado === "PENDENTE")!;

  decidirAprovacao(c.base, c.joao, ap.id, false, "Valor alto, buscar outra proposta.", AGORA + 3 * HORA);
  assert.equal(semDirecao(contextoDemanda(c.base, d.id)), false);
  assert.ok(pendente(c.base, d.id, "ORCAMENTO"), "a recusa gera um novo passo de replanejamento");
});

// Regra 9 -------------------------------------------------------------------
test("recorrência vencida abre ocorrência sozinha e reprograma a próxima", () => {
  const c = cenario();
  const rec = c.base.recorrencias.find((r) => r.titulo.startsWith("Limpeza técnica"))!;
  const anterior = rec.proximaExecucao;
  const antes = c.base.demandas.length;

  executarTick(c.base, anterior + HORA);

  assert.equal(c.base.demandas.length, antes + 1);
  const nova = c.base.demandas.at(-1)!;
  assert.equal(nova.recorrenciaId, rec.id);
  assert.ok(rec.proximaExecucao > anterior, "a próxima execução precisa ser reprogramada");
  assert.equal(
    Math.round((rec.proximaExecucao - anterior) / DIA),
    rec.intervaloDias,
    "reprograma a partir do previsto, não da data em que rodou",
  );
});

// Regra 11 ------------------------------------------------------------------
test("prioridade é calculada por fatores e o ajuste manual exige justificativa", () => {
  const c = cenario();
  const categoria = c.base.categorias.find((x) => x.slug === "eletrica")!;
  const local = c.base.locais.find((l) => l.nome === "Templo principal")!;

  const grave = calcularPrioridade({
    fatores: { risco: true, seguranca: true, operacaoComprometida: true, pessoasAfetadas: 800 },
    categoria, local, abertaEm: AGORA, agora: AGORA, reincidencias: 0,
  });
  const leve = calcularPrioridade({
    fatores: { risco: false, seguranca: false, operacaoComprometida: false, pessoasAfetadas: 5 },
    categoria: c.base.categorias.find((x) => x.slug === "pintura")!,
    local: c.base.locais.find((l) => l.nome === "Cozinha / cafeteria")!,
    abertaEm: AGORA, agora: AGORA, reincidencias: 0,
  });
  assert.equal(grave.nivel, "CRITICA");
  assert.ok(grave.score > leve.score);
  assert.ok(grave.justificativa.length > 0, "o cálculo precisa se explicar");

  const d = novaDemanda(c);
  assert.throws(() => ajustarPrioridade(c.base, c.joao, d.id, "CRITICA", "", AGORA), /motivo/i);
  ajustarPrioridade(c.base, c.joao, d.id, "CRITICA", "Vamos receber visitas nesse corredor.", AGORA);
  const alvo = c.base.demandas.find((x) => x.id === d.id)!;
  assert.equal(alvo.prioridade.origem, "AJUSTE_MANUAL");
  assert.ok(c.base.eventos.some((e) => e.tipo === "PRIORIDADE_ALTERADA" && e.demandaId === d.id));
});

// Regra 8 -------------------------------------------------------------------
test("mudanças relevantes geram histórico e o histórico nunca encolhe", () => {
  const c = cenario();
  const antes = c.base.eventos.length;
  const d = novaDemanda(c);
  const triagem = pendente(c.base, d.id, "TRIAGEM")!;
  concluirMovimento(c.base, c.carlos, triagem.id,
    { relato: "Triado.", causaIdentificada: true, exigeOrcamento: false },
    { responsavelId: c.carlos.id }, AGORA + HORA);

  const tipos = c.base.eventos.filter((e) => e.demandaId === d.id).map((e) => e.tipo);
  assert.ok(tipos.includes("DEMANDA_CRIADA"));
  assert.ok(tipos.includes("MOVIMENTO_CRIADO"));
  assert.ok(tipos.includes("TRIAGEM_REALIZADA"));
  assert.ok(c.base.eventos.length > antes);
});

// Regra 12 ------------------------------------------------------------------
test("o Motor de Atenção ordena por urgência e sempre diz quem precisa agir", () => {
  const c = cenario();
  const painel = montarAtencao(snapshotDe(c.base, AGORA), c.joao);
  const itens = [...painel.precisaDeVoce, ...painel.proximas48h, ...painel.operacao];
  assert.ok(itens.length > 0, "o seed precisa produzir situações reais de atenção");

  for (let i = 1; i < painel.precisaDeVoce.length; i += 1) {
    assert.ok(painel.precisaDeVoce[i - 1]!.peso >= painel.precisaDeVoce[i]!.peso);
  }
  for (const item of itens) {
    assert.ok(item.chamadaAcao.length > 0, "todo item precisa dizer o que fazer");
  }
  // A liderança vê a aprovação que está endereçada a ela no bloco de ação.
  assert.ok(
    painel.precisaDeVoce.some((i) => i.sinal.tipo === "APROVACAO_PENDENTE"),
    "aprovação pendente precisa aparecer para quem decide",
  );
});

test("solicitante só enxerga sinais das próprias solicitações", () => {
  const c = cenario();
  const painel = montarAtencao(snapshotDe(c.base, AGORA), c.priscila);
  const todos = [
    ...painel.precisaDeVoce, ...painel.proximas48h,
    ...painel.aguardandoTerceiros, ...painel.operacao,
  ];
  for (const item of todos) {
    if (!item.demanda) continue;
    assert.equal(item.demanda.solicitanteId, c.priscila.id);
  }
});
