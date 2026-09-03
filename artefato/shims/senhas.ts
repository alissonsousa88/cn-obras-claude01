/**
 * Shim de `src/server/senhas.ts`.
 *
 * Esta versão roda inteiramente no navegador, sem servidor: a troca de perfil
 * é uma escolha local, não uma autenticação. O scrypt do Node não faz sentido
 * aqui e não é carregado.
 */
export function gerarHashSenha(): string {
  return "demonstracao-local";
}

export function conferirSenha(): boolean {
  return true;
}
