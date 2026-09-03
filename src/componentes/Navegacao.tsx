"use client";

/**
 * Navegação principal.
 *
 * Desktop: barra lateral fixa. Mobile: barra inferior com os quatro destinos
 * que fazem sentido em campo — a experiência móvel não é a versão desktop
 * encolhida.
 *
 * O contador de itens que precisam da atenção do usuário fica visível na
 * navegação: a pessoa não precisa entrar numa tela para descobrir que há algo.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Papel } from "@/domain/tipos";
import { ROTULO_PAPEL } from "@/domain/rotulos";
import { Avatar } from "./primitivos";

export interface ItemNav {
  href: string;
  rotulo: string;
  rotuloCurto: string;
  icone: string;
  contador?: number;
  /** Mostrado na barra inferior do celular. */
  mobile: boolean;
}

export function Navegacao({
  itens,
  usuario,
  sair,
}: {
  itens: ItemNav[];
  usuario: { id: string; nome: string; papel: Papel };
  sair: () => Promise<void>;
}) {
  const caminho = usePathname();
  const ativo = (href: string) =>
    href === "/" ? caminho === "/" : caminho.startsWith(href);

  return (
    <>
      {/* Barra lateral — desktop */}
      <nav className="sem-impressao fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-tinta-200 bg-white lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-tinta-900 text-sm font-bold text-white">
            CN
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-tinta-900">CN Obras</p>
            <p className="text-[11px] text-tinta-500">Gestão de infraestrutura</p>
          </div>
        </div>

        <ul className="flex-1 space-y-0.5 px-3 py-2">
          {itens.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`foco-visivel flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                  ativo(item.href)
                    ? "bg-tinta-100 font-semibold text-tinta-900"
                    : "text-tinta-600 hover:bg-tinta-50"
                }`}
              >
                <span aria-hidden className="w-4 text-center">
                  {item.icone}
                </span>
                <span className="flex-1">{item.rotulo}</span>
                {item.contador ? (
                  <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-700">
                    {item.contador}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>

        <div className="border-t border-tinta-200 p-3">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <Avatar nome={usuario.nome} id={usuario.id} />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-medium text-tinta-800">
                {usuario.nome}
              </p>
              <p className="text-[11px] text-tinta-500">{ROTULO_PAPEL[usuario.papel]}</p>
            </div>
          </div>
          <form action={sair}>
            <button
              type="submit"
              className="foco-visivel mt-1 w-full rounded-lg px-3 py-1.5 text-left text-xs text-tinta-500 hover:bg-tinta-50 hover:text-tinta-700"
            >
              Sair
            </button>
          </form>
        </div>
      </nav>

      {/* Cabeçalho — mobile */}
      <header className="sem-impressao sticky top-0 z-20 flex items-center justify-between border-b border-tinta-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-tinta-900 text-[11px] font-bold text-white">
            CN
          </span>
          <span className="text-sm font-semibold text-tinta-900">CN Obras</span>
        </div>
        <div className="flex items-center gap-2">
          <Avatar nome={usuario.nome} id={usuario.id} tamanho="sm" />
          <form action={sair}>
            <button type="submit" className="text-xs text-tinta-500">
              Sair
            </button>
          </form>
        </div>
      </header>

      {/* Barra inferior — mobile */}
      <nav className="sem-impressao fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-tinta-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {itens
          .filter((i) => i.mobile)
          .map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] transition ${
                ativo(item.href) ? "font-semibold text-tinta-900" : "text-tinta-500"
              }`}
            >
              <span aria-hidden className="text-base leading-none">
                {item.icone}
              </span>
              {item.rotuloCurto}
              {item.contador ? (
                <span className="absolute right-1/4 top-1 size-2 rounded-full bg-red-500" />
              ) : null}
            </Link>
          ))}
      </nav>
    </>
  );
}
