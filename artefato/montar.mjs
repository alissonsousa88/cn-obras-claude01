/**
 * Monta o arquivo único da versão navegável: CSS + bundle + casca da página.
 *
 * Tudo fica embutido — nenhuma dependência externa, nenhum servidor.
 */
import { readFileSync, writeFileSync } from "node:fs";

const css = readFileSync("/tmp/app.css", "utf8");
const js = readFileSync("/tmp/app-bundle.min.js", "utf8");
const casca = readFileSync("artefato/casca.html", "utf8");

const html = casca
  .replace("/*ESTILO*/", () => css)
  .replace("/*APLICACAO*/", () => js);

writeFileSync("artefato/cn-obras.html", html);
console.log(`artefato/cn-obras.html — ${(html.length / 1024).toFixed(0)} KB`);
