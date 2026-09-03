/**
 * PAINEL — Central operacional.
 *
 * Não é uma coleção de gráficos. A tela responde, de cima para baixo, às
 * perguntas que o usuário faria ao abrir o sistema:
 *
 *   O que precisa de mim agora?  -> Precisa da sua atenção
 *   O que devo fazer?            -> Próximos movimentos (meus)
 *   O que está acontecendo?      -> Demandas em destaque
 *   Como está a operação?        -> Indicadores resumidos
 *
 * Se nada disso existir, a tela diz explicitamente que a operação está saudável
 * — o silêncio também é informação.
 */
import Link from "next/link";
import { CartaoAtencao } from "@/componentes/CartaoAtencao";
import { CartaoDemanda } from "@/componentes/CartaoDemanda";
import {
  BotaoLink,
  Cartao,
  QuemAge,
  SeloPrioridade,
  TituloSecao,
  Vazio,
} from "@/componentes/primitivos";
import { plural, primeiroNome, prazoLegivel, saudacao } from "@/lib/formato";
import { exigirUsuario } from "@/server/auth";
import { dadosPainel } from "@/server/consultas";

export default async function Painel() {
  const usuario = await exigirUsuario();
  const dados = await dadosPainel(usuario);
  const { atencao, destaques, minhaOperacao, contagens } = dados;

  const fazerAgora = minhaOperacao.fazerAgora;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        {/* A frase de resumo é limitada para não empurrar a ação principal. */}
        <div className="max-w-xl">
          <h1 className="titulo-tela">
            {saudacao()}, {primeiroNome(usuario.nome)}
          </h1>
          <p className="mt-1 text-sm text-tinta-500">{resumoDoDia(atencao)}</p>
        </div>
        <BotaoLink href="/demandas/nova" variante="primario">
          + Nova demanda
        </BotaoLink>
      </header>

      {/* ------------------------------------------------------------------ */}
      <section>
        <TituloSecao
          contagem={atencao.precisaDeVoce.length}
          acao={
            atencao.precisaDeVoce.length > 6 ? (
              <Link href="/atencao" className="text-xs font-medium text-obra-700 hover:underline">
                Ver todas
              </Link>
            ) : undefined
          }
        >
          Precisa da sua atenção
        </TituloSecao>

        {atencao.precisaDeVoce.length === 0 ? (
          <Vazio
            titulo="Nada aguardando você agora"
            descricao="Nenhuma decisão pendente, nenhuma ação vencida sob sua responsabilidade."
          />
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {atencao.precisaDeVoce.map((item) => (
              <CartaoAtencao key={item.sinal.id} item={item} />
            ))}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {fazerAgora.length > 0 && (
        <section>
          <TituloSecao
            contagem={fazerAgora.length}
            acao={
              <Link
                href="/minha-operacao"
                className="text-xs font-medium text-obra-700 hover:underline"
              >
                Minha operação
              </Link>
            }
          >
            Seus próximos movimentos
          </TituloSecao>
          <Cartao className="divide-y divide-tinta-100">
            {fazerAgora.slice(0, 5).map(({ movimento, demanda, atrasado }) => (
              <Link
                key={movimento.id}
                href={`/demandas/${demanda.id}`}
                className="foco-visivel flex items-start gap-3 p-3.5 transition hover:bg-tinta-50 sm:items-center"
              >
                <span
                  className={`mt-1 size-2 shrink-0 rounded-full sm:mt-0 ${
                    atrasado ? "bg-red-500" : "bg-amber-400"
                  }`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-tinta-900">
                    {movimento.acao}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-tinta-500">
                    {demanda.codigo} · {demanda.titulo}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <SeloPrioridade nivel={demanda.prioridade.nivel} />
                  <span
                    className={`text-[11px] ${
                      atrasado ? "font-medium text-red-600" : "text-tinta-500"
                    }`}
                  >
                    {prazoLegivel(movimento.prazo)}
                  </span>
                </div>
              </Link>
            ))}
          </Cartao>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {atencao.proximas48h.length > 0 && (
        <section>
          <TituloSecao contagem={atencao.proximas48h.length}>
            Atenção nas próximas 48 horas
          </TituloSecao>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {atencao.proximas48h.slice(0, 4).map((item) => (
              <CartaoAtencao key={item.sinal.id} item={item} />
            ))}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {atencao.aguardandoTerceiros.length > 0 && (
        <section>
          <TituloSecao contagem={atencao.aguardandoTerceiros.length}>
            Aguardando outras pessoas
          </TituloSecao>
          <Cartao className="divide-y divide-tinta-100">
            {atencao.aguardandoTerceiros.slice(0, 4).map((item) => (
              <Link
                key={item.sinal.id}
                href={item.href}
                className="foco-visivel flex flex-wrap items-center gap-x-3 gap-y-1 p-3.5 transition hover:bg-tinta-50"
              >
                <p className="min-w-0 flex-1 text-sm text-tinta-800">
                  {item.sinal.mensagem}
                </p>
                <QuemAge
                  nome={item.responsavel?.nome}
                  id={item.responsavel?.id}
                  prefixo="Destrava: "
                />
              </Link>
            ))}
          </Cartao>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      <section>
        <TituloSecao
          acao={
            <Link href="/demandas" className="text-xs font-medium text-obra-700 hover:underline">
              Todas as demandas
            </Link>
          }
        >
          Demandas em destaque
        </TituloSecao>
        {destaques.length === 0 ? (
          <Vazio
            titulo="Nenhuma demanda com situação anormal"
            descricao="As demandas em aberto estão avançando dentro do previsto."
          />
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {destaques.map((d) => (
              <CartaoDemanda
                key={d.demanda.id}
                demanda={d.demanda}
                responsavel={d.responsavel}
                proximoMovimento={d.proximoMovimento}
                sinais={d.sinais}
                local={dados.locais.find((l) => l.id === d.demanda.localId)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      <section>
        <TituloSecao>Operação</TituloSecao>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          <Indicador rotulo="Novas" valor={contagens.novas} href="/demandas?estado=EM_TRIAGEM" />
          <Indicador rotulo="Em andamento" valor={contagens.emAndamento} href="/demandas" />
          <Indicador
            rotulo="Bloqueadas"
            valor={contagens.bloqueadas}
            href="/demandas?estado=BLOQUEADA"
            alerta={contagens.bloqueadas > 0}
          />
          <Indicador
            rotulo="Aguardando aprovação"
            valor={contagens.aguardandoAprovacao}
            href="/demandas?estado=AGUARDANDO_APROVACAO"
          />
          <Indicador
            rotulo="Concluídas (7 dias)"
            valor={contagens.concluidasRecentes}
            href="/demandas?estado=CONCLUIDA&concluidas=1"
          />
        </div>
      </section>
    </div>
  );
}

/** Frase de abertura: o sistema diz como está a operação antes de ser perguntado. */
function resumoDoDia(atencao: Awaited<ReturnType<typeof dadosPainel>>["atencao"]): string {
  const r = atencao.resumo;
  const partes: string[] = [];
  if (r.acoesVencidas > 0) {
    partes.push(`${plural(r.acoesVencidas, "ação", "ações")} com prazo ultrapassado`);
  }
  if (r.aprovacoesAguardando > 0) {
    partes.push(
      `${plural(r.aprovacoesAguardando, "aprovação", "aprovações")} aguardando`,
    );
  }
  if (r.semProximoMovimento > 0) {
    partes.push(`${plural(r.semProximoMovimento, "demanda")} sem próximo passo`);
  }
  if (r.demandasBloqueadas > 0) {
    partes.push(plural(r.demandasBloqueadas, "bloqueada"));
  }
  if (partes.length === 0) {
    return "A operação está em dia: nada vencido, nada bloqueado, nada sem direção.";
  }
  return `Na operação agora: ${partes.join(", ")}.`;
}

function Indicador({
  rotulo,
  valor,
  href,
  alerta,
}: {
  rotulo: string;
  valor: number;
  href: string;
  alerta?: boolean;
}) {
  return (
    <Link
      href={href}
      className="foco-visivel rounded-xl border border-tinta-200 bg-white p-3 transition hover:border-tinta-300"
    >
      <p
        className={`text-2xl font-semibold tabular-nums ${
          alerta && valor > 0 ? "text-red-600" : "text-tinta-900"
        }`}
      >
        {valor}
      </p>
      <p className="mt-0.5 text-[11px] leading-tight text-tinta-500">{rotulo}</p>
    </Link>
  );
}
