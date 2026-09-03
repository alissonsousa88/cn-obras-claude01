# Versão navegável do CN Obras

Uma página única, sem servidor, que executa o sistema real no navegador.

```bash
npm run artefato   # gera artefato/cn-obras.html
```

## Por que isso é possível

A camada de inteligência do CN Obras foi escrita sem I/O e sem dependência de
framework. Em todo `src/domain/` e `src/server/servicos/` existe **uma única**
importação específica do Node: `randomUUID`, usado apenas para gerar
identificadores.

Por isso os quatro motores, os serviços que aplicam as invariantes e o gerador
de dados de demonstração entram no bundle **sem nenhuma modificação**. Não há
reimplementação, não há simulação: é o mesmo código que roda no servidor Next.

Os componentes visuais também são reaproveitados — `primitivos.tsx`,
`CartaoAtencao.tsx` e `CartaoDemanda.tsx` vêm de `src/componentes/`, com
`next/link` trocado por um `<a>` de navegação por hash.

## O que é substituído

| Módulo | Substituto | Motivo |
|---|---|---|
| `node:crypto` | `shims/crypto.ts` | O navegador tem `crypto.randomUUID` |
| `src/server/senhas.ts` | `shims/senhas.ts` | Não há autenticação: a troca de perfil é local |
| `next/link` | `shims/link.tsx` | Navegação por hash, sem roteador de servidor |

## O que difere do produto

- **Sem servidor.** O estado vive na memória e no `localStorage` do navegador.
- **Sem autenticação.** Trocar de perfil é uma escolha na barra lateral.
- **Controle de tempo.** Os botões "+1d / +3d / +7d" adiantam o relógio e rodam
  `executarTick` — não existem no produto. Servem para ver o Motor de Sinais e
  as rotinas preventivas reagindo ao tempo sem esperar dias.

Tudo o mais — cálculo de prioridade, decisão do próximo movimento, suspensão e
retomada por impedimento, reconciliação de sinais, guardas de conclusão,
histórico append-only — é o comportamento real.

## Arquivos

```
app.tsx          As telas (usa os componentes reais da aplicação)
construir.mjs    Bundle com esbuild, trocando os módulos do Node
montar.mjs       Junta CSS + JS na casca da página
estilo.css       Reaproveita o design system de src/app/globals.css
casca.html       Estrutura da página
shims/           Substitutos de navegador
```
