import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'yaml';
import { overlap } from './quality/text.ts';
import { loadGlossary } from './quality/lints.ts';
import { VerdictSchema, type Verdict } from './schemas.ts';

export type PostRef = {
  slug: string; title: string; description: string; date: string;
  tags: string[]; verifiedAt: string; staleAfterDays: number; path: string;
};

const DAY = 86_400_000;
const today = () => new Date().toISOString().slice(0, 10);

function frontmatter(raw: string): Record<string, unknown> | null {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  return m?.[1] ? (parse(m[1]) as Record<string, unknown>) : null;
}

/** Indice de posts lido do disco. A pasta posts/ e a fonte da verdade, nao um banco. */
export function listPosts(dir = 'posts'): PostRef[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !/\.(newsletter|roteiro)\.md$/.test(f))
    .map((f) => {
      const fm = frontmatter(readFileSync(`${dir}/${f}`, 'utf8'));
      if (!fm) return null;
      return {
        slug: String(fm.slug ?? f.replace(/\.md$/, '')),
        title: String(fm.title ?? ''),
        description: String(fm.description ?? ''),
        date: String(fm.date ?? ''),
        tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
        verifiedAt: String(fm.verifiedAt ?? fm.date ?? ''),
        staleAfterDays: Number(fm.staleAfterDays ?? 120),
        path: `${dir}/${f}`,
      } satisfies PostRef;
    })
    .filter((p): p is PostRef => p !== null)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Manter 40 posts corretos vale mais que publicar 120 desatualizados. */
export function stalePosts(refs: PostRef[], now = Date.now()): Array<{ ref: PostRef; daysOver: number }> {
  return refs
    .map((ref) => ({ ref, daysOver: Math.floor((now - Date.parse(ref.verifiedAt)) / DAY) - ref.staleAfterDays }))
    .filter((x) => x.daysOver >= 0)
    .sort((a, b) => b.daysOver - a.daysOver);
}

/**
 * Canibalizacao: assunto novo parecido demais com post existente pede `update`, nao `create`.
 * ponytail: sobreposicao de tokens em vez de embedding. Nao entende sinonimo,
 * mas nao precisa de API nem de banco vetorial. Troque por embedding se o acervo
 * passar de umas 100 pecas e comecar a escapar duplicata obvia.
 */
export function similar(subject: string, refs: PostRef[], min = 0.5): Array<{ slug: string; score: number }> {
  return refs
    .map((r) => ({ slug: r.slug, score: Math.max(overlap(subject, r.title), overlap(subject, [r.slug, ...r.tags].join(' '))) }))
    .filter((x) => x.score >= min)
    .sort((a, b) => b.score - a.score);
}

/** Links internos sugeridos, nunca inseridos sozinhos: quem decide contexto e voce. */
export function suggestLinks(markdown: string, refs: PostRef[], excludeSlug: string, n = 5) {
  return refs
    .filter((r) => r.slug !== excludeSlug)
    .map((r) => ({ slug: r.slug, title: r.title, score: overlap(markdown, [r.title, ...r.tags].join(' ')) }))
    .filter((x) => x.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

// ------------------------------------------------------------ paginas do site
// GitHub Pages roda Jekyll sozinho: todo .md com frontmatter vira HTML.
// Estas tres paginas sao geradas do disco, nunca de LLM.

const listVerdicts = (dir = 'verdicts'): Verdict[] =>
  !existsSync(dir)
    ? []
    : readdirSync(dir)
        .filter((f) => f.endsWith('.yaml'))
        .map((f) => VerdictSchema.safeParse(parse(readFileSync(`${dir}/${f}`, 'utf8'))))
        .filter((r) => r.success)
        .map((r) => r.data);

const staleTag = (p: PostRef) =>
  Date.parse(p.verifiedAt) + p.staleAfterDays * DAY < Date.now() ? ' _(revisao pendente)_' : '';

function indexPage(posts: PostRef[]): string {
  const items = posts.length
    ? posts.map((p) => `### [${p.title}](${p.path.replace(/\.md$/, '.html')})\n\n${p.description}\n\n<small>${p.date} - conferido em ${p.verifiedAt}${staleTag(p)}</small>`).join('\n\n---\n\n')
    : '_Nenhum post publicado ainda._';
  return [
    '---', 'title: Artigos', '---', '',
    '# IA e automacao, testado antes de recomendar', '',
    'Cada artigo aqui sai de um veredito com evidencia declarada. Nada e recomendado sem teste, e toda pagina mostra a data da ultima conferencia.', '',
    '[Qual IA usar](qual-ia-usar.html) - [Glossario](glossario.html)', '',
    items, '',
  ].join('\n');
}

function qualIaUsarPage(verdicts: Verdict[]): string {
  const models = verdicts.filter((v) => v.category === 'model' && v.tasks.length);
  const rows = models
    .flatMap((v) => v.tasks.map((t) => ({ task: t, v })))
    .sort((a, b) => a.task.localeCompare(b.task))
    .map((r) => `| ${r.task} | ${r.v.subject} | ${r.v.oneLiner} | ${r.v.priceChecked.at} |`);
  const changelog = existsSync('verdicts/qual-ia-usar-changelog.md')
    ? readFileSync('verdicts/qual-ia-usar-changelog.md', 'utf8')
    : '_Sem mudancas registradas ainda._';

  return [
    '---', 'title: Qual IA usar', '---', '',
    '# Qual IA usar para cada tarefa', '',
    `Esta pagina nao e um post. Ela muda quando o teste muda. Ultima geracao: ${today()}.`, '',
    rows.length
      ? ['| Tarefa | Recomendacao | Por que | Conferido em |', '| :--- | :--- | :--- | :--- |', ...rows].join('\n')
      : '_Nenhum veredito `category: model` com `tasks` preenchido ainda._',
    '', '## O que mudou', '', changelog, '',
  ].join('\n');
}

function glossarioPage(): string {
  const rows = loadGlossary().map((t) => `| **${t.termo}** | ${t.definicaoCurta} |`);
  return [
    '---', 'title: Glossario', '---', '',
    '# Glossario', '',
    'Termo tecnico que aparece nos artigos, explicado sem jargao.', '',
    '| Termo | O que e |', '| :--- | :--- |', ...rows, '',
  ].join('\n');
}

export function buildSite(): string[] {
  const pages: Array<[string, string]> = [
    ['index.md', indexPage(listPosts())],
    ['qual-ia-usar.md', qualIaUsarPage(listVerdicts())],
    ['glossario.md', glossarioPage()],
  ];
  for (const [path, body] of pages) writeFileSync(path, body, 'utf8');
  return pages.map(([p]) => p);
}
