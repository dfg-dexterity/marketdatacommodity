# Cotação de Commodities Agrícolas — regras do repositório

- Tudo em português do Brasil: textos da tela, comentários, nomes de funções e variáveis, mensagens de erro.
- Escopo: **só commodities agrícolas** (futuros do segmento de agronegócio da B3). Metais, energia e
  financeiros ficam de fora.
- Fontes: **B3** — Boletim Diário do Mercado (`arquivos.b3.com.br/bdi`), que é a fonte principal, e
  Pesquisa por Pregão (arquivo SPRD), só para pregões fora dos 21 que o boletim guarda. Não
  acrescentar outra fonte sem combinar. O **CEPEA** entra só pelo widget oficial, em `iframe`
  isolado: os dados são CC BY-NC 4.0 — não ler o widget no servidor, não reaproveitar os valores em
  cálculo e não levar para as exportações.
- O catálogo (código, unidade, tamanho do contrato, indicadores do físico, referência no exterior,
  grupos do CEPEA) fica **só** em `lib/mercadorias.js`, importado pelas funções e pela página. Não
  duplicar lista de mercadorias no `index.html`. Conferir dado novo no Cadastro de instrumentos e na
  tabela de indicadores do Boletim Diário antes de escrever.
- Parse e cálculos são funções puras em `lib/` (`b3.js`, `calculos.js`) com teste em `tests/`
  (amostras reais em `tests/fixtures/`, sem rede). Rodar `npm test` antes de entregar.
- `lib/calculos.js` e `lib/mercadorias.js` rodam no navegador: nada de `node:` neles. `lib/b3.js`,
  `lib/zip.js` e `lib/http.js` são só das funções.
- Nas tabelas da B3, achar a coluna pelo nome, nunca pela posição.
- As funções devolvem erro em JSON `{ "erro": "…" }` (400/404/502/504), nunca 200 enganoso. Valor
  que a B3 não publica fica `null` — nunca zero.
- Não afirmar o que a B3 não diz: nome de indicador segue a descrição dela; conversão de unidade e
  convenção de cálculo ficam explicadas ao lado da tabela.
- Arquivos comuns que **não se editam aqui** (são cópias idênticas em outros repositórios):
  `assets/dexterity.css`, `assets/moldura.js`, `assets/favicon.svg`, `assets/dexterity-logo.svg`,
  `scripts/dev.mjs`, `site/casca-site.html`, `vercel.json`. O `site/build.mjs` também é do kit: a
  entrada `commodities-agricolas` do CATALOGO, da VITRINE e do RODAPE tem de ser replicada nos demais
  repositórios antes de republicar a vitrine.
- Depois de gerar arquivo, `Moldura.aviso(texto)`. `localStorage` sempre protegido por try/catch.
- Página do site: editar `site/paginas/commodities-agricolas.json` e rodar `npm run site`; nunca
  editar o HTML gerado nem a página no Odoo. Os campos `categoria`, `titulo`, `descricaoCartao` e
  `etiquetas` têm de bater com o CATALOGO de `site/build.mjs`.
- Visual: paleta e regras de `assets/dexterity.css` (cerceta = alta, âmbar = baixa, vermelho só erro,
  roxo nota, cantos retos); conferir a 390 px sem rolagem horizontal e em `?embed=1`.
- Servidor local: `npm run dev` (ou `PORT=8151 npm run dev`). Reiniciar ao mudar arquivo de `lib/`.
