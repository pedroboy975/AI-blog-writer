import Anthropic from '@anthropic-ai/sdk';
import { writeFileSync } from 'node:fs';
import type { Verdict } from './schemas.ts';
import { MODEL, PRICE } from './writer.ts';
import { cachedStep, saveRun, type RunState } from './state.ts';

/**
 * Um run, tres saidas. O post ja passou nos lints; estas duas derivam dele.
 * A restricao dura continua valendo: nada que nao esteja no post ou no veredito.
 */
const RULES = `Voce reescreve material ja publicado de um blog brasileiro sobre IA e automacao.

REGRA ABSOLUTA: nao invente nada. Todo numero, preco e afirmacao tem de estar no <post> ou no <veredito>. Nada novo.
LEITOR: entusiasta de tecnologia que nao trabalha com TI.
Frase curta, voz ativa, segunda pessoa. Sem "no mundo atual", "mergulhar", "desvendar", "vamos explorar", "em suma", "nao e apenas X, e Y".`;

const NEWSLETTER = `${RULES}

Escreva a versao newsletter: 300 a 400 palavras, primeira pessoa, mais direta e mais opinativa que o post.
Estrutura: assunto do e-mail (linha "Assunto: ..."), a conclusao logo na primeira frase, o numero que sustenta a conclusao, para quem nao serve, e uma linha final chamando para o post completo.
Entregue Markdown puro, sem frontmatter e sem comentario seu.`;

const ROTEIRO = `${RULES}

Escreva um roteiro de video de 60 segundos e cinco ganchos de abertura alternativos.
Roteiro: falado, primeira pessoa, marcando o tempo aproximado de cada bloco. Comeca pela conclusao, nunca por saudacao.
Ganchos: uma linha cada, cada um atacando um angulo diferente do assunto.
Entregue Markdown puro com dois H2: "## Roteiro (60s)" e "## Ganchos".`;

async function ask(client: Anthropic, system: string, user: string, usage: { in: number; out: number }): Promise<string> {
  const res = await client.messages.create({ model: MODEL, max_tokens: 2000, system, messages: [{ role: 'user', content: user }] });
  usage.in += res.usage.input_tokens;
  usage.out += res.usage.output_tokens;
  return res.content.map((c) => (c.type === 'text' ? c.text : '')).join('').trim();
}

export async function makeOutputs(v: Verdict, slug: string, post: string, run: RunState): Promise<string[]> {
  const client = new Anthropic();
  const usage = { in: 0, out: 0 };
  const context = `<veredito>\n${v.oneLiner}\nnao serve para: ${v.whoShouldnt}\n</veredito>\n\n<post>\n${post}\n</post>`;

  const jobs: Array<[string, string, string]> = [
    [`posts/${slug}.newsletter.md`, NEWSLETTER, 'newsletter'],
    [`posts/${slug}.roteiro.md`, ROTEIRO, 'roteiro'],
  ];

  const written: string[] = [];
  for (const [path, system, kind] of jobs) {
    const { value } = await cachedStep(run, { kind, slug, context }, () => ask(client, system, context, usage));
    writeFileSync(path, `${value}\n`, 'utf8');
    written.push(path);
  }

  run.costUsd += (usage.in / 1e6) * PRICE.in + (usage.out / 1e6) * PRICE.out;
  run.tokensIn += usage.in;
  run.tokensOut += usage.out;
  saveRun(run);
  return written;
}
