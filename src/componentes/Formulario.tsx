"use client";

/**
 * Envelope de formulário com estado de envio e retorno da ação.
 *
 * As mensagens de erro que aparecem aqui vêm das regras de domínio (ex.: "A
 * execução foi concluída, mas ainda falta validar se o problema foi resolvido"),
 * então são exibidas com destaque: elas ensinam o processo, não são ruído.
 */
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { Resultado } from "@/server/acoes";
import { Botao } from "./primitivos";

export function BotaoEnviar({
  children,
  variante = "primario",
  className = "",
}: {
  children: React.ReactNode;
  variante?: "primario" | "secundario" | "fantasma" | "perigo";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" variante={variante} disabled={pending} className={className}>
      {pending ? "Salvando…" : children}
    </Botao>
  );
}

export function Formulario({
  acao,
  children,
  className = "",
  aoConcluir,
}: {
  acao: (anterior: Resultado, fd: FormData) => Promise<Resultado>;
  children: React.ReactNode | ((estado: Resultado) => React.ReactNode);
  className?: string;
  aoConcluir?: string;
}) {
  const [estado, enviar] = useActionState(acao, {} as Resultado);
  return (
    <form action={enviar} className={className}>
      {estado.erro && (
        <p
          role="alert"
          className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-inset ring-red-200"
        >
          {estado.erro}
        </p>
      )}
      {estado.ok && (estado.mensagem || aoConcluir) && (
        <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">
          {estado.mensagem || aoConcluir}
        </p>
      )}
      {typeof children === "function" ? children(estado) : children}
    </form>
  );
}

/** Bloco recolhível — mantém a tela limpa sem esconder capacidade. */
export function Recolhivel({
  rotulo,
  children,
  aberto = false,
}: {
  rotulo: string;
  children: React.ReactNode;
  aberto?: boolean;
}) {
  return (
    <details open={aberto} className="group">
      <summary className="foco-visivel cursor-pointer list-none rounded-lg px-3 py-2 text-sm font-medium text-tinta-600 hover:bg-tinta-50">
        <span className="mr-1.5 inline-block transition group-open:rotate-90">›</span>
        {rotulo}
      </summary>
      <div className="px-3 pb-3 pt-2">{children}</div>
    </details>
  );
}
