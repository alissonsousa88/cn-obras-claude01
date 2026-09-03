/**
 * ABERTURA DE DEMANDA
 *
 * O cadastro inicial é curto de propósito: título, local, categoria e uma
 * descrição. Os fatores que alimentam o Motor de Prioridade são três caixas de
 * marcar escritas em linguagem comum ("pode machucar alguém"), não um campo
 * "Prioridade: Alta/Média/Baixa" — quem abre a demanda descreve a situação, o
 * sistema calcula a urgência.
 */
import { BotaoLink } from "@/componentes/primitivos";
import { exigirUsuario } from "@/server/auth";
import { store } from "@/server/store/arquivoStore";
import { FormularioNovaDemanda } from "./FormularioNovaDemanda";

export default async function PaginaNovaDemanda() {
  await exigirUsuario();
  const base = await store.ler();

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <BotaoLink href="/demandas" variante="fantasma" className="-ml-3 mb-2">
          ← Demandas
        </BotaoLink>
        <h1 className="titulo-tela">Nova demanda</h1>
        <p className="mt-1 text-sm text-tinta-500">
          Descreva o que está acontecendo. O sistema calcula a urgência e já cria o
          primeiro passo — você não precisa saber o fluxo interno.
        </p>
      </header>

      <FormularioNovaDemanda
        locais={base.locais.filter((l) => l.ativo).map((l) => ({ id: l.id, nome: l.nome }))}
        categorias={base.categorias.map((c) => ({ id: c.id, nome: c.nome }))}
      />
    </div>
  );
}
