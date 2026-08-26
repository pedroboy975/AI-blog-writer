import { describe, expect, it } from 'vitest';
import { hash } from '../src/state.ts';
import { pendingPrints, repoSlug } from '../src/publish.ts';
import { similar, stalePosts, suggestLinks, type PostRef } from '../src/site.ts';

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
