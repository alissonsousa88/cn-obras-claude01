"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { Categoria, Local, Usuario } from "@/domain/tipos";
import { ROTULO_ESTADO } from "@/domain/rotulos";
import { classeInput } from "@/componentes/primitivos";

const ESTADOS = [
  "EM_TRIAGEM",
  "EM_DIAGNOSTICO",
  "EM_PLANEJAMENTO",
  "AGUARDANDO_APROVACAO",
  "EM_EXECUCAO",
  "EM_VALIDACAO",
  "BLOQUEADA",
  "CONCLUIDA",
] as const;

export function FiltrosDemandas({
  locais,
  categorias,
  usuarios,
  atual,
}: {
  locais: Local[];
  categorias: Categoria[];
  usuarios: Usuario[];
  atual: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const trocar = (chave: string, valor: string) => {
    const p = new URLSearchParams(params.toString());
    if (valor) p.set(chave, valor);
    else p.delete(chave);
    router.push(`/demandas${p.toString() ? `?${p}` : ""}`);
  };

  const select = "rounded-lg border-0 bg-white py-1.5 pl-2.5 pr-8 text-xs text-tinta-700 ring-1 ring-inset ring-tinta-200 foco-visivel";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        defaultValue={atual.q ?? ""}
        placeholder="Buscar por título ou código…"
        onKeyDown={(e) => {
          if (e.key === "Enter") trocar("q", e.currentTarget.value);
        }}
        className={`${classeInput} h-8 max-w-56 py-1 text-xs`}
      />
      <select
        value={atual.estado ?? ""}
        onChange={(e) => trocar("estado", e.target.value)}
        className={select}
      >
        <option value="">Todas as situações</option>
        {ESTADOS.map((e) => (
          <option key={e} value={e}>
            {ROTULO_ESTADO[e]}
          </option>
        ))}
      </select>
      <select
        value={atual.local ?? ""}
        onChange={(e) => trocar("local", e.target.value)}
        className={select}
      >
        <option value="">Todos os locais</option>
        {locais.map((l) => (
          <option key={l.id} value={l.id}>
            {l.nome}
          </option>
        ))}
      </select>
      <select
        value={atual.categoria ?? ""}
        onChange={(e) => trocar("categoria", e.target.value)}
        className={select}
      >
        <option value="">Todas as categorias</option>
        {categorias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </select>
      <select
        value={atual.responsavel ?? ""}
        onChange={(e) => trocar("responsavel", e.target.value)}
        className={select}
      >
        <option value="">Qualquer responsável</option>
        {usuarios.map((u) => (
          <option key={u.id} value={u.id}>
            {u.nome}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1.5 text-xs text-tinta-600">
        <input
          type="checkbox"
          checked={atual.concluidas === "1"}
          onChange={(e) => trocar("concluidas", e.target.checked ? "1" : "")}
          className="rounded border-tinta-300"
        />
        Incluir concluídas
      </label>
    </div>
  );
}
