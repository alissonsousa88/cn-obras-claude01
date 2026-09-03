/**
 * Comentários e anexos.
 *
 * Comentários não são bate-papo solto: uma pergunta dirigida ao solicitante
 * vira uma pendência rastreável (gera sinal de retorno necessário se ficar sem
 * resposta).
 */
import type { Anexo, Comentario, ID, Instante, Usuario } from "@/domain/tipos";
import type { BaseDados } from "../store/port";
import { acharDemanda, agora as agoraFn, novoId, registrarEvento } from "./comum";
import { reconciliarSinais } from "./sinais";

export function comentar(
  base: BaseDados,
  autor: Usuario,
  demandaId: ID,
  texto: string,
  opcoes: { visivelSolicitante?: boolean; perguntaPara?: ID } = {},
  instante: Instante = agoraFn(),
): Comentario {
  acharDemanda(base, demandaId);
  if (texto.trim().length < 2) throw new Error("Escreva alguma coisa.");

  // Uma pergunta dirigida a alguém encerra as perguntas anteriores dessa pessoa
  // que já foram respondidas implicitamente por este comentário.
  if (autor.papel === "SOLICITANTE") {
    for (const c of base.comentarios) {
      if (c.demandaId === demandaId && c.perguntaPara === autor.id && !c.respondidoEm) {
        c.respondidoEm = instante;
      }
    }
  }

  const comentario: Comentario = {
    id: novoId(),
    demandaId,
    autorId: autor.id,
    texto: texto.trim(),
    criadoEm: instante,
    visivelSolicitante: opcoes.visivelSolicitante ?? true,
    perguntaPara: opcoes.perguntaPara,
  };
  base.comentarios.push(comentario);

  registrarEvento(base, {
    demandaId,
    tipo: "COMENTARIO_ADICIONADO",
    descricao: comentario.perguntaPara
      ? `Pergunta registrada: ${comentario.texto}`
      : comentario.texto,
    autorId: autor.id,
    dados: { perguntaPara: comentario.perguntaPara ?? null },
    em: instante,
  });

  reconciliarSinais(base, instante);
  return comentario;
}

export function anexar(
  base: BaseDados,
  autor: Usuario,
  demandaId: ID,
  arquivo: { nome: string; mimeType: string; tamanho: number; conteudo: string },
  opcoes: { movimentoId?: ID; legenda?: string } = {},
  instante: Instante = agoraFn(),
): Anexo {
  acharDemanda(base, demandaId);
  const LIMITE = 4 * 1024 * 1024;
  if (arquivo.tamanho > LIMITE) {
    throw new Error("Arquivo muito grande (máximo 4 MB).");
  }
  const anexo: Anexo = {
    id: novoId(),
    demandaId,
    movimentoId: opcoes.movimentoId,
    nome: arquivo.nome,
    mimeType: arquivo.mimeType,
    tamanho: arquivo.tamanho,
    conteudo: arquivo.conteudo,
    autorId: autor.id,
    criadoEm: instante,
    legenda: opcoes.legenda,
  };
  base.anexos.push(anexo);
  registrarEvento(base, {
    demandaId,
    tipo: "ANEXO_ADICIONADO",
    descricao: `Evidência anexada: ${anexo.nome}`,
    autorId: autor.id,
    dados: { anexoId: anexo.id, mimeType: anexo.mimeType },
    em: instante,
  });
  return anexo;
}
