import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'yaml';
import { overlap } from './quality/text.ts';
import { loadGlossary } from './quality/lints.ts';
import { VerdictSchema, type Verdict } from './schemas.ts';

export type PostRef = {
  slug: string; title: string; description: string; date: string;
  tags: string[]; verifiedAt: string; staleAfterDays: number; path: string;
  /** O veredito vira selo no site. Sem ele, a pagina esconde o dado mais importante do post. */
  verdict: string;
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
        verdict: String(fm.verdict ?? ''),
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

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** ISO -> dd/mm/aaaa. Mesmo formato que o layout usa, sem depender de locale. */
const br = (iso: string) => iso.split('-').reverse().join('/');

const VERDICT_LABEL: Record<string, string> = {
  use: 'use', use_com_ressalva: 'use com ressalva', evite: 'evite', ainda_nao: 'ainda não',
};

/** Acento vira letra base antes do slug, senao `alucinação` sai como id `alucina-o`. */
const slug = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const badge = (v: string) => (v ? `<span class="badge v-${v}">${VERDICT_LABEL[v] ?? v}</span>` : '');

const staleTag = (p: PostRef) =>
  Date.parse(p.verifiedAt) + p.staleAfterDays * DAY < Date.now() ? ' <span class="stale">— revisão vencida</span>' : '';

function indexPage(posts: PostRef[]): string {
  const items = posts.map((p) =>
    [
      '  <li>',
      // relative_url em vez de caminho cru: com baseurl de site de projeto, link cru da 404.
      `    <h2><a href="{{ '/${p.path.replace(/\.md$/, '.html')}' | relative_url }}">${esc(p.title)}</a></h2>`,
      `    <p>${esc(p.description)}</p>`,
      '    <p class="kicker">',
      `      ${badge(p.verdict)}`,
      `      <span>conferido em <time datetime="${p.verifiedAt}">${br(p.verifiedAt)}</time>${staleTag(p)}</span>`,
      '    </p>',
      '  </li>',
    ].join('\n')
  );

  return [
    '---', 'title: Artigos', '---', '',
    // Nome vem do _config.yml, nao daqui: renomear o blog e uma linha, nao duas.
    '<h1>{{ site.title }}</h1>', '',
    '<p class="lede">Cada artigo sai de um veredito com evidência declarada. Nada é recomendado sem teste, e toda página mostra a data da última conferência.</p>', '',
    // Estado vazio fala com o leitor, nao com quem mantem o repositorio.
    posts.length
      ? `<ul class="posts">\n${items.join('\n')}\n</ul>`
      : '<p class="empty">Nenhum artigo publicado ainda. O primeiro sai quando o primeiro teste terminar.</p>',
    '',
  ].join('\n');
}

function qualIaUsarPage(verdicts: Verdict[]): string {
  const models = verdicts.filter((v) => v.category === 'model' && v.tasks.length);
  const rows = models
    .flatMap((v) => v.tasks.map((t) => ({ task: t, v })))
    .sort((a, b) => a.task.localeCompare(b.task))
    .map((r) => `| ${r.task} | ${r.v.subject} ${badge(r.v.verdict)} | ${r.v.oneLiner} | ${br(r.v.priceChecked.at)} |`);
  const changelog = existsSync('verdicts/qual-ia-usar-changelog.md')
    ? readFileSync('verdicts/qual-ia-usar-changelog.md', 'utf8')
    : '<p class="empty">Nenhuma recomendação mudou até agora. Quando mudar, o motivo fica registrado aqui.</p>';

  return [
    '---', 'title: Qual IA usar', '---', '',
    '# Qual IA usar para cada tarefa', '',
    `Esta página não é um post. Ela muda quando o teste muda. Última geração: ${br(today())}.`, '',
    rows.length
      ? ['| Tarefa | Recomendação | Por quê | Conferido em |', '| :--- | :--- | :--- | :--- |', ...rows].join('\n')
      : '<p class="empty">Ainda não testei modelos o bastante para recomendar um por tarefa. A tabela aparece aqui quando o primeiro teste fechar.</p>',
    '', '## O que mudou', '', changelog, '',
  ].join('\n');
}

/** Lista de definicao, nao tabela: definicao longa em celula de tabela nao cabe em celular. */
function glossarioPage(): string {
  const items = loadGlossary()
    .sort((a, b) => a.termo.localeCompare(b.termo, 'pt-BR'))
    .map((t) => `  <dt id="${slug(t.termo)}">${esc(t.termo)}</dt>\n  <dd>${esc(t.definicaoCurta)}</dd>`);
  return [
    '---', 'title: Glossário', '---', '',
    '<h1>Glossário</h1>', '',
    '<p class="lede">Termo técnico que aparece nos artigos, explicado sem jargão.</p>', '',
    `<dl>\n${items.join('\n')}\n</dl>`, '',
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
