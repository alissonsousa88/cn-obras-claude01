/**
 * Pluralização em português para as mensagens geradas pelo domínio.
 *
 * O produto pede linguagem operacional: "3 dias", não "3 dia(s)". Como os
 * motores escrevem texto que vai direto para a tela, a função vive aqui e não
 * na camada de interface.
 */
export function plural(
  quantidade: number,
  singular: string,
  pluralForma?: string,
): string {
  return `${quantidade} ${quantidade === 1 ? singular : (pluralForma ?? `${singular}s`)}`;
}
