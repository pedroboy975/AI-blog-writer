import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

// ------------------------------------------------------- fila de screenshots

/** Cada [[PRINT: ...]] pedido no rascunho. */
export function pendingPrints(markdown: string): string[] {
  return [...markdown.matchAll(/\[\[PRINT:\s*([^\]]+)\]\]/g)].map((m) => (m[1] ?? '').trim());
}

/**
 * Gera a lista de prints pendentes com o H2 em que cada um aparece.
 * Enquanto sobrar um, `publish` recusa. Este e o unico ponto onde o humano e insubstituivel.
 */
export function screenshotQueue(slug: string, markdown: string): string[] {
  const prints = pendingPrints(markdown);
  if (!prints.length) return [];

  let h2 = '(antes do primeiro H2)';
  const rows: string[] = [];
  for (const line of markdown.split('\n')) {
    if (line.startsWith('## ')) h2 = line.slice(3).trim();
    for (const p of pendingPrints(line)) rows.push(`- [ ] **${p}**\n      secao: ${h2}\n      salvar em: assets/posts/${slug}/`);
  }

  mkdirSync('runs', { recursive: true });
  writeFileSync(
    `runs/${slug}-screenshots.md`,
    `# Prints pendentes: ${slug}\n\n${rows.join('\n\n')}\n\nDepois de anexar, troque o marcador [[PRINT: ...]] pela imagem no post e rode \`lint\` de novo.\n`,
    'utf8'
  );
  return prints;
}

// ------------------------------------------------------------------ publisher
// ponytail: git commita varios arquivos atomicamente de graca. A Git Data API do
// spec existe para contornar o createOrUpdateFileContents, que e single-file --
// problema que nao temos. Troque por API so se publicar de um servidor sem git.

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();

/** owner/repo a partir do remote, aceitando https e ssh. */
export function repoSlug(remote: string): string | null {
  return remote.match(/github\.com[:/]([^/]+\/[^/.]+)/)?.[1] ?? null;
}

export type PublishResult = { branch: string; url: string; files: string[] };

export function publishPost(slug: string, files: string[], mode: 'pull_request' | 'direct' = 'pull_request'): PublishResult {
  const assets = `assets/posts/${slug}`;
  const all = [...files, ...(existsSync(assets) ? [assets] : [])];

  const base = git('rev-parse', '--abbrev-ref', 'HEAD');
  const branch = mode === 'direct' ? base : `post/${slug}`;
  if (mode !== 'direct') git('checkout', '-B', branch);

  git('add', '--', ...all);
  git('commit', '-m', `post: ${slug}`);
  git('push', '-u', 'origin', branch);
  if (mode !== 'direct') git('checkout', base);

  const repo = repoSlug(git('remote', 'get-url', 'origin'));
  const url =
    mode === 'direct'
      ? `https://github.com/${repo}/commits/${branch}`
      : `https://github.com/${repo}/compare/${base}...${branch}?expand=1`;
  return { branch, url, files: all };
}
