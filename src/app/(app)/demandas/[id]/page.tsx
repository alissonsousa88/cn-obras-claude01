/**
 * TELA DA DEMANDA
 *
 * Ordem da hierarquia visual, seguindo a sequência de UX do produto
 * (o que perceber → o que decidir → o que fazer):
 *
 *   1. Cabeçalho: identidade e situação
 *   2. Impedimento ativo (se houver) — bloqueio é a informação mais urgente
 *   3. PRÓXIMO MOVIMENTO — o maior destaque da tela
 *   4. Sinais ativos
 *   5. Aprovação pendente
 *   6. Ações de gestão (responsável, prioridade, conclusão)
 *   7. Conversa e evidências
 *   8. Histórico — por último, deliberadamente: o passado nunca compete com o presente
 */
import { notFound } from "next/navigation";
import { CaixaConcluirDemanda } from "@/componentes/demanda/CaixaConcluirDemanda";
import { CaixaImpedimento } from "@/componentes/demanda/CaixaImpedimento";
import { CaixaProximoMovimento } from "@/componentes/demanda/CaixaProximoMovimento";
import { Conversa } from "@/componentes/demanda/Conversa";
import { GestaoDemanda } from "@/componentes/demanda/GestaoDemanda";
import { Historico } from "@/componentes/demanda/Historico";
import { PainelAprovacao } from "@/componentes/demanda/PainelAprovacao";
import {
  BotaoLink,
  Cartao,
  EtiquetaSinal,
  QuemAge,
  SeloEstado,
  SeloPrioridade,
  TituloSecao,
} from "@/componentes/primitivos";
import { ROTULO_SINAL } from "@/domain/rotulos";
import { data, dataHora, relativo } from "@/lib/formato";
import { exigirUsuario } from "@/server/auth";
import { detalheDemanda } from "@/server/consultas";
import { pode } from "@/server/permissoes";

export default async function PaginaDemanda({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const usuario = await exigirUsuario();
  const { id } = await params;
  const d = await detalheDemanda(usuario, id);
  if (!d) notFound();

  const impedimentoAtivo = d.impedimentos.find((i) => i.estado === "ATIVO");
  const aprovacaoPendente = d.aprovacoes.find((a) => a.estado === "PENDENTE");
  const concluida = d.demanda.estado === "CONCLUIDA";
  const usuariosSimples = d.usuarios.map((u) => ({
    id: u.id,
    nome: u.nome,
    papel: u.papel,
  }));

  return (
    <div className="space-y-6">
      <BotaoLink href="/demandas" variante="fantasma" className="-ml-3">
        ← Demandas
      </BotaoLink>

      {/* 1. Cabeçalho ---------------------------------------------------- */}
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <SeloPrioridade
            nivel={d.demanda.prioridade.nivel}
            titulo={d.demanda.prioridade.justificativa}
          />
          <SeloEstado estado={d.demanda.estado} />
          <span className="text-xs text-tinta-400">{d.demanda.codigo}</span>
        </div>
        <h1 className="titulo-tela mt-2">{d.demanda.titulo}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-tinta-500">
          <span>{d.local?.nome}</span>
          <span>{d.categoria.nome}</span>
          <span>Aberta {relativo(d.demanda.criadoEm)}</span>
          {d.demanda.prazo && <span>Prazo alvo: {data(d.demanda.prazo)}</span>}
          <QuemAge
            nome={d.responsavel?.nome}
            id={d.responsavel?.id}
            prefixo="Responsável: "
          />
        </div>
        <p className="mt-2 text-xs text-tinta-500">
          <span className="font-medium text-tinta-600">Por que esta prioridade:</span>{" "}
          {d.demanda.prioridade.justificativa}
          {d.demanda.prioridade.origem === "AJUSTE_MANUAL" && (
            <span className="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800">
              ajustada manualmente
            </span>
          )}
        </p>
      </header>

      {/* 2. Impedimento -------------------------------------------------- */}
      {impedimentoAtivo && (
        <CaixaImpedimento
          impedimento={impedimentoAtivo}
          responsavel={d.usuarios.find(
            (u) => u.id === impedimentoAtivo.responsavelDesbloqueioId,
          )}
          podeResolver={pode(usuario, "resolver_impedimento")}
          demandaId={d.demanda.id}
        />
      )}

      {/* 3. Próximo movimento — o destaque da tela ------------------------ */}
      {!concluida && (
        <CaixaProximoMovimento
          demanda={d.demanda}
          movimento={d.proximoMovimento}
          responsavel={
            d.proximoMovimento?.responsavelId
              ? d.usuarios.find((u) => u.id === d.proximoMovimento!.responsavelId)
              : undefined
          }
          usuarios={usuariosSimples}
          usuarioAtualId={usuario.id}
          semDirecao={d.semDirecao}
          bloqueado={!!impedimentoAtivo}
          prontaParaConclusao={d.checagemConclusao.pode}
        />
      )}

      {/* 4. Sinais ------------------------------------------------------- */}
      {d.sinais.length > 0 && (
        <section>
          <TituloSecao contagem={d.sinais.length}>Sinais nesta demanda</TituloSecao>
          <div className="flex flex-wrap gap-2">
            {d.sinais
              .slice()
              .sort((a, b) =>
                a.nivel === b.nivel ? 0 : a.nivel === "CRITICO" ? -1 : 1,
              )
              .map((s) => (
                <EtiquetaSinal key={s.id} nivel={s.nivel}>
                  <span className="font-semibold">{ROTULO_SINAL[s.tipo]}:</span>{" "}
                  {s.mensagem}
                </EtiquetaSinal>
              ))}
          </div>
        </section>
      )}

      {/* Reincidência — aprendizado do histórico chegando na decisão ------ */}
      {d.reincidencias.length >= 2 && (
        <Cartao className="border-amber-200 bg-amber-50/60 p-4">
          <p className="text-sm font-medium text-amber-900">
            Este problema já aconteceu {d.reincidencias.length + 1} vezes neste local nos
            últimos 90 dias
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Vale investigar a causa de fundo em vez de repetir o mesmo reparo.
          </p>
          <ul className="mt-2.5 space-y-1">
            {d.reincidencias.slice(0, 4).map((r) => (
              <li key={r.id}>
                <a
                  href={`/demandas/${r.id}`}
                  className="text-xs text-amber-900 underline underline-offset-2"
                >
                  {r.codigo} — {r.titulo} ({data(r.criadoEm)})
                </a>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      {/* 5. Aprovação ---------------------------------------------------- */}
      {aprovacaoPendente && (
        <PainelAprovacao
          aprovacao={aprovacaoPendente}
          aprovador={d.usuarios.find((u) => u.id === aprovacaoPendente.aprovadorId)}
          souOAprovador={aprovacaoPendente.aprovadorId === usuario.id}
          podeDecidir={pode(usuario, "aprovar")}
          demandaId={d.demanda.id}
        />
      )}

      {/* 6. Conclusão ---------------------------------------------------- */}
      {concluida && d.demanda.resultado ? (
        <Cartao className="border-emerald-200 bg-emerald-50/60 p-5">
          <TituloSecao>Resultado</TituloSecao>
          <p className="text-sm font-medium text-emerald-900">
            {d.demanda.resultado.resultadoObtido}
          </p>
          <dl className="mt-3 space-y-2 text-xs text-emerald-900/80">
            <div>
              <dt className="font-semibold">O que foi feito</dt>
              <dd>{d.demanda.resultado.oQueFoiFeito}</dd>
            </div>
            {d.demanda.resultado.observacoesFinais && (
              <div>
                <dt className="font-semibold">Observações</dt>
                <dd>{d.demanda.resultado.observacoesFinais}</dd>
              </div>
            )}
            <div>
              <dt className="font-semibold">Registrado</dt>
              <dd>
                {d.usuarios.find((u) => u.id === d.demanda.resultado!.registradoPor)?.nome}{" "}
                em {dataHora(d.demanda.resultado.registradoEm)}
              </dd>
            </div>
          </dl>
        </Cartao>
      ) : (
        pode(usuario, "concluir_demanda") && (
          <CaixaConcluirDemanda
            demandaId={d.demanda.id}
            checagem={d.checagemConclusao}
          />
        )
      )}

      {/* Gestão ----------------------------------------------------------- */}
      {!concluida && (
        <GestaoDemanda
          demanda={d.demanda}
          usuarios={usuariosSimples}
          podeAtribuir={pode(usuario, "atribuir_responsavel")}
          podeAjustarPrioridade={pode(usuario, "ajustar_prioridade")}
          podeRegistrarImpedimento={
            pode(usuario, "registrar_impedimento") && !impedimentoAtivo
          }
        />
      )}

      {/* 7. Descrição, conversa e evidências ------------------------------ */}
      <section>
        <TituloSecao>Sobre a solicitação</TituloSecao>
        <Cartao className="p-4">
          <p className="whitespace-pre-line text-sm text-tinta-700">
            {d.demanda.descricao || "Sem descrição adicional."}
          </p>
          <p className="mt-3 border-t border-tinta-100 pt-3 text-xs text-tinta-500">
            Solicitado por {d.solicitante?.nome} em {dataHora(d.demanda.criadoEm)}
          </p>
        </Cartao>
      </section>

      <Conversa
        demandaId={d.demanda.id}
        comentarios={d.comentarios.map((c) => ({
          ...c,
          autorNome: d.usuarios.find((u) => u.id === c.autorId)?.nome ?? "Alguém",
        }))}
        anexos={d.anexos}
        usuarios={usuariosSimples}
        podeMarcarInterno={usuario.papel !== "SOLICITANTE"}
        solicitanteId={d.demanda.solicitanteId}
      />

      {/* 8. Histórico ---------------------------------------------------- */}
      <Historico
        eventos={d.eventos.map((e) => ({
          ...e,
          autorNome: e.autorId
            ? d.usuarios.find((u) => u.id === e.autorId)?.nome
            : undefined,
        }))}
        movimentos={d.movimentos}
      />
    </div>
  );
}
