# CN Obras

Sistema de gestão operacional das demandas de infraestrutura da Comunidade das
Nações.

Não é um cadastro de chamados nem um Kanban. A premissa é que registrar a
demanda é a parte fácil — o difícil é não deixá-la parada, saber quem precisa
agir e verificar se o problema foi mesmo resolvido. O sistema existe para dizer
coisas como:

> "Estas três precisam da sua atenção."
> "Esta demanda não avança há quatro dias."
> "João precisa aprovar este orçamento para que o serviço continue."
> "A execução foi concluída, mas ainda falta validar se o problema foi resolvido."
> "Este problema já aconteceu três vezes neste local."

## Rodando

```bash
npm install
npm run dev
```

Abra http://localhost:3000. A base de demonstração é criada na primeira
execução.

Senha de todos os perfis: `cnobras2026`

| Perfil | E-mail | O que enxerga |
|---|---|---|
| Liderança | `joao@cnobras.app` | A operação inteira, aprovações e métricas |
| Equipe | `carlos@cnobras.app` | O que precisa executar, impedimentos, conclusões |
| Equipe | `marina@cnobras.app` | Idem, com outras demandas atribuídas |
| Solicitante | `priscila@cnobras.app` | Apenas as próprias solicitações |

Vale entrar com perfis diferentes: o Motor de Atenção monta um painel distinto
para cada um, porque a pergunta "o que merece atenção agora" depende de quem
pergunta.

```bash
npm run typecheck   # TypeScript
npm test            # regras de domínio (15 testes)
npm run test:e2e    # ciclo completo no navegador (servidor precisa estar rodando)
npm run seed        # recria os dados de demonstração
```

## Os quatro motores

Todo o comportamento inteligente do produto está em `src/domain/` — TypeScript
puro, sem dependência de framework, banco ou I/O.

**Motor de Fluxo** (`motorFluxo.ts`) — responde "qual é o próximo movimento
necessário para essa demanda avançar?". Decide a partir do movimento que acabou
de ser concluído e do que foi relatado. O estado da demanda é *derivado* do que
existe de fato (movimentos, impedimentos, aprovações), nunca escolhido em um
formulário.

**Motor de Sinais** (`motorSinais.ts`) — função pura que devolve os sinais que
*deveriam* existir agora, a partir dos dados reais: prazo vencido, prazo
próximo, demanda parada, sem próximo movimento, impedimento prolongado,
aprovação pendente, retorno necessário, recorrência próxima, reincidência e
mais. Um reconciliador (`servicos/sinais.ts`) abre os novos e resolve os que
deixaram de valer, de modo que sinal resolvido nunca fica ativo.

**Motor de Atenção** (`motorAtencao.ts`) — camada acima dos sinais. Pondera por
criticidade, atraso acumulado, prioridade da demanda e proximidade com o
usuário, e agrupa nos blocos que correspondem à decisão que a pessoa precisa
tomar: precisa de você agora / próximas 48h / aguardando terceiros / operação.

**Motor de Prioridade** (`motorPrioridade.ts`) — prioridade é calculada, não
digitada. Entram segurança, risco, comprometimento do espaço, público afetado,
evento próximo, tempo de espera e reincidência. O cálculo se explica em
linguagem comum na tela. A liderança pode sobrepor, mas a justificativa é
obrigatória e fica no histórico.

## Regras que o sistema não deixa quebrar

1. Demanda ativa nunca fica sem direção — sem próximo passo, vira sinal crítico.
2. Abrir demanda cria automaticamente a triagem, com prazo de 24 horas.
3. Concluir um movimento sempre provoca a análise do próximo.
4. Impedimento exige responsável pelo desbloqueio e data de revisão.
5. Impedimento ativo suspende a execução; resolvê-lo retoma os passos suspensos,
   com o prazo compensado pelo tempo de bloqueio.
6. Concluir exige resultado registrado — o que foi feito, o resultado obtido,
   por quem e quando.
7. Execução concluída não conclui a demanda: exige validação de que o problema
   acabou. Se a validação reprova, a demanda volta ao diagnóstico.
8. Toda mudança relevante gera evento. O histórico é append-only — não existe
   função de remoção em lugar nenhum do sistema.
9. Concluir uma ocorrência recorrente programa a próxima.
10. Sinal resolvido deixa de aparecer como ativo.
11. Ajuste manual de prioridade exige justificativa e vira histórico.
12. A interface sempre diz quem precisa agir — inclusive quando a resposta é
    "ninguém", que aparece em vermelho.

Cada uma tem teste em `tests/motores.test.ts`.

## Estrutura

```
src/domain/      Regras e motores. TypeScript puro, zero I/O.
src/server/
  store/         Port ObrasStore + adapter em arquivo + dados de demonstração
  servicos/      Aplicam as invariantes em transações auditáveis
  acoes.ts       Server Actions — só orquestram, não decidem
  consultas.ts   Leitura para as telas, com os motores já aplicados
src/app/         Next.js App Router
src/componentes/ Design system e componentes de tela
convex/          Schema Convex (documentação do modelo)
docs/            Guia de migração para Convex
```

## Dados de demonstração

O seed não escreve sinais à mão. Ele roda os **serviços reais** numa linha do
tempo retroativa: cada demanda foi de fato aberta, triada, executada, bloqueada
ou aprovada pelas mesmas funções que a interface usa. Os sinais que aparecem no
painel são consequência genuína desse histórico.

Para reiniciar durante uma apresentação: `POST /api/demonstracao/reiniciar`
(desabilitado em produção, salvo `CN_OBRAS_PERMITIR_RESET=1`).

## O tick operacional

O tempo passa mesmo sem ninguém abrir a tela. `POST`/`GET /api/tick` abre
ocorrências de recorrências vencidas, recalcula prioridades (espera e
reincidência mudam sozinhas) e reconcilia os sinais. Roda também nas leituras
das páginas, com intervalo mínimo de 1 minuto. O `vercel.json` já agenda o cron
horário.

## Stack e a decisão sobre o Convex

Next.js 16 (App Router, Server Components e Server Actions), React 19,
TypeScript estrito, Tailwind CSS v4.

O documento de produto pede Convex no backend. O Convex exige autenticação
interativa em uma conta para provisionar o deployment, o que não era possível no
ambiente onde este projeto foi construído. Em vez de entregar uma aplicação que
não roda, a persistência ficou atrás de um port (`ObrasStore`) com adapter em
arquivo, e o modelo Convex está escrito em `convex/schema.ts`.

A consequência prática é que **nenhuma regra de negócio muda na migração** — os
motores e serviços não importam nada de Next nem do store. `docs/PORTAR-PARA-CONVEX.md`
traz o passo a passo.

Uma ressalva honesta: o adapter em arquivo é persistência real e adequada para
um servidor Node único, mas **não serve para serverless com múltiplas
instâncias** — inclusive a Vercel. Migre o adapter antes de implantar lá.

## Variáveis de ambiente

| Variável | Uso |
|---|---|
| `CN_OBRAS_SEGREDO` | Assinatura do cookie de sessão. **Obrigatória em produção**, mínimo 16 caracteres. |
| `CN_OBRAS_DB` | Caminho do arquivo da base. Padrão: `data/cn-obras.json`. |
| `CN_OBRAS_TICK_TOKEN` | Se definida, `/api/tick` passa a exigir `Authorization: Bearer <token>`. |
| `CN_OBRAS_PERMITIR_RESET` | `1` libera o reinício dos dados de demonstração em produção. |
