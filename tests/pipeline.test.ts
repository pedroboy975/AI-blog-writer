import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { hash } from '../src/state.ts';
import { pendingPrints, repoSlug } from '../src/publish.ts';
import { similar, stalePosts, suggestLinks, type PostRef } from '../src/site.ts';
import { planSections, type Size } from '../src/outline.ts';
import { SectionPlanSchema, VerdictSchema, verdictGate, type Verdict } from '../src/schemas.ts';
import { parse } from 'yaml';

const post = (over: Partial<PostRef>): PostRef => ({
  slug: 'make-ou-n8n', title: 'Make ou n8n - qual escolher para automatizar', description: '',
  date: '2026-01-01', tags: ['make', 'n8n'], verifiedAt: '2026-01-01', staleAfterDays: 120,
  path: 'posts/make-ou-n8n.md', verdict: 'use_com_ressalva', ...over,
});

const NOW = Date.parse('2026-08-26');

describe('state', () => {
  it('mesmo input, mesmo hash (cache de passo so acerta se o brief nao mudou)', () => {
    expect(hash({ a: 1, b: 'x' })).toBe(hash({ a: 1, b: 'x' }));
    expect(hash({ a: 1 })).not.toBe(hash({ a: 2 }));
  });
});

describe('fila de screenshots', () => {
  it('extrai cada print pedido', () => {
    expect(pendingPrints('texto [[PRINT: tela de precos]] mais texto [[PRINT: painel de consumo]]')).toEqual([
      'tela de precos',
      'painel de consumo',
    ]);
  });

  it('post sem marcador nao bloqueia', () => {
    expect(pendingPrints('artigo limpo, nenhum print pedido.')).toHaveLength(0);
  });
});

describe('publisher', () => {
  it('tira owner/repo de https e de ssh', () => {
    expect(repoSlug('https://github.com/pedroboy975/AI-blog-writer.git')).toBe('pedroboy975/AI-blog-writer');
    expect(repoSlug('git@github.com:pedroboy975/AI-blog-writer.git')).toBe('pedroboy975/AI-blog-writer');
    expect(repoSlug('https://gitlab.com/x/y.git')).toBeNull();
  });
});

describe('update', () => {
  it('vencido quando verifiedAt + staleAfterDays passou', () => {
    const stale = stalePosts([post({ verifiedAt: '2026-01-01' })], NOW);
    expect(stale).toHaveLength(1);
    expect(stale[0]!.daysOver).toBe(117);
  });

  it('post conferido ontem nao entra na lista', () => {
    expect(stalePosts([post({ verifiedAt: '2026-08-25' })], NOW)).toHaveLength(0);
  });
});

describe('canibalizacao', () => {
  it('acusa assunto ja coberto', () => {
    expect(similar('Make ou n8n para automatizar', [post({})]).length).toBe(1);
  });

  it('deixa passar assunto novo', () => {
    expect(similar('Whisper para transcrever reuniao', [post({})])).toHaveLength(0);
  });
});

describe('links internos', () => {
  it('sugere o post relacionado e nunca o proprio', () => {
    const refs = [post({}), post({ slug: 'zapier-vale-a-pena', title: 'Zapier vale a pena em 2026', tags: ['zapier'] })];
    const out = suggestLinks('Comparei Make e n8n para automatizar e-mail sem programar.', refs, 'zapier-vale-a-pena');
    expect(out.map((x) => x.slug)).toEqual(['make-ou-n8n']);
  });
});

describe('tamanho do artigo', () => {
  const v = (category: Verdict['category']): Verdict =>
    ({ category, evidence: [{ id: 'e1', claim: 'x'.repeat(10), proof: 'link', ref: 'https://a.b' }] }) as Verdict;

  it('escala o orcamento sem mudar o numero de secoes', () => {
    const secoes = (s: Size) => planSections(v('tool'), s);
    const soma = (s: Size) => secoes(s).reduce((t, p) => t + p.wordBudget, 0);

    expect(secoes('curto')).toHaveLength(secoes('longo').length);
    expect(soma('curto')).toBeLessThan(soma('medio'));
    expect(soma('medio')).toBeLessThan(soma('longo'));
  });

  it('nunca estoura os limites 120..600 que o SectionPlanSchema aceita', () => {
    for (const cat of ['tool', 'workflow', 'tactic'] as const)
      for (const size of ['curto', 'medio', 'longo'] as const)
        for (const s of planSections(v(cat), size))
          expect(SectionPlanSchema.safeParse(s).success).toBe(true);
  });
});

/**
 * A costura entre o formulario de /estudio.html e o motor. O formulario monta
 * YAML no navegador, longe do Zod; se as duas pontas divergirem, o erro aparece
 * num run do Actions que ja gastou credito da API. Aqui aparece de graca.
 *
 * A extracao le o texto da pagina em vez de importar: e JS de navegador, nao
 * modulo. Se eu reindentar aquelas funcoes, este teste falha dizendo isso.
 */
describe('formulario do estudio', () => {
  const html = readFileSync('estudio.html', 'utf8');

  const grab = (name: string) => {
    const start = html.indexOf('\n  function ' + name + '(');
    const end = html.indexOf('\n  }\n', start);
    if (start < 0 || end < 0) throw new Error(`nao achei a funcao ${name} em estudio.html`);
    return html.slice(start, end + 5);
  };
  const qStart = html.indexOf('  var q = function');
  const yaml = new Function(
    html.slice(qStart, html.indexOf('\n', qStart)) + grab('list') + grab('yaml') + '\n return yaml;'
  )() as (v: unknown) => string;

  const hoje = new Date().toISOString().slice(0, 10);
  const preenchido = {
    subject: 'Whisper para transcrever reuniao longa',
    category: 'tool', verdict: 'use', keyword: 'Whisper',
    oneLiner: 'Use o Whisper local quando a reuniao passa de uma hora e o custo por minuto comeca a pesar.',
    title: 'Whisper para transcrever reuniao longa sem pagar minuto',
    description: 'Rodar o modelo na sua maquina troca custo por minuto por tempo de processamento. Vale a partir de uma hora de audio, e abaixo disso nao compensa.',
    tags: ['audio', 'transcricao', 'whisper'],
    testedOn: hoje, priceAt: hoje,
    testContext: 'Transcrevi seis reunioes de 40 a 90 minutos comparando a API paga e o modelo local.',
    priceValue: 'API US$ 0,006 por minuto; local gratuito',
    whoShouldnt: 'Quem transcreve audio curto e esporadico nao ganha nada instalando o modelo.',
    dealbreakers: [] as string[],
    alternatives: ['A API paga para quem nao quer instalar nada'],
    evidence: [
      { id: 'e1', claim: 'A API cobra por minuto de audio enviado', proof: 'link', ref: 'https://openai.com/pricing' },
      { id: 'e2', claim: 'O modelo local roda sem custo por minuto', proof: 'medicao', ref: 'medicao propria, 6 reunioes' },
    ],
  };

  it('produz YAML que passa no schema e libera o gate', () => {
    const parsed = VerdictSchema.safeParse(parse(yaml(preenchido)));
    expect(parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)).toEqual([]);
    expect(verdictGate(parsed.data!)).toEqual([]);
  });

  it('emite [] para lista vazia, nao chave nua (que o YAML le como null)', () => {
    expect(yaml(preenchido)).toContain('dealbreakers: []');
    const v = VerdictSchema.parse(parse(yaml(preenchido)));
    expect(v.dealbreakers).toEqual([]);
  });

  it('escapa aspas e quebra de linha sem quebrar o YAML', () => {
    const sujo = { ...preenchido, priceValue: 'ele disse "9 dolares"\nna pagina de preco' };
    expect(VerdictSchema.parse(parse(yaml(sujo))).priceChecked.value).toBe(
      'ele disse "9 dolares"\nna pagina de preco'
    );
  });
});

