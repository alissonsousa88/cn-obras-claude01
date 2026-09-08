"use client";

/**
 * BOTÃO DE AVISO PELO WHATSAPP
 *
 * O solicitante não tem acesso ao sistema — este botão é o único retorno que
 * ele recebe. Ao clicar, o responsável:
 *
 *   1. registra no histórico que o solicitante foi avisado (Server Action,
 *      que também gera o texto a partir do estado real da demanda);
 *   2. tem o WhatsApp aberto, com a mensagem pronta, pronto para conferir e
 *      enviar — a pessoa decide, o sistema só prepara.
 */
import { useActionState, useEffect, useRef } from "react";
import { MessageCircle } from "lucide-react";
import { acaoNotificarSolicitante, type Resultado } from "@/server/acoes";
import { Botao } from "@/componentes/primitivos";

const ESTADO_INICIAL: Resultado = {};

export function BotaoAvisarWhatsApp({
  demandaId,
  telefone,
  solicitanteNome,
}: {
  demandaId: string;
  telefone: string;
  solicitanteNome: string;
}) {
  const [estado, enviar, pendente] = useActionState(acaoNotificarSolicitante, ESTADO_INICIAL);
  const ultimoLink = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (estado.ok && estado.link && estado.link !== ultimoLink.current) {
      ultimoLink.current = estado.link;
      window.open(estado.link, "_blank", "noopener,noreferrer");
    }
  }, [estado]);

  return (
    <form action={enviar} className="inline-block">
      <input type="hidden" name="demandaId" value={demandaId} />
      <input type="hidden" name="telefone" value={telefone} />
      <Botao type="submit" variante="secundario" disabled={pendente}>
        <MessageCircle className="size-4" strokeWidth={1.75} aria-hidden />
        {pendente ? "Preparando…" : `Avisar ${solicitanteNome.split(" ")[0]} pelo WhatsApp`}
      </Botao>
      {estado.erro && <p className="mt-1.5 text-xs text-red-600">{estado.erro}</p>}
    </form>
  );
}
