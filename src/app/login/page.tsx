import { redirect } from "next/navigation";
import { usuarioAtual } from "@/server/auth";
import { SENHA_DEMO } from "@/server/store/seed";
import { store } from "@/server/store/arquivoStore";
import { ROTULO_PAPEL } from "@/domain/rotulos";
import { FormularioLogin } from "./FormularioLogin";

export default async function PaginaLogin() {
  if (await usuarioAtual()) redirect("/");

  // A demonstração precisa ser navegável por quem recebe o link: os perfis
  // disponíveis ficam visíveis para que dê para trocar de papel e ver como o
  // Motor de Atenção muda de acordo com quem está olhando.
  const base = await store.ler();
  const perfis = base.usuarios
    .filter((u) => u.ativo)
    .map((u) => ({ nome: u.nome, email: u.email, papel: ROTULO_PAPEL[u.papel] }));

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-tinta-900 px-4 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-7 text-center">
          <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-white text-base font-bold text-tinta-900">
            CN
          </span>
          <h1 className="text-xl font-semibold text-white">CN Obras</h1>
          <p className="mt-1.5 text-sm text-tinta-300">
            Gestão operacional da infraestrutura da Comunidade das Nações
          </p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-xl">
          <FormularioLogin />
        </div>

        <details className="mt-5 rounded-xl bg-tinta-800/70 p-4 text-tinta-200">
          <summary className="cursor-pointer text-xs font-medium text-tinta-100">
            Perfis para conhecer o sistema
          </summary>
          <p className="mt-2 text-[11px] leading-relaxed text-tinta-400">
            Senha para todos: <code className="text-tinta-100">{SENHA_DEMO}</code>. Cada
            perfil enxerga uma operação diferente — a liderança vê as aprovações e a
            operação inteira; a equipe vê o que precisa executar; o solicitante vê apenas
            as próprias solicitações.
          </p>
          <ul className="mt-3 space-y-1.5">
            {perfis.map((p) => (
              <li key={p.email} className="flex justify-between gap-3 text-[11px]">
                <span className="text-tinta-100">{p.email}</span>
                <span className="shrink-0 text-tinta-400">{p.papel}</span>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
}
