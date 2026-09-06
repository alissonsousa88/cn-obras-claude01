/**
 * Shell das telas autenticadas.
 *
 * O contador de "precisa de você" é calculado no servidor pelo Motor de Atenção
 * e exibido na navegação — o sistema avisa antes de o usuário procurar.
 */
import { redirect } from "next/navigation";
import { Navegacao, type ItemNav } from "@/componentes/Navegacao";
import { montarAtencao, montarMinhaOperacao } from "@/domain/motorAtencao";
import { acaoSair } from "@/server/acoes";
import { usuarioAtual } from "@/server/auth";
import { pode } from "@/server/permissoes";
import { snapshotDe } from "@/server/servicos/comum";
import { tickSeNecessario } from "@/server/servicos/tickRunner";
import { store } from "@/server/store/arquivoStore";

export default async function LayoutApp({
  children,
}: {
  children: React.ReactNode;
}) {
  const usuario = await usuarioAtual();
  if (!usuario) redirect("/login");

  await tickSeNecessario();
  const base = await store.ler();
  const snap = snapshotDe(base, Date.now());
  const atencao = montarAtencao(snap, usuario);
  const minha = montarMinhaOperacao(snap, usuario);

  const itens: ItemNav[] = [
    {
      href: "/",
      rotulo: "Painel",
      rotuloCurto: "Painel",
      icone: "painel",
      mobile: true,
    },
    {
      href: "/atencao",
      rotulo: "Central de Atenção",
      rotuloCurto: "Atenção",
      icone: "atencao",
      contador: atencao.precisaDeVoce.length,
      mobile: true,
    },
    {
      href: "/minha-operacao",
      rotulo: "Minha operação",
      rotuloCurto: "Minhas",
      icone: "minhas",
      contador: minha.fazerAgora.filter((m) => m.atrasado).length,
      mobile: true,
    },
    {
      href: "/demandas",
      rotulo: "Demandas",
      rotuloCurto: "Demandas",
      icone: "demandas",
      mobile: true,
    },
    {
      href: "/recorrencias",
      rotulo: "Rotinas preventivas",
      rotuloCurto: "Rotinas",
      icone: "rotinas",
      mobile: false,
    },
  ];
  if (pode(usuario, "ver_metricas")) {
    itens.push({
      href: "/aprendizado",
      rotulo: "Aprendizado",
      rotuloCurto: "Dados",
      icone: "aprendizado",
      mobile: false,
    });
  }

  return (
    <div className="min-h-dvh">
      <Navegacao
        itens={itens}
        usuario={{ id: usuario.id, nome: usuario.nome, papel: usuario.papel }}
        sair={acaoSair}
      />
      <main className="pb-24 lg:ml-60 lg:pb-10">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
