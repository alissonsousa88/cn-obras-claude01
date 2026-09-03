# Portar o CN Obras para Convex

O documento de produto pede Next.js + TypeScript + Tailwind no frontend e
Convex no backend. Frontend e UI estão como pedido. O Convex não foi
provisionado porque exige autenticação interativa em uma conta (`npx convex
dev` abre um fluxo de login), o que não é possível no ambiente onde este
projeto foi construído.

A adaptação foi feita **sem abandonar nenhum conceito de domínio**, como o
próprio documento autoriza. O que existe hoje:

| Camada | Estado |
|---|---|
| Regras de domínio e os quatro motores | `src/domain/` — TypeScript puro, sem I/O, sem dependência de framework |
| Serviços que aplicam as invariantes | `src/server/servicos/` — funções `(base, autor, entrada) => efeito` |
| Persistência | atrás do port `ObrasStore` (`src/server/store/port.ts`), com adapter em arquivo |
| Schema Convex | escrito e documentado em `convex/schema.ts` |

## Por que a migração é mecânica

Nenhuma regra de negócio conhece o banco. Os motores recebem um
`SnapshotOperacional` e devolvem conclusões; os serviços recebem a `BaseDados`
e a modificam. Uma mutation Convex faz exatamente o que a Server Action faz
hoje.

Hoje:

```ts
// src/server/acoes.ts
await store.transacao((base) =>
  concluirMovimento(base, usuario, movimentoId, conclusao),
);
```

No Convex:

```ts
// convex/movimentos.ts
export const concluir = mutation({
  args: { movimentoId: v.id("movimentos"), relato: v.string() /* … */ },
  handler: async (ctx, args) => {
    const usuario = await usuarioDaSessao(ctx);
    const base = await carregarBaseParcial(ctx, args.movimentoId); // ver abaixo
    concluirMovimento(base, usuario, args.movimentoId, args); // MESMA função
    await gravarAlteracoes(ctx, base);
  },
});
```

## Passos

1. **`npx convex dev`** e apontar o schema para `convex/schema.ts` (já pronto).

2. **Semear os cadastros** (`usuarios`, `categorias`, `locais`) com uma mutation
   de setup. O `construirSeed` atual serve de referência para os dados de
   demonstração.

3. **Substituir o adapter, não os serviços.** Duas abordagens:

   - *Direta e mais simples:* manter a assinatura `(base, …)` e escrever
     `carregarBaseParcial` / `gravarAlteracoes` que leem os documentos
     relevantes de uma demanda e escrevem o que mudou. Como cada serviço opera
     sobre uma demanda e seus satélites, o conjunto lido é pequeno.
   - *Mais idiomática:* trocar as coleções em memória de `BaseDados` por um
     objeto com os mesmos nomes cujos métodos usam `ctx.db`. O corpo dos
     serviços não muda.

4. **Tick.** `executarTick` é uma função pura sobre a base. No Convex vira um
   [cron job](https://docs.convex.dev/scheduling/cron-jobs) chamando uma
   `internalMutation`. A rota `src/app/api/tick/route.ts` mostra o contrato.

5. **Autenticação.** Trocar `src/server/auth.ts` por Convex Auth ou Clerk. É o
   único arquivo com lógica de sessão; `permissoes.ts` continua igual, porque
   trabalha por capacidade e não por identidade.

6. **Anexos.** Trocar o campo `conteudo` (data URL) por `storageId` apontando
   para o file storage do Convex — o schema já prevê os dois campos.

## O que NÃO precisa ser reescrito

- `src/domain/motorFluxo.ts` — decisão do próximo movimento
- `src/domain/motorSinais.ts` — as 13 regras de sinal
- `src/domain/motorAtencao.ts` — priorização e blocos de atenção
- `src/domain/motorPrioridade.ts` — cálculo de prioridade
- `src/domain/analiseHistorico.ts` — reincidência e métricas
- `src/server/servicos/*` — as invariantes do domínio
- `tests/motores.test.ts` — os testes das regras continuam válidos

Esses arquivos não importam nada de Next, do store nem de qualquer banco.
Verificável: `grep -rn "next/\|arquivoStore" src/domain/` não retorna nada.

## Sobre o adapter atual

`arquivoStore` grava um JSON de forma atômica (write + rename) e serializa as
transações numa fila em processo. É persistência real e suficiente para uso em
um único servidor Node (`npm run build && npm start`, uma VM, um container).

Em ambiente serverless com múltiplas instâncias — inclusive a Vercel — cada
instância teria seu próprio arquivo efêmero. **Para produção, migre o adapter
antes de implantar em serverless.** Nada além de `src/server/store/` muda.
