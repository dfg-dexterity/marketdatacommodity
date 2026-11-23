# Cotação de Commodities Agrícolas — boi, milho, soja, café e etanol na B3

App estático + serverless (Vercel) que consulta os **dados públicos da B3** e mostra os futuros
agrícolas — boi gordo, milho, soja do CME Group, soja FOB Santos, café arábica, café conilon e
etanol hidratado — com a **tabela do pregão**, a **curva de preços** por vencimento, o **mercado
físico** com a base contra o futuro, as **referências no exterior** (soja no CME Group, café na
ICE), as **praças do CEPEA** e o **histórico** de cada contrato, com exportação CSV/XLSX.

Mesma família dos apps `cotacaomoedas` (Cotação de Moedas), `taxas-indices` (Indicadores
Econômicos), `bndes-um` (Moedas BNDES), `ibge` (Séries IBGE) e `cotacao-titulos-publicos` (Dados de
Mercado da Dexterity IT Solutions).

| Endereço | Para quê |
| --- | --- |
| **https://www.dexterityit.com.br/commodities-agricolas** | Página do site (Odoo) com a ferramenta incorporada — endereço público e canônico. Gerada a partir de `site/`. No ar desde 23/11/2026. |
| **https://cotacao-commodities.vercel.app** | A aplicação em si (projeto `cotacao-commodities` do time `dexterityit` na Vercel, ligado ao GitHub `dfg-dexterity/marketdatacommodity`), usada no `iframe` da página do site. No ar desde 23/11/2026. |

## Mercadorias

Catálogo único em `lib/mercadorias.js` — as funções e a página importam o mesmo arquivo. Tamanho do
contrato, moeda e liquidação conferidos no Cadastro de instrumentos da B3 em 19/11/2026.

| Mercadoria (`?mercadoria=`) | Código | Cotação | Contrato | Liquidação | Físico publicado pela B3 | Referência no exterior |
| --- | --- | --- | --- | --- | --- | --- |
| Boi gordo (`boi`) | BGI | R$/@ | 330 arrobas líquidas | financeira | `RTBGI` cotação do dia · `BGILIQ` média de 5 (São Paulo) | — |
| Milho (`milho`) | CCM | R$/saca | 450 sacas de 60 kg | financeira | `IAMILAVR$` à vista · `IAMILPZR$` a prazo · `IAMILPZVPZ` prazo médio · `CNILIQ` média de 3 (Campinas) | — |
| Soja CME (`soja`) | SJC | US$/saca | 450 sacas de 60 kg | financeira | — | `YK…` soja no CME Group, US¢/bushel |
| Soja FOB Santos (`soja-santos`) | SOY | US$/t | 34 toneladas | financeira | `SOYMD` média de divulgação (Santos) | `SSL…` preço de referência, US$/t |
| Café arábica (`cafe-arabica`) | ICF | US$/saca | 100 sacas de 60 kg | entrega física | — | `KC…` contrato C da ICE, US¢/lb |
| Café conilon (`cafe-conilon`) | CNL | R$/saca | 100 sacas de 60 kg | entrega física | — | — |
| Etanol hidratado (`etanol`) | ETH | R$/m³ | 30 m³ | financeira | `RTETHAVR$/M3` à vista · `ALPPHLIQ` média de 5 (Paulínia) | — |

O preço de liquidação da B3 é a média das últimas cotações do indicador do dia (cinco no boi e no
etanol, três no milho) — conferido nas séries de 21/10 a 19/11/2026. Indicador novo que a B3
publicar para um contrato aparece sozinho na tabela do físico, com a descrição da própria B3.

Conversões das referências: soja, bushel de 60 libras (27,2155 kg) → `US¢/bu ÷ 100 × 2,204623` =
US$/saca; café, saca de 132,277 libras → `US¢/lb ÷ 100 × 132,277` = US$/saca. Reais pelo dólar que
a B3 divulga às 16h para liquidação em D+1 (`RTDOLD1`), o mesmo dos contratos.

## Fontes

| Fonte | O que sai dela | Limite |
| --- | --- | --- |
| **Boletim Diário do Mercado (BDI)** — `arquivos.b3.com.br/bdi/table/<tabela>/<de>/<até>/<página>/<linhas>`, POST com corpo `{}`; `?filter=<código em base64>` traz um só instrumento | `ConsolidatedTradesDerivatives` (pregão), `OpenPositionsEquities` (posição em aberto no fim do dia), `EconomicIndicators` (físico, referências, dólar), `InstrumentsDerivatives` (vencimento exato, dias úteis), `workdays` (calendário) | Só os **últimos 21 pregões**. Responde em 1–4 s. |
| **Pesquisa por Pregão** — `www.b3.com.br/pesquisapregao/download?filelist=SPRDaammdd.zip,` | ZIP com outro ZIP dentro e o XML de preços de derivativos (BVBG.187) | De **2022** em diante, mas a B3 costuma levar **~40 s** por arquivo. Sem volume; a posição em aberto é a de antes do pregão. Só entra para datas fora do BDI (ou se o BDI falhar). |
| **Widget do CEPEA** — `www.cepea.org.br/br/widgetproduto.js.php` | Indicadores por praça, no quadro "Praças" | Mostrado pelo widget oficial ("Cotações do Cepea no seu site"), num `iframe` isolado (`sandbox` sem `allow-same-origin`). Dados do CEPEA, licença **CC BY-NC 4.0**: não são lidos pelas funções nem entram nas exportações. |

Ficaram de fora, em 23/11/2026: **CONAB** (preços semanais por município) — os servidores
`portaldeinformacoes.conab.gov.br` e `consultaprecosdemercado.conab.gov.br` estavam com certificado de
outro domínio e os arquivos antigos `PrecosSemanal*.txt` respondiam 403; vale retomar quando voltar.
**CBOT e ICE direto** — sem fonte oficial gratuita; entram só os preços de ajuste que a B3 publica.

## Estrutura

- `index.html` — página única sem build (Chart.js 4.4.1 por CDN; SheetJS xlsx 0.18.5 baixado sob
  demanda na primeira exportação). O script do app é `<script type="module">` e importa
  `lib/mercadorias.js` e `lib/calculos.js`.
- `lib/mercadorias.js` — catálogo das mercadorias e dos grupos do widget do CEPEA (fonte única).
- `lib/calculos.js` — datas, código do contrato, curva, base e variação (funções puras; roda no navegador).
- `lib/b3.js` — acesso ao BDI e à Pesquisa por Pregão e normalização das respostas (só no servidor).
- `lib/zip.js` — leitor mínimo de ZIP com `node:zlib` (o arquivo da B3 é um ZIP dentro de outro).
- `lib/http.js` — erros em JSON e cabeçalhos de cache das funções.
- `api/*.js` — funções da Vercel (Node, sem dependências).
- `assets/` — `dexterity.css`, logo e favicon (comuns aos apps) e `moldura.js` (conversa com a página do site no iframe).
- `tests/` — `node --test` com amostras reais da B3 em `tests/fixtures/` (sem rede).
- `scripts/dev.mjs` — servidor local com as funções de `/api` (arquivo comum, não editar aqui).
- `site/` — kit do site: `build.mjs`, `casca-site.html` (comuns) e `paginas/commodities-agricolas.json`.

## API

```
GET /api/pregao?data=2026-11-19                              futuros agrícolas de um pregão
GET /api/indicadores?data=2026-11-19                         físico, referências e dólar da data
GET /api/historico?contratos=BGIZ26,BGIF27&ate=2026-11-19&codigo=BGI   séries de até 21 pregões
GET /api/contratos                                           vencimento exato e dias úteis
GET /api/pregoes                                             calendário recente de pregões
```

`/api/pregao` responde, em ordem de mercadoria e vencimento:

```json
{
  "data": "2026-11-19", "origem": "boletim", "fonte": "B3 · Boletim Diário do Mercado",
  "atualizado_em": "2026-11-19T22:12:29.44",
  "contratos": [{
    "ticker": "BGIZ26", "codigo": "BGI", "vencimento": "2026-12",
    "abertura": 409.4, "minimo": 408.95, "maximo": 410.8, "medio": 409.89, "ultimo": 409.65,
    "ajuste": 409.75, "ajuste_anterior": 409.35, "variacao": 0.4, "variacao_pct": 0.097716,
    "contratos_em_aberto": 19535, "variacao_em_aberto": 391, "negocios": 1274,
    "contratos_negociados": 2253, "volume": 304751254.5, "ajuste_por_contrato": 132, "moeda": "BRL"
  }]
}
```

- Só futuros (código de seis caracteres) das mercadorias do catálogo: opções, rolagens e os demais
  segmentos ficam de fora.
- `origem: "arquivo"` quando a data está fora dos 21 pregões do BDI: `contratos_negociados`,
  `volume`, `ajuste_por_contrato` e `variacao_em_aberto` vêm nulos e `contratos_em_aberto` é a
  posição de antes do pregão.
- Antes do fechamento a tabela do dia já existe no BDI, mas sem preço de ajuste: a função responde
  404 até a B3 publicar o ajuste.
- As colunas das tabelas da B3 são achadas pelo **nome**, nunca pela posição.
- Erros em JSON `{ "erro": "…" }`: **400** parâmetro inválido, **404** sem pregão ou sem dados na
  data, **502/504** quando a B3 falha — nunca um 200 enganoso.
- Cache na borda: pregão com mais de 4 dias, `s-maxage=86400`; recente, `s-maxage=900` (a B3
  republica); 404 recente, 5 minutos. `Access-Control-Allow-Origin: *`.

A posição em aberto vem das duas primeiras páginas de `OpenPositionsEquities` (os futuros ficam
antes das opções); se a B3 mudar a ordem, a coluna fica vazia e o resto segue.

## Cálculos

- **Variação**: ajuste − ajuste do pregão anterior, em valor e em %.
- **Base**: indicador do físico − ajuste do 1º vencimento (negativa = físico abaixo do futuro).
- **Curva**: diferença de cada vencimento para o primeiro e **taxa implícita a.a.** =
  `(ajuste ÷ ajuste do 1º)^(252 ÷ dias úteis entre os dois) − 1`, com os dias úteis do cadastro da
  B3. Em commodity ela mistura juro, armazenagem e safra: compara vencimentos, não é taxa de juros.
- **Em R$** (contratos em dólar): cada curva pelo dólar B3 do seu próprio pregão.
- **1º vencimento contínuo** (histórico): em cada pregão, o contrato de vencimento mais próximo com ajuste.

Funções em `lib/calculos.js`, com teste.

## Parâmetros de URL (incorporação e links diretos)

| Parâmetro | Efeito |
| --- | --- |
| `?embed=1` | Modo incorporado, para `iframe` no site (Odoo), no Notion ou na intranet: sem faixa de título e sem a parte de links do rodapé. Com `assets/moldura.js`, a altura do iframe acompanha o conteúdo e os avisos de arquivo gerado aparecem na página do site. |
| `?mercadoria=milho` | Abre na mercadoria: id do catálogo (`boi`, `milho`, `soja`, `soja-santos`, `cafe-arabica`, `cafe-conilon`, `etanol`) ou código da B3 (`BGI`, `CCM`…). |
| `?data=2026-11-19` | Abre no pregão da data (de 03/01/2022 em diante). |
| `?comparar=semana` | Curva de comparação: `nenhum`, `anterior` (padrão), `semana` (5 pregões) ou `mes` (20 pregões). |

Mercadoria, comparação e moeda ficam lembradas no navegador (`localStorage`, protegido por try/catch).

## Desenvolvimento

```
npm test        # node --test tests/*.test.mjs (sem rede)
npm run dev     # http://localhost:8080 com as funções de /api buscando a B3 de verdade
PORT=8151 npm run dev
```

Node 20 ou mais novo; sem dependências. Ao mudar arquivo de `lib/`, reinicie o servidor local (ele
recarrega as funções de `api/`, mas não os módulos que elas importam).

## Publicação no site (Odoo)

Segue a MK-02-004, opção A (página no Odoo com a casca padrão e a aplicação em `iframe`). O conteúdo
da página fica em `site/paginas/commodities-agricolas.json` — o repositório é a fonte da verdade:

```
npm run site    # node site/build.mjs
```

| Arquivo gerado | Onde entra |
| --- | --- |
| `site/odoo-pagina-commodities-agricolas.html` | Página `/commodities-agricolas` inteira, num único bloco Código Incorporado. |
| `site/odoo-pagina-ferramentas.html` | Vitrine `/ferramentas` (kit comum), já com o cartão desta ferramenta. |
| `site/odoo-rodape-ferramentas.html` | Coluna "Ferramentas" do rodapé das demais páginas (kit comum). |

SEO da página no painel **Otimizar SEO** do Odoo:

- **Título:** `Cotação de commodities agrícolas: boi, milho, soja e café na B3`
- **Descrição:** `Boi gordo, milho, soja, café e etanol na B3: preços do pregão, curva de vencimentos, base contra o mercado físico, praças do CEPEA e histórico, com Excel e CSV.`

A Vercel serve `/site/*` com `Access-Control-Allow-Origin: https://www.dexterityit.com.br`: a sessão do
Odoo no navegador lê o bloco publicado direto da Vercel (conferindo o SHA-256 com o arquivo local, sem o
comentário do início) e grava com `ir.ui.view.save(valor, '/t[1]/t[1]/div[1]')` no idioma pt_BR — o mesmo
caminho do editor, que gera as duas cópias do Código Incorporado.

Publicada em 23/11/2026: página criada com `website.new_page` (view **6148**, key
`website.commodities-agricolas`, `website.page` **48**), título e descrição de SEO gravados em pt_BR e
item **55** "Commodities Agrícolas" no menu do Odoo, em Dados de Mercado. Conferida sem sessão (HTTP 200,
título, descrição, canonical, `iframe` e rodapé). Não havia página anterior, então não há backup.

**Kit comum.** Antes de publicar, a vitrine `/ferramentas` foi capturada de novo (23/11/2026): a casca
do site tinha mudado depois de 15/11 (e-mail como link na chamada final e no rodapé) e o rodapé publicado
já trazia Conversor de Taxas e Indicadores Econômicos. No mesmo dia, o `site/casca-site.html` e o
`site/build.mjs` daqui, acrescidos da entrada da Cotação de Metais, foram replicados nos dez repositórios
do kit (quatro `new-mtm-*`, `cotacao-titulos-publicos`, `bndes-um`, `ibge`, `conversor`, este e
`marketdatacommoditymetals`), e a vitrine `/ferramentas` (view 5704) e a coluna "Ferramentas" do rodapé
das demais páginas foram republicadas no Odoo com o cartão e o link desta ferramenta. Backups das 24
views alteradas: views inativas 6149 a 6172 (`<key>_backup_20261123`).

**Pendente**: pedir a indexação no Search Console (o `/sitemap.xml` do Odoo é cache e leva até 12 horas
para incluir a página).

## Identidade visual

Tema escuro único da Dexterity IT Solutions — base `#1B1B1B`, off-white `#F7F3E7`, cerceta
`#009994` (destaque `#00B3AC`), âmbar `#FFA436`, roxo `#98569A`. Tipografia Barlow Condensed
(títulos, caixa alta), Figtree (texto) e IBM Plex Mono (rótulos e números). Cantos retos, cartões
com fio de 1px, sem sombra. Cor tem sentido: cerceta = alta, âmbar = baixa, vermelho só para erro,
roxo para nota. No gráfico da curva, cerceta é o pregão escolhido, off-white tracejado é a
comparação e âmbar é o físico.

Os tokens e o chrome vivem em `assets/dexterity.css`, mantido **idêntico** nos apps de Dados de
Mercado. Estilos próprios desta ferramenta ficam no `<style>` do `index.html`.

## Deploy

Projeto **`cotacao-commodities`** no time **`dexterityit`** da Vercel, ligado ao repositório
`dfg-dexterity/marketdatacommodity`: cada push na `main` publica em produção e cada PR ganha um
preview. Sem build: a Vercel serve os arquivos estáticos da raiz (inclusive `lib/`, que a página
importa) e as funções de `api/` (`vercel.json`: região `gru1`, `maxDuration` 60 s,
`frame-ancestors *`, `noindex` em `/api/` e `/site/`). Sem variáveis de ambiente.

## Próximos passos possíveis

- **Histórico além de 21 pregões**: uma rotina diária que guarde o pregão do dia (o BDI apaga depois
  de 21 pregões e o arquivo histórico é lento).
- **Carga no SAP**: definir o layout de preços de commodities (DCS) antes de gerar arquivo — o
  F2610 dos outros apps é de taxas e câmbio.
- **Praças por município**: CONAB, quando os servidores voltarem.
