// Apoio comum às funções de /api: parâmetros, erros em JSON e cabeçalhos de cache.
import { diasEntre, hojeEmSaoPaulo } from './calculos.js'

export function primeiro(v) {
  return Array.isArray(v) ? v[0] : v
}

/** Erro sempre em JSON { "erro": "…" } — nunca um 200 enganoso. `cache` em segundos (0 = no-store). */
export function erro(res, status, mensagem, cache = 0) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', cache > 0 ? `s-maxage=${cache}` : 'no-store')
  res.status(status).json({ erro: mensagem })
}

export function json(res, corpo, cache) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', cache)
  res.status(200).json(corpo)
}

/**
 * Pregão antigo não muda: um dia de cache na borda e uma semana servindo enquanto revalida.
 * Nos últimos dias a B3 ainda republica o arquivo, então o cache é curto.
 */
export function cacheDoPregao(data, hoje = hojeEmSaoPaulo()) {
  return diasEntre(data, hoje) > 4 ? 's-maxage=86400, stale-while-revalidate=604800' : 's-maxage=900, stale-while-revalidate=3600'
}

/** "Sem arquivo" numa data antiga é feriado e não muda; numa data recente o arquivo ainda pode sair. */
export function cacheDoVazio(data, hoje = hojeEmSaoPaulo()) {
  return diasEntre(data, hoje) > 4 ? 86400 : 300
}
