/**
 * Formatação de tempo em linguagem operacional.
 *
 * "vence em 3h" comunica melhor que "01/06/2026 14:00" para quem está decidindo
 * o que fazer agora. A data absoluta fica como complemento, não como principal.
 */
const RTF = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

export function dataHora(ms: number): string {
  return new Date(ms).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function data(ms: number): string {
  return new Date(ms).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function dataCurta(ms: number): string {
  return new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

/** "em 3 horas", "há 2 dias". */
export function relativo(ms: number, agora = Date.now()): string {
  const diff = ms - agora;
  const abs = Math.abs(diff);
  const min = 60_000;
  if (abs < min) return "agora";
  if (abs < 60 * min) return RTF.format(Math.round(diff / min), "minute");
  if (abs < 36 * 60 * min) return RTF.format(Math.round(diff / (60 * min)), "hour");
  if (abs < 30 * 24 * 60 * min) return RTF.format(Math.round(diff / (24 * 60 * min)), "day");
  return RTF.format(Math.round(diff / (30 * 24 * 60 * min)), "month");
}

/** Prazo com leitura operacional: "Vencido há 2 dias" / "Vence hoje, 16h". */
export function prazoLegivel(prazo: number, agora = Date.now()): string {
  const diff = prazo - agora;
  const horas = diff / 3_600_000;
  if (horas < 0) return `Vencido ${relativo(prazo, agora)}`;
  if (horas < 12) {
    return `Vence hoje, ${new Date(prazo).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }
  if (horas < 48) return `Vence ${relativo(prazo, agora)}`;
  return `Vence em ${data(prazo)}`;
}

export function moeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function saudacao(agora = new Date()): string {
  const h = agora.getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export function primeiroNome(nome: string): string {
  return nome.split(" ")[0] ?? nome;
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const a = partes[0]?.[0] ?? "";
  const b = partes.length > 1 ? partes[partes.length - 1]?.[0] ?? "" : "";
  return (a + b).toUpperCase();
}

/** Campo datetime-local <-> epoch. */
export function paraInputDateTime(ms: number): string {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}

// Pluralização vive no domínio (os motores também escrevem texto para a tela).
export { plural } from "@/domain/plural";

