"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const NIVEIS = [
  { valor: "CRITICO", rotulo: "Crítico" },
  { valor: "ALTO", rotulo: "Alto" },
  { valor: "MEDIO", rotulo: "Atenção" },
];

export function FiltrosAtencao({
  tipos,
  atual,
}: {
  tipos: { valor: string; rotulo: string }[];
  atual: { nivel?: string; tipo?: string };
}) {
  const caminho = usePathname();
  const params = useSearchParams();

  const link = (chave: string, valor?: string) => {
    const p = new URLSearchParams(params.toString());
    if (valor && p.get(chave) !== valor) p.set(chave, valor);
    else p.delete(chave);
    const q = p.toString();
    return q ? `${caminho}?${q}` : caminho;
  };

  const pilula = (ativo: boolean) =>
    `rounded-full px-2.5 py-1 text-xs font-medium transition ${
      ativo
        ? "bg-tinta-900 text-white"
        : "bg-white text-tinta-600 ring-1 ring-inset ring-tinta-200 hover:bg-tinta-50"
    }`;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Link href={link("nivel")} className={pilula(!atual.nivel && !atual.tipo)}>
        Tudo
      </Link>
      {NIVEIS.map((n) => (
        <Link key={n.valor} href={link("nivel", n.valor)} className={pilula(atual.nivel === n.valor)}>
          {n.rotulo}
        </Link>
      ))}
      <span className="mx-1 h-4 w-px bg-tinta-200" aria-hidden />
      {tipos.map((t) => (
        <Link key={t.valor} href={link("tipo", t.valor)} className={pilula(atual.tipo === t.valor)}>
          {t.rotulo}
        </Link>
      ))}
    </div>
  );
}
