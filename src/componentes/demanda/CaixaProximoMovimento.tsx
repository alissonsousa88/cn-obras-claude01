"use client";

/**
 * O PRÓXIMO MOVIMENTO — componente central da tela de demanda.
 *
 * Três estados possíveis, e nenhum deles é silencioso:
 *
 *  a) existe um próximo passo  -> mostra ação, responsável, prazo e resultado
 *     esperado, com o formulário de conclusão logo abaixo;
 *  b) a demanda está bloqueada -> explica que o passo está suspenso e que o
 *     caminho é resolver o impedimento;
 *  c) não existe próximo passo -> alerta vermelho e formulário para definir um.
 *     Esta é a materialização da regra "uma demanda ativa não deve permanecer
 *     sem direção operacional".
 *
 * O formulário de conclusão é contextual: pergunta o que o Motor de Fluxo
 * precisa saber para decidir o passo seguinte, e nada além disso.
 */
import { useState } from "react";
import { BotaoEnviar, Formulario } from "@/componentes/Formulario";
import { Campo, Cartao, QuemAge, classeInput } from "@/componentes/primitivos";
import { ROTULO_TIPO_MOVIMENTO } from "@/domain/rotulos";
import type { Demanda, Movimento, Papel, Usuario } from "@/domain/tipos";
import { dataHora, paraInputDateTime, prazoLegivel } from "@/lib/formato";
import { acaoConcluirMovimento, acaoDefinirProximoMovimento } from "@/server/acoes";

interface UsuarioSimples {
  id: string;
  nome: string;
  papel: Papel;
}

export function CaixaProximoMovimento({
  demanda,
  movimento,
  responsavel,
  usuarios,
  usuarioAtualId,
  semDirecao,
  bloqueado,
  prontaParaConclusao,
}: {
  demanda: Demanda;
  movimento?: Movimento;
  responsavel?: Usuario;
  usuarios: UsuarioSimples[];
  usuarioAtualId: string;
  semDirecao: boolean;
  bloqueado: boolean;
  prontaParaConclusao: boolean;
}) {
  const [registrando, setRegistrando] = useState(false);

  // (d) O fluxo terminou: o passo que falta é registrar o resultado, não criar
  // outro movimento. Sem esta distinção a tela pediria a coisa errada.
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

  // (c) Sem direção — anomalia que o sistema não deixa passar.
  if (semDirecao || (!movimento && !bloqueado)) {
    return (
      <Cartao className="border-red-300 bg-red-50/70 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
          Sem próximo passo definido
        </p>
        <p className="mt-1.5 text-sm text-red-900">
          Esta demanda está ativa, mas ninguém definiu o que precisa acontecer agora. Ela
          não vai avançar sozinha.
        </p>
        <div className="mt-4">
          <FormularioNovoPasso
            demandaId={demanda.id}
            usuarios={usuarios}
            padraoResponsavel={demanda.responsavelId ?? usuarioAtualId}
          />
        </div>
      </Cartao>
    );
  }

  // (b) Bloqueado por impedimento.
  if (!movimento || movimento.estado === "SUSPENSO") {
    return (
      <Cartao className="border-orange-200 bg-orange-50/60 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">
          Próximo passo suspenso
        </p>
        <p className="mt-1.5 text-sm text-orange-900">
          {movimento
            ? `"${movimento.acao}" está parado até o impedimento ser resolvido.`
            : "Nada avança enquanto o impedimento acima existir."}
        </p>
        <p className="mt-2 text-xs text-orange-800">
          O caminho aqui é destravar o impedimento, não criar outro passo.
        </p>
      </Cartao>
    );
  }

  // (a) Existe próximo passo.
  const atrasado = movimento.prazo < Date.now();

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
            className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700"
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
            {prazoLegivel(movimento.prazo)}
            <span className="ml-1.5 text-[11px] font-normal text-tinta-400">
              {dataHora(movimento.prazo)}
            </span>
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
          <FormularioConclusao
            demandaId={demanda.id}
            movimento={movimento}
            usuarios={usuarios}
            aoCancelar={() => setRegistrando(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setRegistrando(true)}
            className="foco-visivel w-full rounded-lg bg-tinta-900 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-tinta-800"
          >
            Registrar o que aconteceu neste passo
          </button>
        )}
      </div>
    </Cartao>
  );
}

/**
 * Formulário de conclusão contextual.
 *
 * As perguntas mudam conforme o tipo do movimento, porque são exatamente as
 * entradas que o Motor de Fluxo usa para decidir o próximo passo. Nenhum campo
 * existe "por existir".
 */
function FormularioConclusao({
  demandaId,
  movimento,
  usuarios,
  aoCancelar,
}: {
  demandaId: string;
  movimento: Movimento;
  usuarios: UsuarioSimples[];
  aoCancelar: () => void;
}) {
  const operacao = usuarios.filter((u) => u.papel !== "SOLICITANTE");

  return (
    <Formulario acao={acaoConcluirMovimento} className="space-y-4">
      <input type="hidden" name="demandaId" value={demandaId} />
      <input type="hidden" name="movimentoId" value={movimento.id} />

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
            simRotulo="Sim, sei o que precisa ser feito"
            naoRotulo="Não, precisa de diagnóstico"
            padrao
          />
          <Escolha
            nome="exigeOrcamento"
            rotulo="Precisa comprar material ou contratar alguém?"
            simRotulo="Sim, precisa de orçamento"
            naoRotulo="Não, resolvemos com o que temos"
          />
          <div className="grid gap-3 sm:grid-cols-2">
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
            <Campo rotulo="Prazo alvo da demanda">
              <input name="prazoDemanda" type="datetime-local" className={classeInput} />
            </Campo>
          </div>
          <Campo rotulo="Custo estimado (R$)" dica="Acima do limite da categoria, o sistema exige aprovação">
            <input name="custoEstimado" type="number" step="0.01" min="0" className={classeInput} />
          </Campo>
        </div>
      )}

      {movimento.tipo === "DIAGNOSTICO" && (
        <div className="space-y-3 rounded-lg bg-tinta-50 p-3.5">
          <Escolha
            nome="exigeOrcamento"
            rotulo="A solução precisa de compra ou contratação?"
            simRotulo="Sim, precisa de orçamento"
            naoRotulo="Não, a equipe executa"
          />
          <Campo rotulo="Custo estimado (R$)">
            <input name="custoEstimado" type="number" step="0.01" min="0" className={classeInput} />
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
            step="0.01"
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
            simRotulo="Sim, terminei"
            naoRotulo="Ainda não, continua"
            padrao
          />
          <p className="mt-2 text-xs text-tinta-500">
            Concluir a execução não conclui a demanda: o sistema vai pedir a validação de
            que o problema realmente acabou.
          </p>
        </div>
      )}

      {movimento.tipo === "VALIDACAO" && (
        <div className="rounded-lg bg-tinta-50 p-3.5">
          <Escolha
            nome="problemaResolvido"
            rotulo="O problema que originou a demanda foi resolvido?"
            simRotulo="Sim, resolvido"
            naoRotulo="Não, o problema continua"
            padrao
          />
          <p className="mt-2 text-xs text-tinta-500">
            Se o problema continua, o sistema devolve a demanda para nova avaliação em vez
            de encerrar.
          </p>
        </div>
      )}

      <label className="flex items-start gap-2.5 rounded-lg bg-amber-50 p-3">
        <input
          type="checkbox"
          name="precisaRetornoSolicitante"
          className="mt-0.5 size-4 rounded border-tinta-300"
        />
        <span className="text-xs text-amber-900">
          Falta uma informação do solicitante para prosseguir — o sistema vai criar um
          passo de retorno em vez de seguir o fluxo normal.
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        <BotaoEnviar>Concluir passo</BotaoEnviar>
        <button
          type="button"
          onClick={aoCancelar}
          className="foco-visivel rounded-lg px-3 py-2 text-sm text-tinta-600 hover:bg-tinta-100"
        >
          Cancelar
        </button>
      </div>
    </Formulario>
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
    case "DESBLOQUEIO":
      return "O que foi feito para destravar…";
    default:
      return "Registre o que aconteceu…";
  }
}

/** Par de opções sim/não com rótulos em linguagem operacional. */
function Escolha({
  nome,
  rotulo,
  simRotulo,
  naoRotulo,
  padrao = false,
}: {
  nome: string;
  rotulo: string;
  simRotulo: string;
  naoRotulo: string;
  padrao?: boolean;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-tinta-700">{rotulo}</legend>
      <div className="flex flex-wrap gap-2">
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm ring-1 ring-inset ring-tinta-200 has-checked:bg-tinta-900 has-checked:text-white">
          <input
            type="radio"
            name={nome}
            value="true"
            defaultChecked={padrao}
            className="sr-only"
          />
          {simRotulo}
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm ring-1 ring-inset ring-tinta-200 has-checked:bg-tinta-900 has-checked:text-white">
          <input
            type="radio"
            name={nome}
            value="false"
            defaultChecked={!padrao}
            className="sr-only"
          />
          {naoRotulo}
        </label>
      </div>
    </fieldset>
  );
}

/** Definição manual do próximo passo, quando o sistema não decide sozinho. */
export function FormularioNovoPasso({
  demandaId,
  usuarios,
  padraoResponsavel,
}: {
  demandaId: string;
  usuarios: UsuarioSimples[];
  padraoResponsavel?: string;
}) {
  const amanha = paraInputDateTime(Date.now() + 24 * 60 * 60 * 1000);
  return (
    <Formulario acao={acaoDefinirProximoMovimento} className="space-y-3">
      <input type="hidden" name="demandaId" value={demandaId} />
      <Campo rotulo="O que precisa acontecer?" obrigatorio>
        <input
          name="acao"
          required
          placeholder="Ex.: Comprar 6 painéis LED e agendar instalação"
          className={classeInput}
        />
      </Campo>
      <Campo
        rotulo="Como saberemos que deu certo?"
        obrigatorio
        dica="O resultado esperado é o que permite validar o passo depois"
      >
        <input
          name="resultadoEsperado"
          required
          placeholder="Ex.: Painéis comprados e data de instalação confirmada"
          className={classeInput}
        />
      </Campo>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Tipo">
          <select name="tipo" defaultValue="EXECUCAO" className={classeInput}>
            {(
              ["DIAGNOSTICO", "ORCAMENTO", "EXECUCAO", "VALIDACAO", "RETORNO_SOLICITANTE"] as const
            ).map((t) => (
              <option key={t} value={t}>
                {ROTULO_TIPO_MOVIMENTO[t]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Quem faz" obrigatorio>
          <select
            name="responsavelId"
            required
            defaultValue={padraoResponsavel ?? ""}
            className={classeInput}
          >
            <option value="" disabled>
              Escolha
            </option>
            {usuarios.map((u) => (
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
            defaultValue={amanha}
            className={classeInput}
          />
        </Campo>
      </div>
      <BotaoEnviar>Definir próximo passo</BotaoEnviar>
    </Formulario>
  );
}
