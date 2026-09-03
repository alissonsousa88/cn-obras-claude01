"use server";

/**
 * SERVER ACTIONS
 *
 * Fronteira entre a interface e o domínio. Cada ação:
 *   1. resolve o usuário da sessão e confere a capacidade necessária;
 *   2. abre uma transação no store;
 *   3. delega ao serviço, que aplica as regras;
 *   4. revalida as telas afetadas.
 *
 * Nenhuma regra de negócio mora aqui — se uma condição precisa ser garantida,
 * ela está no serviço, para valer também no seed, nos testes e num futuro
 * backend Convex.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type {
  FatoresPrioridade,
  ID,
  NivelPrioridade,
  TipoImpedimento,
  TipoMovimento,
} from "@/domain/tipos";
import { entrar, exigirUsuario, sair } from "./auth";
import { exigir, pode } from "./permissoes";
import { store } from "./store/arquivoStore";
import { decidirAprovacao } from "./servicos/aprovacoes";
import { comentar as comentarServico, anexar } from "./servicos/conversa";
import {
  abrirDemanda,
  ajustarPrioridade,
  atribuirResponsavel,
  cancelarDemanda,
  concluirDemanda,
  reabrirDemanda,
} from "./servicos/demandas";
import {
  registrarImpedimento,
  resolverImpedimento,
} from "./servicos/impedimentos";
import {
  alterarPrazoMovimento,
  concluirMovimento,
  definirProximoMovimento,
} from "./servicos/movimentos";
import { alternarRecorrencia, criarRecorrencia, gerarOcorrencia } from "./servicos/recorrencias";

/** Retorno padrão dos formulários. */
export type Resultado = { erro?: string; ok?: boolean; mensagem?: string };

function texto(fd: FormData, campo: string): string {
  const v = fd.get(campo);
  return typeof v === "string" ? v : "";
}
function opcional(fd: FormData, campo: string): string | undefined {
  const v = texto(fd, campo).trim();
  return v.length > 0 ? v : undefined;
}
function marcado(fd: FormData, campo: string): boolean {
  return fd.get(campo) === "on" || fd.get(campo) === "true";
}
function numero(fd: FormData, campo: string): number | undefined {
  const v = opcional(fd, campo);
  if (v === undefined) return undefined;
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}
function instante(fd: FormData, campo: string): number | undefined {
  const v = opcional(fd, campo);
  if (!v) return undefined;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : undefined;
}

/** Converte exceções de regra de domínio em mensagem para o formulário. */
async function proteger(fn: () => Promise<void>): Promise<Resultado> {
  try {
    await fn();
    return { ok: true };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível concluir a ação." };
  }
}

function revalidarTudo(demandaId?: ID) {
  revalidatePath("/");
  revalidatePath("/atencao");
  revalidatePath("/minha-operacao");
  revalidatePath("/demandas");
  revalidatePath("/recorrencias");
  revalidatePath("/aprendizado");
  if (demandaId) revalidatePath(`/demandas/${demandaId}`);
}

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------

export async function acaoEntrar(_anterior: Resultado, fd: FormData): Promise<Resultado> {
  const r = await entrar(texto(fd, "email"), texto(fd, "senha"));
  if (!r.ok) return { erro: r.erro };
  redirect("/");
}

export async function acaoSair(): Promise<void> {
  await sair();
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Demandas
// ---------------------------------------------------------------------------

export async function acaoAbrirDemanda(
  _anterior: Resultado,
  fd: FormData,
): Promise<Resultado> {
  const usuario = await exigirUsuario();
  exigir(usuario, "abrir_demanda");

  const fatores: Partial<FatoresPrioridade> = {
    seguranca: marcado(fd, "seguranca"),
    risco: marcado(fd, "risco"),
    operacaoComprometida: marcado(fd, "operacaoComprometida"),
    pessoasAfetadas: numero(fd, "pessoasAfetadas") ?? 0,
    eventoProximoEm: instante(fd, "eventoProximoEm"),
  };

  let id: ID | undefined;
  const r = await proteger(async () => {
    id = await store.transacao((base) => {
      const d = abrirDemanda(base, usuario, {
        titulo: texto(fd, "titulo"),
        descricao: texto(fd, "descricao"),
        localId: texto(fd, "localId"),
        categoriaId: texto(fd, "categoriaId"),
        fatores,
      });
      return d.id;
    });
  });
  if (r.erro) return r;
  revalidarTudo(id);
  redirect(`/demandas/${id}?aberta=1`);
}

export async function acaoAtribuirResponsavel(
  _anterior: Resultado,
  fd: FormData,
): Promise<Resultado> {
  const usuario = await exigirUsuario();
  exigir(usuario, "atribuir_responsavel");
  const demandaId = texto(fd, "demandaId");
  const r = await proteger(async () => {
    await store.transacao((base) =>
      atribuirResponsavel(base, usuario, demandaId, opcional(fd, "responsavelId")),
    );
  });
  revalidarTudo(demandaId);
  return r;
}

export async function acaoAjustarPrioridade(
  _anterior: Resultado,
  fd: FormData,
): Promise<Resultado> {
  const usuario = await exigirUsuario();
  exigir(usuario, "ajustar_prioridade");
  const demandaId = texto(fd, "demandaId");
  const r = await proteger(async () => {
    await store.transacao((base) =>
      ajustarPrioridade(
        base,
        usuario,
        demandaId,
        texto(fd, "nivel") as NivelPrioridade,
        texto(fd, "justificativa"),
      ),
    );
  });
  revalidarTudo(demandaId);
  return r;
}

export async function acaoConcluirDemanda(
  _anterior: Resultado,
  fd: FormData,
): Promise<Resultado> {
  const usuario = await exigirUsuario();
  exigir(usuario, "concluir_demanda");
  const demandaId = texto(fd, "demandaId");
  const r = await proteger(async () => {
    await store.transacao((base) =>
      concluirDemanda(base, usuario, demandaId, {
        oQueFoiFeito: texto(fd, "oQueFoiFeito"),
        problemaResolvido: marcado(fd, "problemaResolvido"),
        resultadoObtido: texto(fd, "resultadoObtido"),
        observacoesFinais: opcional(fd, "observacoesFinais"),
      }),
    );
  });
  revalidarTudo(demandaId);
  return r;
}

export async function acaoReabrirDemanda(
  _anterior: Resultado,
  fd: FormData,
): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const demandaId = texto(fd, "demandaId");
  const r = await proteger(async () => {
    await store.transacao((base) =>
      reabrirDemanda(base, usuario, demandaId, texto(fd, "motivo")),
    );
  });
  revalidarTudo(demandaId);
  return r;
}

export async function acaoCancelarDemanda(
  _anterior: Resultado,
  fd: FormData,
): Promise<Resultado> {
  const usuario = await exigirUsuario();
  exigir(usuario, "concluir_demanda");
  const demandaId = texto(fd, "demandaId");
  const r = await proteger(async () => {
    await store.transacao((base) =>
      cancelarDemanda(base, usuario, demandaId, texto(fd, "motivo")),
    );
  });
  revalidarTudo(demandaId);
  return r;
}

// ---------------------------------------------------------------------------
// Movimentos
// ---------------------------------------------------------------------------

export async function acaoConcluirMovimento(
  _anterior: Resultado,
  fd: FormData,
): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const demandaId = texto(fd, "demandaId");
  let mensagem = "";

  const r = await proteger(async () => {
    mensagem = await store.transacao((base) => {
      const resultado = concluirMovimento(
        base,
        usuario,
        texto(fd, "movimentoId"),
        {
          relato: texto(fd, "relato"),
          causaIdentificada: fd.has("causaIdentificada")
            ? marcado(fd, "causaIdentificada")
            : undefined,
          exigeOrcamento: fd.has("exigeOrcamento") ? marcado(fd, "exigeOrcamento") : undefined,
          custoEstimado: numero(fd, "custoEstimado"),
          servicoConcluido: fd.has("servicoConcluido")
            ? marcado(fd, "servicoConcluido")
            : undefined,
          problemaResolvido: fd.has("problemaResolvido")
            ? marcado(fd, "problemaResolvido")
            : undefined,
          precisaRetornoSolicitante: marcado(fd, "precisaRetornoSolicitante"),
          proximoResponsavelId: opcional(fd, "proximoResponsavelId"),
        },
        {
          responsavelId: opcional(fd, "responsavelId"),
          prazoDemanda: instante(fd, "prazoDemanda"),
        },
      );
      // Devolve ao usuário o que o Motor de Fluxo decidiu E por quê — o sistema
      // explica seu próprio raciocínio em vez de apenas mudar a tela.
      if (!resultado.criado) return resultado.decisao.motivo;
      const porque = resultado.decisao.sugestao?.motivo ?? resultado.decisao.motivo;
      return `Próximo passo criado: ${resultado.criado.acao}. Motivo: ${porque}.`;
    });
  });
  revalidarTudo(demandaId);
  return r.erro ? r : { ok: true, mensagem };
}

export async function acaoDefinirProximoMovimento(
  _anterior: Resultado,
  fd: FormData,
): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const demandaId = texto(fd, "demandaId");
  const prazo = instante(fd, "prazo");
  if (!prazo) return { erro: "Informe o prazo do próximo passo." };

  const r = await proteger(async () => {
    await store.transacao((base) =>
      definirProximoMovimento(base, usuario, demandaId, {
        tipo: texto(fd, "tipo") as TipoMovimento,
        acao: texto(fd, "acao"),
        resultadoEsperado: texto(fd, "resultadoEsperado"),
        prazo,
        responsavelId: opcional(fd, "responsavelId"),
      }),
    );
  });
  revalidarTudo(demandaId);
  return r;
}

export async function acaoAlterarPrazo(
  _anterior: Resultado,
  fd: FormData,
): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const demandaId = texto(fd, "demandaId");
  const prazo = instante(fd, "prazo");
  if (!prazo) return { erro: "Informe o novo prazo." };
  const r = await proteger(async () => {
    await store.transacao((base) =>
      alterarPrazoMovimento(base, usuario, texto(fd, "movimentoId"), prazo, texto(fd, "motivo")),
    );
  });
  revalidarTudo(demandaId);
  return r;
}

// ---------------------------------------------------------------------------
// Impedimentos
// ---------------------------------------------------------------------------

export async function acaoRegistrarImpedimento(
  _anterior: Resultado,
  fd: FormData,
): Promise<Resultado> {
  const usuario = await exigirUsuario();
  exigir(usuario, "registrar_impedimento");
  const demandaId = texto(fd, "demandaId");
  const dataRevisao = instante(fd, "dataRevisao");
  if (!dataRevisao) return { erro: "Informe quando este impedimento será revisto." };

  const r = await proteger(async () => {
    await store.transacao((base) =>
      registrarImpedimento(base, usuario, demandaId, {
        tipo: texto(fd, "tipo") as TipoImpedimento,
        descricao: texto(fd, "descricao"),
        responsavelDesbloqueioId: texto(fd, "responsavelDesbloqueioId"),
        dataRevisao,
      }),
    );
  });
  revalidarTudo(demandaId);
  return r;
}

export async function acaoResolverImpedimento(
  _anterior: Resultado,
  fd: FormData,
): Promise<Resultado> {
  const usuario = await exigirUsuario();
  exigir(usuario, "resolver_impedimento");
  const demandaId = texto(fd, "demandaId");
  const r = await proteger(async () => {
    await store.transacao((base) =>
      resolverImpedimento(base, usuario, texto(fd, "impedimentoId"), texto(fd, "resolucao")),
    );
  });
  revalidarTudo(demandaId);
  return r;
}

// ---------------------------------------------------------------------------
// Aprovações
// ---------------------------------------------------------------------------

export async function acaoDecidirAprovacao(
  _anterior: Resultado,
  fd: FormData,
): Promise<Resultado> {
  const usuario = await exigirUsuario();
  exigir(usuario, "aprovar");
  const demandaId = texto(fd, "demandaId");
  const r = await proteger(async () => {
    await store.transacao((base) =>
      decidirAprovacao(
        base,
        usuario,
        texto(fd, "aprovacaoId"),
        texto(fd, "decisao") === "aprovar",
        texto(fd, "justificativa"),
      ),
    );
  });
  revalidarTudo(demandaId);
  return r;
}

// ---------------------------------------------------------------------------
// Conversa e evidências
// ---------------------------------------------------------------------------

export async function acaoComentar(
  _anterior: Resultado,
  fd: FormData,
): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const demandaId = texto(fd, "demandaId");
  const r = await proteger(async () => {
    await store.transacao((base) =>
      comentarServico(base, usuario, demandaId, texto(fd, "texto"), {
        visivelSolicitante: !marcado(fd, "interno"),
        perguntaPara: opcional(fd, "perguntaPara"),
      }),
    );
  });
  revalidarTudo(demandaId);
  return r;
}

export async function acaoAnexar(
  _anterior: Resultado,
  fd: FormData,
): Promise<Resultado> {
  const usuario = await exigirUsuario();
  const demandaId = texto(fd, "demandaId");
  const arquivo = fd.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Escolha um arquivo." };
  }
  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const conteudo = `data:${arquivo.type || "application/octet-stream"};base64,${buffer.toString("base64")}`;

  const r = await proteger(async () => {
    await store.transacao((base) =>
      anexar(
        base,
        usuario,
        demandaId,
        {
          nome: arquivo.name,
          mimeType: arquivo.type || "application/octet-stream",
          tamanho: arquivo.size,
          conteudo,
        },
        { legenda: opcional(fd, "legenda"), movimentoId: opcional(fd, "movimentoId") },
      ),
    );
  });
  revalidarTudo(demandaId);
  return r;
}

// ---------------------------------------------------------------------------
// Recorrências
// ---------------------------------------------------------------------------

export async function acaoCriarRecorrencia(
  _anterior: Resultado,
  fd: FormData,
): Promise<Resultado> {
  const usuario = await exigirUsuario();
  exigir(usuario, "gerenciar_recorrencias");
  const primeira = instante(fd, "primeiraExecucao");
  if (!primeira) return { erro: "Informe a data da primeira execução." };
  const intervalo = numero(fd, "intervaloDias");
  if (!intervalo) return { erro: "Informe de quantos em quantos dias isso se repete." };

  const r = await proteger(async () => {
    await store.transacao((base) =>
      criarRecorrencia(base, usuario, {
        titulo: texto(fd, "titulo"),
        descricao: texto(fd, "descricao"),
        categoriaId: texto(fd, "categoriaId"),
        localId: texto(fd, "localId"),
        responsavelPadraoId: opcional(fd, "responsavelPadraoId"),
        intervaloDias: intervalo,
        avisarAntesDias: numero(fd, "avisarAntesDias"),
        primeiraExecucao: primeira,
      }),
    );
  });
  revalidarTudo();
  return r;
}

export async function acaoExecutarRecorrenciaAgora(
  _anterior: Resultado,
  fd: FormData,
): Promise<Resultado> {
  const usuario = await exigirUsuario();
  exigir(usuario, "gerenciar_recorrencias");
  const r = await proteger(async () => {
    await store.transacao((base) => {
      gerarOcorrencia(base, usuario, texto(fd, "recorrenciaId"));
    });
  });
  revalidarTudo();
  return r;
}

export async function acaoAlternarRecorrencia(
  _anterior: Resultado,
  fd: FormData,
): Promise<Resultado> {
  const usuario = await exigirUsuario();
  exigir(usuario, "gerenciar_recorrencias");
  const r = await proteger(async () => {
    await store.transacao((base) =>
      alternarRecorrencia(base, usuario, texto(fd, "recorrenciaId"), marcado(fd, "ativo")),
    );
  });
  revalidarTudo();
  return r;
}

export async function podeCapacidade(capacidade: Parameters<typeof pode>[1]) {
  const usuario = await exigirUsuario();
  return pode(usuario, capacidade);
}
