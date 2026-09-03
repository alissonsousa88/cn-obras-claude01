"use client";

import { BotaoEnviar, Formulario, Recolhivel } from "@/componentes/Formulario";
import { Campo, Cartao, classeInput } from "@/componentes/primitivos";
import { acaoAbrirDemanda } from "@/server/acoes";

export function FormularioNovaDemanda({
  locais,
  categorias,
}: {
  locais: { id: string; nome: string }[];
  categorias: { id: string; nome: string }[];
}) {
  return (
    <Formulario acao={acaoAbrirDemanda}>
      <Cartao className="space-y-4 p-5">
        <Campo rotulo="O que está acontecendo?" obrigatorio>
          <input
            name="titulo"
            required
            minLength={4}
            autoFocus
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
              {locais.map((l) => (
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
              {categorias.map((c) => (
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

        {/* Estes três checkboxes são a entrada real do Motor de Prioridade. */}
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
        </fieldset>

        <Recolhivel rotulo="Informações adicionais (opcional)">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Quantas pessoas isso afeta?" dica="Deixe vazio para usar a média do local">
              <input
                name="pessoasAfetadas"
                type="number"
                min={0}
                placeholder="Ex.: 120"
                className={classeInput}
              />
            </Campo>
            <Campo rotulo="Tem evento marcado nesse espaço?" dica="Aumenta a urgência conforme a data se aproxima">
              <input name="eventoProximoEm" type="datetime-local" className={classeInput} />
            </Campo>
          </div>
        </Recolhivel>
      </Cartao>

      <div className="mt-4 flex items-center gap-3">
        <BotaoEnviar>Abrir demanda</BotaoEnviar>
        <p className="text-xs text-tinta-500">
          O sistema cria automaticamente a triagem com prazo de 24 horas.
        </p>
      </div>
    </Formulario>
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
        className="mt-0.5 size-4 rounded border-tinta-300 text-tinta-900 focus:ring-obra-500"
      />
      <span className="leading-tight">
        <span className="block text-sm font-medium text-tinta-800">{rotulo}</span>
        <span className="block text-xs text-tinta-500">{dica}</span>
      </span>
    </label>
  );
}
