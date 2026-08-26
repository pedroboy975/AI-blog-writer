# ai-blog-writer

Traduz opinião humana testada em artigo publicável. Não gera opinião.

O input é um **veredito** (`verdicts/*.yaml`) preenchido por você. O LLM expande e
formata. Ele nunca afirma nada que não esteja rastreado a uma `evidence` declarada.

## Uso

```bash
npm install
cp .env.example .env          # coloque sua ANTHROPIC_API_KEY

npm run ai-blog -- create verdicts/make-ou-n8n.yaml --links --outputs
npm run ai-blog -- lint posts/x.md --verdict verdicts/x.yaml --links
npm run ai-blog -- publish make-ou-n8n-para-automatizar-sem-programar --verdict verdicts/make-ou-n8n.yaml
npm run ai-blog -- outputs <slug> --verdict verdicts/x.yaml
npm run ai-blog -- update     # posts vencidos (verifiedAt + staleAfterDays)
npm run ai-blog -- cost       # custo por post e agregado
npm run ai-blog -- site       # regenera index / qual-ia-usar / glossario
npm run ai-blog -- glossary add rate-limit "limite de pedidos por minuto que a ferramenta aceita"

npm test && npm run typecheck
```

`--links` faz HEAD em cada link externo (resultado fica em cache por 7 dias).
`--outputs` gera newsletter e roteiro junto com o post.

## Como funciona

```
verdict.yaml ──> verdictGate ──> planSections ──> writer (1 H2 por chamada)
                  (bloqueia)     (determinístico)      │
                                                       └─> lints por seção ─> reescrita dirigida (2x)
                                                                                    │
                                              runAllLints no artigo inteiro <───────┘
                                                       │
                                    relatório ──> fila de prints ──> publish (branch + PR)
                                                                          │
                                                        index.md · qual-ia-usar.md · glossario.md
```

Cada seção é um passo cacheado por hash do brief em `runs/<slug>.json`. Rodar
`create` de novo depois de um crash ou rate limit não repaga o que já saiu.

**O gate de veredito bloqueia** se: menos de 2 evidências, preço conferido há mais
de 30 dias, teste há mais de 180 dias, `oneLiner` vazio, `whoShouldnt` vazio, ou
`category: model` (esses alimentam a página `/qual-ia-usar`, não viram post).

**`publish` bloqueia** se qualquer lint reprovar ou se sobrar um `[[PRINT: ...]]`
sem imagem anexada. Sem exceção — é o único ponto do pipeline onde o humano é
insubstituível.

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

## O site (GitHub Pages)

O próprio repositório é o site. GitHub Pages roda Jekyll sozinho: todo `.md` com
frontmatter vira HTML, sem build local, sem gerador de estático.

Para ligar, uma vez: **Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)`**.

Três páginas são geradas do disco por `ai-blog site`, nunca por LLM:

| página | fonte |
| :--- | :--- |
| `index.md` | frontmatter de `posts/*.md`, mais recente primeiro, com aviso de revisão vencida |
| `qual-ia-usar.md` | vereditos `category: model` com `tasks` preenchido — uma linha por tarefa |
| `glossario.md` | `glossary/terms.yaml` |

O histórico de mudanças da página viva sai de `verdicts/qual-ia-usar-changelog.md`,
escrito à mão ("out/2026 — troquei a recomendação de transcrição. Motivo: …").

## O estúdio (`/estudio.html`)

Formulário para montar o veredito sem escrever YAML à mão, com conferência ao vivo
das regras que reprovam na hora de gerar: título de 40 a 65 caracteres, descrição de
120 a 160, mínimo de 2 referências, preço conferido há menos de 30 dias.

**O Pages não tem área restrita.** Ele serve arquivo estático, público, para qualquer
um. Senha em JavaScript aparece no código-fonte. Então a divisão é:

| onde | o quê | quem pode |
| :--- | :--- | :--- |
| `/estudio.html` | monta e valida o YAML, no navegador | qualquer um — não há segredo na página |
| Actions `Novo artigo` | escreve o artigo com a chave do cofre | só com permissão de escrita no repositório |
| merge do PR | publica na página principal | você |

O formulário não chama a API: ele produz texto que você cola no Actions.

O workflow escreve o artigo, roda os lints com checagem de link, regenera as três
páginas e abre um PR com o relatório no corpo. Nada vai ao ar antes do merge.

### Autenticação sem chave (WIF)

O workflow **não usa `ANTHROPIC_API_KEY`**. Ele pede um JWT ao emissor OIDC do próprio
GitHub e troca por um token Anthropic de vida curta. Não existe `sk-ant-…` guardado em
lugar nenhum para vazar, e não há nada para rotacionar.

Configurar, uma vez, no [Console da Claude](https://platform.claude.com/settings/workload-identity-federation):
**Settings → Workload identity → Connect workload → GitHub Actions**. O assistente cria
o emissor, a conta de serviço e a regra de federação. Restrinja a regra ao mínimo:

```
subject_prefix: repo:pedroboy975@261669390/AI-blog-writer@1347531016:ref:refs/heads/main
audience:       https://api.anthropic.com
claims:         { repository_owner: pedroboy975, ref: refs/heads/main,
                  event_name: workflow_dispatch }
```

Os `@` com números **não são opcionais aqui**. Desde 15/07/2026 o GitHub emite o
*subject imutável*, que embute o ID da conta e o do repositório; repositórios criados
depois dessa data já nascem assim. O formato antigo (`repo:owner/repo:ref:…`) que
aparece na maioria dos tutoriais não casa, e a recusa vem como `match_subject_prefix`
no [histórico de autenticação](https://platform.claude.com/settings/workload-identity-federation?tab=history).
Os IDs saem dos próprios claims do token: `repository_owner_id` e `repository_id`.

`event_name: workflow_dispatch` também não é opcional: o assistente pré-preenche `push`,
e o disparo do estúdio é manual. Com `push` ali, nenhuma execução casa nunca.

Um `subject_prefix` frouxo como `repo:pedroboy975@261669390/*` casa com **todo**
repositório da conta e, sem restrição de `ref`, também com runs de pull request vindos
de fork — qualquer um que abra um PR conseguiria um token.

Depois, em **Settings → Secrets and variables → Actions → Variables** deste repositório:

| variável | valor |
| :--- | :--- |
| `ANTHROPIC_FEDERATION_RULE_ID` | `fdrl_…` |
| `ANTHROPIC_ORGANIZATION_ID` | UUID da organização |
| `ANTHROPIC_SERVICE_ACCOUNT_ID` | `svac_…` |
| `ANTHROPIC_WORKSPACE_ID` | `wrkspc_…` (só se a regra cobrir mais de um workspace) |

São *Variables*, não *Secrets*: sozinhos não autenticam nada, porque a prova é o JWT
assinado pelo GitHub.

Duas armadilhas que o workflow checa antes de gastar crédito:

- **`ANTHROPIC_API_KEY` tem precedência sobre federação no SDK.** Uma chave esquecida no
  ambiente vence calada e a federação nunca é exercitada. O job falha se achar uma.
- **O JWT do GitHub vale ~5 minutos** e um artigo de 6 seções passa disso. Um laço em
  segundo plano mantém o arquivo do token fresco; o SDK relê a cada renovação.

Local continua com `ANTHROPIC_API_KEY` no `.env` — WIF precisa de um provedor de
identidade, e a sua máquina não é um.

`ai-blog create --size curto|medio|longo` escala o orçamento de palavras de cada
seção; o número de seções não muda, porque isso é o formato do artigo.

## Fases

| fase | onde | como foi feito |
| :--- | :--- | :--- |
| 1 Schemas + gate | `src/schemas.ts` | Zod em toda fronteira |
| 2 Lints | `src/quality/` | zero LLM, 24 testes |
| 3 Strategist | `src/outline.ts` | determinístico, formato sai da `category` |
| 4 Writer | `src/writer.ts` | 1 H2 por chamada, tool use, reescrita dirigida |
| 5 Estado, resume, custo | `src/state.ts` | **JSON por run em vez de SQLite** |
| 6 Fila de prints | `src/publish.ts` | gate bloqueante; **sem Playwright** |
| 7 Publisher | `src/publish.ts` | **git commita atômico de graça**, sem Git Data API |
| 8 Multi-saída | `src/outputs.ts` | newsletter + roteiro; **sem repositório de templates** |
| 9 Página viva, update, canibalização | `src/site.ts` | **overlap de tokens em vez de embedding** |

## O que não está aqui

Cortado de propósito. Adicione quando doer:

- **Enricher automático (fase 3)** — você confere o preço à mão e escreve em `priceChecked`. O gate de 30 dias já força isso.
- **SQLite** — JSON por run dá resume, cache e custo com zero dependência. Troque por `node:sqlite` se precisar de query ou passar de uns mil runs.
- **Playwright** — print de tela é você que tira. Automatizar screenshot de página pública só se a fila encher toda semana.
- **Git Data API** — `git` já commita post + prints + páginas num commit só. Só precisa da API se publicar de um servidor sem git.
- **Embeddings para canibalização** — sobreposição de tokens não entende sinônimo, mas não precisa de API nem banco vetorial. Troque quando o acervo passar de ~100 peças.
- **Repositório de templates (4ª saída da fase 8)** — não existe template para distribuir ainda.
- **`update` que reescreve sozinho** — ele lista o que venceu e manda você reconferir. Diff automático depende do enricher.

## Escrevendo um veredito

Copie `verdicts/make-ou-n8n.yaml`. As regras que importam:

- `oneLiner` é **sua frase**, na sua voz. Nunca gerada por LLM.
- `evidence[].claim` precisa estar escrito nas palavras que você quer ver no artigo.
  O `evidenceLint` compara por sobreposição de tokens: claim vago = frase órfã reprovada.
- `proof: link` é o mais fácil de auditar. `experiencia` e `print` valem mais para o leitor.
- `whoShouldnt` não é opcional. Perder o leitor errado agora vale mais que perdê-lo depois.
- `category: model` não vira post. Preencha `tasks: [resumir PDF longo, ...]` e ele entra na página `/qual-ia-usar`.
