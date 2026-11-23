// Função (Vercel, Node, sem dependências): indicadores de commodities que a B3 publica no Boletim Diário.
//   GET /api/indicadores?data=2026-11-19
// Traz o mercado físico (boi, milho, etanol, soja FOB Santos), os preços de ajuste dos contratos de
// referência no exterior (soja no CME Group, café na ICE) e o dólar que a B3 usa na conversão.
// A B3 só mantém os últimos 21 pregões nesta tabela.
// Resposta 200: { data, fonte, atualizado_em, dolar, indicadores: [{ codigo, simbolo, descricao, valor }] }.
// Erros em JSON { "erro": "…" }: 400 data inválida, 404 sem indicadores na data, 502/504 quando a B3 falha.
import { dataValida, hojeEmSaoPaulo, rotuloData } from '../lib/calculos.js'
import { ErroFonte, buscarTabelaBdi, normalizarIndicadores } from '../lib/b3.js'
import { cacheDoVazio, erro, json, primeiro } from '../lib/http.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  const data = String(primeiro(req.query.data) ?? '').trim()
  if (!dataValida(data)) return erro(res, 400, 'Informe a data: ?data=AAAA-MM-DD (ex.: data=2026-11-19).')
  const hoje = hojeEmSaoPaulo()
  if (data > hoje) return erro(res, 400, `A data ${rotuloData(data)} ainda não aconteceu.`)

  let tabela
  try {
    tabela = await buscarTabelaBdi('EconomicIndicators', data)
  } catch (e) {
    const status = e instanceof ErroFonte ? e.status : 502
    return erro(res, status, `Não foi possível obter os indicadores de ${rotuloData(data)}: ${e.message}.`)
  }

  let resultado
  try {
    resultado = normalizarIndicadores(tabela)
  } catch (e) {
    return erro(res, 502, `Não foi possível ler os indicadores de ${rotuloData(data)}: ${e.message}.`)
  }
  if (!resultado.indicadores.length) {
    return erro(
      res,
      404,
      `Sem indicadores em ${rotuloData(data)}: a B3 só mantém os últimos 21 pregões, e não há dados em fim de semana ou feriado.`,
      cacheDoVazio(data, hoje),
    )
  }

  json(
    res,
    {
      data,
      fonte: 'B3 · Boletim Diário do Mercado · Indicadores econômicos',
      atualizado_em: tabela.atualizado_em,
      dolar: resultado.dolar,
      indicadores: resultado.indicadores,
    },
    's-maxage=1800, stale-while-revalidate=21600',
  )
}
