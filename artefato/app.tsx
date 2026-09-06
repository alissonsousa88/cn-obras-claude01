/**
 * CN OBRAS — versão navegável no navegador.
 *
 * Esta página executa o sistema real. Os quatro motores, os serviços de
 * domínio e os dados de demonstração entram no bundle SEM MODIFICAÇÃO, a
 * partir de `src/domain/` e `src/server/servicos/` — a mesma camada que roda
 * no servidor Next. É possível porque o domínio foi escrito sem I/O e sem
 * dependência de framework.
 *
 * O que muda em relação à aplicação completa:
 *   - não há servidor: o estado vive na memória e no localStorage do navegador;
 *   - a troca de perfil é uma escolha local, não autenticação;
 *   - ganha um controle de tempo, que não existe no produto: permite ver o
 *     Motor de Sinais reagindo ao relógio sem esperar dias.
 */
import {
  BarChart3,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  LayoutDashboard,
  List,
  Radar,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { createRoot } from "react-dom/client";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CartaoAtencao } from "@/componentes/CartaoAtencao";
import { CartaoDemanda } from "@/componentes/CartaoDemanda";
import {
  Avatar,
  Botao,
  Campo,
  Cartao,
  EtiquetaSinal,
  PontoSinal,
  QuemAge,
  SeloEstado,
  SeloPrioridade,
  TituloSecao,
  Vazio,
  classeInput,
} from "@/componentes/primitivos";
import { calcularMetricas } from "@/domain/analiseHistorico";
import {
  demandasEmDestaque,
  montarAtencao,
  montarMinhaOperacao,
} from "@/domain/motorAtencao";
import { movimentoAtual, podeConcluir, semDirecao } from "@/domain/motorFluxo";
import { plural } from "@/domain/plural";
import { DIA, REGRAS } from "@/domain/regras";
import {
  ROTULO_ESTADO,
  ROTULO_EVENTO,
  ROTULO_IMPEDIMENTO,
  ROTULO_PAPEL,
  ROTULO_PRIORIDADE,
  ROTULO_SINAL,
  ROTULO_TIPO_MOVIMENTO,
} from "@/domain/rotulos";
import type {
  Demanda,
  ID,
  Impedimento,
  Movimento,
  NivelPrioridade,
  TipoImpedimento,
  Usuario,
} from "@/domain/tipos";
import {
  data,
  dataHora,
  paraInputDateTime,
  prazoLegivel,
  primeiroNome,
  relativo,
  saudacao,
} from "@/lib/formato";
import { pode, podeVerDemanda } from "@/server/permissoes";
import { decidirAprovacao } from "@/server/servicos/aprovacoes";
import { snapshotDe } from "@/server/servicos/comum";
import { comentar } from "@/server/servicos/conversa";
import {
  abrirDemanda,
  ajustarPrioridade,
  atribuirResponsavel,
  concluirDemanda,
} from "@/server/servicos/demandas";
import {
  registrarImpedimento,
  resolverImpedimento,
} from "@/server/servicos/impedimentos";
import {
  concluirMovimento,
  definirProximoMovimento,
} from "@/server/servicos/movimentos";
import { gerarOcorrencia } from "@/server/servicos/recorrencias";
import { executarTick } from "@/server/servicos/tick";
import type { BaseDados } from "@/server/store/port";
import { construirSeed } from "@/server/store/seed";

// ---------------------------------------------------------------------------
// Estado da sessão local
// ---------------------------------------------------------------------------

const CHAVE = "cn-obras-demonstracao-v1";

interface Sessao {
  base: BaseDados;
  /** Deslocamento do relógio, em ms. Só existe nesta versão. */
  deslocamento: number;
  usuarioId: ID;
}

function novaSessao(): Sessao {
  const agora = Date.now();
  const base = construirSeed(agora);
  return {
    base,
    deslocamento: 0,
    usuarioId: base.usuarios.find((u) => u.papel === "LIDERANCA")!.id,
  };
}

function carregarSessao(): Sessao {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (bruto) return JSON.parse(bruto) as Sessao;
  } catch {
    // Janela anônima ou armazenamento bloqueado: começa do zero.
  }
  return novaSessao();
}

function salvarSessao(s: Sessao): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(s));
  } catch {
    // Sem armazenamento a sessão continua funcionando, só não sobrevive ao recarregar.
  }
}

// ---------------------------------------------------------------------------
// Roteamento por hash
// ---------------------------------------------------------------------------

function usarRota(): string {
  const [rota, setRota] = useState(() => location.hash.slice(1) || "/");
  useEffect(() => {
    const aoMudar = () => {
      setRota(location.hash.slice(1) || "/");
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", aoMudar);
    return () => window.removeEventListener("hashchange", aoMudar);
  }, []);
  return rota;
}

function ir(destino: string): void {
  location.hash = destino;
}

// ---------------------------------------------------------------------------
// Aplicação
// ---------------------------------------------------------------------------

function App() {
  const [sessao, setSessao] = useState<Sessao>(carregarSessao);
  const [aviso, setAviso] = useState<{ texto: string; erro?: boolean } | null>(null);
  const rota = usarRota();

  const agora = sessao.base ? Date.now() + sessao.deslocamento : Date.now();
  const usuario =
    sessao.base.usuarios.find((u) => u.id === sessao.usuarioId) ??
    sessao.base.usuarios[0]!;

  useEffect(() => salvarSessao(sessao), [sessao]);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 6000);
    return () => clearTimeout(t);
  }, [aviso]);

  /**
   * Aplica uma operação de domínio: clona a base, executa o serviço real e
   * guarda o resultado. Erros de regra (ex.: "impedimento precisa de
   * responsável") chegam como mensagem, exatamente como na aplicação completa.
   */
  const aplicar = useCallback(
    (fn: (base: BaseDados, agora: number) => string | void) => {
      setSessao((atual) => {
        const proxima = structuredClone(atual.base);
        const instante = Date.now() + atual.deslocamento;
        try {
          const mensagem = fn(proxima, instante);
          setAviso(mensagem ? { texto: mensagem } : null);
          return { ...atual, base: proxima };
        } catch (e) {
          setAviso({
            texto: e instanceof Error ? e.message : "Não foi possível concluir.",
            erro: true,
          });
          return atual;
        }
      });
    },
    [],
  );

  const avancarTempo = useCallback((dias: number) => {
    setSessao((atual) => {
      const deslocamento = atual.deslocamento + dias * DIA;
      const proxima = structuredClone(atual.base);
      const resultado = executarTick(proxima, Date.now() + deslocamento);
      const partes = [
        resultado.ocorrenciasAbertas > 0 &&
          `${plural(resultado.ocorrenciasAbertas, "rotina preventiva", "rotinas preventivas")} virou demanda`,
        resultado.sinaisAbertos > 0 && `${plural(resultado.sinaisAbertos, "sinal", "sinais")} aberto`,
        resultado.sinaisResolvidos > 0 &&
          `${plural(resultado.sinaisResolvidos, "sinal", "sinais")} resolvido`,
        resultado.prioridadesAlteradas > 0 &&
          `${plural(resultado.prioridadesAlteradas, "prioridade")} recalculada`,
      ].filter(Boolean);
      setAviso({
        texto:
          partes.length > 0
            ? `Avançamos ${plural(dias, "dia")}: ${partes.join(", ")}.`
            : `Avançamos ${plural(dias, "dia")}. Nada mudou na operação.`,
      });
      return { ...atual, base: proxima, deslocamento };
    });
  }, []);

  const reiniciar = useCallback(() => {
    setSessao(novaSessao());
    setAviso({ texto: "Demonstração reiniciada." });
    ir("/");
  }, []);

  const snap = useMemo(
    () => snapshotDe(sessao.base, agora),
    [sessao.base, agora],
  );

  const conteudo = renderizarRota(rota, {
    base: sessao.base,
    snap,
    usuario,
    agora,
    aplicar,
  });

  const atencao = montarAtencao(snap, usuario);
  const minha = montarMinhaOperacao(snap, usuario);

  return (
    <div className="min-h-dvh">
      <BarraLateral
        usuario={usuario}
        usuarios={sessao.base.usuarios}
        aoTrocarUsuario={(id) => setSessao((a) => ({ ...a, usuarioId: id }))}
        rota={rota}
        contadorAtencao={atencao.precisaDeVoce.length}
        contadorMinhas={minha.fazerAgora.filter((m) => m.atrasado).length}
        podeVerMetricas={pode(usuario, "ver_metricas")}
        deslocamentoDias={Math.round(sessao.deslocamento / DIA)}
        aoAvancar={avancarTempo}
        aoReiniciar={reiniciar}
      />

      <main className="pb-28 lg:ml-64 lg:pb-10">
        <div className="mx-auto max-w-5xl px-4 pt-4 sm:px-6 lg:px-8">
          <FaixaExplicativa />
        </div>
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {conteudo}
        </div>
      </main>

      {aviso && (
        <div
          role="status"
          className={`fixed inset-x-3 bottom-20 z-40 mx-auto max-w-lg rounded-xl px-4 py-3 text-sm shadow-lg lg:bottom-6 ${
            aviso.erro
              ? "bg-red-600 text-white"
              : "bg-tinta-900 text-white"
          }`}
        >
          {aviso.texto}
        </div>
      )}

      <BarraInferior
        rota={rota}
        contadorAtencao={atencao.precisaDeVoce.length}
        contadorMinhas={minha.fazerAgora.filter((m) => m.atrasado).length}
      />
    </div>
  );
}

/**
 * Explica, para quem abre o link sem contexto, o que esta página é.
 * Fica dentro da coluna de conteúdo — a barra lateral é fixa e cobriria uma
 * faixa colada ao topo do documento.
 */
function FaixaExplicativa() {
  const [visivel, setVisivel] = useState(
    () => localStorage.getItem("cn-obras-faixa") !== "oculta",
  );
  if (!visivel) return null;
  return (
    <div className="flex items-start gap-3 rounded-xl bg-tinta-900 px-4 py-3 text-[12px] leading-snug text-tinta-300">
      <p className="flex-1">
        <strong className="font-semibold text-white">
          Este é o CN Obras rodando de verdade.
        </strong>{" "}
        Os quatro motores, as regras de domínio e os dados de demonstração são o mesmo
        código que roda no servidor, compilado para o navegador. Troque de perfil e
        adiante o relógio na barra lateral para ver os motores trabalhando. Nada sai
        deste navegador.
      </p>
      <button
        type="button"
        onClick={() => {
          try {
            localStorage.setItem("cn-obras-faixa", "oculta");
          } catch {
            // Sem armazenamento a faixa volta no próximo carregamento.
          }
          setVisivel(false);
        }}
        className="foco-visivel shrink-0 rounded px-2 py-0.5 text-tinta-400 transition hover:bg-tinta-800 hover:text-white"
        aria-label="Fechar aviso"
      >
        ×
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Navegação
// ---------------------------------------------------------------------------

/** Família de ícones do sistema: Lucide, a mesma da aplicação completa. */
const ITENS: { href: string; rotulo: string; curto: string; Icone: LucideIcon }[] = [
  { href: "/", rotulo: "Painel", curto: "Painel", Icone: LayoutDashboard },
  { href: "/atencao", rotulo: "Central de Atenção", curto: "Atenção", Icone: Radar },
  { href: "/minha-operacao", rotulo: "Minha operação", curto: "Minhas", Icone: ClipboardCheck },
  { href: "/demandas", rotulo: "Demandas", curto: "Demandas", Icone: List },
  { href: "/recorrencias", rotulo: "Rotinas preventivas", curto: "Rotinas", Icone: RefreshCw },
  { href: "/aprendizado", rotulo: "Aprendizado", curto: "Dados", Icone: BarChart3 },
];

function ativo(rota: string, href: string): boolean {
  return href === "/" ? rota === "/" : rota.startsWith(href);
}

function BarraLateral({
  usuario,
  usuarios,
  aoTrocarUsuario,
  rota,
  contadorAtencao,
  contadorMinhas,
  podeVerMetricas,
  deslocamentoDias,
  aoAvancar,
  aoReiniciar,
}: {
  usuario: Usuario;
  usuarios: Usuario[];
  aoTrocarUsuario: (id: ID) => void;
  rota: string;
  contadorAtencao: number;
  contadorMinhas: number;
  podeVerMetricas: boolean;
  deslocamentoDias: number;
  aoAvancar: (dias: number) => void;
  aoReiniciar: () => void;
}) {
  const itens = ITENS.filter((i) => i.href !== "/aprendizado" || podeVerMetricas);

  return (
    <nav className="fixed inset-y-0 left-0 hidden w-64 flex-col overflow-y-auto border-r border-tinta-200 bg-white lg:flex">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex size-9 items-center justify-center rounded-lg bg-tinta-900 text-sm font-bold text-white">
          CN
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-tinta-900">CN Obras</p>
          <p className="text-[11px] text-tinta-500">Gestão de infraestrutura</p>
        </div>
      </div>

      <ul className="space-y-0.5 px-3 py-2">
        {itens.map((item) => {
          const contador =
            item.href === "/atencao"
              ? contadorAtencao
              : item.href === "/minha-operacao"
                ? contadorMinhas
                : 0;
          return (
            <li key={item.href}>
              <a
                href={`#${item.href}`}
                className={`foco-visivel flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                  ativo(rota, item.href)
                    ? "bg-tinta-100 font-semibold text-tinta-900"
                    : "text-tinta-600 hover:bg-tinta-50"
                }`}
              >
                <item.Icone className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                <span className="flex-1">{item.rotulo}</span>
                {contador > 0 && (
                  <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-700">
                    {contador}
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto space-y-3 border-t border-tinta-200 p-3">
        <div>
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-tinta-500">
            Ver como
          </label>
          <select
            value={usuario.id}
            onChange={(e) => aoTrocarUsuario(e.target.value)}
            className="foco-visivel w-full rounded-lg border-0 bg-tinta-50 py-1.5 pl-2 pr-6 text-xs text-tinta-800 ring-1 ring-inset ring-tinta-200"
          >
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome} — {ROTULO_PAPEL[u.papel]}
              </option>
            ))}
          </select>
          <div className="mt-2 flex items-center gap-2">
            <Avatar nome={usuario.nome} id={usuario.id} tamanho="sm" />
            <span className="text-xs font-medium text-tinta-700">
              {ROTULO_PAPEL[usuario.papel]}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-tinta-500">
            Cada perfil enxerga uma operação diferente.
          </p>
        </div>

        <div className="rounded-lg bg-tinta-50 p-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-tinta-500">
            Adiantar o relógio
          </p>
          <p className="mt-1 text-[11px] leading-snug text-tinta-500">
            Só existe nesta demonstração: mostra os motores reagindo ao tempo
            sem esperar dias.
          </p>
          <div className="mt-2 flex gap-1.5">
            {[1, 3, 7].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => aoAvancar(d)}
                className="foco-visivel flex-1 rounded-md bg-white px-2 py-1 text-xs font-medium text-tinta-700 ring-1 ring-inset ring-tinta-200 transition hover:bg-tinta-100"
              >
                +{d}d
              </button>
            ))}
          </div>
          {deslocamentoDias > 0 && (
            <p className="mt-1.5 text-[11px] text-obra-700">
              {plural(deslocamentoDias, "dia")} à frente
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={aoReiniciar}
          className="foco-visivel w-full rounded-lg px-3 py-1.5 text-left text-xs text-tinta-500 hover:bg-tinta-50 hover:text-tinta-700"
        >
          Reiniciar demonstração
        </button>
      </div>
    </nav>
  );
}

function BarraInferior({
  rota,
  contadorAtencao,
  contadorMinhas,
}: {
  rota: string;
  contadorAtencao: number;
  contadorMinhas: number;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-tinta-200 bg-white/95 backdrop-blur lg:hidden">
      {ITENS.slice(0, 4).map((item) => {
        const contador =
          item.href === "/atencao"
            ? contadorAtencao
            : item.href === "/minha-operacao"
              ? contadorMinhas
              : 0;
        return (
          <a
            key={item.href}
            href={`#${item.href}`}
            className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] transition ${
              ativo(rota, item.href)
                ? "font-semibold text-tinta-900"
                : "text-tinta-500"
            }`}
          >
            <span className="relative">
              <item.Icone className="size-5" strokeWidth={1.75} aria-hidden />
              {contador > 0 && (
                <span className="absolute -right-1.5 -top-0.5 size-2 rounded-full bg-red-500 ring-2 ring-white" />
              )}
            </span>
            {item.curto}
          </a>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Contexto passado às telas
// ---------------------------------------------------------------------------

interface Ctx {
  base: BaseDados;
  snap: ReturnType<typeof snapshotDe>;
  usuario: Usuario;
  agora: number;
  aplicar: (fn: (base: BaseDados, agora: number) => string | void) => void;
}

function renderizarRota(rota: string, ctx: Ctx) {
  if (rota === "/") return <Painel ctx={ctx} />;
  if (rota === "/atencao") return <CentralAtencao ctx={ctx} />;
  if (rota === "/minha-operacao") return <MinhaOperacao ctx={ctx} />;
  if (rota === "/demandas/nova") return <NovaDemanda ctx={ctx} />;
  if (rota.startsWith("/demandas/")) {
    return <TelaDemanda ctx={ctx} id={rota.slice("/demandas/".length)} />;
  }
  if (rota === "/demandas") return <ListaDemandas ctx={ctx} />;
  if (rota === "/recorrencias") return <Recorrencias ctx={ctx} />;
  if (rota === "/aprendizado") return <Aprendizado ctx={ctx} />;
  return <Vazio titulo="Página não encontrada" icone={CircleHelp} />;
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------

function Painel({ ctx }: { ctx: Ctx }) {
  const { snap, usuario, base } = ctx;
  const atencao = montarAtencao(snap, usuario, { limitePorBloco: 6 });
  const minha = montarMinhaOperacao(snap, usuario);
  const destaques = demandasEmDestaque(snap, usuario, 4);
  const souSolicitante = usuario.papel === "SOLICITANTE";
  const r = atencao.resumo;

  const partes: string[] = [];
  if (r.acoesVencidas > 0) {
    partes.push(`${plural(r.acoesVencidas, "ação", "ações")} com prazo ultrapassado`);
  }
  if (r.aprovacoesAguardando > 0) {
    partes.push(`${plural(r.aprovacoesAguardando, "aprovação", "aprovações")} aguardando`);
  }
  if (r.semProximoMovimento > 0) {
    partes.push(`${plural(r.semProximoMovimento, "demanda")} sem próximo passo`);
  }
  if (r.demandasBloqueadas > 0) partes.push(plural(r.demandasBloqueadas, "bloqueada"));

  const resumo =
    partes.length === 0
      ? souSolicitante
        ? "Suas solicitações estão avançando: nada vencido nem bloqueado."
        : "A operação está em dia: nada vencido, nada bloqueado, nada sem direção."
      : souSolicitante
        ? `Nas suas solicitações: ${partes.join(", ")}.`
        : `Na operação agora: ${partes.join(", ")}.`;

  /**
   * Cada bloco só mostra o que os anteriores não mostraram. A mesma regra da
   * aplicação completa: sem ela, a mesma demanda atravessava três blocos.
   */
  const demandasVistas = new Set<string>();
  const movimentosVistos = new Set<string>();
  const registrar = (d?: string, m?: string) => {
    if (d) demandasVistas.add(d);
    if (m) movimentosVistos.add(m);
  };
  for (const i of atencao.precisaDeVoce) {
    registrar(i.sinal.demandaId, i.sinal.movimentoId);
  }
  const fazerAgora = minha.fazerAgora.filter(
    (m) => !movimentosVistos.has(m.movimento.id) && !demandasVistas.has(m.demanda.id),
  );
  for (const m of fazerAgora) registrar(m.demanda.id, m.movimento.id);

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

  const visiveis = base.demandas.filter((d) => podeVerDemanda(usuario, d));
  const seteDias = ctx.agora - 7 * DIA;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-xl">
          <h1 className="titulo-tela">
            {saudacao(new Date(ctx.agora))}, {primeiroNome(usuario.nome)}
          </h1>
          <p className="mt-1 text-sm text-tinta-500">{resumo}</p>
        </div>
        <a
          href="#/demandas/nova"
          className="foco-visivel inline-flex items-center rounded-lg bg-obra-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-obra-700 active:bg-obra-800"
        >
          + Nova demanda
        </a>
      </header>

      <section>
        <TituloSecao contagem={atencao.precisaDeVoce.length}>
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

      {fazerAgora.length > 0 && (
        <section>
          <TituloSecao contagem={fazerAgora.length}>
            Seus próximos movimentos
          </TituloSecao>
          <Cartao className="divide-y divide-tinta-100">
            {fazerAgora.slice(0, 5).map(({ movimento, demanda, atrasado }) => (
              <a
                key={movimento.id}
                href={`#/demandas/${demanda.id}`}
                className="foco-visivel flex items-start gap-3 p-3.5 transition hover:bg-tinta-50 sm:items-center"
              >
                <span
                  className={`mt-1 size-2 shrink-0 rounded-full sm:mt-0 ${
                    atrasado ? "bg-red-500" : "bg-amber-400"
                  }`}
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
                    {prazoLegivel(movimento.prazo, ctx.agora)}
                  </span>
                </div>
              </a>
            ))}
          </Cartao>
        </section>
      )}

      {/* Preventivo não é urgente: linha compacta, não cartão. */}
      {proximas48h.length > 0 && (
        <section>
          <TituloSecao contagem={proximas48h.length}>
            Atenção nas próximas 48 horas
          </TituloSecao>
          <Cartao className="divide-y divide-tinta-100">
            {proximas48h.slice(0, 5).map((item) => (
              <a
                key={item.sinal.id}
                href={`#${item.href}`}
                className="foco-visivel flex flex-wrap items-baseline gap-x-2 gap-y-0.5 p-3 transition hover:bg-tinta-50"
              >
                <span className="text-sm text-tinta-800">{item.sinal.assunto}</span>
                <span className="text-sm text-tinta-500">{item.sinal.mensagem}</span>
                {item.responsavel && (
                  <span className="ml-auto text-[11px] text-tinta-400">
                    {item.responsavel.nome}
                  </span>
                )}
              </a>
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
              <a
                key={item.sinal.id}
                href={`#${item.href}`}
                className="foco-visivel flex flex-wrap items-center gap-x-3 gap-y-1 p-3.5 transition hover:bg-tinta-50"
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
              </a>
            ))}
          </Cartao>
        </section>
      )}

      {/* Demandas com sinal que ainda não apareceram acima. Linhas, não
          cartões: não são ações do usuário, são consciência da operação. */}
      {outrasComSinal.length > 0 && (
        <section>
          <TituloSecao contagem={outrasComSinal.length}>
            Outras demandas com sinal
          </TituloSecao>
          <Cartao className="divide-y divide-tinta-100">
            {outrasComSinal.map((d) => (
              <a
                key={d.demanda.id}
                href={`#/demandas/${d.demanda.id}`}
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
              </a>
            ))}
          </Cartao>
        </section>
      )}

      {/* Resumo navegável em uma linha. Cinco quadros grandes repetiam, em
          números, o que a frase de abertura já diz em prosa. */}
      <section className="border-t border-tinta-200 pt-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-tinta-500">
          <Contador rotulo="novas" valor={visiveis.filter((d) => d.estado === "NOVA" || d.estado === "EM_TRIAGEM").length} />
          <Contador
            rotulo="em andamento"
            valor={
              visiveis.filter((d) =>
                ["EM_DIAGNOSTICO", "EM_PLANEJAMENTO", "EM_EXECUCAO", "EM_VALIDACAO"].includes(
                  d.estado,
                ),
              ).length
            }
          />
          <Contador
            rotulo="bloqueadas"
            valor={visiveis.filter((d) => d.estado === "BLOQUEADA").length}
            alerta
          />
          <Contador
            rotulo="aguardando aprovação"
            valor={visiveis.filter((d) => d.estado === "AGUARDANDO_APROVACAO").length}
          />
          <Contador
            rotulo="concluídas em 7 dias"
            valor={
              visiveis.filter(
                (d) => d.estado === "CONCLUIDA" && (d.concluidoEm ?? 0) >= seteDias,
              ).length
            }
          />
        </div>
      </section>
    </div>
  );
}

function Contador({
  rotulo,
  valor,
  alerta,
}: {
  rotulo: string;
  valor: number;
  alerta?: boolean;
}) {
  return (
    <a href="#/demandas" className="foco-visivel hover:text-tinta-700">
      <span
        className={`numerico font-semibold ${
          alerta && valor > 0 ? "text-red-600" : "text-tinta-800"
        }`}
      >
        {valor}
      </span>{" "}
      {rotulo}
    </a>
  );
}


// ---------------------------------------------------------------------------
// Central de Atenção
// ---------------------------------------------------------------------------

function CentralAtencao({ ctx }: { ctx: Ctx }) {
  const painel = montarAtencao(ctx.snap, ctx.usuario);
  const blocos = [
    {
      titulo: "Precisa de você agora",
      descricao: "Decisões e ações sob sua responsabilidade.",
      itens: painel.precisaDeVoce,
    },
    {
      titulo: "Atenção nas próximas 48 horas",
      descricao: "Ainda não é problema — e é por isso que dá para evitar.",
      itens: painel.proximas48h,
    },
    {
      titulo: "Aguardando terceiros",
      descricao: "A bola está com outra pessoa. Acompanhe e cobre se travar.",
      itens: painel.aguardandoTerceiros,
    },
    {
      titulo: "Outras situações da operação",
      descricao: "Não é sua responsabilidade direta, mas está acontecendo.",
      itens: painel.operacao,
    },
  ];
  const total = blocos.reduce((s, b) => s + b.itens.length, 0);

  return (
    <div className="space-y-7">
      <header>
        <h1 className="titulo-tela">Central de Atenção</h1>
        <p className="mt-1 text-sm text-tinta-500">
          Tudo que está fora do normal na operação, já ordenado por urgência. Você não
          precisa filtrar para saber por onde começar.
        </p>
      </header>

      {total === 0 ? (
        <Vazio
          titulo="Operação saudável"
          descricao="Demandas avançando, ações dentro do prazo e nenhum bloqueio crítico."
        />
      ) : (
        blocos
          .filter((b) => b.itens.length > 0)
          .map((b) => (
            <section key={b.titulo}>
              <TituloSecao contagem={b.itens.length}>{b.titulo}</TituloSecao>
              <p className="-mt-2 mb-3 text-xs text-tinta-500">{b.descricao}</p>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {b.itens.map((item) => (
                  <CartaoAtencao key={item.sinal.id} item={item} />
                ))}
              </div>
            </section>
          ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Minha operação
// ---------------------------------------------------------------------------

function MinhaOperacao({ ctx }: { ctx: Ctx }) {
  const op = montarMinhaOperacao(ctx.snap, ctx.usuario);
  const atrasadas = op.fazerAgora.filter((m) => m.atrasado).length;

  const lista = (itens: typeof op.fazerAgora, destaque?: boolean) => (
    <div className="space-y-2.5">
      {itens.map(({ movimento, demanda, atrasado }) => (
        <a
          key={movimento.id}
          href={`#/demandas/${demanda.id}`}
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
          <p
            className={`mt-2.5 text-xs font-medium ${
              atrasado ? "text-red-600" : "text-tinta-600"
            }`}
          >
            {prazoLegivel(movimento.prazo, ctx.agora)}
            <span className="ml-2 font-normal text-tinta-400">
              {dataHora(movimento.prazo)}
            </span>
          </p>
        </a>
      ))}
    </div>
  );

  return (
    <div className="space-y-7">
      <header>
        <h1 className="titulo-tela">Minha operação</h1>
        <p className="mt-1 text-sm text-tinta-500">
          {op.fazerAgora.length === 0 && op.precisaMinhaDecisao.length === 0
            ? `Nada pendente com você agora, ${primeiroNome(ctx.usuario.nome)}.`
            : `${op.fazerAgora.length} para fazer agora${
                atrasadas > 0 ? ` (${atrasadas} em atraso)` : ""
              }.`}
        </p>
      </header>

      {op.precisaMinhaDecisao.length > 0 && (
        <section>
          <TituloSecao contagem={op.precisaMinhaDecisao.length}>
            Precisa da minha decisão
          </TituloSecao>
          {lista(op.precisaMinhaDecisao, true)}
        </section>
      )}

      <section>
        <TituloSecao contagem={op.fazerAgora.length}>Fazer agora</TituloSecao>
        {op.fazerAgora.length === 0 ? (
          <Vazio
            titulo="Nada vencendo nas próximas 48 horas"
            descricao="O que estiver mais adiante aparece em “Próximas”."
          />
        ) : (
          lista(op.fazerAgora)
        )}
      </section>

      {op.proximas.length > 0 && (
        <section>
          <TituloSecao contagem={op.proximas.length}>Próximas</TituloSecao>
          {lista(op.proximas)}
        </section>
      )}

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
              <a
                key={demanda.id}
                href={`#/demandas/${demanda.id}`}
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
              </a>
            ))}
          </Cartao>
        </section>
      )}

      {op.concluidoRecentemente.length > 0 && (
        <section>
          <TituloSecao contagem={op.concluidoRecentemente.length}>
            Concluído recentemente
          </TituloSecao>
          <Cartao className="divide-y divide-tinta-100">
            {op.concluidoRecentemente.map(({ movimento, demanda }) => (
              <a
                key={movimento.id}
                href={`#/demandas/${demanda.id}`}
                className="foco-visivel flex items-center gap-3 p-3 transition hover:bg-tinta-50"
              >
                <span className="text-emerald-600">✓</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-tinta-700">{movimento.acao}</p>
                  <p className="truncate text-[11px] text-tinta-400">
                    {demanda.codigo} · concluído{" "}
                    {relativo(movimento.concluidoEm ?? 0, ctx.agora)}
                  </p>
                </div>
                <SeloEstado estado={demanda.estado} />
              </a>
            ))}
          </Cartao>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lista e abertura de demandas
// ---------------------------------------------------------------------------

function ListaDemandas({ ctx }: { ctx: Ctx }) {
  const { base, usuario, snap } = ctx;
  const [busca, setBusca] = useState("");
  const [incluirConcluidas, setIncluirConcluidas] = useState(false);

  const linhas = base.demandas
    .filter((d) => podeVerDemanda(usuario, d))
    .filter((d) =>
      incluirConcluidas ? true : d.estado !== "CONCLUIDA" && d.estado !== "CANCELADA",
    )
    .filter(
      (d) =>
        !busca ||
        d.titulo.toLowerCase().includes(busca.toLowerCase()) ||
        d.codigo.toLowerCase().includes(busca.toLowerCase()),
    )
    .map((demanda) => {
      const movimentos = base.movimentos.filter((m) => m.demandaId === demanda.id);
      const impedimentos = base.impedimentos.filter((i) => i.demandaId === demanda.id);
      const categoria = base.categorias.find((c) => c.id === demanda.categoriaId)!;
      return {
        demanda,
        local: base.locais.find((l) => l.id === demanda.localId),
        responsavel: base.usuarios.find((u) => u.id === demanda.responsavelId),
        proximoMovimento: movimentoAtual(movimentos),
        sinais: snap.sinais.filter(
          (s) => s.estado === "ATIVO" && s.demandaId === demanda.id,
        ),
        semDirecao: semDirecao({
          demanda,
          movimentos,
          impedimentos,
          aprovacoes: base.aprovacoes.filter((a) => a.demandaId === demanda.id),
          categoria,
        }),
      };
    })
    .sort((a, b) => {
      const peso = (l: (typeof linhas)[number]) =>
        l.sinais.reduce(
          (s, x) => s + { CRITICO: 1000, ALTO: 600, MEDIO: 300, INFO: 100 }[x.nivel],
          0,
        );
      return peso(b) - peso(a) || b.demanda.prioridade.score - a.demanda.prioridade.score;
    });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titulo-tela">Demandas</h1>
          <p className="mt-1 text-sm text-tinta-500">
            {plural(linhas.length, "demanda")}, ordenadas pelo que está acontecendo com
            elas.
          </p>
        </div>
        <a
          href="#/demandas/nova"
          className="foco-visivel inline-flex items-center rounded-lg bg-obra-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-obra-700 active:bg-obra-800"
        >
          + Nova demanda
        </a>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por título ou código…"
          className={`${classeInput} h-9 max-w-64 py-1.5 text-xs`}
        />
        <label className="flex items-center gap-1.5 text-xs text-tinta-600">
          <input
            type="checkbox"
            checked={incluirConcluidas}
            onChange={(e) => setIncluirConcluidas(e.target.checked)}
            className="rounded border-tinta-300"
          />
          Incluir concluídas
        </label>
      </div>

      {linhas.length === 0 ? (
        <Vazio titulo="Nenhuma demanda encontrada" icone={List} />
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

function NovaDemanda({ ctx }: { ctx: Ctx }) {
  const { base, aplicar } = ctx;
  const [erro, setErro] = useState("");

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <a href="#/demandas" className="text-sm text-tinta-500 hover:text-tinta-700">
          ← Demandas
        </a>
        <h1 className="titulo-tela mt-2">Nova demanda</h1>
        <p className="mt-1 text-sm text-tinta-500">
          Descreva o que está acontecendo. O sistema calcula a urgência e já cria o
          primeiro passo — você não precisa saber o fluxo interno.
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setErro("");
          let criada: ID | undefined;
          aplicar((b, agora) => {
            const d = abrirDemanda(
              b,
              b.usuarios.find((u) => u.id === ctx.usuario.id)!,
              {
                titulo: String(fd.get("titulo") ?? ""),
                descricao: String(fd.get("descricao") ?? ""),
                localId: String(fd.get("localId") ?? ""),
                categoriaId: String(fd.get("categoriaId") ?? ""),
                fatores: {
                  seguranca: fd.get("seguranca") === "on",
                  risco: fd.get("risco") === "on",
                  operacaoComprometida: fd.get("operacaoComprometida") === "on",
                  pessoasAfetadas: Number(fd.get("pessoasAfetadas") ?? 0) || 0,
                },
              },
              agora,
            );
            criada = d.id;
            return `${d.codigo} aberta. Prioridade ${ROTULO_PRIORIDADE[d.prioridade.nivel]}: ${d.prioridade.justificativa}. Triagem criada com prazo de 24h.`;
          });
          setTimeout(() => criada && ir(`/demandas/${criada}`), 60);
        }}
      >
        <Cartao className="space-y-4 p-5">
          {erro && <p className="text-sm text-red-700">{erro}</p>}
          <Campo rotulo="O que está acontecendo?" obrigatorio>
            <input
              name="titulo"
              required
              minLength={4}
              placeholder="Ex.: Vazamento no banheiro masculino"
              className={classeInput}
            />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Onde?" obrigatorio>
              <select name="localId" required defaultValue="" className={classeInput}>
                <option value="" disabled>
                  Escolha o local
                </option>
                {base.locais.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Que tipo de serviço?" obrigatorio>
              <select name="categoriaId" required defaultValue="" className={classeInput}>
                <option value="" disabled>
                  Escolha a categoria
                </option>
                {base.categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <Campo
            rotulo="Conte um pouco mais"
            dica="Detalhes ajudam quem vai atender a chegar preparado."
          >
            <textarea
              name="descricao"
              rows={3}
              placeholder="Desde quando acontece, o que já tentaram, o que atrapalha…"
              className={classeInput}
            />
          </Campo>

          <fieldset className="rounded-lg bg-tinta-50 p-3.5">
            <legend className="px-1 text-xs font-medium text-tinta-600">
              Alguma dessas coisas se aplica?
            </legend>
            <div className="space-y-2">
              <Marcar
                nome="seguranca"
                rotulo="Pode machucar alguém"
                dica="Fio exposto, estrutura solta, risco de queda ou choque"
              />
              <Marcar
                nome="risco"
                rotulo="Vai piorar se demorar"
                dica="Infiltração, vazamento, dano que se agrava"
              />
              <Marcar
                nome="operacaoComprometida"
                rotulo="Impede o uso do espaço"
                dica="O local não pode ser usado normalmente até resolver"
              />
            </div>
            <p className="mt-2.5 text-[11px] text-tinta-500">
              O Motor de Prioridade usa estas respostas, o público do local e o histórico
              de reincidência para calcular a urgência.
            </p>
          </fieldset>

          <Campo rotulo="Quantas pessoas isso afeta?" dica="Deixe vazio para usar a média do local">
            <input
              name="pessoasAfetadas"
              type="number"
              min={0}
              placeholder="Ex.: 120"
              className={classeInput}
            />
          </Campo>
        </Cartao>

        <div className="mt-4 flex items-center gap-3">
          <Botao type="submit">Abrir demanda</Botao>
          <p className="text-xs text-tinta-500">
            O sistema cria automaticamente a triagem com prazo de 24 horas.
          </p>
        </div>
      </form>
    </div>
  );
}

function Marcar({
  nome,
  rotulo,
  dica,
}: {
  nome: string;
  rotulo: string;
  dica: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        name={nome}
        className="mt-0.5 size-4 rounded border-tinta-300"
      />
      <span className="leading-tight">
        <span className="block text-sm font-medium text-tinta-800">{rotulo}</span>
        <span className="block text-xs text-tinta-500">{dica}</span>
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Tela da demanda
// ---------------------------------------------------------------------------

function TelaDemanda({ ctx, id }: { ctx: Ctx; id: ID }) {
  const { base, usuario, aplicar, agora, snap } = ctx;
  const demanda = base.demandas.find((d) => d.id === id);
  if (!demanda || !podeVerDemanda(usuario, demanda)) {
    return <Vazio titulo="Demanda não encontrada" icone={CircleHelp} />;
  }

  const categoria = base.categorias.find((c) => c.id === demanda.categoriaId)!;
  const movimentos = base.movimentos
    .filter((m) => m.demandaId === id)
    .sort((a, b) => a.sequencia - b.sequencia);
  const impedimentos = base.impedimentos.filter((i) => i.demandaId === id);
  const aprovacoes = base.aprovacoes.filter((a) => a.demandaId === id);
  const eventos = base.eventos
    .filter((e) => e.demandaId === id)
    .sort((a, b) => b.criadoEm - a.criadoEm);
  const comentarios = base.comentarios
    .filter((c) => c.demandaId === id)
    .filter((c) => usuario.papel !== "SOLICITANTE" || c.visivelSolicitante);
  const sinais = snap.sinais.filter((s) => s.estado === "ATIVO" && s.demandaId === id);

  const ctxFluxo = { demanda, movimentos, impedimentos, aprovacoes, categoria };
  const checagem = podeConcluir(ctxFluxo);
  const impedimentoAtivo = impedimentos.find((i) => i.estado === "ATIVO");
  const aprovacaoPendente = aprovacoes.find((a) => a.estado === "PENDENTE");
  const proximo = movimentoAtual(movimentos);
  const concluida = demanda.estado === "CONCLUIDA";
  const responsavel = base.usuarios.find((u) => u.id === demanda.responsavelId);
  const reincidencias = base.demandas.filter(
    (d) =>
      d.id !== id &&
      d.localId === demanda.localId &&
      d.categoriaId === demanda.categoriaId &&
      d.criadoEm >= agora - 90 * DIA,
  );

  return (
    <div className="space-y-6">
      <a href="#/demandas" className="inline-block text-sm text-tinta-500 hover:text-tinta-700">
        ← Demandas
      </a>

      <header>
        <div className="flex flex-wrap items-center gap-2">
          <SeloPrioridade
            nivel={demanda.prioridade.nivel}
            titulo={demanda.prioridade.justificativa}
          />
          <SeloEstado estado={demanda.estado} />
          <span className="numerico text-xs text-tinta-400">{demanda.codigo}</span>
        </div>
        <h1 className="titulo-tela mt-2">{demanda.titulo}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-tinta-500">
          <span>{base.locais.find((l) => l.id === demanda.localId)?.nome}</span>
          <span>{categoria.nome}</span>
          <span>Aberta {relativo(demanda.criadoEm, agora)}</span>
          <QuemAge nome={responsavel?.nome} id={responsavel?.id} prefixo="Responsável: " />
        </div>
        <p className="mt-2 text-xs text-tinta-500">
          <span className="font-medium text-tinta-600">Por que esta prioridade:</span>{" "}
          {demanda.prioridade.justificativa}
          {demanda.prioridade.origem === "AJUSTE_MANUAL" && (
            <span className="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800">
              ajustada manualmente
            </span>
          )}
        </p>
      </header>

      {impedimentoAtivo && (
        <BlocoImpedimento
          ctx={ctx}
          impedimento={impedimentoAtivo}
          responsavel={base.usuarios.find(
            (u) => u.id === impedimentoAtivo.responsavelDesbloqueioId,
          )}
        />
      )}

      {!concluida && (
        <BlocoProximoMovimento
          ctx={ctx}
          demanda={demanda}
          movimento={proximo}
          prontaParaConclusao={checagem.pode}
          semDirecaoAgora={semDirecao(ctxFluxo)}
        />
      )}

      {sinais.length > 0 && (
        <section>
          <TituloSecao contagem={sinais.length}>Sinais nesta demanda</TituloSecao>
          <div className="flex flex-wrap gap-2">
            {sinais.map((s) => (
              <EtiquetaSinal key={s.id} nivel={s.nivel}>
                <span className="font-semibold">{ROTULO_SINAL[s.tipo]}</span>
                <span className="text-tinta-600">· {s.mensagem}</span>
              </EtiquetaSinal>
            ))}
          </div>
        </section>
      )}

      {reincidencias.length >= 2 && (
        <Cartao className="border-amber-200 bg-amber-50/60 p-4">
          <p className="text-sm font-medium text-amber-900">
            Este problema já aconteceu {reincidencias.length + 1} vezes neste local nos
            últimos 90 dias
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Vale investigar a causa de fundo em vez de repetir o mesmo reparo.
          </p>
          <ul className="mt-2.5 space-y-1">
            {reincidencias.slice(0, 4).map((r) => (
              <li key={r.id}>
                <a
                  href={`#/demandas/${r.id}`}
                  className="text-xs text-amber-900 underline underline-offset-2"
                >
                  {r.codigo} — {r.titulo} ({data(r.criadoEm)})
                </a>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      {aprovacaoPendente && (
        <Cartao className="border-obra-300 bg-obra-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-obra-700">
            {aprovacaoPendente.aprovadorId === usuario.id
              ? "Aguardando sua decisão"
              : "Aguardando aprovação"}
          </p>
          <p className="mt-1.5 text-base font-semibold text-obra-900">
            {aprovacaoPendente.descricao}
          </p>
          <div className="mt-3">
            <QuemAge
              nome={base.usuarios.find((u) => u.id === aprovacaoPendente.aprovadorId)?.nome}
              id={aprovacaoPendente.aprovadorId}
              prefixo="Decide: "
            />
          </div>
          {aprovacaoPendente.aprovadorId !== usuario.id && (
            <p className="mt-3 text-sm text-obra-800">
              {base.usuarios.find((u) => u.id === aprovacaoPendente.aprovadorId)?.nome}{" "}
              precisa aprovar para que o serviço continue.
            </p>
          )}
          {pode(usuario, "aprovar") && (
            <form
              className="mt-4 space-y-3 border-t border-obra-200 pt-4"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const decisao = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement;
                aplicar((b, ag) => {
                  decidirAprovacao(
                    b,
                    b.usuarios.find((u) => u.id === usuario.id)!,
                    aprovacaoPendente.id,
                    decisao?.value === "aprovar",
                    String(fd.get("justificativa") ?? ""),
                    ag,
                  );
                  return decisao?.value === "aprovar"
                    ? "Aprovado. A execução foi liberada pelo Motor de Fluxo."
                    : "Recusado. O sistema criou um passo de replanejamento para a demanda não ficar parada.";
                });
              }}
            >
              <Campo
                rotulo="Justificativa"
                dica="Obrigatória ao recusar — orienta o próximo passo de quem executa"
              >
                <textarea name="justificativa" rows={2} className={classeInput} />
              </Campo>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  name="decisao"
                  value="aprovar"
                  className="foco-visivel rounded-lg bg-obra-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-obra-700 active:bg-obra-800"
                >
                  Aprovar
                </button>
                <button
                  type="submit"
                  name="decisao"
                  value="recusar"
                  className="foco-visivel rounded-lg px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-300 hover:bg-red-50"
                >
                  Recusar
                </button>
              </div>
            </form>
          )}
        </Cartao>
      )}

      {concluida && demanda.resultado ? (
        <Cartao className="border-emerald-200 bg-emerald-50/60 p-5">
          <TituloSecao>Resultado</TituloSecao>
          <p className="text-sm font-medium text-emerald-900">
            {demanda.resultado.resultadoObtido}
          </p>
          <dl className="mt-3 space-y-2 text-xs text-emerald-900/80">
            <div>
              <dt className="font-semibold">O que foi feito</dt>
              <dd>{demanda.resultado.oQueFoiFeito}</dd>
            </div>
            {demanda.resultado.observacoesFinais && (
              <div>
                <dt className="font-semibold">Observações</dt>
                <dd>{demanda.resultado.observacoesFinais}</dd>
              </div>
            )}
            <div>
              <dt className="font-semibold">Registrado</dt>
              <dd>
                {base.usuarios.find((u) => u.id === demanda.resultado!.registradoPor)?.nome}{" "}
                em {dataHora(demanda.resultado.registradoEm)}
              </dd>
            </div>
          </dl>
        </Cartao>
      ) : (
        pode(usuario, "concluir_demanda") && (
          <BlocoConclusao ctx={ctx} demandaId={id} checagem={checagem} />
        )
      )}

      {!concluida && (
        <BlocoGestao
          ctx={ctx}
          demanda={demanda}
          temImpedimentoAtivo={!!impedimentoAtivo}
        />
      )}

      <section>
        <TituloSecao>Sobre a solicitação</TituloSecao>
        <Cartao className="p-4">
          <p className="whitespace-pre-line text-sm text-tinta-700">
            {demanda.descricao || "Sem descrição adicional."}
          </p>
          <p className="mt-3 border-t border-tinta-100 pt-3 text-xs text-tinta-500">
            Solicitado por{" "}
            {base.usuarios.find((u) => u.id === demanda.solicitanteId)?.nome} em{" "}
            {dataHora(demanda.criadoEm)}
          </p>
        </Cartao>
      </section>

      <section>
        <TituloSecao contagem={comentarios.length}>Conversa</TituloSecao>
        <Cartao className="divide-y divide-tinta-100">
          {comentarios.length === 0 ? (
            <p className="p-4 text-sm text-tinta-500">Nenhum comentário ainda.</p>
          ) : (
            comentarios.map((c) => (
              <div key={c.id} className="flex gap-3 p-4">
                <Avatar
                  nome={base.usuarios.find((u) => u.id === c.autorId)?.nome ?? "?"}
                  id={c.autorId}
                  tamanho="sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-medium text-tinta-800">
                      {base.usuarios.find((u) => u.id === c.autorId)?.nome}
                    </span>
                    <span className="text-[11px] text-tinta-400">
                      {relativo(c.criadoEm, agora)}
                    </span>
                    {c.perguntaPara && !c.respondidoEm && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                        aguardando resposta
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-tinta-700">{c.texto}</p>
                </div>
              </div>
            ))
          )}
          <form
            className="space-y-2.5 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const fd = new FormData(form);
              aplicar((b, ag) =>
                void comentar(
                  b,
                  b.usuarios.find((u) => u.id === usuario.id)!,
                  id,
                  String(fd.get("texto") ?? ""),
                  {},
                  ag,
                ),
              );
              form.reset();
            }}
          >
            <textarea
              name="texto"
              required
              rows={2}
              placeholder="Escreva um comentário…"
              className={classeInput}
            />
            <Botao type="submit" variante="secundario">
              Comentar
            </Botao>
          </form>
        </Cartao>
      </section>

      <BlocoHistorico ctx={ctx} eventos={eventos} movimentos={movimentos} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Blocos da tela de demanda
// ---------------------------------------------------------------------------

function BlocoProximoMovimento({
  ctx,
  demanda,
  movimento,
  prontaParaConclusao,
  semDirecaoAgora,
}: {
  ctx: Ctx;
  demanda: Demanda;
  movimento?: Movimento;
  prontaParaConclusao: boolean;
  semDirecaoAgora: boolean;
}) {
  const { base, aplicar, agora, usuario } = ctx;
  const [registrando, setRegistrando] = useState(false);
  const operacao = base.usuarios.filter((u) => u.papel !== "SOLICITANTE");

  if (prontaParaConclusao && !movimento) {
    return (
      <Cartao className="border-emerald-300 bg-emerald-50/50 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
          O que precisa acontecer agora
        </p>
        <p className="mt-1.5 text-base font-semibold text-emerald-950">
          Registrar o resultado para concluir a demanda
        </p>
        <p className="mt-1.5 text-sm text-emerald-900">
          A execução foi feita e o resultado já foi validado. Falta apenas registrar o que
          foi realizado — é isso que fecha o ciclo.
        </p>
      </Cartao>
    );
  }

  if (semDirecaoAgora || !movimento) {
    return (
      <Cartao className="border-red-300 bg-red-50/70 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
          Sem próximo passo definido
        </p>
        <p className="mt-1.5 text-sm text-red-900">
          Esta demanda está ativa, mas ninguém definiu o que precisa acontecer agora. Ela
          não vai avançar sozinha.
        </p>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            aplicar((b, ag) =>
              void definirProximoMovimento(
                b,
                b.usuarios.find((u) => u.id === usuario.id)!,
                demanda.id,
                {
                  tipo: "EXECUCAO",
                  acao: String(fd.get("acao") ?? ""),
                  resultadoEsperado: String(fd.get("resultadoEsperado") ?? ""),
                  prazo: new Date(String(fd.get("prazo"))).getTime(),
                  responsavelId: String(fd.get("responsavelId") ?? "") || undefined,
                },
                ag,
              ),
            );
          }}
        >
          <Campo rotulo="O que precisa acontecer?" obrigatorio>
            <input name="acao" required className={classeInput} />
          </Campo>
          <Campo rotulo="Como saberemos que deu certo?" obrigatorio>
            <input name="resultadoEsperado" required className={classeInput} />
          </Campo>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Quem faz" obrigatorio>
              <select
                name="responsavelId"
                required
                defaultValue={demanda.responsavelId ?? ""}
                className={classeInput}
              >
                <option value="" disabled>
                  Escolha
                </option>
                {operacao.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Prazo" obrigatorio>
              <input
                name="prazo"
                type="datetime-local"
                required
                defaultValue={paraInputDateTime(agora + DIA)}
                className={classeInput}
              />
            </Campo>
          </div>
          <Botao type="submit">Definir próximo passo</Botao>
        </form>
      </Cartao>
    );
  }

  if (movimento.estado === "SUSPENSO") {
    return (
      <Cartao className="border-orange-200 bg-orange-50/60 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">
          Próximo passo suspenso
        </p>
        <p className="mt-1.5 text-sm text-orange-900">
          "{movimento.acao}" está parado até o impedimento ser resolvido.
        </p>
      </Cartao>
    );
  }

  const atrasado = movimento.prazo < agora;
  const responsavel = base.usuarios.find((u) => u.id === movimento.responsavelId);

  return (
    <Cartao className={`p-5 ${atrasado ? "border-red-300" : "border-tinta-300"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-tinta-500">
          O que precisa acontecer agora
        </p>
        <span className="rounded bg-tinta-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-tinta-600">
          {ROTULO_TIPO_MOVIMENTO[movimento.tipo]}
        </span>
        {movimento.origem === "AUTOMATICO" && (
          <span
            className="rounded bg-obra-50 px-1.5 py-0.5 text-[10px] font-medium text-obra-700"
            title="Este passo foi criado pelo sistema com base no passo anterior"
          >
            definido pelo sistema
          </span>
        )}
      </div>

      <p className="mt-2 text-lg font-semibold leading-snug text-tinta-900">
        {movimento.acao}
      </p>

      <dl className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-tinta-500">Quem faz</dt>
          <dd className="mt-1">
            <QuemAge nome={responsavel?.nome} id={responsavel?.id} />
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-tinta-500">Prazo</dt>
          <dd
            className={`mt-1 text-sm font-medium ${
              atrasado ? "text-red-600" : "text-tinta-800"
            }`}
          >
            {prazoLegivel(movimento.prazo, agora)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-tinta-500">
            Resultado esperado
          </dt>
          <dd className="mt-1 text-sm text-tinta-700">{movimento.resultadoEsperado}</dd>
        </div>
      </dl>

      <div className="mt-4 border-t border-tinta-100 pt-4">
        {registrando ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const bool = (k: string) =>
                fd.has(k) ? fd.get(k) === "true" : undefined;
              aplicar((b, ag) => {
                const r = concluirMovimento(
                  b,
                  b.usuarios.find((u) => u.id === usuario.id)!,
                  movimento.id,
                  {
                    relato: String(fd.get("relato") ?? ""),
                    causaIdentificada: bool("causaIdentificada"),
                    exigeOrcamento: bool("exigeOrcamento"),
                    servicoConcluido: bool("servicoConcluido"),
                    problemaResolvido: bool("problemaResolvido"),
                    custoEstimado: fd.get("custoEstimado")
                      ? Number(fd.get("custoEstimado"))
                      : undefined,
                    proximoResponsavelId:
                      String(fd.get("responsavelId") ?? "") || undefined,
                  },
                  { responsavelId: String(fd.get("responsavelId") ?? "") || undefined },
                  ag,
                );
                if (!r.criado) return r.decisao.motivo;
                const porque = r.decisao.sugestao?.motivo ?? r.decisao.motivo;
                return `Próximo passo criado: ${r.criado.acao}. Motivo: ${porque}.`;
              });
              setRegistrando(false);
            }}
          >
            <Campo rotulo="O que aconteceu?" obrigatorio>
              <textarea
                name="relato"
                required
                rows={3}
                autoFocus
                placeholder={placeholderRelato(movimento.tipo)}
                className={classeInput}
              />
            </Campo>

            {movimento.tipo === "TRIAGEM" && (
              <div className="space-y-3 rounded-lg bg-tinta-50 p-3.5">
                <p className="text-xs font-medium text-tinta-600">
                  Estas respostas definem o próximo passo automaticamente.
                </p>
                <Escolha
                  nome="causaIdentificada"
                  rotulo="Já sabemos qual é a causa?"
                  sim="Sim, sei o que precisa ser feito"
                  nao="Não, precisa de diagnóstico"
                  padrao
                />
                <Escolha
                  nome="exigeOrcamento"
                  rotulo="Precisa comprar material ou contratar alguém?"
                  sim="Sim, precisa de orçamento"
                  nao="Não, resolvemos com o que temos"
                />
                <Campo rotulo="Quem assume esta demanda?">
                  <select name="responsavelId" defaultValue="" className={classeInput}>
                    <option value="">Manter como está</option>
                    {operacao.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nome}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo
                  rotulo="Custo estimado (R$)"
                  dica="Acima do limite da categoria, o sistema exige aprovação"
                >
                  <input name="custoEstimado" type="number" min="0" className={classeInput} />
                </Campo>
              </div>
            )}

            {movimento.tipo === "DIAGNOSTICO" && (
              <div className="space-y-3 rounded-lg bg-tinta-50 p-3.5">
                <Escolha
                  nome="exigeOrcamento"
                  rotulo="A solução precisa de compra ou contratação?"
                  sim="Sim, precisa de orçamento"
                  nao="Não, a equipe executa"
                />
                <Campo rotulo="Custo estimado (R$)">
                  <input name="custoEstimado" type="number" min="0" className={classeInput} />
                </Campo>
              </div>
            )}

            {movimento.tipo === "ORCAMENTO" && (
              <Campo
                rotulo="Valor orçado (R$)"
                obrigatorio
                dica="Acima do limite da categoria, o sistema abre uma aprovação para a liderança"
              >
                <input
                  name="custoEstimado"
                  type="number"
                  min="0"
                  required
                  className={classeInput}
                />
              </Campo>
            )}

            {movimento.tipo === "EXECUCAO" && (
              <div className="rounded-lg bg-tinta-50 p-3.5">
                <Escolha
                  nome="servicoConcluido"
                  rotulo="O serviço foi concluído?"
                  sim="Sim, terminei"
                  nao="Ainda não, continua"
                  padrao
                />
                <p className="mt-2 text-xs text-tinta-500">
                  Concluir a execução não conclui a demanda: o sistema vai pedir a
                  validação de que o problema realmente acabou.
                </p>
              </div>
            )}

            {movimento.tipo === "VALIDACAO" && (
              <div className="rounded-lg bg-tinta-50 p-3.5">
                <Escolha
                  nome="problemaResolvido"
                  rotulo="O problema que originou a demanda foi resolvido?"
                  sim="Sim, resolvido"
                  nao="Não, o problema continua"
                  padrao
                />
                <p className="mt-2 text-xs text-tinta-500">
                  Se o problema continua, o sistema devolve a demanda para nova avaliação
                  em vez de encerrar.
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Botao type="submit">Concluir passo</Botao>
              <button
                type="button"
                onClick={() => setRegistrando(false)}
                className="foco-visivel rounded-lg px-3 py-2 text-sm text-tinta-600 hover:bg-tinta-100"
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setRegistrando(true)}
            className="foco-visivel w-full rounded-lg bg-obra-600 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-obra-700 active:bg-obra-800"
          >
            Registrar o que aconteceu neste passo
          </button>
        )}
      </div>
    </Cartao>
  );
}

function placeholderRelato(tipo: Movimento["tipo"]): string {
  switch (tipo) {
    case "TRIAGEM":
      return "O que você viu no local, qual parece ser a causa, o que precisa ser feito…";
    case "DIAGNOSTICO":
      return "Causa identificada e solução proposta…";
    case "ORCAMENTO":
      return "Fornecedor, valor e prazo de entrega…";
    case "EXECUCAO":
      return "O que foi feito, materiais usados, como ficou…";
    case "VALIDACAO":
      return "Como você verificou que o problema acabou (ou não)…";
    default:
      return "Registre o que aconteceu…";
  }
}

function Escolha({
  nome,
  rotulo,
  sim,
  nao,
  padrao = false,
}: {
  nome: string;
  rotulo: string;
  sim: string;
  nao: string;
  padrao?: boolean;
}) {
  const [valor, setValor] = useState(padrao ? "true" : "false");
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-tinta-700">{rotulo}</legend>
      <div className="flex flex-wrap gap-2">
        {[
          { v: "true", r: sim },
          { v: "false", r: nao },
        ].map((o) => (
          <label
            key={o.v}
            className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm ring-1 ring-inset transition ${
              valor === o.v
                ? "bg-obra-600 text-white ring-obra-600"
                : "bg-white text-tinta-700 ring-tinta-200 hover:bg-tinta-50"
            }`}
          >
            <input
              type="radio"
              name={nome}
              value={o.v}
              checked={valor === o.v}
              onChange={() => setValor(o.v)}
              className="sr-only"
            />
            {o.r}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function BlocoImpedimento({
  ctx,
  impedimento,
  responsavel,
}: {
  ctx: Ctx;
  impedimento: Impedimento;
  responsavel?: Usuario;
}) {
  const [resolvendo, setResolvendo] = useState(false);
  const revisaoVencida = impedimento.dataRevisao < ctx.agora;

  return (
    <Cartao className="border-red-300 bg-red-50/70 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-red-600 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
          Bloqueada
        </span>
        <span className="text-xs font-medium text-red-800">
          {ROTULO_IMPEDIMENTO[impedimento.tipo]}
        </span>
        <span className="ml-auto text-[11px] text-red-700">
          bloqueada {relativo(impedimento.dataInicio, ctx.agora)}
        </span>
      </div>

      <p className="mt-2 text-sm font-medium text-red-950">{impedimento.descricao}</p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <QuemAge
          nome={responsavel?.nome}
          id={responsavel?.id}
          prefixo="Precisa destravar: "
        />
        <span
          className={`text-xs ${revisaoVencida ? "font-medium text-red-700" : "text-red-800"}`}
        >
          {revisaoVencida ? "Revisão vencida em " : "Revisar em "}
          {data(impedimento.dataRevisao)}
        </span>
      </div>

      {pode(ctx.usuario, "resolver_impedimento") && (
        <div className="mt-4 border-t border-red-200 pt-4">
          {resolvendo ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                ctx.aplicar((b, ag) => {
                  resolverImpedimento(
                    b,
                    b.usuarios.find((u) => u.id === ctx.usuario.id)!,
                    impedimento.id,
                    String(fd.get("resolucao") ?? ""),
                    ag,
                  );
                  return "Impedimento resolvido. Os passos suspensos voltaram a ficar pendentes, com o prazo compensado pelo tempo de bloqueio.";
                });
                setResolvendo(false);
              }}
            >
              <Campo rotulo="Como o impedimento foi resolvido?" obrigatorio>
                <textarea
                  name="resolucao"
                  required
                  rows={2}
                  autoFocus
                  placeholder="Ex.: Orçamento recebido do fornecedor por telefone."
                  className={classeInput}
                />
              </Campo>
              <div className="flex gap-2">
                <Botao type="submit" variante="perigo">
                  Destravar e retomar
                </Botao>
                <button
                  type="button"
                  onClick={() => setResolvendo(false)}
                  className="foco-visivel rounded-lg px-3 py-2 text-sm text-red-800 hover:bg-red-100"
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setResolvendo(true)}
              className="foco-visivel rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Registrar desbloqueio
            </button>
          )}
        </div>
      )}
    </Cartao>
  );
}

function BlocoConclusao({
  ctx,
  demandaId,
  checagem,
}: {
  ctx: Ctx;
  demandaId: ID;
  checagem: ReturnType<typeof podeConcluir>;
}) {
  const [aberto, setAberto] = useState(false);

  if (!checagem.pode) {
    return (
      <Cartao className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-tinta-500">
          Ainda não dá para concluir
        </p>
        <ul className="mt-2 space-y-1">
          {checagem.pendencias.map((p) => (
            <li key={p} className="flex gap-2 text-sm text-tinta-700">
              <span className="text-tinta-400">•</span>
              {p}
            </li>
          ))}
        </ul>
      </Cartao>
    );
  }

  return (
    <Cartao className="border-emerald-300 bg-emerald-50/50 p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
        Pronta para conclusão
      </p>
      <p className="mt-1.5 text-sm text-emerald-900">
        Todos os passos foram concluídos e o resultado foi validado. Registre o que
        aconteceu para fechar a demanda.
      </p>
      {aberto ? (
        <form
          className="mt-4 space-y-3 border-t border-emerald-200 pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            ctx.aplicar((b, ag) => {
              concluirDemanda(
                b,
                b.usuarios.find((u) => u.id === ctx.usuario.id)!,
                demandaId,
                {
                  oQueFoiFeito: String(fd.get("oQueFoiFeito") ?? ""),
                  problemaResolvido: fd.get("problemaResolvido") === "on",
                  resultadoObtido: String(fd.get("resultadoObtido") ?? ""),
                  observacoesFinais: String(fd.get("observacoesFinais") ?? "") || undefined,
                },
                ag,
              );
              return "Demanda concluída com resultado registrado.";
            });
          }}
        >
          <Campo rotulo="O que foi realizado?" obrigatorio dica="A atividade executada">
            <textarea name="oQueFoiFeito" required rows={2} autoFocus className={classeInput} />
          </Campo>
          <Campo
            rotulo="Qual foi o resultado obtido?"
            obrigatorio
            dica="O efeito, na perspectiva de quem abriu a demanda"
          >
            <textarea name="resultadoObtido" required rows={2} className={classeInput} />
          </Campo>
          <Campo rotulo="Observações finais">
            <textarea name="observacoesFinais" rows={2} className={classeInput} />
          </Campo>
          <label className="flex items-start gap-2.5 rounded-lg bg-white p-3 ring-1 ring-inset ring-emerald-200">
            <input
              type="checkbox"
              name="problemaResolvido"
              required
              className="mt-0.5 size-4 rounded border-tinta-300"
            />
            <span className="text-sm text-emerald-900">
              Confirmo que o problema que originou esta demanda foi resolvido
            </span>
          </label>
          <div className="flex gap-2">
            <Botao type="submit">Concluir demanda</Botao>
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="foco-visivel rounded-lg px-3 py-2 text-sm text-tinta-600 hover:bg-white"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="foco-visivel mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-800"
        >
          Registrar resultado e concluir
        </button>
      )}
    </Cartao>
  );
}

const TIPOS_IMPEDIMENTO: TipoImpedimento[] = [
  "AGUARDANDO_APROVACAO",
  "AGUARDANDO_FORNECEDOR",
  "AGUARDANDO_MATERIAL",
  "AGUARDANDO_ACESSO",
  "FALTA_INFORMACAO",
  "DEPENDENCIA",
  "RESTRICAO_FINANCEIRA",
];

function BlocoGestao({
  ctx,
  demanda,
  temImpedimentoAtivo,
}: {
  ctx: Ctx;
  demanda: Demanda;
  temImpedimentoAtivo: boolean;
}) {
  const { base, usuario, aplicar, agora } = ctx;
  const podeImpedir = pode(usuario, "registrar_impedimento") && !temImpedimentoAtivo;
  const podeAtribuir = pode(usuario, "atribuir_responsavel");
  const podePrioridade = pode(usuario, "ajustar_prioridade");
  if (!podeImpedir && !podeAtribuir && !podePrioridade) return null;
  const operacao = base.usuarios.filter((u) => u.papel !== "SOLICITANTE");

  return (
    <Cartao className="divide-y divide-tinta-100">
      {podeImpedir && (
        <Recolhivel rotulo="Registrar um impedimento">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              aplicar((b, ag) => {
                registrarImpedimento(
                  b,
                  b.usuarios.find((u) => u.id === usuario.id)!,
                  demanda.id,
                  {
                    tipo: String(fd.get("tipo")) as TipoImpedimento,
                    descricao: String(fd.get("descricao") ?? ""),
                    responsavelDesbloqueioId: String(fd.get("responsavelDesbloqueioId") ?? ""),
                    dataRevisao: new Date(String(fd.get("dataRevisao"))).getTime(),
                  },
                  ag,
                );
                return "Impedimento registrado. Os passos de execução ficaram suspensos e o desbloqueio virou um passo com dono e prazo.";
              });
            }}
          >
            <p className="text-xs text-tinta-500">
              Use quando não dá para avançar por um motivo concreto. Os passos de execução
              ficam suspensos até o desbloqueio — e o sistema passa a cobrar quem pode
              destravar.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="O que está travando?" obrigatorio>
                <select name="tipo" defaultValue="" required className={classeInput}>
                  <option value="" disabled>
                    Escolha
                  </option>
                  {TIPOS_IMPEDIMENTO.map((t) => (
                    <option key={t} value={t}>
                      {ROTULO_IMPEDIMENTO[t]}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Quem consegue destravar?" obrigatorio>
                <select
                  name="responsavelDesbloqueioId"
                  defaultValue=""
                  required
                  className={classeInput}
                >
                  <option value="" disabled>
                    Escolha uma pessoa
                  </option>
                  {base.usuarios.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
            <Campo rotulo="Descreva o impedimento" obrigatorio>
              <textarea name="descricao" required rows={2} className={classeInput} />
            </Campo>
            <Campo
              rotulo="Quando revisar isso?"
              obrigatorio
              dica="Impedimento sem data de revisão vira esquecimento"
            >
              <input
                name="dataRevisao"
                type="datetime-local"
                required
                defaultValue={paraInputDateTime(agora + 3 * DIA)}
                className={classeInput}
              />
            </Campo>
            <Botao type="submit" variante="perigo">
              Registrar impedimento
            </Botao>
          </form>
        </Recolhivel>
      )}

      {podeAtribuir && (
        <Recolhivel rotulo="Trocar responsável">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              aplicar((b, ag) =>
                void atribuirResponsavel(
                  b,
                  b.usuarios.find((u) => u.id === usuario.id)!,
                  demanda.id,
                  String(fd.get("responsavelId") ?? "") || undefined,
                  ag,
                ),
              );
            }}
          >
            <Campo rotulo="Responsável pela demanda">
              <select
                name="responsavelId"
                defaultValue={demanda.responsavelId ?? ""}
                className={classeInput}
              >
                <option value="">Sem responsável</option>
                {operacao.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Botao type="submit" variante="secundario">
              Salvar responsável
            </Botao>
          </form>
        </Recolhivel>
      )}

      {podePrioridade && (
        <Recolhivel rotulo="Ajustar prioridade">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              aplicar((b, ag) => {
                ajustarPrioridade(
                  b,
                  b.usuarios.find((u) => u.id === usuario.id)!,
                  demanda.id,
                  String(fd.get("nivel")) as NivelPrioridade,
                  String(fd.get("justificativa") ?? ""),
                  ag,
                );
                return "Prioridade ajustada. A decisão ficou registrada no histórico com seu nome.";
              });
            }}
          >
            <p className="rounded-lg bg-tinta-50 p-3 text-xs text-tinta-600">
              <span className="font-medium">Cálculo do sistema:</span>{" "}
              {ROTULO_PRIORIDADE[demanda.prioridade.nivel]} (score{" "}
              {demanda.prioridade.score}) — {demanda.prioridade.justificativa}
            </p>
            <Campo rotulo="Nova prioridade">
              <select
                name="nivel"
                defaultValue={demanda.prioridade.nivel}
                className={classeInput}
              >
                {(["CRITICA", "ALTA", "MEDIA", "BAIXA"] as NivelPrioridade[]).map((n) => (
                  <option key={n} value={n}>
                    {ROTULO_PRIORIDADE[n]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo
              rotulo="Por que está mudando?"
              obrigatorio
              dica="A decisão fica registrada no histórico com seu nome"
            >
              <textarea name="justificativa" required rows={2} className={classeInput} />
            </Campo>
            <Botao type="submit" variante="secundario">
              Salvar prioridade
            </Botao>
          </form>
        </Recolhivel>
      )}
    </Cartao>
  );
}

function Recolhivel({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group">
      <summary className="foco-visivel cursor-pointer list-none rounded-lg px-3 py-2 text-sm font-medium text-tinta-600 hover:bg-tinta-50">
        <ChevronRight
          className="mr-1.5 inline-block size-4 align-[-3px] transition group-open:rotate-90"
          strokeWidth={2}
          aria-hidden
        />
        {rotulo}
      </summary>
      <div className="px-3 pb-3 pt-2">{children}</div>
    </details>
  );
}

function BlocoHistorico({
  ctx,
  eventos,
  movimentos,
}: {
  ctx: Ctx;
  eventos: BaseDados["eventos"];
  movimentos: Movimento[];
}) {
  const concluidos = movimentos.filter((m) => m.estado === "CONCLUIDO");
  const nome = (id?: ID) =>
    id ? (ctx.base.usuarios.find((u) => u.id === id)?.nome ?? "alguém") : "sistema";

  return (
    <section>
      <TituloSecao contagem={eventos.length}>Histórico</TituloSecao>

      {concluidos.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-xs text-tinta-500">Passos já concluídos</p>
          <Cartao className="divide-y divide-tinta-100">
            {concluidos.map((m) => (
              <div key={m.id} className="p-3.5">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="rounded bg-tinta-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-tinta-600">
                    {ROTULO_TIPO_MOVIMENTO[m.tipo]}
                  </span>
                  <span className="text-sm font-medium text-tinta-800">{m.acao}</span>
                  <span className="ml-auto text-[11px] text-tinta-400">
                    {m.concluidoEm ? dataHora(m.concluidoEm) : ""}
                  </span>
                </div>
                {m.relato && <p className="mt-1.5 text-sm text-tinta-600">{m.relato}</p>}
              </div>
            ))}
          </Cartao>
        </div>
      )}

      <details className="group">
        <summary className="foco-visivel cursor-pointer list-none rounded-lg px-3 py-2 text-sm text-tinta-600 hover:bg-tinta-100">
          <span className="mr-1.5 inline-block transition group-open:rotate-90">›</span>
          Ver todos os {eventos.length} registros
        </summary>
        <ol className="mt-2 space-y-0 border-l border-tinta-200 pl-4">
          {eventos.map((e) => (
            <li key={e.id} className="relative py-2">
              <span className="absolute -left-[21px] top-3 size-2 rounded-full bg-tinta-300 ring-2 ring-tinta-50" />
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-xs text-tinta-500">{ROTULO_EVENTO[e.tipo]}</span>
                <span className="text-[11px] text-tinta-400">
                  {relativo(e.criadoEm, ctx.agora)}
                </span>
                <span className="text-[11px] text-tinta-400">· {nome(e.autorId)}</span>
              </div>
              <p className="mt-0.5 text-sm text-tinta-700">{e.descricao}</p>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Rotinas preventivas
// ---------------------------------------------------------------------------

function Recorrencias({ ctx }: { ctx: Ctx }) {
  const { base, usuario, aplicar, agora } = ctx;
  const podeGerenciar = pode(usuario, "gerenciar_recorrencias");

  const lista = base.recorrencias
    .map((r) => ({
      ...r,
      local: base.locais.find((l) => l.id === r.localId),
      categoria: base.categorias.find((c) => c.id === r.categoriaId),
      responsavel: base.usuarios.find((u) => u.id === r.responsavelPadraoId),
      ocorrenciaAberta: base.demandas.find(
        (d) =>
          d.recorrenciaId === r.id && d.estado !== "CONCLUIDA" && d.estado !== "CANCELADA",
      ),
    }))
    .sort((a, b) => a.proximaExecucao - b.proximaExecucao);

  return (
    <div className="space-y-7">
      <header>
        <h1 className="titulo-tela">Rotinas preventivas</h1>
        <p className="mt-1 text-sm text-tinta-500">
          Manutenções que se repetem. Quando a data chega, o sistema abre a demanda
          sozinho — ninguém precisa lembrar. Use o controle de tempo na barra lateral para
          ver isso acontecer.
        </p>
      </header>

      <div className="space-y-2.5">
        {lista.map((r) => {
          const dias = Math.ceil((r.proximaExecucao - agora) / DIA);
          const atrasada = dias < 0 && r.ativo;
          const proxima = dias >= 0 && dias <= r.avisarAntesDias && r.ativo;

          return (
            <Cartao
              key={r.id}
              className={`p-4 ${atrasada ? "border-orange-300 bg-orange-50/50" : ""}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-tinta-900">{r.titulo}</h3>
                    {atrasada && (
                      <span className="rounded bg-orange-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
                        atrasada
                      </span>
                    )}
                    {proxima && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                        se aproximando
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-tinta-500">
                    {r.local?.nome} · {r.categoria?.nome} · a cada{" "}
                    {plural(r.intervaloDias, "dia")}
                  </p>
                  <p className="mt-2 text-sm text-tinta-700">
                    Próxima execução{" "}
                    <span
                      className={`font-medium ${
                        atrasada ? "text-orange-700" : "text-tinta-900"
                      }`}
                    >
                      {relativo(r.proximaExecucao, agora)}
                    </span>{" "}
                    <span className="text-tinta-400">({data(r.proximaExecucao)})</span>
                  </p>
                  <div className="mt-2">
                    <QuemAge
                      nome={r.responsavel?.nome}
                      id={r.responsavel?.id}
                      prefixo="Executa: "
                    />
                  </div>
                  {r.ocorrenciaAberta && (
                    <a
                      href={`#/demandas/${r.ocorrenciaAberta.id}`}
                      className="mt-2 inline-block rounded-lg bg-obra-50 px-2.5 py-1 text-xs font-medium text-obra-800 hover:bg-obra-100"
                    >
                      Ocorrência em andamento: {r.ocorrenciaAberta.codigo} →
                    </a>
                  )}
                </div>

                {podeGerenciar && r.ativo && !r.ocorrenciaAberta && (
                  <Botao
                    type="button"
                    variante="secundario"
                    onClick={() =>
                      aplicar((b, ag) => {
                        gerarOcorrencia(
                          b,
                          b.usuarios.find((u) => u.id === usuario.id)!,
                          r.id,
                          ag,
                        );
                        return `Ocorrência aberta com triagem. Próxima execução reprogramada.`;
                      })
                    }
                  >
                    Abrir agora
                  </Botao>
                )}
              </div>
            </Cartao>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aprendizado
// ---------------------------------------------------------------------------

function Aprendizado({ ctx }: { ctx: Ctx }) {
  const { base, agora } = ctx;
  const m = calcularMetricas(base.demandas, base.movimentos, agora);
  const nomeLocal = (id: ID) => base.locais.find((l) => l.id === id)?.nome ?? "—";
  const nomeCategoria = (id: ID) =>
    base.categorias.find((c) => c.id === id)?.nome ?? "—";

  return (
    <div className="space-y-8">
      <header>
        <h1 className="titulo-tela">Aprendizado</h1>
        <p className="mt-1 text-sm text-tinta-500">
          O que o histórico dos últimos 90 dias diz sobre a operação. Números que mudam
          decisões, não painéis decorativos.
        </p>
      </header>

      <section>
        <TituloSecao>Problemas que se repetem</TituloSecao>
        {m.reincidencias.length === 0 ? (
          <Vazio titulo="Nenhuma reincidência identificada" icone={BarChart3} />
        ) : (
          <div className="space-y-2.5">
            {m.reincidencias.map((r) => (
              <Cartao
                key={`${r.localId}-${r.categoriaId}`}
                className="border-amber-200 bg-amber-50/50 p-4"
              >
                <p className="text-sm font-semibold text-amber-950">
                  {nomeCategoria(r.categoriaId)} em {nomeLocal(r.localId)}
                </p>
                <p className="mt-1 text-sm text-amber-900">
                  {plural(r.ocorrencias, "demanda")} nos últimos{" "}
                  {REGRAS.reincidencia.janelaDias} dias. Repetição neste padrão sugere
                  causa de fundo não resolvida — considere uma rotina preventiva.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {r.demandaIds.map((id) => (
                    <a
                      key={id}
                      href={`#/demandas/${id}`}
                      className="rounded bg-white px-2 py-1 text-[11px] text-amber-900 ring-1 ring-amber-200"
                    >
                      ver ocorrência →
                    </a>
                  ))}
                </div>
              </Cartao>
            ))}
          </div>
        )}
      </section>

      <section>
        <TituloSecao>Como a operação está funcionando</TituloSecao>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <Metrica
            rotulo="Tempo até a triagem"
            valor={m.tempoMedioAteTriagemHoras}
            sufixo="h"
            referencia={`meta: ${REGRAS.triagemHoras}h`}
            alerta={
              m.tempoMedioAteTriagemHoras !== null &&
              m.tempoMedioAteTriagemHoras > REGRAS.triagemHoras
            }
          />
          <Metrica
            rotulo="Tempo até a resolução"
            valor={
              m.tempoMedioResolucaoHoras !== null
                ? Math.round(m.tempoMedioResolucaoHoras / 24)
                : null
            }
            sufixo=" dias"
          />
          <Metrica rotulo="Resolvidas no prazo" valor={m.percentualNoPrazo} sufixo="%" />
          <Metrica rotulo="Demandas ativas" valor={m.totalAtivas} />
          <Metrica rotulo="Concluídas no período" valor={m.concluidasNoPeriodo} />
          <Metrica
            rotulo="Precisaram de retrabalho"
            valor={m.retrabalhos}
            referencia="execução repetida"
            alerta={m.retrabalhos > 0}
          />
        </div>
        {m.demandasSemProximoMovimento > 0 && (
          <Cartao className="mt-2.5 border-red-200 bg-red-50/60 p-4">
            <p className="text-sm text-red-900">
              <span className="font-semibold">
                {plural(m.demandasSemProximoMovimento, "demanda")} sem próximo passo
                definido.
              </span>{" "}
              Este é o indicador mais importante desta tela: demanda sem direção é demanda
              esquecida.
            </p>
          </Cartao>
        )}
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section>
          <TituloSecao>Onde surgem mais demandas</TituloSecao>
          <Barras
            itens={m.porLocal
              .slice(0, 6)
              .map((x) => ({ rotulo: nomeLocal(x.localId), valor: x.total }))}
          />
        </section>
        <section>
          <TituloSecao>Que tipo de serviço mais aparece</TituloSecao>
          <Barras
            itens={m.porCategoria
              .slice(0, 6)
              .map((x) => ({ rotulo: nomeCategoria(x.categoriaId), valor: x.total }))}
          />
        </section>
      </div>
    </div>
  );
}

function Metrica({
  rotulo,
  valor,
  sufixo = "",
  referencia,
  alerta,
}: {
  rotulo: string;
  valor: number | null;
  sufixo?: string;
  referencia?: string;
  alerta?: boolean;
}) {
  return (
    <Cartao className="p-4">
      <p
        className={`numerico text-2xl font-semibold ${
          alerta ? "text-orange-600" : "text-tinta-900"
        }`}
      >
        {valor === null ? "—" : `${valor}${sufixo}`}
      </p>
      <p className="mt-0.5 text-xs leading-tight text-tinta-600">{rotulo}</p>
      {referencia && <p className="mt-0.5 text-[11px] text-tinta-400">{referencia}</p>}
    </Cartao>
  );
}

function Barras({ itens }: { itens: { rotulo: string; valor: number }[] }) {
  const maximo = Math.max(1, ...itens.map((i) => i.valor));
  if (itens.length === 0) return <Vazio titulo="Sem dados no período" icone={BarChart3} />;
  return (
    <Cartao className="space-y-2.5 p-4">
      {itens.map((i) => (
        <div key={i.rotulo}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-tinta-700">{i.rotulo}</span>
            <span className="shrink-0 font-medium tabular-nums text-tinta-900">
              {i.valor}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-tinta-100">
            <div
              className="h-full rounded-full bg-tinta-400"
              style={{ width: `${(i.valor / maximo) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </Cartao>
  );
}

// ---------------------------------------------------------------------------

const raiz = document.getElementById("raiz");
if (raiz) createRoot(raiz).render(<App />);
