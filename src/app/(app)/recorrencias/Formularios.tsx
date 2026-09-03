"use client";

import { BotaoEnviar, Formulario } from "@/componentes/Formulario";
import { Campo, Cartao, classeInput } from "@/componentes/primitivos";
import { paraInputDateTime } from "@/lib/formato";
import {
  acaoAlternarRecorrencia,
  acaoCriarRecorrencia,
  acaoExecutarRecorrenciaAgora,
} from "@/server/acoes";

export function AcoesRecorrencia({
  id,
  ativo,
  temOcorrenciaAberta,
}: {
  id: string;
  ativo: boolean;
  temOcorrenciaAberta: boolean;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      {ativo && !temOcorrenciaAberta && (
        <Formulario acao={acaoExecutarRecorrenciaAgora}>
          <input type="hidden" name="recorrenciaId" value={id} />
          <BotaoEnviar variante="secundario">Abrir agora</BotaoEnviar>
        </Formulario>
      )}
      <Formulario acao={acaoAlternarRecorrencia}>
        <input type="hidden" name="recorrenciaId" value={id} />
        <input type="hidden" name="ativo" value={ativo ? "false" : "true"} />
        <BotaoEnviar variante="fantasma">{ativo ? "Pausar" : "Reativar"}</BotaoEnviar>
      </Formulario>
    </div>
  );
}

export function FormularioNovaRecorrencia({
  locais,
  categorias,
  usuarios,
}: {
  locais: { id: string; nome: string }[];
  categorias: { id: string; nome: string }[];
  usuarios: { id: string; nome: string }[];
}) {
  const emUmaSemana = paraInputDateTime(Date.now() + 7 * 86_400_000);

  return (
    <Formulario acao={acaoCriarRecorrencia} aoConcluir="Rotina criada.">
      <Cartao className="space-y-4 p-5">
        <Campo rotulo="O que precisa se repetir?" obrigatorio>
          <input
            name="titulo"
            required
            placeholder="Ex.: Revisão dos extintores"
            className={classeInput}
          />
        </Campo>
        <Campo rotulo="O que deve ser feito?" obrigatorio>
          <textarea
            name="descricao"
            required
            rows={2}
            placeholder="Instruções para quem for executar"
            className={classeInput}
          />
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Local" obrigatorio>
            <select name="localId" required defaultValue="" className={classeInput}>
              <option value="" disabled>
                Escolha
              </option>
              {locais.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Categoria" obrigatorio>
            <select name="categoriaId" required defaultValue="" className={classeInput}>
              <option value="" disabled>
                Escolha
              </option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Campo rotulo="A cada (dias)" obrigatorio>
            <input
              name="intervaloDias"
              type="number"
              min={1}
              required
              defaultValue={90}
              className={classeInput}
            />
          </Campo>
          <Campo rotulo="Avisar antes (dias)">
            <input
              name="avisarAntesDias"
              type="number"
              min={0}
              defaultValue={7}
              className={classeInput}
            />
          </Campo>
          <Campo rotulo="Primeira execução" obrigatorio>
            <input
              name="primeiraExecucao"
              type="datetime-local"
              required
              defaultValue={emUmaSemana}
              className={classeInput}
            />
          </Campo>
          <Campo rotulo="Responsável">
            <select name="responsavelPadraoId" defaultValue="" className={classeInput}>
              <option value="">Definir na triagem</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <BotaoEnviar>Criar rotina</BotaoEnviar>
      </Cartao>
    </Formulario>
  );
}
