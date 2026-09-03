/**
 * Execução do tick contra o store.
 *
 * Separado de `tick.ts` (que é uma função pura sobre a base) para que o seed
 * possa fechar sua linha do tempo com um tick sem criar um ciclo de módulos
 * com o adapter de persistência.
 */
import { store } from "../store/arquivoStore";
import { agora as agoraFn } from "./comum";
import { executarTick, type ResultadoTick } from "./tick";

/** Intervalo mínimo entre ticks automáticos, para não reprocessar a cada clique. */
const INTERVALO_MS = 60 * 1000;
let ultimoTick = 0;

/** Executa o tick com throttle. Chamado pelas leituras das páginas. */
export async function tickSeNecessario(): Promise<void> {
  const instante = agoraFn();
  if (instante - ultimoTick < INTERVALO_MS) return;
  ultimoTick = instante;
  await store.transacao((base) => executarTick(base, instante));
}

/** Força a execução do tick (endpoint /api/tick, agendador externo, testes). */
export async function forcarTick(): Promise<ResultadoTick> {
  const instante = agoraFn();
  ultimoTick = instante;
  return store.transacao((base) => executarTick(base, instante));
}
