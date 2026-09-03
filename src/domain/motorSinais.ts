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
import { DIA, HORA, REGRAS } from "./regras";
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
        mensagem: `"${mov.acao}" está com o prazo ultrapassado (${formatarAtraso(
          mov.prazo,
          agora,
        )})`,
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
        mensagem: `"${mov.acao}" ${formatarFalta(mov.prazo, agora)}`,
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
        mensagem:
          horas < 0
            ? `${demanda.titulo} aguarda triagem há mais de 24h`
            : `${demanda.titulo} aguarda triagem`,
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
    const impedimentosDaDemanda = snap.impedimentos.filter(
      (i) => i.demandaId === demanda.id && i.estado === "ATIVO",
    );

    // Sem próximo movimento — a anomalia mais grave do modelo: a demanda está
    // viva e ninguém sabe o que deve acontecer em seguida.
    if (abertos.length === 0 && impedimentosDaDemanda.length === 0) {
      sinais.push({
        chave: `SEM_PROXIMO_MOVIMENTO:${demanda.id}`,
        tipo: "SEM_PROXIMO_MOVIMENTO",
        nivel: "CRITICO",
        mensagem: `${demanda.titulo} está ativa, mas ninguém definiu o próximo passo`,
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
        mensagem: `${demanda.titulo} está em andamento sem responsável definido`,
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
        mensagem: `${demanda.titulo} não avança há ${diasParada} dia${
          diasParada > 1 ? "s" : ""
        }`,
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
        mensagem: `A execução de "${demanda.titulo}" foi concluída, mas ainda falta validar se o problema foi resolvido`,
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
      mensagem: `Pergunta sem resposta em "${demanda.titulo}" há ${Math.floor(
        horas,
      )}h`,
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
        mensagem: `"${demanda.titulo}" está bloqueada há ${dias} dias: ${imp.descricao}`,
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
        mensagem: `O impedimento de "${demanda.titulo}" passou da data de revisão`,
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
      mensagem:
        horas > REGRAS.aprovacaoPendenteHoras
          ? `${ap.descricao} aguarda decisão há ${Math.floor(horas / 24)} dia(s)`
          : `${ap.descricao} aguarda sua decisão`,
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
        mensagem: `${rec.titulo} deveria ter acontecido há ${-dias} dia(s)`,
        recorrenciaId: rec.id,
        destinatarioId: rec.responsavelPadraoId,
        dados: { diasAtraso: -dias },
      });
    } else if (dias <= rec.avisarAntesDias) {
      sinais.push({
        chave: `RECORRENCIA_PROXIMA:${rec.id}`,
        tipo: "RECORRENCIA_PROXIMA",
        nivel: dias <= 3 ? "MEDIO" : "INFO",
        mensagem:
          dias === 0
            ? `${rec.titulo} precisa acontecer hoje`
            : `${rec.titulo} precisa acontecer em ${dias} dia${dias > 1 ? "s" : ""}`,
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
      mensagem: `${categoria.nome} em ${local.nome} já gerou ${grupo.ocorrencias} demandas nos últimos ${REGRAS.reincidencia.janelaDias} dias`,
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
