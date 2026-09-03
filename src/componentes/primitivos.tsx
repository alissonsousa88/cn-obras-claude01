/**
 * Primitivos visuais.
 *
 * Prioridade, estado e sinal precisam ser diferenciáveis num relance — é o que
 * permite ao usuário "perceber" antes de ler. Por isso cada um tem uma forma
 * própria (pastilha sólida, contorno, faixa lateral) além da cor.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import type {
  EstadoDemanda,
  NivelPrioridade,
  NivelSinal,
} from "@/domain/tipos";
import { ROTULO_ESTADO, ROTULO_PRIORIDADE } from "@/domain/rotulos";
import { iniciais } from "@/lib/formato";

// ---------------------------------------------------------------------------

export function Cartao({
  children,
  className = "",
  faixa,
}: {
  children: ReactNode;
  className?: string;
  faixa?: NivelSinal;
}) {
  const classeFaixa = faixa
    ? { CRITICO: "faixa-critico", ALTO: "faixa-alto", MEDIO: "faixa-medio", INFO: "faixa-info" }[
        faixa
      ]
    : "";
  return <div className={`cartao ${classeFaixa} ${className}`}>{children}</div>;
}

export function TituloSecao({
  children,
  contagem,
  acao,
}: {
  children: ReactNode;
  contagem?: number;
  acao?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="titulo-secao">
        {children}
        {contagem !== undefined && contagem > 0 && (
          <span className="ml-2 text-tinta-400">({contagem})</span>
        )}
      </h2>
      {acao}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prioridade — pastilha sólida, é o atributo mais escaneado
// ---------------------------------------------------------------------------

const CORES_PRIORIDADE: Record<NivelPrioridade, string> = {
  CRITICA: "bg-red-600 text-white",
  ALTA: "bg-orange-100 text-orange-800 ring-1 ring-orange-300",
  MEDIA: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  BAIXA: "bg-tinta-100 text-tinta-600 ring-1 ring-tinta-200",
};

export function SeloPrioridade({
  nivel,
  titulo,
}: {
  nivel: NivelPrioridade;
  titulo?: string;
}) {
  return (
    <span
      title={titulo}
      className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold tracking-wide ${CORES_PRIORIDADE[nivel]}`}
    >
      {ROTULO_PRIORIDADE[nivel]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Estado — contorno discreto, é contexto e não alarme
// ---------------------------------------------------------------------------

const CORES_ESTADO: Record<EstadoDemanda, string> = {
  NOVA: "text-blue-700 bg-blue-50 ring-blue-200",
  EM_TRIAGEM: "text-blue-700 bg-blue-50 ring-blue-200",
  EM_DIAGNOSTICO: "text-indigo-700 bg-indigo-50 ring-indigo-200",
  EM_PLANEJAMENTO: "text-indigo-700 bg-indigo-50 ring-indigo-200",
  AGUARDANDO_APROVACAO: "text-violet-700 bg-violet-50 ring-violet-200",
  EM_EXECUCAO: "text-obra-700 bg-obra-50 ring-obra-200",
  EM_VALIDACAO: "text-teal-700 bg-teal-50 ring-teal-200",
  BLOQUEADA: "text-red-700 bg-red-50 ring-red-200",
  CONCLUIDA: "text-emerald-700 bg-emerald-50 ring-emerald-200",
  CANCELADA: "text-tinta-500 bg-tinta-100 ring-tinta-200",
};

export function SeloEstado({ estado }: { estado: EstadoDemanda }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${CORES_ESTADO[estado]}`}
    >
      {ROTULO_ESTADO[estado]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sinal — ponto colorido + texto, sempre acompanhado do que fazer
// ---------------------------------------------------------------------------

const CORES_SINAL: Record<NivelSinal, string> = {
  CRITICO: "bg-red-500",
  ALTO: "bg-orange-500",
  MEDIO: "bg-amber-500",
  INFO: "bg-blue-500",
};

export function PontoSinal({ nivel }: { nivel: NivelSinal }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-2 shrink-0 rounded-full ${CORES_SINAL[nivel]}`}
    />
  );
}

export function EtiquetaSinal({
  nivel,
  children,
}: {
  nivel: NivelSinal;
  children: ReactNode;
}) {
  const cor = {
    CRITICO: "bg-red-50 text-red-800 ring-red-200",
    ALTO: "bg-orange-50 text-orange-800 ring-orange-200",
    MEDIO: "bg-amber-50 text-amber-900 ring-amber-200",
    INFO: "bg-blue-50 text-blue-800 ring-blue-200",
  }[nivel];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${cor}`}
    >
      <PontoSinal nivel={nivel} />
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Pessoa
// ---------------------------------------------------------------------------

const CORES_AVATAR = [
  "bg-obra-100 text-obra-800",
  "bg-blue-100 text-blue-800",
  "bg-emerald-100 text-emerald-800",
  "bg-violet-100 text-violet-800",
  "bg-teal-100 text-teal-800",
  "bg-rose-100 text-rose-800",
];

function corDe(id: string): string {
  let soma = 0;
  for (let i = 0; i < id.length; i += 1) soma += id.charCodeAt(i);
  return CORES_AVATAR[soma % CORES_AVATAR.length]!;
}

export function Avatar({
  nome,
  id,
  tamanho = "md",
}: {
  nome: string;
  id: string;
  tamanho?: "sm" | "md";
}) {
  const dim = tamanho === "sm" ? "size-6 text-[10px]" : "size-8 text-xs";
  return (
    <span
      title={nome}
      className={`inline-flex ${dim} shrink-0 items-center justify-center rounded-full font-semibold ${corDe(id)}`}
    >
      {iniciais(nome)}
    </span>
  );
}

/**
 * Atribuição de responsabilidade. É o componente mais importante da interface:
 * a regra de domínio diz que sempre precisa estar claro quem deve agir, e o
 * caso "ninguém" nunca pode passar despercebido.
 */
export function QuemAge({
  nome,
  id,
  prefixo = "",
}: {
  nome?: string;
  id?: string;
  prefixo?: string;
}) {
  if (!nome || !id) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">
        Sem responsável
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-tinta-600">
      <Avatar nome={nome} id={id} tamanho="sm" />
      <span className="font-medium text-tinta-700">
        {prefixo}
        {nome}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Botões
// ---------------------------------------------------------------------------

type Variante = "primario" | "secundario" | "fantasma" | "perigo";

const ESTILO_BOTAO: Record<Variante, string> = {
  primario: "bg-tinta-900 text-white hover:bg-tinta-800",
  secundario:
    "bg-white text-tinta-700 ring-1 ring-inset ring-tinta-300 hover:bg-tinta-50",
  fantasma: "text-tinta-600 hover:bg-tinta-100",
  perigo: "bg-red-600 text-white hover:bg-red-700",
};

export function Botao({
  children,
  variante = "primario",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return (
    <button
      {...props}
      className={`foco-visivel inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${ESTILO_BOTAO[variante]} ${className}`}
    >
      {children}
    </button>
  );
}

export function BotaoLink({
  children,
  href,
  variante = "secundario",
  className = "",
}: {
  children: ReactNode;
  href: string;
  variante?: Variante;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`foco-visivel inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${ESTILO_BOTAO[variante]} ${className}`}
    >
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Campos
// ---------------------------------------------------------------------------

export function Campo({
  rotulo,
  dica,
  children,
  obrigatorio,
}: {
  rotulo: string;
  dica?: string;
  children: ReactNode;
  obrigatorio?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-tinta-700">
        {rotulo}
        {obrigatorio && <span className="ml-0.5 text-red-600">*</span>}
      </span>
      {children}
      {dica && <span className="mt-1 block text-xs text-tinta-500">{dica}</span>}
    </label>
  );
}

export const classeInput =
  "foco-visivel w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-tinta-900 ring-1 ring-inset ring-tinta-300 placeholder:text-tinta-400";

export function Vazio({
  titulo,
  descricao,
  icone = "✓",
}: {
  titulo: string;
  descricao?: string;
  icone?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-tinta-200 bg-white/50 px-6 py-10 text-center">
      <span className="mb-2 text-2xl" aria-hidden>
        {icone}
      </span>
      <p className="text-sm font-medium text-tinta-700">{titulo}</p>
      {descricao && <p className="mt-1 text-xs text-tinta-500">{descricao}</p>}
    </div>
  );
}
