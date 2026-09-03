/**
 * Endpoint do tick operacional.
 *
 * Permite que um agendador externo (ex.: Vercel Cron) mantenha o sistema
 * percebendo o tempo passar mesmo sem ninguém abrir a tela: recorrências
 * vencidas viram demandas, prioridades sobem com a espera e os sinais são
 * reconciliados.
 */
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { forcarTick } from "@/server/servicos/tickRunner";

export async function GET(request: Request) {
  // Quando CN_OBRAS_TICK_TOKEN estiver definido, exige o token do agendador.
  const token = process.env.CN_OBRAS_TICK_TOKEN;
  if (token) {
    const enviado = request.headers.get("authorization");
    if (enviado !== `Bearer ${token}`) {
      return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
    }
  }
  const resultado = await forcarTick();
  // O tick abre ocorrências e reconcilia sinais: as telas precisam refletir isso.
  revalidatePath("/", "layout");
  return NextResponse.json({ executadoEm: new Date().toISOString(), ...resultado });
}
