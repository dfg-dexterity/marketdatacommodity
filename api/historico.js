// Função (Vercel, Node, sem dependências): série diária de contratos futuros agrícolas e do físico.
//   GET /api/historico?contratos=BGIZ26,BGIF27&ate=2026-11-19&codigo=BGI
//     contratos  até 24 códigos de futuros do catálogo (obrigatório)
//     ate        último pregão da série (padrão: hoje)
//     codigo     mercadoria cujos indicadores do físico devem vir junto (opcional)
// Fonte: Boletim Diário do Mercado, consultado por instrumento com intervalo de datas — a B3 só
// guarda os últimos 21 pregões, então a série tem no máximo esse tamanho.
// Resposta 200: { ate, fonte, contratos: { "BGIZ26": [{ data, ajuste, ultimo, minimo, maximo, negocios,
//   contratos_negociados }] }, indicadores: [{ data, simbolo, valor }] } — contrato sem dados no
//   período vem com lista vazia.
// Erros em JSON { "erro": "…" }: 400 parâmetro inválido, 502/504 quando a B3 falha.
import { dataValida, decomporTicker, hojeEmSaoPaulo, rotuloData, somarDias } from '../lib/calculos.js'
import { ErroFonte, buscarTabelaBdi, normalizarSerie, normalizarSerieDeIndicadores } from '../lib/b3.js'
import { CODIGOS } from '../lib/mercadorias.js'
import { erro, json, primeiro } from '../lib/http.js'

const MAXIMO_DE_CONTRATOS = 24
const JANELA_EM_DIAS = 45 // mais que os 21 pregões que a B3 guarda: quem corta é ela

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  const hoje = hojeEmSaoPaulo()
  const ate = String(primeiro(req.query.ate) ?? '').trim() || hoje
  if (!dataValida(ate) || ate > hoje) return erro(res, 400, 'Data inválida: use ate=AAAA-MM-DD, até hoje (ex.: ate=2026-11-19).')

  const contratos = [...new Set(String(primeiro(req.query.contratos) ?? '').toUpperCase().split(',').map((s) => s.trim()).filter(Boolean))]
  if (!contratos.length) return erro(res, 400, 'Informe os contratos: ?contratos=BGIZ26,BGIF27 (futuros agrícolas da B3, separados por vírgula).')
  if (contratos.length > MAXIMO_DE_CONTRATOS) return erro(res, 400, `Peça no máximo ${MAXIMO_DE_CONTRATOS} contratos por vez.`)
  const invalido = contratos.find((t) => !CODIGOS.has(decomporTicker(t)?.codigo))
  if (invalido) return erro(res, 400, `"${invalido}" não é um futuro agrícola coberto pela ferramenta (ex.: BGIZ26, CCMF27, SJCF27).`)

  const codigo = String(primeiro(req.query.codigo) ?? '').trim().toUpperCase()
  if (codigo && !CODIGOS.has(codigo)) return erro(res, 400, `Mercadoria inválida ("${codigo}"). Use um destes códigos: ${[...CODIGOS].join(', ')}.`)

  const de = somarDias(ate, -JANELA_EM_DIAS)
  let series, indicadores
  try {
    ;[series, indicadores] = await Promise.all([
      Promise.all(contratos.map(async (t) => [t, normalizarSerie(await buscarTabelaBdi('ConsolidatedTradesDerivatives', de, ate, { filtro: t }), t)])),
      // O físico é complemento: se falhar, a série dos contratos segue sozinha
      codigo
        ? buscarTabelaBdi('EconomicIndicators', de, ate, { filtro: codigo })
            .then((tabela) => normalizarSerieDeIndicadores(tabela, codigo))
            .catch(() => [])
        : [],
    ])
  } catch (e) {
    const status = e instanceof ErroFonte ? e.status : 502
    return erro(res, status, `Não foi possível obter o histórico até ${rotuloData(ate)}: ${e.message}.`)
  }

  json(
    res,
    { ate, fonte: 'B3 · Boletim Diário do Mercado', contratos: Object.fromEntries(series), indicadores },
    's-maxage=900, stale-while-revalidate=3600',
  )
}
