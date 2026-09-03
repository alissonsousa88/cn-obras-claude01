/**
 * Shim de `node:crypto` para a versão navegável do CN Obras.
 *
 * A camada de domínio inteira depende de exatamente uma função do Node —
 * `randomUUID` — que existe nativamente no navegador. Nenhuma regra precisou
 * ser adaptada para rodar aqui.
 */
export function randomUUID(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Navegadores antigos: suficiente para identificar registros locais.
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
