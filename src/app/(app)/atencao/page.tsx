/**
 * CENTRAL DE ATENÇÃO
 *
 * Consolida tudo que está fora do normal, já ordenado pelo Motor de Atenção.
 * Os filtros existem, mas são secundários: o usuário não precisa configurar
 * nada para descobrir o que importa — a ordem já é a resposta.
 */
import { CartaoAtencao } from "@/componentes/CartaoAtencao";
import { TituloSecao, Vazio } from "@/componentes/primitivos";
import { ROTULO_SINAL } from "@/domain/rotulos";
import type { ItemAtencao } from "@/domain/motorAtencao";
import type { NivelSinal, TipoSinal } from "@/domain/tipos";
import { exigirUsuario } from "@/server/auth";
import { painelAtencaoCompleto } from "@/server/consultas";
import { FiltrosAtencao } from "./FiltrosAtencao";

export default async function PaginaAtencao({
  searchParams,
}: {
  searchParams: Promise<{ nivel?: string; tipo?: string }>;
}) {
  const usuario = await exigirUsuario();
  const painel = await painelAtencaoCompleto(usuario);
  const filtros = await searchParams;

  const aplicar = (itens: ItemAtencao[]) =>
    itens
      .filter((i) => !filtros.nivel || i.sinal.nivel === (filtros.nivel as NivelSinal))
      .filter((i) => !filtros.tipo || i.sinal.tipo === (filtros.tipo as TipoSinal));

  const precisa = aplicar(painel.precisaDeVoce);
  const proximas = aplicar(painel.proximas48h);
  const terceiros = aplicar(painel.aguardandoTerceiros);
  const operacao = aplicar(painel.operacao);
  const total = precisa.length + proximas.length + terceiros.length + operacao.length;

  // Tipos presentes, para que o filtro só ofereça o que existe de verdade.
  const tiposPresentes = [
    ...new Set(
      [
        ...painel.precisaDeVoce,
        ...painel.proximas48h,
        ...painel.aguardandoTerceiros,
        ...painel.operacao,
      ].map((i) => i.sinal.tipo),
    ),
  ].map((t) => ({ valor: t, rotulo: ROTULO_SINAL[t] }));

  return (
    <div className="space-y-7">
      <header>
        <h1 className="titulo-tela">Central de Atenção</h1>
        <p className="mt-1 text-sm text-tinta-500">
          Tudo que está fora do normal na operação, já ordenado por urgência. Você não
          precisa filtrar para saber por onde começar.
        </p>
      </header>

      <FiltrosAtencao tipos={tiposPresentes} atual={filtros} />

      {total === 0 ? (
        <Vazio
          titulo={
            painel.saudavel
              ? "Operação saudável"
              : "Nenhuma situação corresponde a este filtro"
          }
          descricao={
            painel.saudavel
              ? "Demandas avançando, ações dentro do prazo e nenhum bloqueio crítico."
              : "Limpe os filtros para ver todas as situações."
          }
        />
      ) : (
        <div className="space-y-7">
          <Bloco
            titulo="Precisa de você agora"
            descricao="Decisões e ações sob sua responsabilidade."
            itens={precisa}
          />
          <Bloco
            titulo="Atenção nas próximas 48 horas"
            descricao="Ainda não é problema — e é por isso que dá para evitar."
            itens={proximas}
          />
          <Bloco
            titulo="Aguardando terceiros"
            descricao="A bola está com outra pessoa. Acompanhe e cobre se travar."
            itens={terceiros}
          />
          <Bloco
            titulo="Outras situações da operação"
            descricao="Não é sua responsabilidade direta, mas está acontecendo."
            itens={operacao}
          />
        </div>
      )}
    </div>
  );
}

function Bloco({
  titulo,
  descricao,
  itens,
}: {
  titulo: string;
  descricao: string;
  itens: ItemAtencao[];
}) {
  if (itens.length === 0) return null;
  return (
    <section>
      <TituloSecao contagem={itens.length}>{titulo}</TituloSecao>
      <p className="-mt-2 mb-3 text-xs text-tinta-500">{descricao}</p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {itens.map((item) => (
          <CartaoAtencao key={item.sinal.id} item={item} />
        ))}
      </div>
    </section>
  );
}
