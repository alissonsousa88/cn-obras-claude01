/**
 * Comentários e anexos.
 *
 * Comentário é conversa interna da equipe — o solicitante não tem acesso ao
 * sistema, então não lê nem escreve aqui. O contato com ele acontece pelo
 * botão de WhatsApp da tela de demanda (`gerarResumoWhatsApp`).
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
  instante: Instante = agoraFn(),
): Comentario {
  acharDemanda(base, demandaId);
  if (texto.trim().length < 2) throw new Error("Escreva alguma coisa.");

  const comentario: Comentario = {
    id: novoId(),
    demandaId,
    autorId: autor.id,
    texto: texto.trim(),
    criadoEm: instante,
  };
  base.comentarios.push(comentario);

  registrarEvento(base, {
    demandaId,
    tipo: "COMENTARIO_ADICIONADO",
    descricao: comentario.texto,
    autorId: autor.id,
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
