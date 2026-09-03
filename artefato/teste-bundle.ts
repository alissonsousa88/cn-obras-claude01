// Verificação: os motores e serviços reais rodam sem Node?
import { construirSeed } from "@/server/store/seed";
import { montarAtencao } from "@/domain/motorAtencao";
import { snapshotDe } from "@/server/servicos/comum";

const base = construirSeed(Date.now());
const joao = base.usuarios.find((u) => u.papel === "LIDERANCA")!;
const painel = montarAtencao(snapshotDe(base, Date.now()), joao);
console.log(
  "demandas:", base.demandas.length,
  "| sinais ativos:", base.sinais.filter((s) => s.estado === "ATIVO").length,
  "| precisa de você:", painel.precisaDeVoce.length,
);
