/**
 * Demanda ou página inexistente.
 *
 * Costuma acontecer com um link antigo de demanda cancelada, ou quando alguém
 * sem permissão recebe o endereço — por isso o texto cobre as duas hipóteses
 * em vez de acusar erro de digitação.
 */
import { FileQuestion } from "lucide-react";
import { BotaoLink, Cartao } from "@/componentes/primitivos";

export default function NaoEncontrado() {
  return (
    <Cartao className="mx-auto max-w-lg p-6">
      <FileQuestion className="size-6 text-tinta-400" strokeWidth={1.75} aria-hidden />
      <h1 className="mt-3 text-base font-semibold text-tinta-900">
        Não encontramos essa demanda
      </h1>
      <p className="mt-1.5 text-sm text-tinta-600">
        Ela pode ter sido cancelada, ou pode ser de alguém cujas solicitações
        você não acompanha.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <BotaoLink href="/demandas" variante="primario">
          Ver as demandas
        </BotaoLink>
        <BotaoLink href="/">Ir para o painel</BotaoLink>
      </div>
    </Cartao>
  );
}
