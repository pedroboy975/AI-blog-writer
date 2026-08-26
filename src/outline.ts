import type { SectionPlan, Verdict } from './schemas.ts';

const refs = (v: Verdict) => v.evidence.map((e) => e.id);

/**
 * Estrategista deterministico: o formato sai da `category`, nao de um LLM.
 * Nunca mais de 6 H2s.
 */
export function planSections(v: Verdict): SectionPlan[] {
  const all = refs(v);

  if (v.category === 'tactic')
    return [
      { h2: 'A tatica', objective: 'Descrever a tatica e quando ela se aplica.', wordBudget: 200, requiredElements: ['example'], evidenceRefs: all.slice(0, 1) },
      { h2: 'Por que funciona', objective: 'Amarrar a tatica a evidencia medida.', wordBudget: 200, requiredElements: ['data_point'], evidenceRefs: all },
    ];

  if (v.category === 'workflow')
    return [
      { h2: 'O que essa automacao faz', objective: 'Resultado concreto e para quem serve.', wordBudget: 200, requiredElements: ['callout'], evidenceRefs: all.slice(0, 1) },
      { h2: 'O que voce precisa antes de comecar', objective: 'Contas, custos e limites reais.', wordBudget: 200, requiredElements: ['list', 'data_point'], evidenceRefs: all },
      { h2: 'Passo a passo', objective: 'Cada passo com o clique exato. Sem pular etapa.', wordBudget: 550, requiredElements: ['list', 'example'], evidenceRefs: all },
      { h2: 'Onde isso quebra', objective: 'Falhas reais que o autor encontrou, com os dealbreakers.', wordBudget: 250, requiredElements: ['list'], evidenceRefs: all },
      { h2: 'Pra quem isso nao serve', objective: 'Recorte honesto de quem nao deve montar isso.', wordBudget: 180, requiredElements: ['callout'], evidenceRefs: [] },
    ];

  // category: 'tool' - review opinativa
  return [
    { h2: 'O veredito, sem rodeio', objective: 'Abrir com a decisao e o custo real. Nada de introducao generica.', wordBudget: 220, requiredElements: ['callout', 'data_point'], evidenceRefs: all.slice(0, 2) },
    { h2: 'Como eu testei', objective: 'Contexto do teste: tempo, plano, volume. Torna a opiniao auditavel.', wordBudget: 180, requiredElements: ['list'], evidenceRefs: all },
    { h2: 'A diferenca que decide a escolha', objective: 'A evidencia central explicada em linguagem simples, com numeros.', wordBudget: 450, requiredElements: ['table', 'data_point'], evidenceRefs: all },
    { h2: 'Onde isso te pega', objective: 'Dealbreakers concretos, do jeito que aparecem na tela.', wordBudget: 300, requiredElements: ['list'], evidenceRefs: all },
    { h2: 'Pra quem isso nao serve', objective: 'Recorte honesto. Perder o leitor errado agora vale mais que perde-lo depois.', wordBudget: 200, requiredElements: ['callout'], evidenceRefs: [] },
    { h2: 'O que fazer na segunda-feira', objective: 'Proximo passo executavel hoje, com criterio de sucesso.', wordBudget: 250, requiredElements: ['list', 'example'], evidenceRefs: all },
  ];
}
