# Análise de Preço — INTERNO (não enviar ao cliente)

> Documento de raciocínio pra você, Denis. Compara o que os **USD 12.000** compravam antes com o que entra de novo (Change Order CO-01) e sugere **quanto o projeto deveria aumentar em dólar**. Todos os números são **sugestão** — você fecha o valor final a partir da sua taxa e margem.

---

## TL;DR — a recomendação

- O contrato de **USD 12.000** cobre a **loja core** (storefront + portal + admin + integração inbound de fornecedor + Stripe + tiers + os 8 módulos). É um preço **enxuto/agressivo** pra esse escopo.
- O que entra de novo (IA, Pricing v2, Partner API como plataforma) **não é "mais features na loja"** — muda a categoria do produto pra **alta escala** (inteligência de preço + distribuição B2B via API + operação com IA). Isso pede preço por **valor/escala**, não por hora.
- **Sugestão de aumento: +USD 23.000 a 28.000** (ponto recomendado **~USD 25.500**).
- **Total revisado do projeto: ~USD 37.500** (faixa 34k–40k) — cerca de **2,8× a 3,3×** o contrato original.
- **Mensalidade (§2.3) revisada: USD 900 a 1.700/mês** (vs. ~300–500 se fosse só a loja core), escalando com volume de parceiros/API/IA — inclui **infra dedicada de scraping** (worker + proxies) e manutenção por fonte.
- **Correção importante:** o benchmark de preço (M15) **não é "chamar uma API"** — é **um bot/scraping por fonte, rodando numa máquina dedicada**, complexidade **alta (XL)**. Isso puxou o Pricing v2 pra cima (ver §3) e engordou o recorrente.

---

## 1. O que os USD 12.000 compravam (a âncora)

Uma **loja single-tenant** de e-commerce, completa mas "clássica":

- Vitrine + catálogo + carrinho + checkout Stripe.
- Portal do cliente + admin dashboard.
- Integração **inbound** de fornecedor (puxar estoque).
- Pricing por tier baseado em **regra de desconto** (config do admin).
- Os 8 core modules (§1.8).

**Leitura honesta:** 12k por uma plataforma custom inteira é preço de portfólio/relacionamento. A taxa embutida (blended rate) é baixa. Isso importa: se você precificar o escopo novo na **mesma taxa baixa**, você subvaloriza justamente a parte difícil e de maior valor. Não ancore o novo no rate do velho.

---

## 2. O que entra de novo — e por que é "veia de alta escala"

| Item (CO-01) | Complexidade | Por que é alta escala / alto valor |
|---|---|---|
| **A.1 — Swarm de IA** | Muito alta (XL) | Subsistema inteiro: orquestrador + 4 agentes + guardrails + eval. Opera o negócio, não é feature de tela. Risco alto (ação autônoma) = engenharia cara. |
| **A.2 — Pricing Engine v2** | Muito alta (XL) | 5 integrações de marketplace + engine de benchmark + CTIA + flag queue + custo recorrente de dados. **É o que define TODA a margem** — leverage direto no lucro do cliente. |
| **A.3 — Partner API (plataforma)** | Alta (L–XL) | De "integrar SmartPay/Qpay" (isso é escopo base) pra **plataforma multi-parceiro**: keys, margem por parceiro, webhooks, masking. Isso **gera receita** pro cliente (canal B2B/atacado). |
| **A.4 — Recebimento de pedido por parceiro** | Alta (XL) | Cada parceiro faz pedido pela **API dele**; a gente se adapta a cada spec. Um adapter por parceiro, escala variável. Espelho do lado de fornecedor. |

O ponto central: esses itens transformam OMP de **loja** em **plataforma** — inteligência de preço, distribuição B2B por API e operação com IA. Trabalho de escala/B2B/API/IA vale mais por hora do que uma vitrine de varejo. É legítimo cobrar prêmio.

**Importante separar (não cobrar duas vezes):** integrar **SmartPay e Qpay** já está no contrato base (§1.4) — **não entra na conta nova**. O que entra é só a **plataforma genérica** por cima desses dois.

---

## 3. Duas lentes de preço

### Lente A — "custo-plus" (piso, e é subvalorizado)
Se você precificasse o escopo novo pela **mesma taxa enxuta** do contrato base:
- ~+**USD 3.000 a 4.500**.
- **Não recomendo.** Isso repete o rate de portfólio na parte mais difícil e de maior risco. É o chão absoluto, só use se relacionamento > margem.

### Lente B — valor + complexidade (recomendada)
Precificando cada item pelo que ele realmente é (subsistema de alta escala, risco financeiro, valor recorrente):

| Item | Faixa sugerida (one-time) | Ponto recomendado | Esforço aprox. |
|---|---|---|---|
| A.1 Swarm de IA | USD 5.000 – 7.000 | **6.000** | ~20–30 dev-dias |
| A.2a Pricing — engine/waterfall (M14) | USD 4.000 – 5.500 | **4.500** | ~15–20 dev-dias |
| A.2b Pricing — bots & scraping (M15) · **alta** | USD 5.000 – 8.000 | **6.000** | ~20–30 dev-dias |
| A.3 Partner API (plataforma) | USD 4.000 – 6.000 | **4.500** | ~15–20 dev-dias |
| A.4 Recebimento de pedido por parceiro (M28) · **alta** | USD 4.000 – 6.000 | **4.500** | ~15–25 dev-dias |
| **Total novo (one-time)** | **USD 22.000 – 32.500** | **~25.500** | ~85–125 dev-dias |

> **Por que o Pricing v2 foi dividido:** o engine (M14, a "cascata" de margem) é trabalho contido e previsível. Os **bots/scraping (M15)** são a parte cara e frágil — **uma operação por fonte** (login, proxy, anti-bot), rodando numa máquina dedicada, com manutenção recorrente. Separar deixa claro pro cliente onde mora o custo — e permite ele **fasear**.
>
> **A.4 escala por parceiro.** O valor acima cobre o **serviço de recebimento (dual-mode) + o 1º adapter** (ex.: SmartPay). Cada **parceiro adicional** que exige a gente adaptar à API *dele* = **+USD 2.000 – 3.500 por adapter** (custo variável, vira Change Order a partir do 3º cliente, §1.4). É o espelho do lado de fornecedor: a gente não controla a spec, o parceiro dita.

> Observação: o total novo é **maior que os 12k do base** — e isso é o sinal correto. O escopo novo é mais engenharia, mais risco e mais valor do que o contrato original inteiro.

---

## 4. Total revisado e impacto no prazo

| | USD |
|---|---|
| Contrato base (§2.1) | 12.000 |
| + Escopo novo (recomendado) | ~25.500 |
| **Total revisado do projeto** | **~37.500** (faixa 34.000 – 40.000) |
| Múltiplo sobre o original | **~2,8× – 3,3×** |

**Prazo:** os itens somam ~85–125 dev-dias (o scraping do M15 e o recebimento por-parceiro do M28 puxaram pra cima). Em série depois do base, o prazo de 120 dias **mais que dobra**; em paralelo com um segundo dev, some ~11–16 semanas ao cronograma. Registre a extensão day-for-day (§3.3) no CO-01.

---

## 5. Mensalidade (§2.3) — o recorrente sobe também

O escopo novo traz custo e operação contínuos que a loja core não tinha:

| Componente | Faixa mensal |
|---|---|
| Base (hosting, Sentry/PostHog, e-mail/SMS) | ~USD 200 – 400 |
| **Infra dedicada de scraping** (worker + pool de proxies) | ~USD 150 – 400 |
| Manutenção por fonte (bots quebram quando o site muda) | ~USD 150 – 350 |
| Uso de modelo de IA (swarm) | ~USD 100 – 500 (variável por volume) |
| Infra extra p/ Partner API + batch noturno | ~USD 150 – 300 |
| **Mensalidade sugerida** | **USD 900 – 1.700 / mês** |

Sugestão: cobrar um **piso** (ex. USD 1.000/mês) + repasse dos custos variáveis de IA/proxies acima de uma franquia, ou faixas por volume de parceiros/chamadas. Os **bots de scraping (M15) são o maior driver de recorrente** — não é "entrega e esquece", é operação contínua. Formalizar no addendum da §2.3.

---

## 6. Como apresentar o aumento (enquadramento)

- **Não** venda como "ficou mais caro". Venda como **mudança de categoria**: "o contrato construiu a loja; o CO-01 constrói a **plataforma de distribuição + inteligência de preço + operação com IA**."
- Amarre no **retorno do cliente**: a Partner API é **canal de receita** (SmartPay/atacado); o Pricing v2 **protege e otimiza a margem** dele todo dia. O preço se paga.
- Deixe os **itens independentes** no CO-01 (já estão) — o cliente pode faseá-los. Se travar no orçamento, entrega A.2 (pricing, paga-se sozinho) primeiro, o resto depois.
- Use o **mapa mental** (barras de complexidade + marca vermelha de fora-de-escopo) como material visual da conversa — mostra em segundos por que o CO-01 é trabalho pesado.

---

## 7. Ressalvas

- **Tudo aqui é sugestão.** Os dev-dias são âncoras de esforço, não a sua planilha de custo. Feche os valores pela sua taxa e margem antes de colocar no CO-01.
- Confirme o custo real do agregador de dados (A.2) com uma cotação antes de fixar a mensalidade.
- O rate do contrato base é baixo — considere se o CO-01 é o momento de **realinhar sua taxa** pra o valor real, já que o cliente está expandindo o escopo por vontade própria (a Pricing v2 é deck deles, a SmartPay é demanda deles).
- Se o cliente recusar o valor cheio, o **piso da Lente A (+~USD 3–4,5k)** existe — mas deixe explícito internamente que abaixo disso você está subsidiando trabalho de alta escala.
