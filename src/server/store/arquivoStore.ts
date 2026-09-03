/**
 * ADAPTER DE PERSISTÊNCIA EM ARQUIVO
 *
 * Persistência real (não in-memory: sobrevive a reinícios) sem exigir
 * provisionamento de banco externo. Escritas são serializadas por uma fila
 * em processo e gravadas de forma atômica (write + rename).
 *
 * Este é o único ponto do sistema que conhece o meio de armazenamento.
 */
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { baseVazia, type BaseDados, type ObrasStore } from "./port";
import { construirSeed } from "./seed";

const CAMINHO =
  process.env.CN_OBRAS_DB ?? join(process.cwd(), "data", "cn-obras.json");

/**
 * Cache em processo: evita reler o arquivo a cada requisição.
 *
 * O cache é validado contra a data de modificação do arquivo. Isso importa
 * porque o Next pode instanciar este módulo mais de uma vez no mesmo processo
 * (o bundle das rotas de API é distinto do bundle das páginas): sem a
 * verificação, uma escrita feita por um caminho ficaria invisível para o
 * outro. Também faz um `npm run seed` externo ser percebido na hora.
 */
let cache: BaseDados | null = null;
let cacheMtime = 0;
/** Fila serial: garante que duas transações nunca se sobreponham. */
let fila: Promise<unknown> = Promise.resolve();

async function mtimeAtual(): Promise<number> {
  try {
    return (await stat(CAMINHO)).mtimeMs;
  } catch {
    return 0;
  }
}

async function carregar(): Promise<BaseDados> {
  const mtime = await mtimeAtual();
  if (cache && mtime === cacheMtime) return cache;

  try {
    const bruto = await readFile(CAMINHO, "utf8");
    cache = { ...baseVazia(), ...(JSON.parse(bruto) as BaseDados) };
    cacheMtime = mtime;
  } catch (erro) {
    const naoExiste =
      typeof erro === "object" && erro !== null && "code" in erro &&
      (erro as { code?: string }).code === "ENOENT";
    if (!naoExiste) throw erro;
    // Primeira execução: nasce com os dados de demonstração.
    cache = construirSeed(Date.now());
    await gravar(cache);
  }
  return cache;
}

async function gravar(base: BaseDados): Promise<void> {
  await mkdir(dirname(CAMINHO), { recursive: true });
  const temporario = `${CAMINHO}.${process.pid}.tmp`;
  await writeFile(temporario, JSON.stringify(base, null, 2), "utf8");
  await rename(temporario, CAMINHO);
  cacheMtime = await mtimeAtual();
}

/** Serializa a operação na fila global do processo. */
function enfileirar<T>(fn: () => Promise<T>): Promise<T> {
  const proxima = fila.then(fn, fn);
  // Mantém a fila viva mesmo se uma operação falhar.
  fila = proxima.catch(() => undefined);
  return proxima;
}

export const arquivoStore: ObrasStore = {
  async ler() {
    return enfileirar(async () => {
      const base = await carregar();
      // Cópia defensiva: leitores não conseguem mutar o cache sem transação.
      return structuredClone(base);
    });
  },

  async transacao(fn) {
    return enfileirar(async () => {
      const base = await carregar();
      const rascunho = structuredClone(base);
      const resultado = await fn(rascunho);
      cache = rascunho;
      await gravar(rascunho);
      return resultado;
    });
  },

  async redefinir(base) {
    return enfileirar(async () => {
      cache = structuredClone(base);
      await gravar(cache);
    });
  },
};

export const store: ObrasStore = arquivoStore;
