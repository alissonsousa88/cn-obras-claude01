# Identidade visual do CN Obras

Derivada pelo método da skill `design-de-interface`, não escolhida por gosto.
Este documento existe para que qualquer mudança futura possa ser conferida
contra a derivação — se uma decisão nova não puder ser justificada aqui, ela
não entra.

## Passo 1 — A alma do projeto

| | |
|---|---|
| **Cliente** | Ministério de obras: manutenção predial de um templo em uso constante |
| **Uso** | Liderança decide no desktop · equipe em campo, no celular, entre tarefas, sob luz variável · solicitantes leigos e ocasionais |
| **Sensação** | Zelo confiável — cuidar da casa. Não é urgência de call center nem calor devocional |

**A armadilha que evitamos:** a igreja é o *ambiente*; o *produto* é manutenção
de campo. Derivar uma serifada quente "porque é igreja" seria repetir o erro
documentado no caso 065 Gelo — puxar do ambiente em vez do produto. O produto
vence.

## Passo 2 — A regra que governa a paleta

> **Cor quente na tela significa urgência. Nada mais.**

Toda a derivação sai daí:

| Camada | Decisão | Por quê |
|---|---|---|
| **Neutro** (`tinta`, 11 passos) | Ardósia com viés azul — não é cinza puro | É 90% dos pixels; a temperatura fria serve ao contexto técnico |
| **Acento** (`obra`, 10 passos) | Azul-petróleo `#2f677b`, com hover/ativo/sutil | Conduíte galvanizado, água, painel de instrumento. Fora da faixa quente, para não disputar com a gravidade |
| **Gravidade** | Rampa quente única: âmbar → laranja → vermelho | Intensidade dentro de uma família, não três cores diferentes |
| **Informativo** | Neutro (`tinta-300`) | "Não precisa agir agora" não deve competir por atenção |
| **Desfecho** | Verde só para concluída | É resultado, não fase |
| **Superfícies** | página `tinta-50` → cartão branco → interno `tinta-50` → inverso `tinta-900` | Elevação por passo de superfície e borda; nunca por sombra colorida |

O acento anterior era terracota `#d96f2b` — que fica **entre o âmbar e o
laranja**, ou seja, a única cor de marca era indistinguível de um nível de
gravidade. Num produto cuja promessa é "você percebe a urgência num relance",
isso era um defeito de derivação.

### Contagem de matizes

Antes: 9 (`red · emerald · amber · blue · orange · violet · indigo · teal · rose`).
Depois: 4 — neutro, acento, rampa quente, verde de desfecho.

Fase da demanda perdeu a matiz própria: fase é contexto, não gravidade.

## Tipografia

- **IBM Plex Sans** — desenhada para interface técnica densa, legível em corpo
  pequeno, que é o caso no celular em campo.
- **IBM Plex Mono** — carrega o que é dado e alinha em coluna: códigos de
  demanda, prazos, valores e scores. Classe utilitária `.numerico`.

Duas famílias, uma superfamília.

## Ícones

**Lucide**, família única em toda a interface. Antes eram glifos unicode
avulsos (`◈ ◉ ☑ ▤ ↻ ◔`) — desenhos de origens diferentes, com pesos e
alinhamentos que não conversavam.

## Recusas aplicadas

- Sem gradiente decorativo
- Sem glow, sombra colorida ou glassmorphism — elevação por borda e superfície
- Sem emoji nem glifo avulso como ícone
- Sem roxo-em-azul automático
- Texto e dado alinhados à esquerda
- Contraste AA no mínimo (o acento `#2f677b` dá 6,2:1 sobre branco)

## Estados definidos (Passo 4)

| Estado | Onde |
|---|---|
| Vazio | Componente `Vazio`, em toda tela com lista |
| Carregando | `src/app/(app)/loading.tsx` — esqueleto com a forma do painel |
| Com dados | O normal |
| Erro | `src/app/(app)/error.tsx` — o que houve e como sair |
| Não encontrado | `src/app/(app)/not-found.tsx` — cobre demanda cancelada e falta de permissão |

Não há estado de "dado chegando de outro usuário": o sistema não é tempo real.

## Densidade (Passo 5)

Público misto. A equipe usa em campo, então o piso vale para todos: **alvos de
toque ≥ 44px** em ponteiro grosso, garantido por regra global em `globals.css`
e verificado no teste de ponta a ponta (`tests/fluxo.e2e.mjs` mede os alvos
reais em 390px).
