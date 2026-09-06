/**
 * MINHA OPERAÇÃO — inbox individual.
 *
 * Feita para o celular em primeiro lugar: é a tela que a equipe abre em campo,
 * entre uma tarefa e outra. Cada bloco corresponde a um estado mental
 * diferente — "o que faço agora", "o que vem depois", "o que não depende de
 * mim", "o que preciso decidir" e "o que eu já resolvi".
 */
import Link from "next/link";
import {
  BotaoLink,
  Cartao,
  QuemAge,
  SeloEstado,
  SeloPrioridade,
  TituloSecao,
  Vazio,
} from "@/componentes/primitivos";
import { ROTULO_TIPO_MOVIMENTO } from "@/domain/rotulos";
import type { MovimentoComContexto } from "@/domain/motorAtencao";
import { dataHora, prazoLegivel, primeiroNome, relativo } from "@/lib/formato";
import { exigirUsuario } from "@/server/auth";
import { minhaOperacao } from "@/server/consultas";

export default async function PaginaMinhaOperacao() {
  const usuario = await exigirUsuario();
  const op = await minhaOperacao(usuario);
  const atrasadas = op.fazerAgora.filter((m) => m.atrasado).length;

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titulo-tela">Minha operação</h1>
          <p className="mt-1 text-sm text-tinta-500">
            {op.fazerAgora.length === 0 && op.precisaMinhaDecisao.length === 0
              ? `Nada pendente com você agora, ${primeiroNome(usuario.nome)}.`
              : `${op.fazerAgora.length} para fazer agora${
                  atrasadas > 0 ? ` (${atrasadas} em atraso)` : ""
                }${
                  op.precisaMinhaDecisao.length > 0
                    ? ` · ${op.precisaMinhaDecisao.length} aguardando sua decisão`
                    : ""
                }.`}
          </p>
        </div>
        <BotaoLink href="/demandas/nova">+ Nova demanda</BotaoLink>
      </header>

      {op.precisaMinhaDecisao.length > 0 && (
        <Secao titulo="Precisa da minha decisão" itens={op.precisaMinhaDecisao} destaque />
      )}

      <section>
        <TituloSecao contagem={op.fazerAgora.length}>Fazer agora</TituloSecao>
        {op.fazerAgora.length === 0 ? (
          <Vazio
            titulo="Nada vencendo nas próximas 48 horas"
            descricao="O que estiver mais adiante aparece em “Próximas”."
          />
        ) : (
          <Lista itens={op.fazerAgora} />
        )}
      </section>

      {op.proximas.length > 0 && <Secao titulo="Próximas" itens={op.proximas} />}

      {op.aguardandoTerceiros.length > 0 && (
        <section>
          <TituloSecao contagem={op.aguardandoTerceiros.length}>
            Aguardando terceiros
          </TituloSecao>
          <p className="-mt-2 mb-3 text-xs text-tinta-500">
            Você não consegue avançar sozinho nestas. Alguém precisa destravar.
          </p>
          <Cartao className="divide-y divide-tinta-100">
            {op.aguardandoTerceiros.map(({ demanda, motivo, responsavel }) => (
              <Link
                key={demanda.id}
                href={`/demandas/${demanda.id}`}
                className="foco-visivel block p-3.5 transition hover:bg-tinta-50"
              >
                <p className="text-sm font-medium text-tinta-900">{demanda.titulo}</p>
                <p className="mt-0.5 text-xs text-tinta-600">{motivo}</p>
                <div className="mt-2">
                  <QuemAge
                    nome={responsavel?.nome}
                    id={responsavel?.id}
                    prefixo="Precisa destravar: "
                  />
                </div>
              </Link>
            ))}
          </Cartao>
        </section>
      )}

      {op.concluidoRecentemente.length > 0 && (
        <section>
          <TituloSecao contagem={op.concluidoRecentemente.length}>
            Concluído recentemente
          </TituloSecao>
          <p className="-mt-2 mb-3 text-xs text-tinta-500">
            O que avançou por suas mãos nos últimos dias.
          </p>
          <Cartao className="divide-y divide-tinta-100">
            {op.concluidoRecentemente.map(({ movimento, demanda }) => (
              <Link
                key={movimento.id}
                href={`/demandas/${demanda.id}`}
                className="foco-visivel flex items-center gap-3 p-3 transition hover:bg-tinta-50"
              >
                <span className="text-emerald-600" aria-hidden>
                  ✓
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-tinta-700">{movimento.acao}</p>
                  <p className="truncate text-[11px] text-tinta-400">
                    {demanda.codigo} · concluído {relativo(movimento.concluidoEm ?? 0)}
                  </p>
                </div>
                <SeloEstado estado={demanda.estado} />
              </Link>
            ))}
          </Cartao>
        </section>
      )}
    </div>
  );
}

function Secao({
  titulo,
  itens,
  destaque,
}: {
  titulo: string;
  itens: MovimentoComContexto[];
  destaque?: boolean;
}) {
  return (
    <section>
      <TituloSecao contagem={itens.length}>{titulo}</TituloSecao>
      <Lista itens={itens} destaque={destaque} />
    </section>
  );
}

function Lista({
  itens,
  destaque,
}: {
  itens: MovimentoComContexto[];
  destaque?: boolean;
}) {
  return (
    <div className="space-y-2.5">
      {itens.map(({ movimento, demanda, atrasado }) => (
        <Link
          key={movimento.id}
          href={`/demandas/${demanda.id}`}
          className={`foco-visivel block rounded-xl border bg-white p-4 transition hover:shadow-sm ${
            destaque
              ? "border-obra-200 bg-obra-50/60"
              : atrasado
                ? "border-red-200"
                : "border-tinta-200"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-tinta-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-tinta-600">
              {ROTULO_TIPO_MOVIMENTO[movimento.tipo]}
            </span>
            <SeloPrioridade nivel={demanda.prioridade.nivel} />
            <span className="numerico ml-auto text-[11px] text-tinta-400">
              {demanda.codigo}
            </span>
          </div>

          <p className="mt-2 text-sm font-semibold leading-snug text-tinta-900">
            {movimento.acao}
          </p>
          <p className="mt-1 text-xs text-tinta-500">
            Resultado esperado: {movimento.resultadoEsperado}
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span
              className={`text-xs font-medium ${
                atrasado ? "text-red-600" : "text-tinta-600"
              }`}
            >
              {prazoLegivel(movimento.prazo)}
            </span>
            <span className="text-[11px] text-tinta-400">{dataHora(movimento.prazo)}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
