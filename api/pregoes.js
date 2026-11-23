// Função (Vercel, Node, sem dependências): calendário recente de pregões da B3.
//   GET /api/pregoes
// Resposta 200: { hoje, datas: ["2026-11-23", "2026-11-19", …] } — cerca de 30 pregões, do mais
// recente para o mais antigo. O dia de hoje entra mesmo antes de a B3 publicar o arquivo: a página
// tenta as datas em ordem até achar a primeira com dados.
// Erro em JSON { "erro": "…" } (502/504) quando o Boletim Diário falha; a página então usa os dias de semana.
import { hojeEmSaoPaulo } from '../lib/calculos.js'
import { ErroFonte, buscarPregoesBdi } from '../lib/b3.js'
import { erro, json } from '../lib/http.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const hoje = hojeEmSaoPaulo()
  let datas
  try {
    datas = (await buscarPregoesBdi(hoje)).filter((d) => d <= hoje)
  } catch (e) {
    return erro(res, e instanceof ErroFonte ? e.status : 502, `Não foi possível obter o calendário de pregões: ${e.message}.`)
  }
  if (!datas.length) return erro(res, 502, 'A B3 devolveu o calendário de pregões vazio.')
  json(res, { hoje, datas }, 's-maxage=900, stale-while-revalidate=3600')
}
