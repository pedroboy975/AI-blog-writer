# ai-blog-writer

Traduz opinião humana testada em artigo publicável. Não gera opinião.

O input é um **veredito** (`verdicts/*.yaml`) preenchido por você. O LLM expande e
formata. Ele nunca afirma nada que não esteja rastreado a uma `evidence` declarada.

## Uso

```bash
npm install
cp .env.example .env          # coloque sua ANTHROPIC_API_KEY

npm run ai-blog -- create verdicts/make-ou-n8n.yaml --links
npm run ai-blog -- lint posts/x.md --verdict verdicts/x.yaml --links
npm run ai-blog -- glossary add rate-limit "limite de pedidos por minuto que a ferramenta aceita"

npm test && npm run typecheck
```

`--links` faz HEAD em cada link externo. Custa uns segundos, deixe fora enquanto rascunha.

## Como funciona

```
verdict.yaml ──> verdictGate ──> planSections ──> writer (1 H2 por chamada)
                  (bloqueia)     (determinístico)      │
                                                       └─> lints por seção ─> reescrita dirigida (2x)
                                                                                    │
                                              runAllLints no artigo inteiro <───────┘
                                                       │
                                              relatório de qualidade
```

**O gate de veredito bloqueia** se: menos de 2 evidências, preço conferido há mais
de 30 dias, teste há mais de 180 dias, `oneLiner` vazio, `whoShouldnt` vazio, ou
`category: model` (esses alimentam a página `/qual-ia-usar`, não viram post).

**Os lints são determinísticos, sem LLM:**

| lint | o que reprova |
| :--- | :--- |
| `clicheLint` | 12 padrões banidos, excesso de travessão, regra de três, gerúndio |
| `readabilityLint` | Flesch PT-BR < 55, média > 22 palavras/frase, frase > 35 palavras, passiva > 12% |
| `glossaryLint` | termo técnico do `glossary/terms.yaml` sem explicação na 1ª ocorrência |
| `evidenceLint` | frase avaliativa sem rastro para uma `evidence` do veredito |
| `linkLint` | link externo fora do ar (403/429 vira aviso, não erro) |

Estilo é responsabilidade dos lints, não do prompt. O prompt do writer não contém
"seja opinativo" nem "seja envolvente".

## O que não está aqui

Cortado de propósito, do documento original. Adicione quando doer:

- **SQLite / resume / custo agregado** — o pipeline roda em ~2 min. Adicione quando um run começar a falhar no meio.
- **Publisher GitHub** — `posts/*.md` sai pronto; `git add` resolve. Adicione quando publicar mais de 4 posts/mês.
- **Enricher automático** — você confere o preço à mão e escreve em `priceChecked`. O gate de 30 dias já força isso.
- **Fila de screenshots** — escreva `[[PRINT: descrição]]` no texto; o relatório conta os pendentes.
- **Newsletter / roteiro / página viva** — uma chamada de LLM cada, a partir do post pronto.

## Escrevendo um veredito

Copie `verdicts/make-ou-n8n.yaml`. As regras que importam:

- `oneLiner` é **sua frase**, na sua voz. Nunca gerada por LLM.
- `evidence[].claim` precisa estar escrito nas palavras que você quer ver no artigo.
  O `evidenceLint` compara por sobreposição de tokens: claim vago = frase órfã reprovada.
- `proof: link` é o mais fácil de auditar. `experiencia` e `print` valem mais para o leitor.
- `whoShouldnt` não é opcional. Perder o leitor errado agora vale mais que perdê-lo depois.
