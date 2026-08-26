import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';
import type { Verdict } from '../schemas.ts';
import { deaccent, overlap, paragraphs, prose, sentences, syllables, words } from './text.ts';
import { cachedLink, rememberLink } from '../state.ts';

export type Finding = { rule: string; severity: 'error' | 'warn'; message: string; excerpt?: string };

// ---------------------------------------------------------------- clichê

export const BANNED_PATTERNS: Array<[RegExp, string]> = [
  [/no mundo (acelerado|dinamico|atual|moderno)/i, 'abertura cliche'],
  [/em (suma|conclusao)/i, 'transicao cliche'],
  [/mergulh(e|ar|amos|ando)/i, 'cliche de IA'],
  [/desvenda(r|ndo|mos)/i, 'cliche de IA'],
  [/e crucial (entender|notar|lembrar)/i, 'filler'],
  [/vamos explorar/i, 'filler'],
  [/nesta era (digital|de)/i, 'abertura cliche'],
  [/nao e apenas .{3,40}, e /i, 'paralelismo negativo'],
  [/(seja|revoluciona|transform(a|ando)) (a forma|a maneira) como/i, 'promocional'],
  [/(panorama|cenario) em constante evolucao/i, 'vago'],
  [/vale (a pena )?(ressaltar|destacar) que/i, 'filler'],
  [/potencializ(a|ar|ando)|alavanc(a|ar|ando)/i, 'corporates'],
];

export function clicheLint(markdown: string): Finding[] {
  const text = prose(markdown);
  const flat = deaccent(text);
  const out: Finding[] = [];

  for (const [re, why] of BANNED_PATTERNS) {
    const m = flat.match(re);
    if (m) out.push({ rule: 'cliche', severity: 'error', message: why, excerpt: m[0] });
  }

  const w = words(text).length;
  const dashes = (text.match(/—/g) ?? []).length;
  if (w > 0 && dashes / w > 1 / 150)
    out.push({ rule: 'cliche', severity: 'warn', message: `travessoes demais: ${dashes} em ${w} palavras (max 1 a cada 150)` });

  // Regra de tres: tres ou mais listas seguidas de exatamente 3 itens.
  const listSizes = markdown
    .split(/\n{2,}/)
    .map((b) => (b.match(/^\s*[-*]\s/gm) ?? []).length)
    .filter((n) => n > 0);
  for (let i = 0; i + 2 < listSizes.length; i++)
    if (listSizes.slice(i, i + 3).every((n) => n === 3)) {
      out.push({ rule: 'cliche', severity: 'warn', message: 'tres listas de 3 itens em sequencia (regra de tres)' });
      break;
    }

  const gerunds = paragraphs(text).filter((p) => /^[A-ZÀ-Ú][a-zà-ú]+ndo\b/.test(p)).length;
  if (gerunds > 2) out.push({ rule: 'cliche', severity: 'warn', message: `${gerunds} paragrafos comecam com gerundio (max 2)` });

  const besides = (deaccent(text).match(/(?:^|\. )(Alem disso|Ademais)/g) ?? []).length;
  if (besides > 2) out.push({ rule: 'cliche', severity: 'warn', message: `"Alem disso"/"Ademais" ${besides}x (max 2)` });

  return out;
}

// ---------------------------------------------------------- legibilidade

export const READABILITY = {
  maxAvgWordsPerSentence: 22,
  hardFailSentenceWords: 35,
  maxParagraphLines: 4,
  fleschPtBrMin: 55,
  maxPassiveRatio: 0.12,
};

const PASSIVE = /\b(e|foi|foram|sao|era|eram|sera|serao|sendo|sido|esta|estao)\s+\w+(ad|id)(o|a|os|as)\b/gi;

/**
 * Flesch adaptado ao PT-BR (Martins et al., 1996):
 *   248.835 - 1.015 * (palavras/frases) - 84.6 * (silabas/palavras)
 * Faixas: 75-100 muito facil, 50-75 facil, 25-50 dificil, 0-25 muito dificil.
 */
export function fleschPtBr(text: string): number {
  const s = sentences(text);
  const w = words(text);
  if (!s.length || !w.length) return 100;
  const syl = w.reduce((acc, x) => acc + syllables(x), 0);
  return 248.835 - 1.015 * (w.length / s.length) - 84.6 * (syl / w.length);
}

export function readabilityLint(markdown: string): Finding[] {
  const text = prose(markdown);
  const s = sentences(text);
  const w = words(text);
  const out: Finding[] = [];
  if (!s.length) return out;

  const avg = w.length / s.length;
  if (avg > READABILITY.maxAvgWordsPerSentence)
    out.push({
      rule: 'readability',
      severity: 'error',
      message: `media de ${avg.toFixed(1)} palavras/frase (max ${READABILITY.maxAvgWordsPerSentence})`,
    });

  for (const sent of s) {
    const n = words(sent).length;
    if (n > READABILITY.hardFailSentenceWords)
      out.push({
        rule: 'readability',
        severity: 'error',
        message: `frase com ${n} palavras (max ${READABILITY.hardFailSentenceWords})`,
        excerpt: sent.slice(0, 90),
      });
  }

  const flesch = fleschPtBr(text);
  if (flesch < READABILITY.fleschPtBrMin)
    out.push({ rule: 'readability', severity: 'error', message: `Flesch PT-BR ${flesch.toFixed(0)} (min ${READABILITY.fleschPtBrMin})` });

  for (const p of paragraphs(text)) {
    if (/^\s*[-*|>\d]/.test(p)) continue;
    const lines = Math.ceil(words(p).length / 20);
    if (lines > READABILITY.maxParagraphLines)
      out.push({ rule: 'readability', severity: 'warn', message: `paragrafo de ~${lines} linhas (max ${READABILITY.maxParagraphLines})`, excerpt: p.slice(0, 70) });
  }

  const passives = (deaccent(text).match(PASSIVE) ?? []).length;
  if (passives / s.length > READABILITY.maxPassiveRatio)
    out.push({ rule: 'readability', severity: 'warn', message: `voz passiva em ${((passives / s.length) * 100).toFixed(0)}% das frases (max 12%)` });

  return out;
}

// -------------------------------------------------------------- glossário

const GlossarySchema = z.array(
  z.object({ termo: z.string(), definicaoCurta: z.string(), aliases: z.array(z.string()).default([]) })
);
export type GlossaryTerm = z.infer<typeof GlossarySchema>[number];

export const loadGlossary = (path = 'glossary/terms.yaml'): GlossaryTerm[] =>
  GlossarySchema.parse(parse(readFileSync(path, 'utf8')));

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Todo termo tecnico precisa de glosa na primeira aparicao: a definicao curta
 * tem de aparecer na mesma frase ou na seguinte (detectado por sobreposicao de
 * tokens). O leitor-alvo nao trabalha com TI.
 */
export function glossaryLint(markdown: string, glossary: GlossaryTerm[], minOverlap = 0.34): Finding[] {
  const text = prose(markdown);
  const s = sentences(text);
  const flat = deaccent(text.toLowerCase());
  const out: Finding[] = [];

  for (const term of glossary) {
    const names = [term.termo, ...term.aliases];
    const hit = names.find((n) => new RegExp(`\\b${escapeRe(deaccent(n.toLowerCase()))}\\b`).test(flat));
    if (!hit) continue;

    const needle = new RegExp(`\\b${escapeRe(deaccent(hit.toLowerCase()))}\\b`);
    const i = s.findIndex((sent) => needle.test(deaccent(sent.toLowerCase())));
    const window = [s[i] ?? '', s[i + 1] ?? ''].join(' ');
    if (overlap(term.definicaoCurta, window) < minOverlap)
      out.push({
        rule: 'glossary',
        severity: 'error',
        message: `"${term.termo}" usado sem explicacao na 1a ocorrencia`,
        excerpt: (s[i] ?? '').slice(0, 90),
      });
  }
  return out;
}

// -------------------------------------------------------------- evidência

const EVALUATIVE = new RegExp(
  [
    String.raw`\b(e|fica|sai|parece) (mais |menos |bem |bastante )?(lent|car|barat|rapid|melhor|pior|ideal|superior|inferior)`,
    String.raw`\bvale a pena\b`,
    String.raw`\b(nao )?recomendo\b`,
    String.raw`\b(quebra|trava|estoura|decepciona|frustra|compensa)\b`,
    String.raw`\bo (melhor|pior)\b`,
    String.raw`\bideal para\b`,
    String.raw`\bevite\b`,
    String.raw`\bfunciona (bem|mal)\b`,
    String.raw`\bnao (serve|vale|aguenta)\b`,
  ].join('|'),
  'i'
);

/**
 * A regra que sustenta o projeto: toda afirmacao avaliativa precisa de rastro
 * para uma entrada de verdict.evidence. Frases orfas sao reportadas, nunca
 * ignoradas em silencio.
 */
export function evidenceLint(markdown: string, verdict: Verdict, minOverlap = 0.28): Finding[] {
  const out: Finding[] = [];
  for (const sent of sentences(prose(markdown))) {
    if (!EVALUATIVE.test(deaccent(sent))) continue;
    const best = Math.max(
      ...verdict.evidence.map((e) => Math.max(overlap(sent, e.claim), overlap(sent, e.ref))),
      overlap(sent, verdict.oneLiner)
    );
    if (best < minOverlap)
      out.push({
        rule: 'evidence',
        severity: 'error',
        message: `afirmacao avaliativa sem evidencia rastreada (overlap ${best.toFixed(2)})`,
        excerpt: sent.slice(0, 110),
      });
  }
  return out;
}

// ------------------------------------------------------------------ links

/** Status HTTP do link, ou 0 se nem respondeu. Alguns servidores recusam HEAD; confirma com GET. */
async function probe(url: string): Promise<number> {
  const opts = { redirect: 'follow' as const, signal: AbortSignal.timeout(15_000) };
  try {
    const head = await fetch(url, { method: 'HEAD', ...opts });
    if (head.ok) return head.status;
    const get = await fetch(url, opts);
    return get.status;
  } catch {
    return 0;
  }
}

export async function linkLint(markdown: string): Promise<Finding[]> {
  const urls = [...new Set(markdown.match(/https?:\/\/[^\s)\]<>"]+/g) ?? [])];
  const checks = urls.map(async (url): Promise<Finding | null> => {
    let status = cachedLink(url);
    if (status === undefined) {
      status = await probe(url);
      if (status) rememberLink(url, status);
    }
    if (status >= 200 && status < 400) return null;
    if (!status) return { rule: 'link', severity: 'error', message: 'inacessivel (sem resposta)', excerpt: url };
    // 401/403/405/429 = protecao anti-robo, nao link morto. Vira aviso.
    const botBlock = [401, 403, 405, 429].includes(status);
    return {
      rule: 'link',
      severity: botBlock ? 'warn' : 'error',
      message: botBlock ? `HTTP ${status} (bloqueio anti-robo) - confira no navegador` : `HTTP ${status}`,
      excerpt: url,
    };
  });
  return (await Promise.all(checks)).filter((f): f is Finding => f !== null);
}

// ---------------------------------------------------------------- agregado

export type QualityReport = {
  findings: Finding[];
  stats: { words: number; flesch: number; avgWordsPerSentence: number; pendingPrints: number; missing: number };
  ok: boolean;
};

export async function runAllLints(
  markdown: string,
  verdict: Verdict,
  opts: { glossary?: GlossaryTerm[]; checkLinks?: boolean } = {}
): Promise<QualityReport> {
  const glossary = opts.glossary ?? loadGlossary();
  const findings = [
    ...clicheLint(markdown),
    ...readabilityLint(markdown),
    ...glossaryLint(markdown, glossary),
    ...evidenceLint(markdown, verdict),
    ...(opts.checkLinks ? await linkLint(markdown) : []),
  ];

  const text = prose(markdown);
  const s = sentences(text);
  const w = words(text);
  const pendingPrints = (markdown.match(/\[\[PRINT:/g) ?? []).length;
  const missing = (markdown.match(/\[\[FALTA:/g) ?? []).length;
  if (missing) findings.push({ rule: 'draft', severity: 'error', message: `${missing} marcador(es) [[FALTA: ...]] sem resolver` });
  if (pendingPrints)
    findings.push({ rule: 'draft', severity: 'warn', message: `${pendingPrints} print(s) pendente(s) - publicacao bloqueada ate anexar` });

  return {
    findings,
    stats: {
      words: w.length,
      flesch: Math.round(fleschPtBr(text)),
      avgWordsPerSentence: s.length ? +(w.length / s.length).toFixed(1) : 0,
      pendingPrints,
      missing,
    },
    ok: !findings.some((f) => f.severity === 'error'),
  };
}
