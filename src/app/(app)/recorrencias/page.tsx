/**
 * ROTINAS PREVENTIVAS
 *
 * O usuário não deve depender da própria memória para lembrar de manutenção
 * preventiva. Cada rotina mostra quando acontece de novo e o sistema abre a
 * demanda sozinho quando a data chega (ver `servicos/tick.ts`).
 */
import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { Cartao, QuemAge, TituloSecao, Vazio } from "@/componentes/primitivos";
import { data, relativo } from "@/lib/formato";
import { exigirUsuario } from "@/server/auth";
import { listarRecorrencias } from "@/server/consultas";
import { pode } from "@/server/permissoes";
import { AcoesRecorrencia, FormularioNovaRecorrencia } from "./Formularios";

export default async function PaginaRecorrencias() {
  const usuario = await exigirUsuario();
  const { recorrencias, locais, categorias, usuarios } = await listarRecorrencias();
  const podeGerenciar = pode(usuario, "gerenciar_recorrencias");
  const simples = usuarios.map((u) => ({ id: u.id, nome: u.nome }));

  return (
    <div className="space-y-7">
      <header>
        <h1 className="titulo-tela">Rotinas preventivas</h1>
        <p className="mt-1 text-sm text-tinta-500">
          Manutenções que se repetem. Quando a data chega, o sistema abre a demanda
          sozinho — ninguém precisa lembrar.
        </p>
      </header>

      {recorrencias.length === 0 ? (
        <Vazio titulo="Nenhuma rotina cadastrada" icone={RefreshCw} />
      ) : (
        <div className="space-y-2.5">
          {recorrencias.map((r) => {
            const dias = Math.ceil((r.proximaExecucao - Date.now()) / 86_400_000);
            const atrasada = dias < 0 && r.ativo;
            const proxima = dias >= 0 && dias <= r.avisarAntesDias && r.ativo;

            return (
              <Cartao
                key={r.id}
                className={`p-4 ${
                  atrasada ? "border-orange-300 bg-orange-50/50" : ""
                } ${!r.ativo ? "opacity-60" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-tinta-900">{r.titulo}</h3>
                      {!r.ativo && (
                        <span className="rounded bg-tinta-100 px-1.5 py-0.5 text-[10px] text-tinta-600">
                          pausada
                        </span>
                      )}
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
                      {r.local?.nome} · {r.categoria?.nome} · a cada {r.intervaloDias} dias
                    </p>
                    <p className="mt-2 text-sm text-tinta-700">
                      {r.ativo ? (
                        <>
                          Próxima execução{" "}
                          <span
                            className={`font-medium ${
                              atrasada ? "text-orange-700" : "text-tinta-900"
                            }`}
                          >
                            {relativo(r.proximaExecucao)}
                          </span>{" "}
                          <span className="text-tinta-400">({data(r.proximaExecucao)})</span>
                        </>
                      ) : (
                        "Rotina pausada"
                      )}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <QuemAge
                        nome={r.responsavel?.nome}
                        id={r.responsavel?.id}
                        prefixo="Executa: "
                      />
                      {r.ultimaExecucao && (
                        <span className="text-[11px] text-tinta-400">
                          Última: {data(r.ultimaExecucao)}
                        </span>
                      )}
                    </div>
                    {r.ocorrenciaAberta && (
                      <Link
                        href={`/demandas/${r.ocorrenciaAberta.id}`}
                        className="mt-2 inline-block rounded-lg bg-obra-50 px-2.5 py-1 text-xs font-medium text-obra-800 hover:bg-obra-100"
                      >
                        Ocorrência em andamento: {r.ocorrenciaAberta.codigo} →
                      </Link>
                    )}
                  </div>

                  {podeGerenciar && (
                    <AcoesRecorrencia
                      id={r.id}
                      ativo={r.ativo}
                      temOcorrenciaAberta={!!r.ocorrenciaAberta}
                    />
                  )}
                </div>
              </Cartao>
            );
          })}
        </div>
      )}

      {podeGerenciar && (
        <section>
          <TituloSecao>Nova rotina</TituloSecao>
          <FormularioNovaRecorrencia
            locais={locais.map((l) => ({ id: l.id, nome: l.nome }))}
            categorias={categorias.map((c) => ({ id: c.id, nome: c.nome }))}
            usuarios={simples}
          />
        </section>
      )}
    </div>
  );
}
