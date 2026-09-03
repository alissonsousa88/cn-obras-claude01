"use client";

/**
 * Conversa e evidências.
 *
 * Um comentário pode ser marcado como pergunta dirigida a alguém — e aí deixa
 * de ser bate-papo: vira pendência rastreada, que gera sinal de retorno
 * necessário se ficar sem resposta.
 */
import { BotaoEnviar, Formulario, Recolhivel } from "@/componentes/Formulario";
import { Avatar, Cartao, TituloSecao, classeInput } from "@/componentes/primitivos";
import type { Anexo, Comentario, Papel } from "@/domain/tipos";
import { dataHora, relativo } from "@/lib/formato";
import { acaoAnexar, acaoComentar } from "@/server/acoes";

type ComentarioComAutor = Comentario & { autorNome: string };

export function Conversa({
  demandaId,
  comentarios,
  anexos,
  usuarios,
  podeMarcarInterno,
  solicitanteId,
}: {
  demandaId: string;
  comentarios: ComentarioComAutor[];
  anexos: Anexo[];
  usuarios: { id: string; nome: string; papel: Papel }[];
  podeMarcarInterno: boolean;
  solicitanteId: string;
}) {
  const solicitante = usuarios.find((u) => u.id === solicitanteId);

  return (
    <section>
      <TituloSecao contagem={comentarios.length}>Conversa e evidências</TituloSecao>

      <Cartao className="divide-y divide-tinta-100">
        {comentarios.length === 0 ? (
          <p className="p-4 text-sm text-tinta-500">Nenhum comentário ainda.</p>
        ) : (
          comentarios.map((c) => (
            <div key={c.id} className="flex gap-3 p-4">
              <Avatar nome={c.autorNome} id={c.autorId} tamanho="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-medium text-tinta-800">{c.autorNome}</span>
                  <span className="text-[11px] text-tinta-400">{relativo(c.criadoEm)}</span>
                  {!c.visivelSolicitante && (
                    <span className="rounded bg-tinta-100 px-1.5 py-0.5 text-[10px] text-tinta-600">
                      interno
                    </span>
                  )}
                  {c.perguntaPara && !c.respondidoEm && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                      aguardando resposta
                    </span>
                  )}
                  {c.perguntaPara && c.respondidoEm && (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-800">
                      respondida
                    </span>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-line text-sm text-tinta-700">{c.texto}</p>
              </div>
            </div>
          ))
        )}

        <div className="p-4">
          <Formulario acao={acaoComentar} className="space-y-2.5">
            <input type="hidden" name="demandaId" value={demandaId} />
            <textarea
              name="texto"
              required
              rows={2}
              placeholder="Escreva um comentário ou faça uma pergunta…"
              className={classeInput}
            />
            <div className="flex flex-wrap items-center gap-3">
              <BotaoEnviar variante="secundario">Comentar</BotaoEnviar>
              {podeMarcarInterno && (
                <>
                  <label className="flex items-center gap-1.5 text-xs text-tinta-600">
                    <input
                      type="checkbox"
                      name="interno"
                      className="rounded border-tinta-300"
                    />
                    Só para a equipe
                  </label>
                  {solicitante && (
                    <label className="flex items-center gap-1.5 text-xs text-tinta-600">
                      <input
                        type="checkbox"
                        name="perguntaPara"
                        value={solicitante.id}
                        className="rounded border-tinta-300"
                      />
                      É uma pergunta para {solicitante.nome.split(" ")[0]}
                    </label>
                  )}
                </>
              )}
            </div>
          </Formulario>
        </div>
      </Cartao>

      {anexos.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {anexos.map((a) =>
            a.mimeType.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <a key={a.id} href={a.conteudo} target="_blank" rel="noreferrer" className="block">
                <img
                  src={a.conteudo}
                  alt={a.legenda ?? a.nome}
                  className="aspect-square w-full rounded-lg object-cover ring-1 ring-tinta-200"
                />
                <span className="mt-1 block truncate text-[11px] text-tinta-500">
                  {a.nome}
                </span>
              </a>
            ) : (
              <a
                key={a.id}
                href={a.conteudo}
                download={a.nome}
                className="flex flex-col justify-center rounded-lg bg-white p-3 text-xs ring-1 ring-tinta-200"
              >
                <span className="truncate font-medium text-tinta-700">{a.nome}</span>
                <span className="text-tinta-400">{dataHora(a.criadoEm)}</span>
              </a>
            ),
          )}
        </div>
      )}

      <div className="mt-2">
        <Recolhivel rotulo="Anexar foto ou documento">
          <Formulario acao={acaoAnexar} className="space-y-2.5">
            <input type="hidden" name="demandaId" value={demandaId} />
            {/* capture="environment" abre a câmera direto no celular, que é onde
                a equipe registra evidência em campo. */}
            <input
              type="file"
              name="arquivo"
              accept="image/*,application/pdf"
              capture="environment"
              required
              className="block w-full text-xs text-tinta-600 file:mr-3 file:rounded-lg file:border-0 file:bg-tinta-100 file:px-3 file:py-1.5 file:text-xs file:font-medium"
            />
            <input name="legenda" placeholder="Legenda (opcional)" className={classeInput} />
            <BotaoEnviar variante="secundario">Anexar</BotaoEnviar>
          </Formulario>
        </Recolhivel>
      </div>
    </section>
  );
}
