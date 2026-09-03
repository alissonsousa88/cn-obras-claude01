/**
 * Recria a base de demonstração.
 *
 * Útil para apresentar o sistema mais de uma vez sem carregar o resultado da
 * demonstração anterior, e para tornar o teste de ponta a ponta repetível.
 *
 * Fica desabilitado em produção, a menos que CN_OBRAS_PERMITIR_RESET=1 seja
 * definido explicitamente — reiniciar apaga o histórico operacional, o que o
 * domínio proíbe em uso real.
 */
import { NextResponse } from "next/server";
import { store } from "@/server/store/arquivoStore";
import { construirSeed } from "@/server/store/seed";

function permitido(): boolean {
  if (process.env.CN_OBRAS_PERMITIR_RESET === "1") return true;
  return process.env.NODE_ENV !== "production";
}

export async function POST() {
  if (!permitido()) {
    return NextResponse.json(
      { erro: "Reinício de dados desabilitado neste ambiente." },
      { status: 403 },
    );
  }
  const base = construirSeed(Date.now());
  await store.redefinir(base);
  return NextResponse.json({
    reiniciadoEm: new Date().toISOString(),
    demandas: base.demandas.length,
    movimentos: base.movimentos.length,
    sinaisAtivos: base.sinais.filter((s) => s.estado === "ATIVO").length,
    eventos: base.eventos.length,
  });
}
