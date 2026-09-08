/**
 * RESUMO PARA O SOLICITANTE
 *
 * O solicitante não tem acesso ao sistema — ele não faz login, não vê tela
 * nenhuma. O único retorno que ele recebe é o que o responsável decide mandar
 * pelo WhatsApp, usando o botão da tela de demanda.
 *
 * Este módulo gera esse texto a partir do estado real da demanda: mesma regra
 * de sempre, nenhuma mensagem escrita à mão que possa ficar desatualizada.
 * Fica no domínio (não em `lib/formato.ts`, camada de UI) porque decidir o que
 * contar é uma regra de negócio, não uma formatação de tela.
 */
import { movimentoAtual } from "./motorFluxo";
import type { Demanda, Impedimento, Instante, Movimento } from "./tipos";

export interface EntradaResumo {
  demanda: Demanda;
  movimentos: Movimento[];
  impedimentoAtivo?: Impedimento;
  localNome?: string;
}

function dataPtBr(ms: Instante): string {
  return new Date(ms).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function horaPtBr(ms: Instante): string {
  return new Date(ms).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Gera o texto pronto para envio. Primeiro nome do solicitante, para soar como
 * gente falando com gente — não um sistema disparando mensagem.
 */
export function gerarResumoWhatsApp(entrada: EntradaResumo): string {
  const { demanda, movimentos, impedimentoAtivo, localNome } = entrada;
  const primeiroNome = demanda.solicitanteNome.trim().split(/\s+/)[0] ?? "";
  const local = localNome ? ` (${localNome})` : "";

  const linhas: string[] = [
    `Olá${primeiroNome ? `, ${primeiroNome}` : ""}! Passando para atualizar sobre "${demanda.titulo}"${local}.`,
    "",
  ];

  if (demanda.estado === "CONCLUIDA" && demanda.resultado) {
    linhas.push(
      `✅ Concluído em ${dataPtBr(demanda.resultado.registradoEm)}.`,
      demanda.resultado.resultadoObtido,
    );
  } else if (demanda.estado === "CANCELADA") {
    linhas.push("Esta solicitação foi cancelada.");
  } else if (impedimentoAtivo) {
    linhas.push(
      "⏳ No momento estamos aguardando um ponto para seguir:",
      impedimentoAtivo.descricao,
    );
  } else {
    const proximo = movimentoAtual(movimentos);
    if (proximo) {
      linhas.push(
        `🔧 Andamento: ${proximo.acao}`,
        `Previsão: ${dataPtBr(proximo.prazo)} às ${horaPtBr(proximo.prazo)}`,
      );
    } else {
      linhas.push("Estamos avaliando os próximos passos com a equipe.");
    }
  }

  linhas.push("", "Qualquer dúvida, é só responder por aqui.", "— Equipe CN Obras");

  return linhas.join("\n");
}
