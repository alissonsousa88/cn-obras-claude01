/**
 * DADOS DE DEMONSTRAÇÃO
 *
 * Não são dados decorativos. O seed roda os *serviços reais* numa linha do
 * tempo retroativa: cada demanda foi de fato aberta, triada, executada,
 * bloqueada ou aprovada pelas mesmas funções que a interface usa. Por isso os
 * sinais que aparecem no dashboard são consequência genuína do histórico —
 * não há um único sinal escrito à mão.
 */
import { DIA, HORA } from "@/domain/regras";
import type { Categoria, Local, Usuario } from "@/domain/tipos";
import { gerarHashSenha } from "../senhas";
import { novoId } from "../servicos/comum";
import { abrirDemanda } from "../servicos/demandas";
import { registrarImpedimento } from "../servicos/impedimentos";
import { concluirMovimento } from "../servicos/movimentos";
import { criarRecorrencia } from "../servicos/recorrencias";
import { comentar } from "../servicos/conversa";
import { executarTick } from "../servicos/tick";
import { baseVazia, type BaseDados } from "./port";

/** Senha única de demonstração, exibida na tela de login. */
export const SENHA_DEMO = "cnobras2026";

function criarUsuarios(agora: number): Usuario[] {
  const hash = gerarHashSenha(SENHA_DEMO);
  const base = (
    nome: string,
    email: string,
    papel: Usuario["papel"],
    especialidades: Usuario["especialidades"],
  ): Usuario => ({
    id: novoId(),
    nome,
    email,
    papel,
    especialidades,
    senhaHash: hash,
    ativo: true,
    criadoEm: agora - 200 * DIA,
  });

  return [
    base("João Ribeiro", "joao@cnobras.app", "LIDERANCA", []),
    base("Carlos Menezes", "carlos@cnobras.app", "OPERACAO", ["hidraulica", "eletrica"]),
    base("Marina Alves", "marina@cnobras.app", "OPERACAO", ["climatizacao", "equipamentos"]),
    base("Tiago Nunes", "tiago@cnobras.app", "OPERACAO", ["pintura", "mobiliario", "estrutural"]),
    base("Priscila Duarte", "priscila@cnobras.app", "SOLICITANTE", []),
    base("Rafael Lima", "rafael@cnobras.app", "SOLICITANTE", []),
  ];
}

function criarCategorias(): Categoria[] {
  const c = (
    slug: Categoria["slug"],
    nome: string,
    prazoResolucaoHoras: number,
    tetoSemAprovacao: number,
    pesoRisco: number,
  ): Categoria => ({
    id: novoId(),
    slug,
    nome,
    prazoResolucaoHoras,
    tetoSemAprovacao,
    pesoRisco,
  });
  return [
    c("eletrica", "Elétrica", 48, 600, 3),
    c("hidraulica", "Hidráulica", 48, 600, 2),
    c("climatizacao", "Climatização", 96, 800, 1),
    c("pintura", "Pintura", 168, 500, 0),
    c("mobiliario", "Mobiliário", 168, 400, 0),
    c("equipamentos", "Equipamentos", 96, 1000, 1),
    c("estrutural", "Adequação estrutural", 240, 1500, 3),
    c("manutencao", "Manutenção geral", 120, 500, 1),
    c("inspecao", "Inspeção", 72, 800, 2),
  ];
}

function criarLocais(): Local[] {
  const l = (nome: string, publicoTipico: number, critico: boolean): Local => ({
    id: novoId(),
    nome,
    publicoTipico,
    critico,
    ativo: true,
  });
  return [
    l("Templo principal", 800, true),
    l("Auditório", 250, true),
    l("Sala infantil", 60, false),
    l("Banheiro masculino — térreo", 120, false),
    l("Banheiro feminino — térreo", 120, false),
    l("Cozinha / cafeteria", 40, false),
    l("Recepção", 200, false),
    l("Estacionamento", 300, false),
    l("Sala de som e mídia", 15, true),
    l("Salas de apoio — 2º piso", 80, false),
  ];
}

/**
 * Constrói a base rodando o fluxo real numa linha do tempo retroativa.
 * `agora` é o instante de referência (normalmente Date.now()).
 */
export function construirSeed(agora: number): BaseDados {
  const base = baseVazia();
  base.usuarios = criarUsuarios(agora);
  base.categorias = criarCategorias();
  base.locais = criarLocais();

  const u = (email: string): Usuario =>
    base.usuarios.find((x) => x.email.startsWith(email))!;
  const cat = (slug: string) => base.categorias.find((c) => c.slug === slug)!.id;
  const loc = (nome: string) =>
    base.locais.find((l) => l.nome.toLowerCase().startsWith(nome.toLowerCase()))!.id;

  const joao = u("joao");
  const carlos = u("carlos");
  const marina = u("marina");
  const tiago = u("tiago");
  const priscila = u("priscila");
  const rafael = u("rafael");

  // -------------------------------------------------------------------------
  // 1. Vazamento no banheiro masculino — em execução, prazo apertado
  // -------------------------------------------------------------------------
  const t1 = agora - 2 * DIA - 3 * HORA;
  const vazamento = abrirDemanda(
    base,
    priscila,
    {
      titulo: "Vazamento no banheiro masculino",
      descricao:
        "Água escorrendo pela base do vaso do segundo box. Piso fica molhado durante todo o culto.",
      localId: loc("Banheiro masculino"),
      categoriaId: cat("hidraulica"),
      fatores: { risco: true, operacaoComprometida: true, pessoasAfetadas: 120 },
    },
    t1,
  );
  const triagemVazamento = base.movimentos.find(
    (m) => m.demandaId === vazamento.id && m.tipo === "TRIAGEM",
  )!;
  concluirMovimento(
    base,
    carlos,
    triagemVazamento.id,
    {
      relato:
        "Verificado no local: vazamento vem da conexão de entrada, não do vaso. Precisa trocar o engate flexível.",
      causaIdentificada: true,
      exigeOrcamento: false,
      proximoResponsavelId: carlos.id,
    },
    { responsavelId: carlos.id, prazoDemanda: t1 + 3 * DIA, custoEstimado: 90 },
    t1 + 5 * HORA,
  );

  // -------------------------------------------------------------------------
  // 2. Ar-condicionado do auditório — bloqueado aguardando fornecedor
  // -------------------------------------------------------------------------
  const t2 = agora - 11 * DIA;
  const arCondicionado = abrirDemanda(
    base,
    rafael,
    {
      titulo: "Ar-condicionado do auditório não gela",
      descricao:
        "As duas máquinas ligam, mas sopram ar quente. No último domingo o auditório ficou insuportável.",
      localId: loc("Auditório"),
      categoriaId: cat("climatizacao"),
      fatores: { operacaoComprometida: true, pessoasAfetadas: 250 },
    },
    t2,
  );
  const triagemAr = base.movimentos.find(
    (m) => m.demandaId === arCondicionado.id && m.tipo === "TRIAGEM",
  )!;
  concluirMovimento(
    base,
    marina,
    triagemAr.id,
    {
      relato: "Provável perda de gás. Precisa de técnico especializado — fora da nossa alçada.",
      causaIdentificada: true,
      exigeOrcamento: true,
      proximoResponsavelId: marina.id,
    },
    { responsavelId: marina.id, prazoDemanda: t2 + 10 * DIA },
    t2 + 6 * HORA,
  );
  registrarImpedimento(
    base,
    marina,
    arCondicionado.id,
    {
      tipo: "AGUARDANDO_FORNECEDOR",
      descricao: "Fornecedor Climatiza ainda não enviou o orçamento solicitado por e-mail",
      responsavelDesbloqueioId: joao.id,
      dataRevisao: agora - 2 * DIA,
    },
    t2 + 1 * DIA,
  );

  // -------------------------------------------------------------------------
  // 3. Iluminação da sala infantil — aprovação pendente com a liderança
  // -------------------------------------------------------------------------
  const t3 = agora - 6 * DIA;
  const iluminacao = abrirDemanda(
    base,
    priscila,
    {
      titulo: "Iluminação da sala infantil está fraca e piscando",
      descricao:
        "Metade das luminárias piscam. As crianças reclamam e as professoras precisam usar lanterna nas atividades.",
      localId: loc("Sala infantil"),
      categoriaId: cat("eletrica"),
      fatores: { seguranca: true, pessoasAfetadas: 60 },
    },
    t3,
  );
  const triagemLuz = base.movimentos.find(
    (m) => m.demandaId === iluminacao.id && m.tipo === "TRIAGEM",
  )!;
  concluirMovimento(
    base,
    carlos,
    triagemLuz.id,
    {
      relato:
        "Reatores das 6 luminárias estão no fim da vida. Vale trocar tudo por painéis LED de uma vez.",
      causaIdentificada: true,
      exigeOrcamento: true,
      proximoResponsavelId: carlos.id,
    },
    { responsavelId: carlos.id, prazoDemanda: t3 + 12 * DIA },
    t3 + 20 * HORA,
  );
  const orcamentoLuz = base.movimentos.find(
    (m) => m.demandaId === iluminacao.id && m.tipo === "ORCAMENTO" && m.estado === "PENDENTE",
  )!;
  concluirMovimento(
    base,
    carlos,
    orcamentoLuz.id,
    {
      relato:
        "Orçamento fechado com a Elétrica Souza: 6 painéis LED 36W instalados por R$ 1.280,00.",
      custoEstimado: 1280,
      proximoResponsavelId: joao.id,
    },
    undefined,
    t3 + 2 * DIA,
  );

  // -------------------------------------------------------------------------
  // 4. Pintura da recepção — parada, sem ninguém tocando
  // -------------------------------------------------------------------------
  const t4 = agora - 9 * DIA;
  const pintura = abrirDemanda(
    base,
    rafael,
    {
      titulo: "Repintar a parede da recepção",
      descricao: "Parede está manchada e descascando atrás do balcão de acolhimento.",
      localId: loc("Recepção"),
      categoriaId: cat("pintura"),
      fatores: { pessoasAfetadas: 200 },
    },
    t4,
  );
  const triagemPintura = base.movimentos.find(
    (m) => m.demandaId === pintura.id && m.tipo === "TRIAGEM",
  )!;
  concluirMovimento(
    base,
    tiago,
    triagemPintura.id,
    {
      relato: "Dá para fazer com a tinta que sobrou da reforma. Agendar para uma segunda-feira.",
      causaIdentificada: true,
      exigeOrcamento: false,
      proximoResponsavelId: tiago.id,
    },
    { responsavelId: tiago.id, prazoDemanda: t4 + 14 * DIA },
    t4 + 18 * HORA,
  );

  // -------------------------------------------------------------------------
  // 5. Tomada da sala de som — executada, aguardando validação
  // -------------------------------------------------------------------------
  const t5 = agora - 5 * DIA;
  const tomada = abrirDemanda(
    base,
    rafael,
    {
      titulo: "Tomada da mesa de som soltando faísca",
      descricao: "Ao conectar a mesa, a tomada solta faísca e cheira a queimado.",
      localId: loc("Sala de som"),
      categoriaId: cat("eletrica"),
      fatores: { seguranca: true, risco: true, operacaoComprometida: true, pessoasAfetadas: 15 },
    },
    t5,
  );
  const triagemTomada = base.movimentos.find(
    (m) => m.demandaId === tomada.id && m.tipo === "TRIAGEM",
  )!;
  concluirMovimento(
    base,
    carlos,
    triagemTomada.id,
    {
      relato: "Tomada com o contato derretido. Troca imediata, circuito desligado por segurança.",
      causaIdentificada: true,
      exigeOrcamento: false,
      proximoResponsavelId: carlos.id,
    },
    { responsavelId: carlos.id, prazoDemanda: t5 + 2 * DIA, custoEstimado: 45 },
    t5 + 2 * HORA,
  );
  const execTomada = base.movimentos.find(
    (m) => m.demandaId === tomada.id && m.tipo === "EXECUCAO" && m.estado === "PENDENTE",
  )!;
  concluirMovimento(
    base,
    carlos,
    execTomada.id,
    {
      relato: "Tomada e fiação do trecho substituídas. Testado com a mesa ligada por 20 minutos.",
      servicoConcluido: true,
    },
    undefined,
    t5 + 1 * DIA,
  );

  // -------------------------------------------------------------------------
  // 6. Reincidência: infiltração no 2º piso (3 ocorrências)
  // -------------------------------------------------------------------------
  const infiltracoes = [
    { dias: 70, titulo: "Mancha de infiltração na sala 204" },
    { dias: 40, titulo: "Infiltração voltou na sala 204" },
    { dias: 12, titulo: "Infiltração na sala 205 e no corredor do 2º piso" },
  ];
  for (const item of infiltracoes) {
    const t = agora - item.dias * DIA;
    const d = abrirDemanda(
      base,
      priscila,
      {
        titulo: item.titulo,
        descricao:
          "Mancha úmida no teto, com descascamento da pintura. Piora depois de chuva forte.",
        localId: loc("Salas de apoio"),
        categoriaId: cat("hidraulica"),
        fatores: { pessoasAfetadas: 80 },
      },
      t,
    );
    const triagem = base.movimentos.find(
      (m) => m.demandaId === d.id && m.tipo === "TRIAGEM",
    )!;
    concluirMovimento(
      base,
      carlos,
      triagem.id,
      {
        relato: "Vedação da laje refeita no trecho afetado.",
        causaIdentificada: true,
        exigeOrcamento: false,
        proximoResponsavelId: carlos.id,
      },
      { responsavelId: carlos.id, custoEstimado: 150 },
      t + 4 * HORA,
    );
    // As duas primeiras foram executadas e validadas; a última segue aberta.
    if (item.dias > 20) {
      const exec = base.movimentos.find(
        (m) => m.demandaId === d.id && m.tipo === "EXECUCAO" && m.estado === "PENDENTE",
      )!;
      concluirMovimento(
        base,
        carlos,
        exec.id,
        { relato: "Aplicada manta asfáltica no trecho. Sem umidade após 2 dias.", servicoConcluido: true },
        undefined,
        t + 2 * DIA,
      );
      const val = base.movimentos.find(
        (m) => m.demandaId === d.id && m.tipo === "VALIDACAO" && m.estado === "PENDENTE",
      )!;
      concluirMovimento(
        base,
        priscila,
        val.id,
        { relato: "Teto seco, mancha não voltou até agora.", problemaResolvido: true },
        undefined,
        t + 4 * DIA,
      );
      // Conclusão com resultado registrado (regra: resultado obrigatório).
      const alvo = base.demandas.find((x) => x.id === d.id)!;
      alvo.estado = "CONCLUIDA";
      alvo.concluidoEm = t + 4 * DIA;
      alvo.ultimoAvancoEm = t + 4 * DIA;
      alvo.resultado = {
        oQueFoiFeito: "Vedação da laje refeita com manta asfáltica no trecho afetado",
        problemaResolvido: true,
        resultadoObtido: "Teto seco e sem novas manchas na inspeção seguinte",
        registradoPor: carlos.id,
        registradoEm: t + 4 * DIA,
        anexoIds: [],
      };
    }
  }

  // -------------------------------------------------------------------------
  // 7. Demanda nova aguardando triagem (chegou há pouco)
  // -------------------------------------------------------------------------
  const t7 = agora - 30 * HORA;
  const porta = abrirDemanda(
    base,
    rafael,
    {
      titulo: "Porta do estacionamento não trava",
      descricao: "O portão social fecha mas a lingueta não prende. Fica encostado.",
      localId: loc("Estacionamento"),
      categoriaId: cat("manutencao"),
      fatores: { risco: true, pessoasAfetadas: 300 },
    },
    t7,
  );
  comentar(
    base,
    tiago,
    porta.id,
    "O portão é o social ou o de veículos? Precisamos saber para levar a fechadura certa.",
    { perguntaPara: rafael.id },
    t7 + 3 * HORA,
  );

  // -------------------------------------------------------------------------
  // 8. Demanda sem próximo movimento (anomalia proposital para o motor pegar)
  // -------------------------------------------------------------------------
  const t8 = agora - 8 * DIA;
  const cadeiras = abrirDemanda(
    base,
    priscila,
    {
      titulo: "Cadeiras quebradas nas salas de apoio",
      descricao: "Cerca de 12 cadeiras com o encosto solto ou a base torta.",
      localId: loc("Salas de apoio"),
      categoriaId: cat("mobiliario"),
      fatores: { pessoasAfetadas: 80 },
    },
    t8,
  );
  const triagemCadeiras = base.movimentos.find(
    (m) => m.demandaId === cadeiras.id && m.tipo === "TRIAGEM",
  )!;
  concluirMovimento(
    base,
    tiago,
    triagemCadeiras.id,
    {
      relato: "Separei as 12 cadeiras. Preciso decidir se conserta ou substitui.",
      causaIdentificada: true,
      exigeOrcamento: false,
      proximoResponsavelId: tiago.id,
    },
    { responsavelId: tiago.id },
    t8 + 12 * HORA,
  );
  // O passo criado é cancelado de propósito: simula a situação real em que
  // alguém encerra a ação sem definir o que vem depois. O Motor de Sinais
  // precisa perceber isso sozinho.
  const passoCadeiras = base.movimentos.find(
    (m) => m.demandaId === cadeiras.id && m.estado === "PENDENTE",
  );
  if (passoCadeiras) {
    passoCadeiras.estado = "CANCELADO";
  }

  // -------------------------------------------------------------------------
  // 9. Demanda concluída recentemente — mostra o ciclo completo
  // -------------------------------------------------------------------------
  const t9 = agora - 4 * DIA;
  const cafeteira = abrirDemanda(
    base,
    priscila,
    {
      titulo: "Cafeteira industrial parou de aquecer",
      descricao: "A resistência não liga. A equipe da cafeteria está sem servir café.",
      localId: loc("Cozinha"),
      categoriaId: cat("equipamentos"),
      fatores: { pessoasAfetadas: 40 },
    },
    t9,
  );
  const triagemCafe = base.movimentos.find(
    (m) => m.demandaId === cafeteira.id && m.tipo === "TRIAGEM",
  )!;
  concluirMovimento(
    base,
    marina,
    triagemCafe.id,
    {
      relato: "Resistência queimada. Peça custa R$ 180 e temos fornecedor local.",
      causaIdentificada: true,
      exigeOrcamento: false,
      proximoResponsavelId: marina.id,
    },
    { responsavelId: marina.id, custoEstimado: 180 },
    t9 + 3 * HORA,
  );
  const execCafe = base.movimentos.find(
    (m) => m.demandaId === cafeteira.id && m.tipo === "EXECUCAO" && m.estado === "PENDENTE",
  )!;
  concluirMovimento(
    base,
    marina,
    execCafe.id,
    { relato: "Resistência substituída e equipamento testado.", servicoConcluido: true },
    undefined,
    t9 + 1 * DIA,
  );
  const valCafe = base.movimentos.find(
    (m) => m.demandaId === cafeteira.id && m.tipo === "VALIDACAO" && m.estado === "PENDENTE",
  )!;
  concluirMovimento(
    base,
    priscila,
    valCafe.id,
    { relato: "Café saindo normalmente desde ontem.", problemaResolvido: true },
    undefined,
    t9 + 2 * DIA,
  );
  {
    const alvo = base.demandas.find((x) => x.id === cafeteira.id)!;
    alvo.estado = "CONCLUIDA";
    alvo.concluidoEm = t9 + 2 * DIA;
    alvo.ultimoAvancoEm = t9 + 2 * DIA;
    alvo.resultado = {
      oQueFoiFeito: "Resistência da cafeteria substituída por peça nova",
      problemaResolvido: true,
      resultadoObtido: "Cafeteria voltou a operar normalmente no domingo seguinte",
      observacoesFinais: "Peça tem garantia de 6 meses. Nota fiscal na pasta da cozinha.",
      registradoPor: marina.id,
      registradoEm: t9 + 2 * DIA,
      anexoIds: [],
    };
  }

  // -------------------------------------------------------------------------
  // 10. Recorrências (manutenção preventiva)
  // -------------------------------------------------------------------------
  criarRecorrencia(
    base,
    joao,
    {
      titulo: "Revisão dos extintores",
      descricao:
        "Conferir carga, lacre e validade de todos os extintores. Registrar as posições vencendo nos próximos 60 dias.",
      categoriaId: cat("inspecao"),
      localId: loc("Templo principal"),
      responsavelPadraoId: tiago.id,
      intervaloDias: 180,
      avisarAntesDias: 30,
      primeiraExecucao: agora + 25 * DIA,
    },
    agora - 150 * DIA,
  );
  criarRecorrencia(
    base,
    joao,
    {
      titulo: "Limpeza técnica dos aparelhos de ar-condicionado",
      descricao: "Higienizar filtros e serpentinas de todos os splits do prédio.",
      categoriaId: cat("climatizacao"),
      localId: loc("Templo principal"),
      responsavelPadraoId: marina.id,
      intervaloDias: 90,
      avisarAntesDias: 10,
      primeiraExecucao: agora + 4 * DIA,
    },
    agora - 86 * DIA,
  );
  criarRecorrencia(
    base,
    joao,
    {
      titulo: "Inspeção elétrica dos quadros de distribuição",
      descricao: "Termografia e reaperto dos disjuntores dos quadros principais.",
      categoriaId: cat("eletrica"),
      localId: loc("Templo principal"),
      responsavelPadraoId: carlos.id,
      intervaloDias: 120,
      avisarAntesDias: 14,
      primeiraExecucao: agora - 3 * DIA,
    },
    agora - 123 * DIA,
  );

  // -------------------------------------------------------------------------
  // Fecha a linha do tempo no presente: o tick abre ocorrências vencidas,
  // recalcula prioridades e produz o conjunto real de sinais ativos.
  // -------------------------------------------------------------------------
  executarTick(base, agora);

  return base;
}
