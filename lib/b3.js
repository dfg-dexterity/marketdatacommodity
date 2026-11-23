// Leitura dos dados públicos da B3 — só nas funções de /api (usa lib/zip.js, que é do Node).
//
//   Boletim Diário (BDI)  https://arquivos.b3.com.br/bdi/table/<tabela>/<de>/<até>/<página>/<linhas>
//                         POST com corpo "{}" e, para um só instrumento, ?filter=<código em base64>.
//                         Responde em JSON, rápido, mas só guarda os últimos 21 pregões. Tabelas:
//                           ConsolidatedTradesDerivatives  negócios consolidados do pregão
//                           OpenPositionsEquities          posições em aberto (no fim do pregão)
//                           EconomicIndicators             indicadores (físico, referências, dólar)
//                           InstrumentsDerivatives         cadastro (vencimento exato, dias úteis)
//   Pesquisa por Pregão   https://www.b3.com.br/pesquisapregao/download?filelist=SPRDaammdd.zip,
//                         ZIP com outro ZIP dentro e o XML de preços de derivativos (BVBG.187, uma
//                         mensagem <PricRpt> por instrumento). Vai de 2022 em diante, mas a B3
//                         costuma levar ~40 s para responder: fica só para pregões fora do BDI.
//
// O parse é feito por funções puras, testadas em tests/b3.test.mjs com amostras reais.
import { listarZip, extrairDoZip } from './zip.js'
import { CODIGOS, SIMBOLO_DOLAR, mercadoriaDe } from './mercadorias.js'
import { decomporReferencia, decomporTicker, ordenarContratos, variacao } from './calculos.js'

export class ErroFonte extends Error {
  constructor(mensagem, status = 502) {
    super(mensagem)
    this.name = 'ErroFonte'
    this.status = status
  }
}

const CABECALHOS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Accept: '*/*',
}

// ---------------------------------------------------------------- pregão (Pesquisa por Pregão)

/**
 * XML do pregão a partir do ZIP baixado. A B3 entrega um ZIP com outro ZIP dentro; quando o pregão
 * foi republicado há mais de um XML e vale o último (o nome traz o número de geração, crescente).
 * Devolve null para o ZIP vazio que a B3 manda quando não houve pregão na data.
 */
export function xmlDoPregao(zip) {
  let buf = zip
  for (let nivel = 0; nivel < 3; nivel++) {
    let entradas
    try {
      entradas = listarZip(buf).filter((e) => !e.nome.endsWith('/'))
    } catch (e) {
      throw new ErroFonte(`a B3 respondeu algo que não é um ZIP (${e.message})`)
    }
    if (!entradas.length) return null
    const xmls = entradas.filter((e) => /\.xml$/i.test(e.nome)).sort((a, b) => (a.nome < b.nome ? -1 : 1))
    try {
      if (xmls.length) return extrairDoZip(buf, xmls[xmls.length - 1]).toString('utf8')
      const interno = entradas.find((e) => /\.zip$/i.test(e.nome))
      if (!interno) break
      buf = extrairDoZip(buf, interno)
    } catch (e) {
      throw new ErroFonte(`não foi possível abrir o arquivo da B3 (${e.message})`)
    }
  }
  throw new ErroFonte('o arquivo da B3 não traz o XML de preços')
}

const RE_PRICRPT = /<PricRpt>([\s\S]*?)<\/PricRpt>/g
const reTag = (nome) => new RegExp(`<${nome}(?:\\s[^>]*)?>([^<]*)</${nome}>`)
const TAGS = Object.fromEntries(
  ['TckrSymb', 'Dt', 'OpnIntrst', 'FrstPric', 'MinPric', 'MaxPric', 'TradAvrgPric', 'LastPric', 'RglrTxsQty', 'AdjstdQt', 'PrvsAdjstdQt'].map((t) => [t, reTag(t)]),
)
const RE_MOEDA = /<(?:AdjstdQt|LastPric|FrstPric)\s+Ccy="([A-Z]{3})"/

function texto(bloco, tag) {
  const m = TAGS[tag].exec(bloco)
  const t = m ? m[1].trim() : ''
  return t === '' ? null : t
}
function valor(bloco, tag) {
  const t = texto(bloco, tag)
  if (t === null) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
// Tira o resíduo de ponto flutuante das diferenças (409.75 − 409.35 = 0.39999999999997726)
const arredondar = (x) => (x === null ? null : Math.round(x * 1e6) / 1e6)

/**
 * Futuros das mercadorias do catálogo no XML do pregão. Opções, rolagens e os demais mercados ficam
 * de fora: só passam códigos de seis caracteres (mercadoria + letra do mês + ano).
 * Devolve { data, contratos } com os contratos em ordem de mercadoria e vencimento.
 */
export function parsearPregao(xml, codigos = CODIGOS) {
  let data = null
  const contratos = []
  for (const m of xml.matchAll(RE_PRICRPT)) {
    const bloco = m[1]
    const ticker = texto(bloco, 'TckrSymb')
    const partes = decomporTicker(ticker)
    if (!partes || !codigos.has(partes.codigo)) continue
    data ??= texto(bloco, 'Dt')
    const ajuste = valor(bloco, 'AdjstdQt')
    const anterior = valor(bloco, 'PrvsAdjstdQt')
    const v = variacao(ajuste, anterior)
    contratos.push({
      ticker,
      codigo: partes.codigo,
      vencimento: partes.vencimento,
      abertura: valor(bloco, 'FrstPric'),
      minimo: valor(bloco, 'MinPric'),
      maximo: valor(bloco, 'MaxPric'),
      medio: valor(bloco, 'TradAvrgPric'),
      ultimo: valor(bloco, 'LastPric'),
      ajuste,
      ajuste_anterior: anterior,
      variacao: arredondar(v.abs),
      variacao_pct: arredondar(v.pct),
      // no arquivo, a posição em aberto é a de antes do pregão (o BDI traz a do fim do dia)
      contratos_em_aberto: valor(bloco, 'OpnIntrst'),
      variacao_em_aberto: null,
      negocios: valor(bloco, 'RglrTxsQty'),
      contratos_negociados: null,
      volume: null,
      ajuste_por_contrato: null,
      moeda: RE_MOEDA.exec(bloco)?.[1] ?? null,
    })
  }
  return { data, contratos: porMercadoriaEVencimento(contratos) }
}

function porMercadoriaEVencimento(contratos) {
  const porCodigo = new Map()
  for (const c of contratos) porCodigo.set(c.codigo, [...(porCodigo.get(c.codigo) ?? []), c])
  return [...porCodigo.keys()].sort().flatMap((codigo) => ordenarContratos(porCodigo.get(codigo)))
}

export function nomeDoArquivoDoPregao(data) {
  return `SPRD${data.slice(2, 4)}${data.slice(5, 7)}${data.slice(8, 10)}.zip`
}

/** Baixa o arquivo do pregão. Devolve null quando a B3 não tem arquivo para a data. */
export async function baixarPregao(data, { tempoLimite = 50000 } = {}) {
  const arquivo = nomeDoArquivoDoPregao(data)
  let r
  try {
    r = await fetch(`https://www.b3.com.br/pesquisapregao/download?filelist=${arquivo},`, {
      headers: CABECALHOS,
      signal: AbortSignal.timeout(tempoLimite),
    })
  } catch (e) {
    throw new ErroFonte(e?.name === 'TimeoutError' ? 'a B3 não respondeu a tempo' : `falha ao consultar a B3 (${e.message})`, 504)
  }
  if (!r.ok) throw new ErroFonte(`a B3 respondeu HTTP ${r.status} para ${arquivo}`)
  const corpo = Buffer.from(await r.arrayBuffer())
  // Todo ZIP começa com "PK"; outra coisa (HTML de erro, vazio) é arquivo indisponível
  if (corpo.length < 22 || corpo[0] !== 0x50 || corpo[1] !== 0x4b) return null
  return corpo
}

// ---------------------------------------------------------------- Boletim Diário (BDI)

const BDI = 'https://arquivos.b3.com.br/bdi/table'

async function paginaBdi(tabela, de, ate, pagina, linhas, filtro, tempoLimite) {
  const consulta = filtro ? `?filter=${Buffer.from(filtro).toString('base64')}` : ''
  let r
  try {
    r = await fetch(`${BDI}/${tabela}/${de}/${ate}/${pagina}/${linhas}${consulta}`, {
      method: 'POST',
      headers: { ...CABECALHOS, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(tempoLimite),
    })
  } catch (e) {
    throw new ErroFonte(e?.name === 'TimeoutError' ? 'o Boletim Diário da B3 não respondeu a tempo' : `falha ao consultar o Boletim Diário da B3 (${e.message})`, 504)
  }
  if (!r.ok) throw new ErroFonte(`o Boletim Diário da B3 respondeu HTTP ${r.status}`)
  let corpo
  try {
    corpo = await r.json()
  } catch {
    throw new ErroFonte('o Boletim Diário da B3 respondeu algo que não é JSON')
  }
  if (!corpo?.table || !Array.isArray(corpo.table.columns) || !Array.isArray(corpo.table.values)) {
    throw new ErroFonte('o Boletim Diário da B3 respondeu fora do formato esperado')
  }
  return corpo
}

/**
 * Tabela do BDI entre duas datas (a mesma data nas duas pontas = um pregão):
 * { colunas, linhas, paginas, atualizado_em }. As páginas seguintes vêm em paralelo.
 *   filtro      código exato de um instrumento (ou do ativo, na tabela de indicadores)
 *   maxPaginas  para tabelas enormes em que só o começo interessa
 */
export async function buscarTabelaBdi(tabela, de, ate = de, { filtro = '', linhas = 1000, maxPaginas = 40, tempoLimite = 30000 } = {}) {
  const primeira = await paginaBdi(tabela, de, ate, 1, linhas, filtro, tempoLimite)
  const paginas = Number(primeira.table.pageCount) || 1
  const quantas = Math.min(paginas, maxPaginas)
  const demais = await Promise.all(Array.from({ length: Math.max(0, quantas - 1) }, (_, i) => paginaBdi(tabela, de, ate, i + 2, linhas, filtro, tempoLimite)))
  return {
    colunas: primeira.table.columns.map((c) => c.name),
    linhas: [primeira, ...demais].flatMap((p) => p.table.values),
    paginas,
    atualizado_em: primeira.lastUpdateDate ?? null,
  }
}

/** Últimos pregões do calendário da B3 (inclui o dia de hoje, mesmo antes de haver arquivo). */
export async function buscarPregoesBdi(hoje, { tempoLimite = 20000 } = {}) {
  let r
  try {
    r = await fetch(`${BDI}/workdays?date=${hoje}`, { headers: CABECALHOS, signal: AbortSignal.timeout(tempoLimite) })
  } catch (e) {
    throw new ErroFonte(e?.name === 'TimeoutError' ? 'o Boletim Diário da B3 não respondeu a tempo' : `falha ao consultar o Boletim Diário da B3 (${e.message})`, 504)
  }
  if (!r.ok) throw new ErroFonte(`o Boletim Diário da B3 respondeu HTTP ${r.status}`)
  let lista
  try {
    lista = await r.json()
  } catch {
    throw new ErroFonte('o Boletim Diário da B3 respondeu algo que não é JSON')
  }
  if (!Array.isArray(lista)) throw new ErroFonte('o Boletim Diário da B3 respondeu fora do formato esperado')
  return normalizarPregoes(lista)
}

/** ["2026-11-19T00:00:00", …] → ["2026-11-19", …], sem repetição, do mais recente para o mais antigo. */
export function normalizarPregoes(lista) {
  const datas = lista.map((d) => String(d).slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  return [...new Set(datas)].sort().reverse()
}

// As colunas são achadas pelo nome, nunca pela posição: a B3 muda a ordem sem avisar.
function indices(colunas, nomes, tabela) {
  const idx = {}
  for (const n of nomes) {
    idx[n] = colunas.indexOf(n)
    if (idx[n] < 0) throw new ErroFonte(`a tabela ${tabela} da B3 veio sem a coluna ${n}`)
  }
  return idx
}

const numeroOuNulo = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null)
const dataDaLinha = (x) => String(x ?? '').slice(0, 10)

/**
 * Futuros das mercadorias do catálogo na tabela de negócios consolidados (ConsolidatedTradesDerivatives).
 * Opções, rolagens e os demais segmentos ficam de fora. Cada contrato sai com a data do pregão, no
 * mesmo formato de parsearPregao — a posição em aberto vem de outra tabela (normalizarPosicoes).
 */
export function normalizarNegocios({ colunas, linhas }, codigos = CODIGOS) {
  const i = indices(
    colunas,
    ['RptDt', 'TckrSymb', 'SgmtNm', 'Mkt', 'OpenPric', 'MinPric', 'MaxPric', 'TradAvrgPric', 'LastPric', 'AdjstdQt', 'PrvsAdjstdQt', 'AdjstdValCtrct', 'TradQty', 'FinInstrmQty', 'NtlFinVol'],
    'ConsolidatedTradesDerivatives',
  )
  const contratos = []
  for (const l of linhas) {
    if (l[i.SgmtNm] !== 'AGRIBUSINESS' || l[i.Mkt] !== 'FUTURE') continue
    const ticker = String(l[i.TckrSymb] ?? '').trim()
    const partes = decomporTicker(ticker)
    if (!partes || !codigos.has(partes.codigo)) continue
    const ajuste = numeroOuNulo(l[i.AdjstdQt])
    const anterior = numeroOuNulo(l[i.PrvsAdjstdQt])
    const v = variacao(ajuste, anterior)
    contratos.push({
      data: dataDaLinha(l[i.RptDt]),
      ticker,
      codigo: partes.codigo,
      vencimento: partes.vencimento,
      abertura: numeroOuNulo(l[i.OpenPric]),
      minimo: numeroOuNulo(l[i.MinPric]),
      maximo: numeroOuNulo(l[i.MaxPric]),
      medio: numeroOuNulo(l[i.TradAvrgPric]),
      ultimo: numeroOuNulo(l[i.LastPric]),
      ajuste,
      ajuste_anterior: anterior,
      variacao: arredondar(v.abs),
      variacao_pct: arredondar(v.pct),
      contratos_em_aberto: null,
      variacao_em_aberto: null,
      negocios: numeroOuNulo(l[i.TradQty]),
      contratos_negociados: numeroOuNulo(l[i.FinInstrmQty]),
      volume: numeroOuNulo(l[i.NtlFinVol]),
      ajuste_por_contrato: arredondar(numeroOuNulo(l[i.AdjstdValCtrct])),
      moeda: mercadoriaDe(partes.codigo)?.moeda ?? null,
    })
  }
  return porMercadoriaEVencimento(contratos)
}

/** Posições em aberto dos futuros do catálogo (OpenPositionsEquities): { [ticker]: { contratos_em_aberto, variacao_em_aberto } }. */
export function normalizarPosicoes({ colunas, linhas }, codigos = CODIGOS) {
  const i = indices(colunas, ['TckrSymb', 'OpnIntrst', 'VartnOpnIntrst'], 'OpenPositionsEquities')
  const posicoes = {}
  for (const l of linhas) {
    const ticker = String(l[i.TckrSymb] ?? '').trim()
    const partes = decomporTicker(ticker)
    if (!partes || !codigos.has(partes.codigo)) continue
    posicoes[ticker] = { contratos_em_aberto: numeroOuNulo(l[i.OpnIntrst]), variacao_em_aberto: numeroOuNulo(l[i.VartnOpnIntrst]) }
  }
  return posicoes
}

/** Junta a posição em aberto aos contratos do pregão (quem não tem posição fica com nulo). */
export function comPosicoes(contratos, posicoes) {
  return contratos.map((c) => ({ ...c, ...(posicoes?.[c.ticker] ?? {}) }))
}

/**
 * Série de um contrato na tabela de negócios consultada com filtro e intervalo de datas:
 * [{ data, ajuste, ultimo, minimo, maximo, negocios, contratos_negociados }] em ordem de data,
 * só os pregões em que houve preço de ajuste.
 */
export function normalizarSerie(tabela, ticker) {
  return normalizarNegocios(tabela, new Set([ticker.slice(0, 3)]))
    .filter((c) => c.ticker === ticker && c.ajuste !== null)
    .sort((a, b) => (a.data < b.data ? -1 : 1))
    .map((c) => ({ data: c.data, ajuste: c.ajuste, ultimo: c.ultimo, minimo: c.minimo, maximo: c.maximo, negocios: c.negocios, contratos_negociados: c.contratos_negociados }))
}

/**
 * Série dos indicadores do físico de uma mercadoria (EconomicIndicators com filtro e intervalo):
 * [{ data, simbolo, valor }] em ordem de data. Os preços de referência por vencimento ficam de fora.
 */
export function normalizarSerieDeIndicadores({ colunas, linhas }, codigo) {
  const i = indices(colunas, ['RptDt', 'TckrSymb', 'IndcSymb', 'IndxVal'], 'EconomicIndicators')
  const vistos = new Set()
  const saida = []
  for (const l of linhas) {
    const simbolo = String(l[i.IndcSymb] ?? '').trim()
    const data = dataDaLinha(l[i.RptDt])
    const v = numeroOuNulo(l[i.IndxVal])
    if (String(l[i.TckrSymb] ?? '').trim() !== codigo || !simbolo || v === null || simbolo === SIMBOLO_DOLAR) continue
    if (decomporReferencia(simbolo, data) || vistos.has(`${data}|${simbolo}`)) continue
    vistos.add(`${data}|${simbolo}`)
    saida.push({ data, simbolo, valor: v })
  }
  return saida.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0))
}

/**
 * Indicadores das mercadorias do catálogo (tabela EconomicIndicators).
 * Devolve { dolar, indicadores: [{ codigo, simbolo, descricao, valor }] }, sem linhas repetidas.
 */
export function normalizarIndicadores({ colunas, linhas }, codigos = CODIGOS) {
  const i = indices(colunas, ['TckrSymb', 'IndcSymb', 'IndcDesc', 'IndxVal'], 'EconomicIndicators')
  let dolar = null
  const vistos = new Set()
  const indicadores = []
  for (const l of linhas) {
    const codigo = String(l[i.TckrSymb] ?? '').trim()
    const simbolo = String(l[i.IndcSymb] ?? '').trim()
    const v = typeof l[i.IndxVal] === 'number' && Number.isFinite(l[i.IndxVal]) ? l[i.IndxVal] : null
    if (simbolo === SIMBOLO_DOLAR && v !== null) dolar ??= v
    if (!codigos.has(codigo) || !simbolo || v === null || simbolo === SIMBOLO_DOLAR) continue
    const chave = `${codigo}|${simbolo}`
    if (vistos.has(chave)) continue
    vistos.add(chave)
    indicadores.push({ codigo, simbolo, descricao: String(l[i.IndcDesc] ?? '').replace(/\s+/g, ' ').trim(), valor: v })
  }
  return { dolar, indicadores }
}

/**
 * Futuros das mercadorias do catálogo no Cadastro de instrumentos (tabela InstrumentsDerivatives):
 * { [ticker]: { codigo, vencimento: "AAAA-MM-DD", dias_uteis, dias_corridos, multiplicador, moeda, entrega } }.
 */
export function normalizarCadastro({ colunas, linhas }, codigos = CODIGOS) {
  const i = indices(colunas, ['TckrSymb', 'Asst', 'XprtnDt', 'WrkgDays', 'ClnrDays', 'CtrctMltplr', 'TradgCcy', 'DlvryTpNm'], 'InstrumentsDerivatives')
  const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null)
  const contratos = {}
  for (const l of linhas) {
    const ticker = String(l[i.TckrSymb] ?? '').trim()
    const partes = decomporTicker(ticker)
    if (!partes || !codigos.has(partes.codigo) || String(l[i.Asst] ?? '').trim() !== partes.codigo) continue
    const vencimento = String(l[i.XprtnDt] ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimento)) continue
    contratos[ticker] = {
      codigo: partes.codigo,
      vencimento,
      dias_uteis: num(l[i.WrkgDays]),
      dias_corridos: num(l[i.ClnrDays]),
      multiplicador: num(l[i.CtrctMltplr]),
      moeda: l[i.TradgCcy] ?? null,
      entrega: l[i.DlvryTpNm] ?? null,
    }
  }
  return contratos
}
