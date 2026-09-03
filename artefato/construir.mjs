/**
 * Compila a versão navegável do CN Obras.
 *
 * O ponto importante: os motores e serviços entram no bundle SEM MODIFICAÇÃO.
 * A camada de domínio foi escrita sem I/O e sem dependência de framework
 * justamente para isso — a única substituição necessária é `node:crypto`
 * (usado só para gerar identificadores) e o módulo de senhas, que não faz
 * sentido numa página que roda inteiramente no navegador.
 */
import { build } from "esbuild";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const raiz = process.cwd();

/** Troca módulos exclusivos do Node por equivalentes de navegador. */
const substituicoes = {
  [resolve(raiz, "src/server/senhas.ts")]: resolve(raiz, "artefato/shims/senhas.ts"),
};

const pluginNode = {
  name: "substituir-modulos-do-node",
  setup(build) {
    build.onResolve({ filter: /^node:crypto$/ }, () => ({
      path: resolve(raiz, "artefato/shims/crypto.ts"),
    }));
    build.onResolve({ filter: /^\.{1,2}\// }, (args) => {
      if (!args.importer) return null;
      for (const ext of ["", ".ts", ".tsx"]) {
        const alvo = resolve(args.resolveDir, args.path + ext);
        if (substituicoes[alvo]) return { path: substituicoes[alvo] };
      }
      return null;
    });
    // `next/link` só é usado para navegar; aqui a navegação é por hash.
    build.onResolve({ filter: /^next\/link$/ }, () => ({
      path: resolve(raiz, "artefato/shims/link.tsx"),
    }));

    // Resolve o alias "@/" do projeto, testando as extensões reais.
    build.onResolve({ filter: /^@\// }, (args) => {
      const semExtensao = resolve(raiz, "src", args.path.slice(2));
      for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
        const alvo = semExtensao + ext;
        if (substituicoes[alvo]) return { path: substituicoes[alvo] };
        if (existsSync(alvo)) return { path: alvo };
      }
      return null;
    });
  },
};

const entrada = process.argv[2] ?? "artefato/app.tsx";
const saida = process.argv[3] ?? "/tmp/cn-obras-navegador.js";

await build({
  entryPoints: [entrada],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: process.env.MINIFICAR === "1",
  jsx: "automatic",
  outfile: saida,
  plugins: [pluginNode],
  logLevel: "warning",
});

console.log(`bundle gerado: ${saida}`);
