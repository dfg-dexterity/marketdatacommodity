// Função (Vercel, Node, sem dependências): vencimento exato dos futuros agrícolas listados na B3.
//   GET /api/contratos
// Fonte: Cadastro de instrumentos do Boletim Diário, no último pregão publicado. Serve para a curva
// (dias úteis até o vencimento) — a página funciona sem ela, usando só o mês do código do contrato.
// Resposta 200: { data, fonte, contratos: { "BGIZ26": { codigo, vencimento, dias_uteis, dias_corridos,
//   multiplicador, moeda, entrega }, … } }.
// Erro em JSON { "erro": "…" } (502/504) quando o Boletim Diário falha.
import { hojeEmSaoPaulo } from '../lib/calculos.js'
import { ErroFonte, buscarPregoesBdi, buscarTabelaBdi, normalizarCadastro } from '../lib/b3.js'
import { erro, json } from '../lib/http.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const hoje = hojeEmSaoPaulo()
  try {
    // O cadastro do dia só sai depois do fechamento: tenta os pregões mais recentes em ordem
    const datas = (await buscarPregoesBdi(hoje)).filter((d) => d <= hoje).slice(0, 4)
    for (const data of datas) {
      const contratos = normalizarCadastro(await buscarTabelaBdi('InstrumentsDerivatives', data))
      if (Object.keys(contratos).length) {
        return json(res, { data, fonte: 'B3 · Boletim Diário do Mercado · Cadastro de instrumentos', contratos }, 's-maxage=21600, stale-while-revalidate=86400')
      }
    }
  } catch (e) {
    return erro(res, e instanceof ErroFonte ? e.status : 502, `Não foi possível obter o cadastro de contratos: ${e.message}.`)
  }
  erro(res, 502, 'A B3 não devolveu o cadastro de contratos nos últimos pregões.')
}
