/**
 * Teste de ponta a ponta do ciclo operacional completo, pelo navegador.
 *
 * Percorre exatamente os 11 pontos que o documento de produto lista como
 * objetivo da primeira entrega (seção 34), validando que a demanda entra no
 * sistema e o próprio sistema a conduz até a resolução.
 *
 * Uso: node tests/fluxo.e2e.mjs   (com o servidor rodando em localhost:3000)
 */
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SENHA = "cnobras2026";
const passos = [];
let falhas = 0;

async function etapa(nome, fn) {
  try {
    await fn();
    passos.push(`  ok   ${nome}`);
  } catch (e) {
    falhas += 1;
    passos.push(`  FALHA ${nome}\n        ${e.message.split("\n")[0]}`);
    throw e;
  }
}

// O container traz um Chromium pré-instalado; usa-se o binário existente em
// vez de baixar outro.
const EXECUTAVEL =
  process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
// A base é recriada antes do teste: o cenário precisa ser o mesmo em toda
// execução (a demonstração inclui uma aprovação pendente que o teste consome).
const reset = await fetch(`${BASE}/api/demonstracao/reiniciar`, { method: "POST" });
if (!reset.ok) {
  console.error("Não foi possível reiniciar a base de demonstração.");
  process.exit(1);
}

const navegador = await chromium.launch({
  executablePath: existsSync(EXECUTAVEL) ? EXECUTAVEL : undefined,
  args: ["--no-sandbox"],
});
const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
p.setDefaultTimeout(15000);

async function entrar(email) {
  await p.context().clearCookies();
  await p.goto(`${BASE}/login`);
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="senha"]', SENHA);
  await p.click('form button[type="submit"]:has-text("Entrar")');
  await p.waitForURL(`${BASE}/`);
}

try {
  // 1 --------------------------------------------------------------------
  await etapa("1. Abertura de demanda pelo solicitante", async () => {
    await entrar("priscila@cnobras.app");
    await p.goto(`${BASE}/demandas/nova`);
    await p.fill('input[name="titulo"]', "Torneira do lavabo pingando sem parar");
    await p.selectOption('select[name="localId"]', { label: "Cozinha / cafeteria" });
    await p.selectOption('select[name="categoriaId"]', { label: "Hidráulica" });
    await p.fill(
      'textarea[name="descricao"]',
      "A torneira do lavabo da cozinha pinga continuamente desde a semana passada.",
    );
    await p.check('input[name="risco"]');
    await p.click('button[type="submit"]:has-text("Abrir demanda")');
    await p.waitForURL(/\/demandas\/[0-9a-f-]{36}/);
  });

  const urlDemanda = p.url().split("?")[0];

  // 2 e 3 ------------------------------------------------------------------
  await etapa("2/3. Triagem criada automaticamente com prazo de 24h", async () => {
    const texto = await p.locator("body").innerText();
    assert.match(texto, /O que precisa acontecer agora/i);
    assert.match(texto, /Triar: Torneira do lavabo/i);
    assert.match(texto, /definido pelo sistema/i);
    assert.match(texto, /Vence /i);
  });

  await etapa("Prioridade foi calculada, não digitada", async () => {
    const texto = await p.locator("body").innerText();
    assert.match(texto, /Por que esta prioridade:/i);
    assert.match(texto, /piorar|risco|pessoas|Hidráulica|Aguardando/i);
  });

  // 4 e 5 ------------------------------------------------------------------
  await etapa("4/5. Equipe conclui a triagem e atribui responsável", async () => {
    await entrar("carlos@cnobras.app");
    await p.goto(urlDemanda);
    await p.click('button:has-text("Registrar o que aconteceu")');
    await p.fill(
      'textarea[name="relato"]',
      "Vedação da torneira gasta. Troca simples, temos o reparo no estoque.",
    );
    await p.click('label:has-text("Sim, sei o que precisa ser feito")');
    await p.click('label:has-text("Não, resolvemos com o que temos")');
    await p.selectOption('select[name="responsavelId"]', { label: "Carlos Menezes" });
    await p.click('button[type="submit"]:has-text("Concluir passo")');
    await p.waitForSelector("text=/Próximo passo criado/i");
  });

  await etapa("Motor de Fluxo criou a execução sozinho e explicou o motivo", async () => {
    const texto = await p.locator("body").innerText();
    assert.match(texto, /Próximo passo criado: Executar/i);
    assert.match(texto, /Motivo: .*alçada da equipe/i);
  });

  // 6 ----------------------------------------------------------------------
  await etapa("6. Registro de impedimento suspende a execução", async () => {
    await p.reload();
    await p.click('summary:has-text("Registrar um impedimento")');
    await p.selectOption('select[name="tipo"]', { label: "Aguardando material" });
    await p.selectOption('select[name="responsavelDesbloqueioId"]', {
      label: "João Ribeiro",
    });
    await p.fill(
      'textarea[name="descricao"]',
      "O reparo do estoque não serve nesse modelo. Precisa comprar.",
    );
    await p.click('button[type="submit"]:has-text("Registrar impedimento")');
    await p.waitForSelector("text=/Bloqueada/i");
    const texto = await p.locator("body").innerText();
    assert.match(texto, /Precisa destravar: João Ribeiro/i);
    // O desbloqueio vira o próximo movimento, com dono e prazo: a demanda
    // bloqueada continua tendo direção operacional.
    assert.match(texto, /Destravar: O reparo do estoque/i);
  });

  // 7 e 8 ------------------------------------------------------------------
  await etapa("7/8. Sinal chega a quem precisa destravar", async () => {
    await entrar("joao@cnobras.app");
    const texto = await p.locator("body").innerText();
    assert.match(texto, /Precisa da sua atenção/i);
    await p.goto(`${BASE}/atencao`);
    const atencao = await p.locator("body").innerText();
    assert.match(atencao, /reparo do estoque não serve|Destravar/i);
  });

  await etapa("Desbloqueio retoma a execução automaticamente", async () => {
    await p.goto(urlDemanda);
    await p.click('button:has-text("Registrar desbloqueio")');
    await p.fill('textarea[name="resolucao"]', "Reparo comprado e entregue ao Carlos.");
    await p.click('button[type="submit"]:has-text("Destravar")');
    await p.waitForSelector("text=/O que precisa acontecer agora/i");
    const texto = await p.locator("body").innerText();
    assert.match(texto, /Executar: Torneira do lavabo/i);
    assert.doesNotMatch(texto, /Próximo passo suspenso/i);
  });

  // Execução ---------------------------------------------------------------
  await etapa("Execução concluída NÃO conclui a demanda: exige validação", async () => {
    await entrar("carlos@cnobras.app");
    await p.goto(urlDemanda);
    await p.click('button:has-text("Registrar o que aconteceu")');
    await p.fill('textarea[name="relato"]', "Reparo trocado e torneira testada.");
    await p.click('label:has-text("Sim, terminei")');
    await p.click('button[type="submit"]:has-text("Concluir passo")');
    await p.waitForSelector("text=/Próximo passo criado/i");
    const texto = await p.locator("body").innerText();
    assert.match(texto, /Validar se o problema foi realmente resolvido/i);
    assert.match(texto, /falta validar/i);
  });

  // 9, 10 ------------------------------------------------------------------
  await etapa("9/10. Validação pelo solicitante e conclusão com resultado", async () => {
    await entrar("priscila@cnobras.app");
    await p.goto(urlDemanda);
    await p.click('button:has-text("Registrar o que aconteceu")');
    await p.fill('textarea[name="relato"]', "Passei lá hoje, não pinga mais.");
    await p.click('label:has-text("Sim, resolvido")');
    await p.click('button[type="submit"]:has-text("Concluir passo")');
    // O solicitante não conclui a demanda; a tela dele passa a dizer que o
    // que falta é o registro do resultado.
    await p.waitForSelector("text=/Registrar o resultado para concluir/i");

    await entrar("carlos@cnobras.app");
    await p.goto(urlDemanda);
    await p.click('button:has-text("Registrar resultado e concluir")');
    await p.fill('textarea[name="oQueFoiFeito"]', "Reparo interno da torneira substituído");
    await p.fill(
      'textarea[name="resultadoObtido"]',
      "Torneira sem vazamento e sem desperdício de água",
    );
    await p.check('input[name="problemaResolvido"]');
    await p.click('button[type="submit"]:has-text("Concluir demanda")');
    // Aguarda o texto do resultado em si, não a palavra "Resultado" — que já
    // aparece na tela como "Resultado esperado" do passo.
    await p.waitForSelector("text=/Torneira sem vazamento/i");
    const texto = await p.locator("body").innerText();
    assert.match(texto, /Concluída/i);
    assert.match(texto, /Reparo interno da torneira substituído/i);
  });

  // 11 ---------------------------------------------------------------------
  await etapa("11. Histórico completo do ciclo", async () => {
    await p.click("summary:has-text('Ver todos')");
    const texto = await p.locator("body").innerText();
    for (const esperado of [
      "Demanda aberta",
      "Triagem concluída",
      "Impedimento registrado",
      "Impedimento resolvido",
      "Passo concluído",
      "Demanda concluída",
    ]) {
      assert.ok(texto.includes(esperado), `histórico sem "${esperado}"`);
    }
  });

  // Aprovação --------------------------------------------------------------
  await etapa("Fluxo de aprovação: liderança decide e libera a execução", async () => {
    await entrar("joao@cnobras.app");
    await p.goto(`${BASE}/demandas?q=Iluminação`);
    await p.click("text=Iluminação da sala infantil");
    await p.waitForSelector("text=/Aguardando sua decisão/i");
    const antes = await p.locator("body").innerText();
    assert.match(antes, /Aprovar orçamento de R\$\s1\.280,00/);
    await p.fill('textarea[name="justificativa"]', "Aprovado: é segurança das crianças.");
    await p.click('button[value="aprovar"]');
    // Espera o passo que a aprovação libera, e não o cabeçalho genérico — que
    // já estava na tela descrevendo o próprio passo de aprovação.
    await p.waitForSelector("text=/Executar serviço aprovado/i");
    const depois = await p.locator("body").innerText();
    assert.doesNotMatch(depois, /Aguardando sua decisão/i);
  });

  // Permissões -------------------------------------------------------------
  await etapa("Solicitante enxerga apenas as próprias solicitações", async () => {
    await entrar("rafael@cnobras.app");
    await p.goto(`${BASE}/demandas`);
    const texto = await p.locator("body").innerText();
    assert.doesNotMatch(texto, /Cadeiras quebradas/i, "viu demanda de outro solicitante");
    assert.match(texto, /Ar-condicionado|Porta do estacionamento|Repintar/i);
  });

  // Mobile -----------------------------------------------------------------
  await etapa("Experiência mobile: navegação inferior e ações em campo", async () => {
    const mob = await navegador.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const pm = await mob.newPage();
    await pm.goto(`${BASE}/login`);
    await pm.fill('input[name="email"]', "carlos@cnobras.app");
    await pm.fill('input[name="senha"]', SENHA);
    await pm.click('form button[type="submit"]:has-text("Entrar")');
    await pm.waitForURL(`${BASE}/`);
    await pm.goto(`${BASE}/minha-operacao`);
    assert.ok(await pm.locator("nav a:has-text('Minhas')").isVisible());
    const larguraCorpo = await pm.evaluate(() => document.body.scrollWidth);
    assert.ok(larguraCorpo <= 390, `rolagem horizontal no celular (${larguraCorpo}px)`);
    await mob.close();
  });
} catch {
  // A etapa que falhou já foi registrada; segue para o relatório.
} finally {
  console.log("\nCiclo operacional ponta a ponta\n");
  console.log(passos.join("\n"));
  console.log(`\n${passos.length - falhas}/${passos.length} etapas OK\n`);
  await navegador.close();
  process.exit(falhas > 0 ? 1 : 0);
}
