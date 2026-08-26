#!/usr/bin/env -S npx tsx
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { parse } from 'yaml';
import { PostMetadataSchema, VerdictSchema, verdictGate, type PostMetadata, type Verdict } from './schemas.ts';
import { loadGlossary, runAllLints, type QualityReport } from './quality/lints.ts';
import { planSections } from './outline.ts';
import { writeArticle } from './writer.ts';
import { makeOutputs } from './outputs.ts';
import { allRuns, loadRun, saveRun } from './state.ts';
import { pendingPrints, publishPost, screenshotQueue } from './publish.ts';
import { buildSite, listPosts, similar, stalePosts, suggestLinks } from './site.ts';

const slugify = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function loadVerdict(path: string): Verdict {
  const parsed = VerdictSchema.safeParse(parse(readFileSync(path, 'utf8')));
  if (!parsed.success) {
    console.error(`\nO veredito ${path} nao passou no schema:\n`);
    for (const i of parsed.error.issues) console.error(`  ${i.path.join('.') || '(raiz)'}: ${i.message}`);
    process.exit(1);
  }
  const blocks = verdictGate(parsed.data);
  if (blocks.length) {
    console.error(`\nGate de veredito reprovou ${path}. Corrija e rode de novo:\n`);
    for (const b of blocks) console.error(`  - ${b}`);
    process.exit(1);
  }
  return parsed.data;
}

/** Metadados sao validados, nunca prometidos por prompt. */
function buildMetadata(v: Verdict): PostMetadata {
  const meta = {
    title: v.title,
    description: v.description,
    verdict: v.verdict,
    slug: slugify(v.subject),
    date: new Date().toISOString().slice(0, 10),
    tags: v.tags,
    verifiedAt: v.priceChecked.at,
    staleAfterDays: 120,
  };
  const parsed = PostMetadataSchema.safeParse(meta);
  if (!parsed.success) {
    console.error('\nMetadados invalidos (corrija title/description/tags no verdict.yaml):\n');
    for (const i of parsed.error.issues) console.error(`  ${i.path.join('.')}: ${i.message}`);
    process.exit(1);
  }
  const head = meta.title.slice(0, 30).toLowerCase();
  if (!head.includes(v.keyword.toLowerCase().split(' ')[0] ?? ''))
    console.error(`  aviso: keyword "${v.keyword}" fora dos 30 primeiros caracteres do title`);
  return parsed.data;
}

const frontmatter = (m: PostMetadata) =>
  ['---', `title: "${m.title}"`, `description: "${m.description}"`, `verdict: ${m.verdict}`, `slug: ${m.slug}`, `date: ${m.date}`,
   `tags: [${m.tags.join(', ')}]`, `verifiedAt: ${m.verifiedAt}`, `staleAfterDays: ${m.staleAfterDays}`, '---', ''].join('\n');

/** A CLI nao renderiza o artigo. Renderizar 1400 palavras garante aprovacao sem leitura. */
function printReport(slug: string, v: Verdict, r: QualityReport, cost?: number) {
  const errs = r.findings.filter((f) => f.severity === 'error');
  const warns = r.findings.filter((f) => f.severity === 'warn');
  const line = (k: string, val: string, ok: boolean) => `  ${k.padEnd(16)}${val.padEnd(34)}${ok ? 'ok' : 'X'}`;
  const count = (rule: string) => r.findings.filter((f) => f.rule === rule && f.severity === 'error').length;

  console.log(`\n  Relatorio: ${slug}\n  ${'-'.repeat(56)}`);
  console.log(line('Veredito', v.verdict, true));
  console.log(line('Evidencias', `${v.evidence.length} declaradas, ${count('evidence')} orfas`, count('evidence') === 0));
  console.log(line('Cliches', String(count('cliche')), count('cliche') === 0));
  console.log(line('Legibilidade', `Flesch ${r.stats.flesch} - ${r.stats.avgWordsPerSentence} pal/frase`, count('readability') === 0));
  console.log(line('Jargao', `${count('glossary')} termos sem glosa`, count('glossary') === 0));
  console.log(line('Links', `${count('link')} quebrados`, count('link') === 0));
  console.log(line('Prints', `${r.stats.pendingPrints} pendente(s)`, r.stats.pendingPrints === 0));
  console.log(line('Tamanho', `${r.stats.words} palavras`, true));
  if (cost !== undefined) console.log(line('Custo', `US$ ${cost.toFixed(3)}`, true));
  console.log(`  ${'-'.repeat(56)}`);

  for (const f of [...errs, ...warns])
    console.log(`  ${f.severity === 'error' ? 'ERRO' : 'aviso'} [${f.rule}] ${f.message}${f.excerpt ? `\n         "${f.excerpt}"` : ''}`);
  console.log(r.ok ? '\n  Passou nos lints.\n' : '\n  Reprovado. Corrija os ERROs acima.\n');
}

async function cmdLint(mdPath: string, verdictPath: string, checkLinks: boolean) {
  const v = loadVerdict(verdictPath);
  const md = readFileSync(mdPath, 'utf8');
  const report = await runAllLints(md, v, { checkLinks });
  printReport(slugify(v.subject), v, report);
  process.exit(report.ok ? 0 : 1);
}

async function cmdCreate(verdictPath: string, checkLinks: boolean, withOutputs: boolean) {
  const v = loadVerdict(verdictPath);
  const meta = buildMetadata(v);
  const posts = listPosts();

  // Canibalizacao: assunto parecido demais pede update, nao post novo.
  for (const d of similar(v.subject, posts).filter((x) => x.slug !== meta.slug))
    console.error(`  aviso: "${d.slug}" cobre assunto parecido (${d.score.toFixed(2)}). Considere update em vez de create.`);

  const run = loadRun(meta.slug, verdictPath);
  const plan = planSections(v);
  console.log(`\nEscrevendo "${v.subject}" - ${plan.length} secoes\n`);

  const res = await writeArticle(v, plan, run);
  const md = frontmatter(meta) + `# ${meta.title}\n\n> ${v.oneLiner}\n\n` + res.markdown + sourcesBlock(v);
  const out = `posts/${meta.slug}.md`;
  writeFileSync(out, md, 'utf8');

  const report = await runAllLints(md, v, { checkLinks });
  printReport(meta.slug, v, report, run.costUsd);
  if (res.needsHuman.length) console.log(`  Secoes marcadas needs_human: ${res.needsHuman.join(', ')}\n`);

  const prints = screenshotQueue(meta.slug, md);
  if (prints.length) console.log(`  ${prints.length} print(s) pedidos: runs/${meta.slug}-screenshots.md\n`);

  const links = suggestLinks(md, posts, meta.slug);
  if (links.length) {
    console.log('  Links internos sugeridos (insira a mao, onde fizer sentido):');
    for (const l of links) console.log(`    ${l.slug} - ${l.title}`);
    console.log();
  }

  if (withOutputs) console.log(`  Saidas extras: ${(await makeOutputs(v, meta.slug, md, run)).join(', ')}\n`);

  run.status = 'draft';
  saveRun(run);
  console.log(`  Rascunho: ${out}\n  Publique com: npm run ai-blog -- publish ${meta.slug} --verdict ${verdictPath}\n`);
}

async function cmdPublish(slug: string, verdictPath: string, direct: boolean, force: boolean) {
  const v = loadVerdict(verdictPath);
  const path = `posts/${slug}.md`;
  if (!existsSync(path)) fail(`nao achei ${path}`);
  const md = readFileSync(path, 'utf8');

  const report = await runAllLints(md, v, { checkLinks: true });
  printReport(slug, v, report);
  if (!report.ok) fail('lints reprovaram. Nada foi publicado.');

  // Gate bloqueante: print pendente nao publica. Sem excecao.
  const prints = pendingPrints(md);
  if (prints.length) {
    screenshotQueue(slug, md);
    fail(`${prints.length} print(s) pendente(s). Veja runs/${slug}-screenshots.md e anexe antes de publicar.`);
  }
  if (direct && !force) fail('modo direct exige --force explicito. Sem ele, use o padrao (pull request).');

  const extras = [`posts/${slug}.newsletter.md`, `posts/${slug}.roteiro.md`].filter((f) => existsSync(f));
  const result = publishPost(slug, [path, ...extras, ...buildSite()], direct ? 'direct' : 'pull_request');

  const run = loadRun(slug, verdictPath);
  run.status = 'published';
  saveRun(run);
  console.log(`  Commitado em ${result.branch}: ${result.files.length} arquivo(s).\n  Abra o PR: ${result.url}\n`);
}

function cmdUpdate() {
  const stale = stalePosts(listPosts());
  if (!stale.length) return console.log('\n  Nenhum post vencido. Acervo em dia.\n');
  console.log(`\n  ${stale.length} post(s) vencido(s). Manter 40 corretos vale mais que publicar 120 velhos:\n`);
  for (const { ref, daysOver } of stale)
    console.log(`  ${ref.slug}\n    conferido em ${ref.verifiedAt}, vencido ha ${daysOver} dia(s)\n    reconfira o preco, atualize verifiedAt e rode lint de novo\n`);
}

function cmdCost(id?: string) {
  const runs = allRuns().filter((r) => !id || r.id === id);
  if (!runs.length) return console.log('\n  Nenhum run registrado.\n');
  console.log(`\n  ${'run'.padEnd(46)}${'status'.padEnd(11)}custo`);
  for (const r of [...runs].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)))
    console.log(`  ${r.id.padEnd(46)}${r.status.padEnd(11)}US$ ${r.costUsd.toFixed(3)}  (${r.tokensIn}+${r.tokensOut} tk)`);
  console.log(`\n  total US$ ${runs.reduce((s, r) => s + r.costUsd, 0).toFixed(3)}\n`);
}

async function cmdOutputs(slug: string, verdictPath: string) {
  const v = loadVerdict(verdictPath);
  const path = `posts/${slug}.md`;
  if (!existsSync(path)) fail(`nao achei ${path}`);
  const run = loadRun(slug, verdictPath);
  const files = await makeOutputs(v, slug, readFileSync(path, 'utf8'), run);
  console.log(`\n  ${files.join('\n  ')}\n  Custo do run: US$ ${run.costUsd.toFixed(3)}\n`);
}

/** As fontes saem do veredito, nao do modelo. Nenhum link e inventado. */
function sourcesBlock(v: Verdict): string {
  const links = v.evidence.filter((e) => e.proof === 'link');
  if (!links.length) return '';
  return (
    `\n\n## Fontes\n\n` +
    links.map((e, i) => `${i + 1}. ${e.claim} - [${new URL(e.ref).hostname}](${e.ref})`).join('\n') +
    `\n\nPrecos e limites conferidos em ${v.priceChecked.at}.\n`
  );
}

function cmdGlossaryAdd(termo: string, definicao: string) {
  appendFileSync('glossary/terms.yaml', `\n- termo: ${termo}\n  definicaoCurta: ${definicao}\n  aliases: []\n`, 'utf8');
  loadGlossary();
  console.log(`ok: "${termo}" adicionado ao glossario.`);
}

function fail(msg: string): never {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    verdict: { type: 'string', short: 'v' },
    links: { type: 'boolean', default: false },
    outputs: { type: 'boolean', default: false },
    direct: { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
  },
});
const [cmd, a, b] = positionals;

switch (cmd) {
  case 'create':
    if (!a) exitUsage();
    await cmdCreate(a, values.links, values.outputs);
    break;
  case 'lint':
    if (!a || !values.verdict) exitUsage();
    await cmdLint(a, values.verdict, values.links);
    break;
  case 'publish':
    if (!a || !values.verdict) exitUsage();
    await cmdPublish(a, values.verdict, values.direct, values.force);
    break;
  case 'outputs':
    if (!a || !values.verdict) exitUsage();
    await cmdOutputs(a, values.verdict);
    break;
  case 'update':
    cmdUpdate();
    break;
  case 'cost':
    cmdCost(a);
    break;
  case 'site':
    console.log(`\n  gerado: ${buildSite().join(', ')}\n`);
    break;
  case 'glossary':
    if (a !== 'add' || !b || !positionals[3]) exitUsage();
    cmdGlossaryAdd(b, positionals.slice(3).join(' '));
    break;
  default:
    exitUsage();
}

function exitUsage(): never {
  console.log(`
  ai-blog create <verdicts/x.yaml> [--links] [--outputs]
  ai-blog lint <posts/x.md> --verdict <verdicts/x.yaml> [--links]
  ai-blog publish <slug> --verdict <verdicts/x.yaml> [--direct --force]
  ai-blog outputs <slug> --verdict <verdicts/x.yaml>
  ai-blog update            posts vencidos (verifiedAt + staleAfterDays)
  ai-blog cost [run_id]     custo por post e agregado
  ai-blog site              regenera index / qual-ia-usar / glossario
  ai-blog glossary add <termo> <definicao curta>
`);
  process.exit(1);
}
