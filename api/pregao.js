// Função (Vercel, Node, sem dependências): futuros agrícolas de um pregão da B3.
//   GET /api/pregao?data=2026-11-19
// Fonte: Boletim Diário do Mercado (negócios consolidados + posições em aberto), que responde rápido
// mas só guarda os últimos 21 pregões. Fora dessa janela a função recorre ao arquivo SPRD da Pesquisa
// por Pregão (de 2022 em diante), que a B3 costuma demorar ~40 s para entregar.
// Resposta 200: { data, origem: "boletim" | "arquivo", fonte, atualizado_em, contratos: [{ ticker,
//   codigo, vencimento, abertura, minimo, maximo, medio, ultimo, ajuste, ajuste_anterior, variacao,
//   variacao_pct, contratos_em_aberto, variacao_em_aberto, negocios, contratos_negociados, volume,
//   ajuste_por_contrato, moeda }] } — todas as mercadorias do catálogo, por código e vencimento.
//   No arquivo, contratos_negociados, volume, ajuste_por_contrato e variacao_em_aberto vêm nulos e a
//   posição em aberto é a de antes do pregão.
// Erros em JSON { "erro": "…" }: 400 data inválida, 404 sem pregão na data, 502/504 quando a B3 falha.
import { dataValida, diasEntre, hojeEmSaoPaulo, rotuloData } from '../lib/calculos.js'
import { ErroFonte, baixarPregao, buscarTabelaBdi, comPosicoes, normalizarNegocios, normalizarPosicoes, parsearPregao, xmlDoPregao } from '../lib/b3.js'
import { cacheDoPregao, cacheDoVazio, erro, json, primeiro } from '../lib/http.js'

const PRIMEIRA_DATA = '2022-01-03'
// 21 pregões cabem em pouco mais de 30 dias corridos: até aqui, "sem dados" no boletim é dia sem pregão
const DIAS_SEGUROS_NO_BOLETIM = 20

async function doBoletim(data) {
  const [negocios, posicoes] = await Promise.all([
    buscarTabelaBdi('ConsolidatedTradesDerivatives', data),
    // Complemento: os futuros ficam nas duas primeiras páginas das posições (as opções vêm depois).
    // Se a B3 mudar a ordem ou a tabela falhar, a coluna só fica vazia.
    buscarTabelaBdi('OpenPositionsEquities', data, data, { maxPaginas: 2 })
      .then(normalizarPosicoes)
      .catch(() => ({})),
  ])
  const contratos = normalizarNegocios(negocios).map(({ data: _data, ...c }) => c)
  // Antes do fechamento a tabela do dia já existe, mas sem preço de ajuste: ainda não é um pregão
  if (!contratos.some((c) => c.ajuste !== null)) return null
  return { contratos: comPosicoes(contratos, posicoes), atualizado_em: negocios.atualizado_em }
}

async function doArquivo(data) {
  const zip = await baixarPregao(data)
  const xml = zip && xmlDoPregao(zip)
  if (!xml) return null
  const lido = parsearPregao(xml)
  if (!lido.contratos.length) return null
  if (lido.data && lido.data !== data) throw new ErroFonte(`a B3 devolveu o pregão de ${rotuloData(lido.data)} no arquivo pedido`)
  return { contratos: lido.contratos, atualizado_em: null }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  const data = String(primeiro(req.query.data) ?? '').trim()
  if (!dataValida(data)) return erro(res, 400, 'Informe a data do pregão: ?data=AAAA-MM-DD (ex.: data=2026-11-19).')
  const hoje = hojeEmSaoPaulo()
  if (data > hoje) return erro(res, 400, `A data ${rotuloData(data)} ainda não aconteceu.`)
  if (data < PRIMEIRA_DATA) return erro(res, 400, `A B3 só publica estes dados de ${rotuloData(PRIMEIRA_DATA)} em diante.`)

  const recente = diasEntre(data, hoje) <= DIAS_SEGUROS_NO_BOLETIM
  let resultado = null
  let origem = 'boletim'
  let falhaDoBoletim = null
  try {
    resultado = await doBoletim(data)
  } catch (e) {
    falhaDoBoletim = e
  }
  // Fora da janela do boletim (ou com o boletim fora do ar), o arquivo histórico
  if (!resultado && (!recente || falhaDoBoletim)) {
    origem = 'arquivo'
    try {
      resultado = await doArquivo(data)
    } catch (e) {
      const status = e instanceof ErroFonte ? e.status : 502
      return erro(res, status, `Não foi possível obter o pregão de ${rotuloData(data)}: ${(falhaDoBoletim ?? e).message}.`)
    }
  }
  if (!resultado) {
    return erro(
      res,
      404,
      `Sem pregão em ${rotuloData(data)}: fim de semana, feriado ou dados ainda não publicados pela B3 (saem depois do fechamento).`,
      cacheDoVazio(data, hoje),
    )
  }

  json(
    res,
    {
      data,
      origem,
      fonte: origem === 'boletim' ? 'B3 · Boletim Diário do Mercado' : 'B3 · Pesquisa por Pregão (arquivo histórico)',
      atualizado_em: resultado.atualizado_em,
      contratos: resultado.contratos,
    },
    cacheDoPregao(data, hoje),
  )
}
