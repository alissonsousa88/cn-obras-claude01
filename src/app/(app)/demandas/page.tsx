/**
 * LISTA DE DEMANDAS
 *
 * Deliberadamente não é a tela inicial e não é uma tabela: a ordenação padrão é
 * por relevância operacional (sinais ativos e prioridade), não por data. Quem
 * chega aqui já sabe o que procura — os filtros servem a isso.
 */
import { BotaoLink, Vazio } from "@/componentes/primitivos";
import { CartaoDemanda } from "@/componentes/CartaoDemanda";
import { exigirUsuario } from "@/server/auth";
import { listarDemandas } from "@/server/consultas";
import { FiltrosDemandas } from "./FiltrosDemandas";

export default async function PaginaDemandas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const usuario = await exigirUsuario();
  const p = await searchParams;

  const { linhas, locais, categorias, usuarios } = await listarDemandas(usuario, {
    estado: p.estado,
    localId: p.local,
    categoriaId: p.categoria,
    responsavelId: p.responsavel,
    busca: p.q,
    incluirConcluidas: p.concluidas === "1" || p.estado === "CONCLUIDA",
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titulo-tela">Demandas</h1>
          <p className="mt-1 text-sm text-tinta-500">
            {linhas.length} demanda{linhas.length === 1 ? "" : "s"}, ordenadas pelo que
            está acontecendo com elas.
          </p>
        </div>
        <BotaoLink href="/demandas/nova" variante="primario">
          + Nova demanda
        </BotaoLink>
      </header>

      <FiltrosDemandas
        locais={locais}
        categorias={categorias}
        usuarios={usuarios}
        atual={p}
      />

      {linhas.length === 0 ? (
        <Vazio
          titulo="Nenhuma demanda encontrada"
          descricao="Ajuste os filtros ou abra uma nova demanda."
          icone="▤"
        />
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {linhas.map((l) => (
            <CartaoDemanda
              key={l.demanda.id}
              demanda={l.demanda}
              local={l.local}
              responsavel={l.responsavel}
              proximoMovimento={l.proximoMovimento}
              sinais={l.sinais}
              semDirecao={l.semDirecao}
            />
          ))}
        </div>
      )}
    </div>
  );
}
