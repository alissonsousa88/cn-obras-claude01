/**
 * Derivação e verificação de senha (scrypt).
 *
 * Isolado de `auth.ts` porque este módulo precisa ser utilizável fora do
 * contexto de requisição do Next — o seed e os testes geram hashes sem tocar
 * em cookies.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function gerarHashSenha(senha: string): string {
  const sal = randomBytes(16).toString("hex");
  const derivada = scryptSync(senha, sal, 32).toString("hex");
  return `scrypt$${sal}$${derivada}`;
}

export function conferirSenha(senha: string, hash: string): boolean {
  const partes = hash.split("$");
  if (partes.length !== 3 || partes[0] !== "scrypt") return false;
  const [, sal, esperado] = partes as [string, string, string];
  const derivada = scryptSync(senha, sal, 32);
  const alvo = Buffer.from(esperado, "hex");
  if (alvo.length !== derivada.length) return false;
  return timingSafeEqual(derivada, alvo);
}
