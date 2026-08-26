import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * Maquina de estado do run: resume, cache de passo e custo.
 * ponytail: um JSON por run em vez de SQLite. Da resume, cache e custo agregado
 * com zero dependencia e legivel a olho nu. Troque por node:sqlite se precisar
 * de query de verdade ou se runs/ passar de uns mil arquivos.
 */
const DIR = 'runs';

export type RunState = {
  id: string;
  verdictPath: string;
  status: 'running' | 'draft' | 'published';
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  /** input_hash -> output do passo. Hash bateu, o passo nao roda de novo. */
  steps: Record<string, unknown>;
  updatedAt: string;
};

const file = (id: string) => `${DIR}/${id}.json`;

const readJson = <T>(path: string, fallback: T): T =>
  existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : fallback;

function writeJson(path: string, data: unknown) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
}

export const hash = (input: unknown) => createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 16);

export function loadRun(id: string, verdictPath: string): RunState {
  return readJson<RunState>(file(id), {
    id, verdictPath, status: 'running', costUsd: 0, tokensIn: 0, tokensOut: 0, steps: {}, updatedAt: '',
  });
}

export function saveRun(run: RunState) {
  run.updatedAt = new Date().toISOString();
  writeJson(file(run.id), run);
}

/** Se o input do passo nao mudou, devolve o output em cache. Rate limit ou crash nao perde trabalho. */
export async function cachedStep<T>(run: RunState, input: unknown, fn: () => Promise<T>): Promise<{ value: T; cached: boolean }> {
  const key = hash(input);
  const hit = run.steps[key];
  if (hit !== undefined) return { value: hit as T, cached: true };
  const value = await fn();
  run.steps[key] = value;
  saveRun(run);
  return { value, cached: false };
}

export function allRuns(): RunState[] {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.json') && f !== 'link-cache.json')
    .map((f) => readJson<RunState | null>(`${DIR}/${f}`, null))
    .filter((r): r is RunState => r !== null);
}

// ------------------------------------------------------------- cache de links
// HEAD em 8 links custa segundos e o resultado nao muda de hora em hora.
const LINKS = `${DIR}/link-cache.json`;
const TTL_DAYS = 7;
type LinkEntry = { status: number; at: string };

export function cachedLink(url: string): number | undefined {
  const e = readJson<Record<string, LinkEntry>>(LINKS, {})[url];
  if (!e) return undefined;
  return (Date.now() - Date.parse(e.at)) / 86_400_000 < TTL_DAYS ? e.status : undefined;
}

export function rememberLink(url: string, status: number) {
  const all = readJson<Record<string, LinkEntry>>(LINKS, {});
  all[url] = { status, at: new Date().toISOString() };
  writeJson(LINKS, all);
}
