/**
 * MOTOR DE SINAIS OPERACIONAIS
 *
 * Um sinal não é uma notificação: é a afirmação de que existe uma situação na
 * operação que merece atenção *agora*, derivada dos dados reais do sistema.
 *
 * O motor é uma função pura: dado um snapshot e um instante, devolve o conjunto
 * de sinais que *deveriam* existir. Quem persiste é o reconciliador
 * (`servicos/sinais.ts`), que abre os novos e resolve os que deixaram de valer —
 * garantindo a regra "sinal resolvido não continua aparecendo como ativo".
 *
 * Cada sinal carrega obrigatoriamente:
 *   - uma mensagem em linguagem operacional;
 *   - um destinatário, sempre que houver alguém identificável para agir.
 */
import { contarReincidencias, detectarReincidencias } from "./analiseHistorico";
import { podeConcluir } from "./motorFluxo";
import { DIA, HORA, REGRAS } from "./regras";
import { plural } from "./plural";
import type {
  Demanda,
  ID,
  Instante,
  Movimento,
  SinalDesejado,
  SnapshotOperacional,
} from "./tipos";

function horasAte(instante: Instante, agora: Instante): number {
  return (instante - agora) / HORA;
}

function diasDesde(instante: Instante, agora: Instante): number {
  return Math.floor((agora - instante) / DIA);
}

function formatarAtraso(prazo: Instante, agora: Instante): string {
  const horas = Math.floor((agora - prazo) / HORA);
  if (horas < 24) return `${horas}h em atraso`;
  const dias = Math.floor(horas / 24);
  return `${dias} dia${dias > 1 ? "s" : ""} em atraso`;
}

function formatarFalta(prazo: Instante, agora: Instante): string {
  const horas = Math.ceil((prazo - agora) / HORA);
  if (horas <= 1) return "vence em menos de 1 hora";
  if (horas < 24) return `vence em ${horas}h`;
  const dias = Math.ceil(horas / 24);
  return `vence em ${dias} dia${dias > 1 ? "s" : ""}`;
}

function ativa(demanda: Demanda): boolean {
  return demanda.estado !== "CONCLUIDA" && demanda.estado !== "CANCELADA";
}

/**
 * Avalia todo o snapshot e devolve os sinais que devem estar ativos.
 * Ordem de emissão não importa — a ordenação é responsabilidade do Motor de Atenção.
 */
export function avaliarSinais(snap: SnapshotOperacional): SinalDesejado[] {
  const { agora } = snap;
  const sinais: SinalDesejado[] = [];

  const demandaPorId = new Map(snap.demandas.map((d) => [d.id, d]));
  const localPorId = new Map(snap.locais.map((l) => [l.id, l]));
  const categoriaPorId = new Map(snap.categorias.map((c) => [c.id, c]));

  const movsPorDemanda = new Map<ID, Movimento[]>();
  for (const m of snap.movimentos) {
    const lista = movsPorDemanda.get(m.demandaId);
    if (lista) lista.push(m);
    else movsPorDemanda.set(m.demandaId, [m]);
  }

  // -------------------------------------------------------------------------
  // Sinais por movimento: prazo vencido / prazo próximo / triagem pendente
  // -------------------------------------------------------------------------
  for (const mov of snap.movimentos) {
    if (mov.estado !== "PENDENTE") continue;
    const demanda = demandaPorId.get(mov.demandaId);
    if (!demanda || !ativa(demanda)) continue;

    const horas = horasAte(mov.prazo, agora);

    if (horas < 0) {
      const critico =
        demanda.prioridade.nivel === "CRITICA" || demanda.prioridade.nivel === "ALTA";
      sinais.push({
        chave: `PRAZO_VENCIDO:${mov.id}`,
        tipo: "PRAZO_VENCIDO",
        nivel: critico ? "CRITICO" : "ALTO",
        assunto: mov.acao,
        mensagem: formatarAtraso(mov.prazo, agora),
        demandaId: demanda.id,
        movimentoId: mov.id,
        destinatarioId: mov.responsavelId ?? demanda.responsavelId,
        dados: {
          horasAtraso: Math.round(-horas),
          prioridade: demanda.prioridade.nivel,
          tipoMovimento: mov.tipo,
        },
      });
    } else if (horas <= REGRAS.prazoProximoHoras) {
      sinais.push({
        chave: `PRAZO_PROXIMO:${mov.id}`,
        tipo: "PRAZO_PROXIMO",
        nivel: horas <= 12 ? "MEDIO" : "INFO",
        assunto: mov.acao,
        mensagem: formatarFalta(mov.prazo, agora),
        demandaId: demanda.id,
        movimentoId: mov.id,
        destinatarioId: mov.responsavelId ?? demanda.responsavelId,
        dados: { horasRestantes: Math.round(horas), tipoMovimento: mov.tipo },
      });
    }

    // Triagem ainda aberta é tratada como situação própria: é o momento em que
    // a demanda ainda não tem direção operacional definida.
    if (mov.tipo === "TRIAGEM") {
      sinais.push({
        chave: `TRIAGEM_PENDENTE:${demanda.id}`,
        tipo: "TRIAGEM_PENDENTE",
        nivel: horas < 0 ? "ALTO" : "MEDIO",
        assunto: demanda.titulo,
        mensagem:
          horas < 0 ? "aguarda triagem há mais de 24h" : "aguarda a primeira leitura",
        demandaId: demanda.id,
        movimentoId: mov.id,
        destinatarioId: mov.responsavelId,
        dados: { horasAberta: Math.round((agora - demanda.criadoEm) / HORA) },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Sinais por demanda
  // -------------------------------------------------------------------------
  for (const demanda of snap.demandas) {
    if (!ativa(demanda)) continue;

    const movs = movsPorDemanda.get(demanda.id) ?? [];
    const abertos = movs.filter(
      (m) => m.estado === "PENDENTE" || m.estado === "SUSPENSO",
    );
    const impedimentosTodos = snap.impedimentos.filter(
      (i) => i.demandaId === demanda.id,
    );
    const impedimentosDaDemanda = impedimentosTodos.filter((i) => i.estado === "ATIVO");
    const categoria = categoriaPorId.get(demanda.categoriaId);

    // Uma demanda cujo fluxo chegou ao fim (execução feita, resultado validado,
    // nada pendente) não está sem direção: está esperando o registro do
    // resultado. São situações diferentes e merecem sinais diferentes — dizer
    // "defina o próximo passo" aqui seria orientação errada.
    const prontaParaConclusao =
      categoria !== undefined &&
      podeConcluir({
        demanda,
        movimentos: movs,
        impedimentos: impedimentosTodos,
        aprovacoes: snap.aprovacoes.filter((a) => a.demandaId === demanda.id),
        categoria,
      }).pode;

    if (prontaParaConclusao) {
      sinais.push({
        chave: `RETORNO_NECESSARIO:resultado:${demanda.id}`,
        tipo: "RETORNO_NECESSARIO",
        nivel: "ALTO",
        assunto: demanda.titulo,
        mensagem: "resolvida, falta registrar o resultado para concluir",
        demandaId: demanda.id,
        destinatarioId: demanda.responsavelId,
        dados: { etapa: "registro_resultado" },
      });
    }

    // Sem próximo movimento — a anomalia mais grave do modelo: a demanda está
    // viva e ninguém sabe o que deve acontecer em seguida.
    if (abertos.length === 0 && impedimentosDaDemanda.length === 0 && !prontaParaConclusao) {
      sinais.push({
        chave: `SEM_PROXIMO_MOVIMENTO:${demanda.id}`,
        tipo: "SEM_PROXIMO_MOVIMENTO",
        nivel: "CRITICO",
        assunto: demanda.titulo,
        mensagem: "está ativa, mas ninguém definiu o próximo passo",
        demandaId: demanda.id,
        destinatarioId: demanda.responsavelId,
        dados: { estado: demanda.estado, prioridade: demanda.prioridade.nivel },
      });
    }

    // Sem responsável definido. Durante a triagem isso é esperado (o dono da
    // demanda é justamente uma das saídas da triagem), então só vira sinal
    // depois que a triagem saiu de cena.
    const emTriagem = abertos.some((m) => m.tipo === "TRIAGEM");
    if (!demanda.responsavelId && demanda.estado !== "NOVA" && !emTriagem) {
      sinais.push({
        chave: `SEM_RESPONSAVEL:${demanda.id}`,
        tipo: "SEM_RESPONSAVEL",
        nivel: demanda.prioridade.nivel === "CRITICA" ? "CRITICO" : "ALTO",
        assunto: demanda.titulo,
        mensagem: "em andamento sem responsável definido",
        demandaId: demanda.id,
        dados: { prioridade: demanda.prioridade.nivel },
      });
    }

    // Demanda parada: o limite de tolerância depende da prioridade.
    const toleranciaDias = REGRAS.paradaDias[demanda.prioridade.nivel];
    const diasParada = diasDesde(demanda.ultimoAvancoEm, agora);
    if (diasParada >= toleranciaDias && impedimentosDaDemanda.length === 0) {
      sinais.push({
        chave: `DEMANDA_PARADA:${demanda.id}`,
        tipo: "DEMANDA_PARADA",
        nivel: diasParada >= toleranciaDias * 2 ? "ALTO" : "MEDIO",
        assunto: demanda.titulo,
        mensagem: `sem avanço há ${plural(diasParada, "dia")}`,
        demandaId: demanda.id,
        destinatarioId: demanda.responsavelId,
        dados: { diasParada, toleranciaDias, prioridade: demanda.prioridade.nivel },
      });
    }

    // Retorno necessário: execução concluída sem validação em aberto nem feita.
    const execucaoConcluida = movs.some(
      (m) => m.tipo === "EXECUCAO" && m.estado === "CONCLUIDO",
    );
    const validacaoResolvida = movs.some(
      (m) => m.tipo === "VALIDACAO" && m.estado === "CONCLUIDO",
    );
    const validacaoAberta = abertos.some((m) => m.tipo === "VALIDACAO");
    if (execucaoConcluida && !validacaoResolvida && !validacaoAberta) {
      sinais.push({
        chave: `RETORNO_NECESSARIO:${demanda.id}`,
        tipo: "RETORNO_NECESSARIO",
        nivel: "ALTO",
        assunto: demanda.titulo,
        mensagem: "executada, mas falta validar se o problema foi resolvido",
        demandaId: demanda.id,
        destinatarioId: demanda.solicitanteId,
        dados: {},
      });
    }
  }

  // -------------------------------------------------------------------------
  // Perguntas ao solicitante sem resposta
  // -------------------------------------------------------------------------
  for (const c of snap.comentarios) {
    if (!c.perguntaPara || c.respondidoEm) continue;
    const demanda = demandaPorId.get(c.demandaId);
    if (!demanda || !ativa(demanda)) continue;
    const horas = (agora - c.criadoEm) / HORA;
    if (horas < 12) continue;
    sinais.push({
      chave: `RETORNO_NECESSARIO:comentario:${c.id}`,
      tipo: "RETORNO_NECESSARIO",
      nivel: horas > 48 ? "ALTO" : "MEDIO",
      assunto: demanda.titulo,
      mensagem: `pergunta sem resposta há ${Math.floor(horas)}h`,
      demandaId: demanda.id,
      destinatarioId: c.perguntaPara,
      dados: { horasSemResposta: Math.floor(horas) },
    });
  }

  // -------------------------------------------------------------------------
  // Impedimentos
  // -------------------------------------------------------------------------
  for (const imp of snap.impedimentos) {
    if (imp.estado !== "ATIVO") continue;
    const demanda = demandaPorId.get(imp.demandaId);
    if (!demanda || !ativa(demanda)) continue;

    const dias = diasDesde(imp.dataInicio, agora);
    if (dias >= REGRAS.impedimentoProlongadoDias) {
      sinais.push({
        chave: `IMPEDIMENTO_PROLONGADO:${imp.id}`,
        tipo: "IMPEDIMENTO_PROLONGADO",
        nivel: dias >= REGRAS.impedimentoProlongadoDias * 2 ? "CRITICO" : "ALTO",
        assunto: demanda.titulo,
        mensagem: `bloqueada há ${plural(dias, "dia")}: ${imp.descricao}`,
        demandaId: demanda.id,
        impedimentoId: imp.id,
        destinatarioId: imp.responsavelDesbloqueioId,
        dados: { diasBloqueada: dias, tipo: imp.tipo },
      });
    }

    if (imp.dataRevisao < agora) {
      sinais.push({
        chave: `IMPEDIMENTO_SEM_REVISAO:${imp.id}`,
        tipo: "IMPEDIMENTO_SEM_REVISAO",
        nivel: "MEDIO",
        assunto: demanda.titulo,
        mensagem: "o impedimento passou da data de revisão",
        demandaId: demanda.id,
        impedimentoId: imp.id,
        destinatarioId: imp.responsavelDesbloqueioId,
        dados: { diasDesdeRevisao: diasDesde(imp.dataRevisao, agora) },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Aprovações pendentes
  // -------------------------------------------------------------------------
  for (const ap of snap.aprovacoes) {
    if (ap.estado !== "PENDENTE") continue;
    const demanda = demandaPorId.get(ap.demandaId);
    if (!demanda || !ativa(demanda)) continue;
    const horas = (agora - ap.solicitadoEm) / HORA;
    sinais.push({
      chave: `APROVACAO_PENDENTE:${ap.id}`,
      tipo: "APROVACAO_PENDENTE",
      nivel: horas > REGRAS.aprovacaoPendenteHoras ? "ALTO" : "MEDIO",
      assunto: ap.descricao,
      mensagem:
        horas > REGRAS.aprovacaoPendenteHoras
          ? `aguarda decisão há ${plural(Math.floor(horas / 24), "dia")}`
          : "aguarda decisão",
      demandaId: demanda.id,
      movimentoId: ap.movimentoId,
      destinatarioId: ap.aprovadorId,
      dados: { horasAguardando: Math.floor(horas), valor: ap.valor ?? 0 },
    });
  }

  // -------------------------------------------------------------------------
  // Recorrências
  // -------------------------------------------------------------------------
  for (const rec of snap.recorrencias) {
    if (!rec.ativo) continue;
    const dias = Math.ceil((rec.proximaExecucao - agora) / DIA);
    if (dias < 0) {
      sinais.push({
        chave: `RECORRENCIA_ATRASADA:${rec.id}`,
        tipo: "RECORRENCIA_ATRASADA",
        nivel: "ALTO",
        assunto: rec.titulo,
        mensagem: `deveria ter acontecido há ${plural(-dias, "dia")}`,
        recorrenciaId: rec.id,
        destinatarioId: rec.responsavelPadraoId,
        dados: { diasAtraso: -dias },
      });
    } else if (dias <= rec.avisarAntesDias) {
      sinais.push({
        chave: `RECORRENCIA_PROXIMA:${rec.id}`,
        tipo: "RECORRENCIA_PROXIMA",
        nivel: dias <= 3 ? "MEDIO" : "INFO",
        assunto: rec.titulo,
        mensagem: dias === 0 ? "precisa acontecer hoje" : `em ${plural(dias, "dia")}`,
        recorrenciaId: rec.id,
        destinatarioId: rec.responsavelPadraoId,
        dados: { diasAte: dias },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Reincidência — aprendizado do histórico virando sinal
  // -------------------------------------------------------------------------
  for (const grupo of detectarReincidencias(snap.demandas, agora)) {
    const local = localPorId.get(grupo.localId);
    const categoria = categoriaPorId.get(grupo.categoriaId);
    if (!local || !categoria) continue;
    // Aponta para a ocorrência ativa mais recente, quando existir.
    const ativaMaisRecente = grupo.demandaIds
      .map((id) => demandaPorId.get(id))
      .filter((d): d is Demanda => !!d && ativa(d))
      .sort((a, b) => b.criadoEm - a.criadoEm)[0];

    sinais.push({
      chave: `REINCIDENCIA:${grupo.localId}:${grupo.categoriaId}`,
      tipo: "REINCIDENCIA",
      nivel: grupo.ocorrencias >= 4 ? "ALTO" : "MEDIO",
      assunto: `${categoria.nome} em ${local.nome}`,
      mensagem: `${plural(grupo.ocorrencias, "demanda")} nos últimos ${REGRAS.reincidencia.janelaDias} dias`,
      demandaId: ativaMaisRecente?.id,
      destinatarioId: ativaMaisRecente?.responsavelId,
      dados: {
        ocorrencias: grupo.ocorrencias,
        localId: grupo.localId,
        categoriaId: grupo.categoriaId,
      },
    });
  }

  return sinais;
}

/** Reincidências de uma demanda específica — usado pelo Motor de Prioridade. */
export { contarReincidencias };
