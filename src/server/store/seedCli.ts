/** Recria a base de demonstração: `npm run seed`. */
import { store } from "./arquivoStore";
import { construirSeed } from "./seed";

const base = construirSeed(Date.now());
await store.redefinir(base);
console.log(
  `Base recriada: ${base.demandas.length} demandas, ${base.movimentos.length} movimentos, ` +
    `${base.sinais.filter((s) => s.estado === "ATIVO").length} sinais ativos, ` +
    `${base.eventos.length} eventos de histórico.`,
);
