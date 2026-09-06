"use client";

/**
 * Estado de erro.
 *
 * A mensagem diz o que aconteceu e oferece saída — nunca um código cru nem um
 * pedido de desculpas. O detalhe técnico fica recolhido, para quem for
 * investigar.
 */
import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { Botao, BotaoLink, Cartao } from "@/componentes/primitivos";

export default function Erro({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Falha ao carregar a tela:", error);
  }, [error]);

  return (
    <Cartao className="mx-auto max-w-lg p-6">
      <TriangleAlert className="size-6 text-orange-500" strokeWidth={1.75} aria-hidden />
      <h1 className="mt-3 text-base font-semibold text-tinta-900">
        Não conseguimos carregar esta tela
      </h1>
      <p className="mt-1.5 text-sm text-tinta-600">
        A operação continua registrada — nada foi perdido. Tente de novo; se
        insistir, volte ao painel e siga por outro caminho.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Botao onClick={() => reset()}>Tentar de novo</Botao>
        <BotaoLink href="/">Ir para o painel</BotaoLink>
      </div>
      {error.digest && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-tinta-500">
            Detalhe técnico
          </summary>
          <p className="numerico mt-1 text-xs text-tinta-500">{error.digest}</p>
        </details>
      )}
    </Cartao>
  );
}
