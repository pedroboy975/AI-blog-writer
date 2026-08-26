import Anthropic from '@anthropic-ai/sdk';
import type { SectionPlan, Verdict } from './schemas.ts';
import { cachedStep, saveRun, type RunState } from './state.ts';
import { clicheLint, evidenceLint, glossaryLint, loadGlossary, readabilityLint, type Finding, type GlossaryTerm } from './quality/lints.ts';

export const MODEL = process.env.WRITER_MODEL ?? 'claude-opus-5';
// USD por milhao de tokens. Confira em https://claude.com/pricing antes de faturar.
export const PRICE = { in: 5, out: 25 };

const SECTION_TOOL = {
  name: 'entregar_secao',
  description: 'Entrega uma secao pronta do artigo em Markdown.',
  input_schema: {
    type: 'object' as const,
    properties: {
      markdown: { type: 'string', description: 'A secao completa, comecando pelo H2 (## Titulo).' },
      glossedTerms: { type: 'array', items: { type: 'string' }, description: 'Termos tecnicos que esta secao explicou pela primeira vez.' },
    },
    required: ['markdown', 'glossedTerms'],
  },
};

const SYSTEM = `Voce escreve para um blog em portugues do Brasil sobre IA e automacao.

LEITOR: entusiasta de tecnologia que NAO trabalha com TI. Nunca rodou um comando no terminal. Clica em botoes. Quer aplicar hoje.

REGRA ABSOLUTA: voce so pode afirmar o que consta em <evidencias>. Voce nao tem opiniao propria e nao inventa numero, preco, versao ou comportamento de produto. Se faltar informacao para completar uma frase, escreva [[FALTA: descricao do que falta]] e siga em frente. Se a secao pedir uma tela, escreva [[PRINT: descricao da tela]].

COMO ESCREVER:
- Frase curta. Media abaixo de 20 palavras, nenhuma acima de 35.
- Paragrafo de no maximo 4 linhas.
- Voz ativa. Segunda pessoa ("voce"), nunca "nos".
- Todo termo tecnico ganha a explicacao junto, na primeira vez que aparece, entre parenteses ou na frase seguinte.
- Numero concreto sempre que a evidencia tiver um.
- Nada de introducao aquecendo o assunto. A primeira frase ja entrega informacao.

PROIBIDO: "no mundo atual", "mergulhar", "desvendar", "e crucial entender", "vamos explorar", "em suma", "nao e apenas X, e Y", "revoluciona a forma como", "vale ressaltar que", "potencializar", "alavancar". Nao use travessao (—) mais de uma vez a cada 150 palavras.

Escreva APENAS a secao pedida. Nao repita o que ja esta no rascunho.`;

function evidenceBlock(v: Verdict): string {
  return v.evidence.map((e) => `[${e.id}] (${e.proof}) ${e.claim}\n      fonte: ${e.ref}`).join('\n');
}

async function call(client: Anthropic, messages: Anthropic.MessageParam[], usage: { in: number; out: number }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        system: SYSTEM,
        tools: [SECTION_TOOL],
        tool_choice: { type: 'tool', name: SECTION_TOOL.name },
        messages,
      });
      usage.in += res.usage.input_tokens;
      usage.out += res.usage.output_tokens;
      const block = res.content.find((c) => c.type === 'tool_use');
      if (!block || block.type !== 'tool_use') throw new Error('modelo nao chamou a tool');
      const input = block.input as { markdown?: unknown; glossedTerms?: unknown };
      if (typeof input.markdown !== 'string') throw new Error('markdown ausente na resposta da tool');
      return {
        markdown: input.markdown,
        glossed: Array.isArray(input.glossedTerms) ? input.glossedTerms.filter((t): t is string => typeof t === 'string') : [],
      };
    } catch (err) {
      if (attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, 2 ** attempt * 1500));
    }
  }
  throw new Error('inalcancavel');
}

/** Lints que rodam por secao. linkLint fica para o fim, no artigo inteiro. */
function lintSection(md: string, v: Verdict, glossary: GlossaryTerm[]): Finding[] {
  return [...clicheLint(md), ...readabilityLint(md), ...glossaryLint(md, glossary), ...evidenceLint(md, v)].filter(
    (f) => f.severity === 'error'
  );
}

export type WriteResult = { markdown: string; costUsd: number; tokensIn: number; tokensOut: number; needsHuman: string[] };
type SectionResult = { markdown: string; glossed: string[]; failed: string[] };

/**
 * Escreve o artigo uma secao por vez, passando o rascunho acumulado inteiro.
 * Depois de cada secao roda os lints; falhou, reescreve com o trecho ofensor.
 * Duas tentativas, depois marca a secao como needs_human e segue.
 * Cada secao e um passo cacheado por hash do brief: rodar de novo nao repaga o que ja saiu.
 */
export async function writeArticle(v: Verdict, plan: SectionPlan[], run: RunState, glossary = loadGlossary()): Promise<WriteResult> {
  const client = new Anthropic();
  const usage = { in: 0, out: 0 };
  const needsHuman: string[] = [];
  const glossed = new Set<string>();
  let draft = '';

  for (const section of plan) {
    const brief = [
      `<veredito>`,
      `assunto: ${v.subject}`,
      `decisao: ${v.verdict}`,
      `frase do autor (use como esta, nunca reescreva): "${v.oneLiner}"`,
      `contexto do teste: ${v.testContext} (testado em ${v.testedOn})`,
      `preco verificado: ${v.priceChecked.value} (em ${v.priceChecked.at})`,
      `dealbreakers: ${v.dealbreakers.join(' | ') || 'nenhum declarado'}`,
      `nao serve para: ${v.whoShouldnt}`,
      `alternativas: ${v.alternatives.join(', ') || 'nenhuma declarada'}`,
      `</veredito>`,
      ``,
      `<evidencias>`,
      evidenceBlock(v),
      `</evidencias>`,
      ``,
      `<ja_explicados>${[...glossed].join(', ') || 'nada ainda'}</ja_explicados>`,
      `(Nao repita a explicacao desses termos.)`,
      ``,
      draft ? `<rascunho_ate_agora>\n${draft}\n</rascunho_ate_agora>` : '<rascunho_ate_agora>vazio, esta e a primeira secao</rascunho_ate_agora>',
      ``,
      `<secao_a_escrever>`,
      `H2: ${section.h2}`,
      `objetivo: ${section.objective}`,
      `tamanho alvo: ${section.wordBudget} palavras`,
      `elementos obrigatorios: ${section.requiredElements.join(', ')}`,
      `evidencias a usar: ${section.evidenceRefs.join(', ') || 'nenhuma especifica'}`,
      `</secao_a_escrever>`,
    ].join('\n');

    const write = async (): Promise<SectionResult> => {
      const messages: Anthropic.MessageParam[] = [{ role: 'user', content: brief }];
      for (let attempt = 0; ; attempt++) {
        const res = await call(client, messages, usage);
        const errors = lintSection(res.markdown, v, glossary);
        if (!errors.length || attempt === 2)
          return { markdown: res.markdown, glossed: res.glossed, failed: errors.map((e) => `${e.rule}: ${e.message}`) };
        messages.push(
          { role: 'assistant', content: `Secao entregue.` },
          {
            role: 'user',
            content:
              `A secao reprovou nos lints. Reescreva corrigindo exatamente isto e nada mais:\n\n` +
              errors.map((e) => `- [${e.rule}] ${e.message}${e.excerpt ? `\n  trecho: "${e.excerpt}"` : ''}`).join('\n'),
          }
        );
      }
    };

    const { value, cached } = await cachedStep(run, brief, write);
    value.glossed.forEach((t) => glossed.add(t));
    let accepted = value.markdown.trim();
    if (value.failed.length) {
      needsHuman.push(section.h2);
      accepted += `\n\n<!-- needs_human: ${value.failed.join(' ; ')} -->`;
    }
    draft += (draft ? '\n\n' : '') + accepted;
    console.log(`  ${cached ? 'cache' : 'ok   '} ${section.h2}`);
  }

  const costUsd = (usage.in / 1e6) * PRICE.in + (usage.out / 1e6) * PRICE.out;
  run.costUsd += costUsd;
  run.tokensIn += usage.in;
  run.tokensOut += usage.out;
  saveRun(run);

  return { markdown: draft, tokensIn: usage.in, tokensOut: usage.out, costUsd, needsHuman };
}
