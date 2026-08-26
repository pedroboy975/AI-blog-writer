---
title: "Make ou n8n - qual escolher para automatizar sem codigo"
description: "A diferenca real esta em como cada um cobra. O Make conta cada bloco que roda, o n8n conta a automacao inteira. Isso muda a sua conta no fim do mes."
slug: make-ou-n8n-para-automatizar-sem-programar
date: 2026-08-26
tags: [automacao, no-code, make, n8n, produtividade]
verifiedAt: 2026-08-26
staleAfterDays: 120
---

# Make ou n8n: qual escolher para automatizar sem código

> Comece no Make e só troque para o n8n quando a conta de créditos doer mais que a curva de aprendizado.

## O veredito, sem rodeio

As duas ferramentas fazem a mesma coisa na superfície. Você arrasta blocos numa tela, liga um aplicativo no outro e a tarefa passa a rodar sozinha. A diferença que decide a escolha não aparece na tela. Aparece na fatura.

No Make, cada ação individual que um bloco da automação realiza conta como uma operação, que hoje a empresa chama de crédito. No n8n é diferente. Uma execução é uma rodada completa da automação, do gatilho até o último bloco. O gatilho é o evento que dispara a automação, como um e-mail novo chegando na sua caixa.

Parece detalhe de contabilidade. É o item que define quanto você vai pagar.

O Make tem um plano gratuito com 1.000 créditos por mês. O plano pago de entrada, chamado Core, custa 9 dólares por mês e libera 10.000 créditos. O plano de entrada do n8n na nuvem custa 20 euros por mês e inclui 2.500 execuções.

Na conta por mês, o plano de entrada do n8n custa mais caro que o Core do Make. Na conta por tarefa, a ordem pode se inverter. Depende inteiramente do que a sua automação faz depois do gatilho.

## Como eu testei

Não é opinião de quem leu o site. É comparação de duas coisas específicas, conferidas na fonte:

- As páginas oficiais de preço do Make e do n8n, em agosto de 2026, com os valores de plano gratuito, plano de entrada e limite mensal de cada um.
- A documentação de cobrança de cada produto, para entender o que exatamente consome saldo em cada rodada.
- O material de treinamento oficial do Make sobre consumo de crédito, que traz o cálculo passo a passo de um cenário real.
- A documentação do n8n sobre expressões, para medir o quanto de escrita técnica a ferramenta exige de você.

Todos os links estão no fim do artigo. Preços mudam. A data da última conferência está no topo da página.

## A diferença que decide a escolha

Aqui está o cálculo que quase ninguém mostra antes de você assinar.

Imagine uma automação simples. Ela lê a sua caixa de entrada, filtra os e-mails de clientes e salva cada um numa planilha, com um aviso no seu celular. Chegaram quatro e-mails novos.

No Make, o bloco de gatilho consome um crédito e entrega quatro pacotes de dados. Cada pacote é um e-mail. Os três blocos seguintes rodam uma vez para cada pacote. São quatro pacotes vezes três blocos, ou seja, doze créditos. Some o gatilho e você gastou treze créditos numa única rodada.

No n8n, a mesma automação com os mesmos quatro e-mails custa uma execução. Uma só. O número de blocos não entra na conta.

| O que acontece | Make | n8n |
| :--- | :--- | :--- |
| Unidade cobrada | crédito por ação de bloco | execução por rodada completa |
| 4 e-mails, 3 blocos | 13 créditos | 1 execução |
| Plano gratuito | 1.000 créditos por mês | versão para servidor próprio |
| Plano de entrada | US$ 9 por 10.000 créditos | € 20 por 2.500 execuções |
| Você escreve código? | não | sim, expressões curtas |

Agora repita esse cálculo com o seu volume real. Se você roda vinte automações por dia e cada uma toca poucos itens, o Make sai na frente com folga. Se você processa listas de cem linhas de cada vez, o Make multiplica créditos por linha e o saldo do mês evapora numa tarde.

Duas peças do Make ajudam a segurar o consumo. O roteador é o bloco que separa a automação em caminhos diferentes conforme uma condição. O filtro descarta o que não interessa antes de seguir adiante. Nenhum dos dois consome crédito. Todo bloco de ação que vem depois consome.

A regra prática é curta. Conte quantas ações a sua automação executa por rodada. Multiplique pelo número de rodadas no mês. Se o resultado passar de 10.000, o modelo do Make deixa de fazer sentido para você.

## Onde isso te pega

O modelo do n8n tem um preço próprio, e ele não está na fatura. Está no teclado.

Para puxar um dado de um bloco anterior no n8n, você escreve uma expressão entre chaves duplas. Algo assim: `{{ $json.body.city }}`. Não é uma linguagem de programação inteira, mas é sintaxe. Um sinal fora do lugar e o bloco para de funcionar sem explicar direito o motivo.

No Make, o mesmo trabalho é feito clicando num campo e escolhendo o dado numa lista que aparece na tela. É a diferença entre montar e escrever.

Os três pontos que costumam derrubar quem escolhe errado:

- **Lista longa no Make.** Cada item da lista multiplica o consumo de todos os blocos seguintes. Uma automação inocente pode queimar mil créditos num único disparo.
- **Expressão no n8n.** Se você nunca viu chaves duplas na vida, os primeiros dias vão ser de tentativa e erro. Reserve um fim de semana, não uma tarde.
- **O gratuito do n8n não é gratuito.** A versão Community é livre para instalar no seu próprio servidor, sem limite de execuções. Só que manter um servidor próprio é um trabalho de tecnologia da informação, com atualização, backup e conta mensal de hospedagem.

Esse último ponto merece atenção. Muita gente lê "n8n é grátis" e imagina um botão de cadastro. O grátis do n8n é o programa, não o serviço. Você precisa hospedar, atualizar e cuidar dele.

## Pra quem isso não serve

> Se você nunca montou uma automação e quer ver algo funcionando hoje, não comece pelo n8n.

Você vai gastar o entusiasmo inteiro depurando sintaxe, em vez de resolver o problema que te trouxe até aqui. Comece no Make, monte três automações que rodem de verdade e volte para esta comparação daqui a um mês.

O recorte oposto também existe. Se a sua rotina processa listas de centenas de itens todo dia, o Make não é o lugar para você ficar. Você vai passar o mês perseguindo o próprio saldo de créditos e reescrevendo automações para economizar bloco. Esse tempo custa mais que a diferença entre os dois planos.

E se você já vive dentro do Microsoft 365, olhe o Power Automate antes de assinar qualquer coisa. Se o que você quer é o caminho mais curto possível e o orçamento não é o problema, o Zapier resolve com menos cliques.

## O que fazer na segunda-feira

Não escolha pela ferramenta. Escolha pelo número. Faça esta conta antes de digitar o cartão:

1. **Escreva a automação no papel.** Gatilho, e depois cada ação, uma por linha. Conte as ações. Chame esse número de A.
2. **Estime as rodadas.** Quantas vezes por dia isso dispara? Multiplique por 30. Chame de R.
3. **Estime os itens por rodada.** Se o gatilho traz uma lista, quantos itens ela costuma ter? Chame de I.
4. **Calcule o consumo no Make.** A vezes I vezes R, mais R. É o seu gasto mensal de créditos.
5. **Compare com o consumo no n8n.** O gasto é simplesmente R execuções por mês.

Um exemplo com números redondos. Uma automação de cinco ações, disparada dez vezes por dia, com oito itens por rodada. No Make: cinco vezes oito vezes trezentas rodadas, mais trezentas, dá doze mil e trezentos créditos por mês. O Core de 10.000 créditos não cobre. No n8n seriam trezentas execuções, bem dentro do plano de 2.500.

Se o seu número der abaixo de 10.000 créditos, fique no Make e durma tranquilo. Se der acima, teste o n8n na nuvem por um mês antes de pensar em servidor próprio.

O critério de sucesso é objetivo. No fim do primeiro mês, abra o painel de consumo. Se você usou menos de 70% do plano com as automações já rodando, a escolha estava certa.

## Fontes

1. Preços, planos e regra de cobrança por ação de bloco no Make - [make.com](https://www.make.com/en/pricing)
2. Preços, planos, limite de execuções e versão Community do n8n - [n8n.io](https://n8n.io/pricing/)
3. Cálculo oficial de consumo de crédito, incluindo gatilho, roteador e filtro - [Make Academy](https://academy-content.make.com/courses/make-foundation-operations-credits/02-credit-consumption-in-make/)
4. Sintaxe de expressões e referência a blocos anteriores no n8n - [docs.n8n.io](https://docs.n8n.io/data/expressions/)

Preços e limites conferidos em 26 de agosto de 2026. Este artigo é revisado a cada 120 dias.
