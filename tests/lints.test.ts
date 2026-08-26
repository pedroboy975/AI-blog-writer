import { describe, expect, it } from 'vitest';
import { clicheLint, evidenceLint, fleschPtBr, glossaryLint, readabilityLint } from '../src/quality/lints.ts';
import { verdictGate, VerdictSchema, type Verdict } from '../src/schemas.ts';

const today = new Date().toISOString().slice(0, 10);

const verdict: Verdict = VerdictSchema.parse({
  subject: 'Make para automatizar e-mail',
  category: 'tool',
  verdict: 'use_com_ressalva',
  keyword: 'make',
  oneLiner: 'Serve para colar duas ferramentas, mas o plano gratuito acaba rapido.',
  testedOn: today,
  testContext: 'Tres semanas no plano gratuito, cerca de oitocentas operacoes rodadas.',
  title: 'Make para automatizar e-mail - vale a pena no plano free',
  description:
    'Testei o plano gratuito do Make por tres semanas para automatizar e-mail. O limite de mil creditos por mes acaba antes do que voce imagina, e explico onde.',
  tags: ['make', 'automacao', 'email'],
  priceChecked: { value: 'Free 1.000 creditos/mes', at: today },
  evidence: [
    { id: 'e1', claim: 'O plano gratuito do Make da mil creditos por mes', proof: 'link', ref: 'https://www.make.com/en/pricing' },
    { id: 'e2', claim: 'Cada acao de modulo consome um credito', proof: 'link', ref: 'https://www.make.com/en/pricing' },
  ],
  dealbreakers: ['creditos acabam rapido'],
  whoShouldnt: 'Quem processa listas longas todo dia.',
  alternatives: ['Zapier'],
});

const glossary = [
  { termo: 'webhook', definicaoCurta: 'aviso automatico que um site dispara para outro assim que algo acontece', aliases: ['webhooks'] },
];

describe('clicheLint', () => {
  it('reprova aberturas cliche', () => {
    expect(clicheLint('No mundo acelerado da tecnologia, tudo muda.').some((f) => f.rule === 'cliche')).toBe(true);
    expect(clicheLint('Vamos explorar o assunto agora.')).toHaveLength(1);
    expect(clicheLint('Isso nao e apenas uma ferramenta, e uma mudanca de habito.')).toHaveLength(1);
  });

  it('aprova prosa direta', () => {
    expect(clicheLint('O plano gratuito do Make da mil creditos por mes. Acaba na segunda semana.')).toHaveLength(0);
  });

  it('pega a regra de tres', () => {
    const three = '- a\n- b\n- c';
    const md = [three, three, three].join('\n\n');
    expect(clicheLint(md).some((f) => f.message.includes('regra de tres'))).toBe(true);
  });
});

describe('readabilityLint', () => {
  it('reprova frase quilometrica', () => {
    const long = Array.from({ length: 40 }, (_, i) => `palavra${i}`).join(' ') + '.';
    expect(readabilityLint(long).some((f) => f.message.includes('palavras (max 35)'))).toBe(true);
  });

  it('aprova frases curtas e simples', () => {
    const ok = 'Voce clica em criar. O Make abre a tela. Escolha o gatilho. Salve e teste uma vez.';
    expect(readabilityLint(ok).filter((f) => f.severity === 'error')).toHaveLength(0);
  });

  it('Flesch cai quando as frases incham', () => {
    expect(fleschPtBr('O gato subiu. A casa e azul.')).toBeGreaterThan(fleschPtBr(
      'A implementacao da infraestrutura organizacional demandou reconfiguracoes procedimentais consideravelmente complexas durante o periodo.'
    ));
  });
});

describe('glossaryLint', () => {
  it('reprova jargao sem glosa', () => {
    expect(glossaryLint('Configure o webhook e siga em frente.', glossary)).toHaveLength(1);
  });

  it('aceita glosa na mesma frase', () => {
    const md = 'Configure o webhook, o aviso automatico que um site dispara para outro assim que algo acontece.';
    expect(glossaryLint(md, glossary)).toHaveLength(0);
  });

  it('ignora termo que nao aparece', () => {
    expect(glossaryLint('Nada tecnico por aqui.', glossary)).toHaveLength(0);
  });
});

describe('evidenceLint', () => {
  it('reprova afirmacao avaliativa orfa', () => {
    expect(evidenceLint('A interface do Notion e lenta demais.', verdict)).toHaveLength(1);
  });

  it('aceita afirmacao rastreada a uma evidencia', () => {
    expect(evidenceLint('Cada acao de modulo consome um credito, entao a conta e caro para listas.', verdict)).toHaveLength(0);
  });

  it('ignora frase descritiva', () => {
    expect(evidenceLint('Clique no botao azul no canto superior.', verdict)).toHaveLength(0);
  });
});

describe('verdictGate', () => {
  it('libera veredito completo e recente', () => {
    expect(verdictGate(verdict)).toHaveLength(0);
  });

  it('bloqueia preco velho', () => {
    const stale = { ...verdict, priceChecked: { ...verdict.priceChecked, at: '2020-01-01' } };
    expect(verdictGate(stale).some((b) => b.includes('priceChecked'))).toBe(true);
  });

  it('bloqueia category model', () => {
    expect(verdictGate({ ...verdict, category: 'model' }).some((b) => b.includes('qual-ia-usar'))).toBe(true);
  });
});
