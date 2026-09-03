/**
 * AUTENTICAÇÃO
 *
 * Implementação real, sem dependência de serviço externo: senha derivada com
 * scrypt e sessão em cookie assinado com HMAC (httpOnly, sameSite=lax).
 *
 * Foi mantida deliberadamente enxuta — o valor do produto está nos motores
 * operacionais, não em infraestrutura de identidade. A troca por um provedor
 * (Clerk, Auth.js, Convex Auth) toca apenas este arquivo e o formulário de login.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { Usuario } from "@/domain/tipos";
import { conferirSenha } from "./senhas";
import { store } from "./store/arquivoStore";

const COOKIE = "cn_obras_sessao";
const DURACAO_DIAS = 30;

function segredo(): string {
  const s = process.env.CN_OBRAS_SEGREDO;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Defina CN_OBRAS_SEGREDO (mínimo 16 caracteres) para rodar em produção.",
    );
  }
  // Desenvolvimento: segredo fixo para que a sessão sobreviva ao hot reload.
  return "cn-obras-desenvolvimento-local";
}

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------

function assinar(payload: string): string {
  return createHmac("sha256", segredo()).update(payload).digest("base64url");
}

function criarToken(usuarioId: string): string {
  const expiraEm = Date.now() + DURACAO_DIAS * 24 * 60 * 60 * 1000;
  const payload = `${usuarioId}.${expiraEm}`;
  return `${payload}.${assinar(payload)}`;
}

function validarToken(token: string): string | null {
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  const [usuarioId, expiraEm, assinatura] = partes as [string, string, string];
  const payload = `${usuarioId}.${expiraEm}`;
  const esperada = Buffer.from(assinar(payload));
  const recebida = Buffer.from(assinatura);
  if (esperada.length !== recebida.length) return null;
  if (!timingSafeEqual(esperada, recebida)) return null;
  if (Number(expiraEm) < Date.now()) return null;
  return usuarioId;
}

export async function entrar(
  email: string,
  senha: string,
): Promise<{ ok: true; usuario: Usuario } | { ok: false; erro: string }> {
  const base = await store.ler();
  const usuario = base.usuarios.find(
    (u) => u.email.toLowerCase() === email.trim().toLowerCase(),
  );
  // Mensagem única para não revelar quais e-mails existem.
  const generico = "E-mail ou senha não conferem.";
  if (!usuario || !usuario.ativo) return { ok: false, erro: generico };
  if (!conferirSenha(senha, usuario.senhaHash)) return { ok: false, erro: generico };

  const jar = await cookies();
  jar.set(COOKIE, criarToken(usuario.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DURACAO_DIAS * 24 * 60 * 60,
  });
  return { ok: true, usuario };
}

export async function sair(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** Usuário da sessão atual, ou `null` se não autenticado. */
export async function usuarioAtual(): Promise<Usuario | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const id = validarToken(token);
  if (!id) return null;
  const base = await store.ler();
  return base.usuarios.find((u) => u.id === id && u.ativo) ?? null;
}

/** Igual a `usuarioAtual`, mas lança quando não há sessão. Uso em páginas privadas. */
export async function exigirUsuario(): Promise<Usuario> {
  const usuario = await usuarioAtual();
  if (!usuario) throw new Error("NAO_AUTENTICADO");
  return usuario;
}
