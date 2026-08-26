import { z } from 'zod';

/** Uma prova concreta. Sem duas destas, o veredito nao vira post. */
export const EvidenceSchema = z.object({
  id: z.string().min(2),
  claim: z.string().min(10),
  proof: z.enum(['print', 'log', 'link', 'medicao', 'experiencia']),
  ref: z.string().min(3),
});

/**
 * Lista opcional em YAML: `dealbreakers:` sem item nenhum embaixo faz o parser
 * devolver null, nao []. Sem isto o schema reprova com "expected array, received
 * null", que nao diz a ninguem o que fazer.
 */
const listaOpcional = z.preprocess((x) => x ?? [], z.array(z.string()));

export const VerdictSchema = z.object({
  subject: z.string().min(3),
  category: z.enum(['tool', 'model', 'workflow', 'tactic']),
  verdict: z.enum(['use', 'use_com_ressalva', 'evite', 'ainda_nao']),
  /** A frase do humano. Nunca gerada por LLM. */
  oneLiner: z.string().min(20).max(180),
  testedOn: z.iso.date(),
  testContext: z.string().min(20),
  evidence: z.array(EvidenceSchema).min(2),
  dealbreakers: listaOpcional,
  whoShouldnt: z.string().min(15),
  alternatives: listaOpcional.pipe(z.array(z.string()).max(3)),
  priceChecked: z.object({ value: z.string(), at: z.iso.date() }),
  keyword: z.string().min(3),
  /** SEO: escrito pelo humano, validado deterministicamente por PostMetadataSchema. */
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  /** Só para category: model: as tarefas que este modelo ganha na página viva /qual-ia-usar. */
  tasks: z.array(z.string()).default([]),
});
export type Verdict = z.infer<typeof VerdictSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;

export const PostMetadataSchema = z.object({
  title: z.string().min(40).max(65).refine((t) => !/["“”‘’']/.test(t), 'aspas quebram OG tags'),
  description: z.string().min(120).max(160),
  /** O veredito no frontmatter: e o selo que o site mostra no card e no topo do post. */
  verdict: z.string().min(3),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug: so minusculas, numeros e hifen'),
  date: z.iso.date(),
  tags: z.array(z.string()).min(3).max(8),
  verifiedAt: z.iso.date(),
  staleAfterDays: z.number().int().default(120),
});
export type PostMetadata = z.infer<typeof PostMetadataSchema>;

export const SectionPlanSchema = z.object({
  h2: z.string(),
  objective: z.string(),
  wordBudget: z.number().int().min(120).max(600),
  requiredElements: z.array(z.enum(['table', 'callout', 'list', 'example', 'data_point'])),
  evidenceRefs: z.array(z.string()),
});
export type SectionPlan = z.infer<typeof SectionPlanSchema>;

const DAY = 86_400_000;
const daysSince = (iso: string) => Math.floor((Date.now() - Date.parse(iso)) / DAY);

/**
 * Gate de veredito: o guardrail do projeto. Sem veredito valido, nada e gerado.
 * Retorna a lista de bloqueios (vazia = liberado).
 */
export function verdictGate(v: Verdict): string[] {
  const blocks: string[] = [];
  if (v.evidence.length < 2) blocks.push('evidence: minimo 2 provas reais. Preencha claim + proof + ref.');
  if (daysSince(v.priceChecked.at) > 30)
    blocks.push(`priceChecked.at tem ${daysSince(v.priceChecked.at)} dias (max 30). Confira o preco de novo e atualize a data.`);
  if (daysSince(v.testedOn) > 180)
    blocks.push(`testedOn tem ${daysSince(v.testedOn)} dias (max 180). Reteste antes de publicar.`);
  if (!v.oneLiner.trim() || /^(TODO|preencher|xxx)/i.test(v.oneLiner))
    blocks.push('oneLiner: escreva a sua frase de veredito, na sua voz. Nao e template.');
  if (!v.whoShouldnt.trim()) blocks.push('whoShouldnt: diga para quem isso NAO serve.');
  if (v.category === 'model') blocks.push('category "model" nao vira post: alimenta a pagina viva /qual-ia-usar.');
  return blocks;
}
