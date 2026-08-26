/** Utilitarios de texto PT-BR compartilhados pelos lints. Zero LLM. */

const STOPWORDS = new Set(
  'para com que uma como mais nao dos das pelo pela quando onde isso esse essa este esta pelos pelas seu sua seus suas mas por ate sem sobre entre depois antes muito pouco todo toda todos todas ser estar tem tenho voce ele ela eles elas'.split(' ')
);

export const deaccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Remove frontmatter, blocos de codigo, tabelas e titulos: nao sao prosa. */
export function prose(markdown: string): string {
  return markdown
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]+`/g, '')
    .split('\n')
    .filter((l) => !/^\s*(\||#{1,6}\s)/.test(l))
    .join('\n');
}

export const words = (s: string): string[] => s.match(/[\p{L}\p{N}'-]+/gu) ?? [];

export function sentences(s: string): string[] {
  return s
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((x) => x.replace(/^[\s*>\-\d.)]+/, '').trim())
    .filter((x) => words(x).length > 2);
}

export function paragraphs(s: string): string[] {
  return s.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
}

/** Tokens significativos para comparar duas frases. */
export function tokens(s: string): Set<string> {
  return new Set(
    words(deaccent(s.toLowerCase()))
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
      .map((w) => w.replace(/(s|es|ao|oes|mente)$/, ''))
  );
}

/** Sobreposicao de tokens normalizada pelo menor conjunto (0..1). */
export function overlap(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let hits = 0;
  for (const t of ta) if (tb.has(t)) hits++;
  return hits / Math.min(ta.size, tb.size);
}

/**
 * Silabas PT-BR por grupos de vogais: vogais adjacentes contam como uma silaba.
 * ponytail: heuristica. Funde ditongos certo, erra em hiatos (sa-u-de = 2, real 3).
 * Serve para uma media sobre centenas de palavras. Trocar por silabificador real
 * so se o Flesch comecar a divergir da leitura humana.
 */
export function syllables(word: string): number {
  const groups = deaccent(word.toLowerCase()).match(/[aeiouy]+/g);
  return Math.max(1, groups?.length ?? 1);
}
