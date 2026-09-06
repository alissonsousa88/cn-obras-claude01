/**
 * PAINEL — Central operacional.
 *
 * Uma pergunta domina a tela: **o que precisa de você agora**. Tudo o mais é
 * subordinado, e de propósito.
 *
 * A tela já teve seis blocos no mesmo nível visual, com a mesma demanda
 * atravessando três deles. Duas regras evitam a volta disso:
 *
 *   1. Nada que apareceu acima reaparece abaixo.
 *   2. Só o bloco de atenção usa cartão. O resto é linha — porque não é ação
 *      do usuário, é consciência da operação.
 */
import Link from "next/link";
import { CartaoAtencao } from "@/componentes/CartaoAtencao";
import {
  BotaoLink,
  Cartao,
  PontoSinal,
  QuemAge,
  SeloPrioridade,
  TituloSecao,
  Vazio,
} from "@/componentes/primitivos";
import { plural, prazoLegivel, primeiroNome, saudacao } from "@/lib/formato";
import { exigirUsuario } from "@/server/auth";
import { dadosPainel } from "@/server/consultas";

export default async function Painel() {
  const usuario = await exigirUsuario();
  const dados = await dadosPainel(usuario);
  const { atencao, destaques, minhaOperacao, contagens } = dados;

  /**
   * Regra 1 como cascata: cada bloco só mostra o que os anteriores não
   * mostraram. Filtrar apenas um par de blocos não bastava — a mesma demanda
   * reaparecia mais adiante por outro sinal.
   */
  const demandasVistas = new Set<string>();
  const movimentosVistos = new Set<string>();
  const registrar = (demandaId?: string, movimentoId?: string) => {
    if (demandaId) demandasVistas.add(demandaId);
    if (movimentoId) movimentosVistos.add(movimentoId);
  };

  for (const item of atencao.precisaDeVoce) {
    registrar(item.sinal.demandaId, item.sinal.movimentoId);
  }

  const fazerAgora = minhaOperacao.fazerAgora.filter(
    (m) => !movimentosVistos.has(m.movimento.id) && !demandasVistas.has(m.demanda.id),
  );
  for (const m of fazerAgora) registrar(m.demanda.id, m.movimento.id);

  // Sinais de recorrência não têm demanda: seguem sempre visíveis.
  const proximas48h = atencao.proximas48h.filter(
    (i) =>
      (!i.sinal.demandaId || !demandasVistas.has(i.sinal.demandaId)) &&
      (!i.sinal.movimentoId || !movimentosVistos.has(i.sinal.movimentoId)),
  );
  for (const i of proximas48h) registrar(i.sinal.demandaId, i.sinal.movimentoId);

  const aguardandoTerceiros = atencao.aguardandoTerceiros.filter(
    (i) => !i.sinal.demandaId || !demandasVistas.has(i.sinal.demandaId),
  );
  for (const i of aguardandoTerceiros) registrar(i.sinal.demandaId, i.sinal.movimentoId);

  const outrasComSinal = destaques
    .filter((d) => !demandasVistas.has(d.demanda.id))
    .slice(0, 3);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-xl">
          <h1 className="titulo-tela">
            {saudacao()}, {primeiroNome(usuario.nome)}
          </h1>
          <p className="mt-1 text-sm text-tinta-500">
            {resumoDoDia(atencao, usuario.papel === "SOLICITANTE")}
          </p>
        </div>
        <BotaoLink href="/demandas/nova" variante="primario">
          + Nova demanda
        </BotaoLink>
      </header>

      {/* O bloco que justifica a tela. Único que usa cartão. */}
      <section>
        <TituloSecao
          contagem={atencao.precisaDeVoce.length}
          acao={
            atencao.precisaDeVoce.length > 6 ? (
              <Link
                href="/atencao"
                className="text-xs font-medium text-obra-700 hover:underline"
              >
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

      {/* Daqui para baixo, tudo é subordinado: linhas compactas. */}
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
            {fazerAgora.slice(0, 4).map(({ movimento, demanda, atrasado }) => (
              <Link
                key={movimento.id}
                href={`/demandas/${demanda.id}`}
                className="foco-visivel flex flex-wrap items-baseline gap-x-2 gap-y-0.5 p-3 transition hover:bg-tinta-50"
              >
                <span
                  className={`size-2 shrink-0 self-center rounded-full ${
                    atrasado ? "bg-red-500" : "bg-amber-400"
                  }`}
                  aria-hidden
                />
                <span className="text-sm text-tinta-800">{movimento.acao}</span>
                <span
                  className={`text-sm ${
                    atrasado ? "font-medium text-red-600" : "text-tinta-500"
                  }`}
                >
                  {prazoLegivel(movimento.prazo)}
                </span>
                <SeloPrioridade nivel={demanda.prioridade.nivel} />
              </Link>
            ))}
          </Cartao>
        </section>
      )}

      {proximas48h.length > 0 && (
        <section>
          <TituloSecao contagem={proximas48h.length}>
            Atenção nas próximas 48 horas
          </TituloSecao>
          <Cartao className="divide-y divide-tinta-100">
            {proximas48h.slice(0, 5).map((item) => (
              <Link
                key={item.sinal.id}
                href={item.href}
                className="foco-visivel flex flex-wrap items-baseline gap-x-2 gap-y-0.5 p-3 transition hover:bg-tinta-50"
              >
                <span className="text-sm text-tinta-800">{item.sinal.assunto}</span>
                <span className="text-sm text-tinta-500">{item.sinal.mensagem}</span>
                {item.responsavel && (
                  <span className="ml-auto text-[11px] text-tinta-400">
                    {item.responsavel.nome}
                  </span>
                )}
              </Link>
            ))}
          </Cartao>
        </section>
      )}

      {aguardandoTerceiros.length > 0 && (
        <section>
          <TituloSecao contagem={aguardandoTerceiros.length}>
            Aguardando outras pessoas
          </TituloSecao>
          <Cartao className="divide-y divide-tinta-100">
            {aguardandoTerceiros.slice(0, 4).map((item) => (
              <Link
                key={item.sinal.id}
                href={item.href}
                className="foco-visivel flex flex-wrap items-center gap-x-3 gap-y-1 p-3 transition hover:bg-tinta-50"
              >
                <p className="min-w-0 flex-1 text-sm text-tinta-800">
                  <span className="font-medium">{item.sinal.assunto}</span>{" "}
                  <span className="text-tinta-500">{item.sinal.mensagem}</span>
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

      {outrasComSinal.length > 0 && (
        <section>
          <TituloSecao
            contagem={outrasComSinal.length}
            acao={
              <Link
                href="/demandas"
                className="text-xs font-medium text-obra-700 hover:underline"
              >
                Todas as demandas
              </Link>
            }
          >
            Outras demandas com sinal
          </TituloSecao>
          <Cartao className="divide-y divide-tinta-100">
            {outrasComSinal.map((d) => (
              <Link
                key={d.demanda.id}
                href={`/demandas/${d.demanda.id}`}
                className="foco-visivel flex flex-wrap items-baseline gap-x-2 gap-y-0.5 p-3 transition hover:bg-tinta-50"
              >
                <PontoSinal nivel={d.sinais[0]?.nivel ?? "INFO"} />
                <span className="text-sm text-tinta-800">{d.demanda.titulo}</span>
                <span className="text-sm text-tinta-500">{d.sinais[0]?.mensagem}</span>
                {d.responsavel && (
                  <span className="ml-auto text-[11px] text-tinta-400">
                    {d.responsavel.nome}
                  </span>
                )}
              </Link>
            ))}
          </Cartao>
        </section>
      )}

      {/* Resumo navegável em uma linha. Cinco quadros grandes repetiam, em
          números, o que a frase de abertura já diz em prosa. */}
      <section className="border-t border-tinta-200 pt-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-tinta-500">
          <Contador
            rotulo="novas"
            valor={contagens.novas}
            href="/demandas?estado=EM_TRIAGEM"
          />
          <Contador rotulo="em andamento" valor={contagens.emAndamento} href="/demandas" />
          <Contador
            rotulo="bloqueadas"
            valor={contagens.bloqueadas}
            href="/demandas?estado=BLOQUEADA"
            alerta
          />
          <Contador
            rotulo="aguardando aprovação"
            valor={contagens.aguardandoAprovacao}
            href="/demandas?estado=AGUARDANDO_APROVACAO"
          />
          <Contador
            rotulo="concluídas em 7 dias"
            valor={contagens.concluidasRecentes}
            href="/demandas?estado=CONCLUIDA&concluidas=1"
          />
        </div>
      </section>
    </div>
  );
}

function Contador({
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
    <Link href={href} className="foco-visivel hover:text-tinta-700">
      <span
        className={`numerico font-semibold ${
          alerta && valor > 0 ? "text-red-600" : "text-tinta-800"
        }`}
      >
        {valor}
      </span>{" "}
      {rotulo}
    </Link>
  );
}

/**
 * Frase de abertura: o sistema diz como estão as coisas antes de ser
 * perguntado. Os números já vêm no escopo do usuário — para o solicitante,
 * falam das solicitações dele, não da operação inteira.
 */
function resumoDoDia(
  atencao: Awaited<ReturnType<typeof dadosPainel>>["atencao"],
  souSolicitante: boolean,
): string {
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
    return souSolicitante
      ? "Suas solicitações estão avançando: nada vencido nem bloqueado."
      : "A operação está em dia: nada vencido, nada bloqueado, nada sem direção.";
  }
  return souSolicitante
    ? `Nas suas solicitações: ${partes.join(", ")}.`
    : `Na operação agora: ${partes.join(", ")}.`;
}
