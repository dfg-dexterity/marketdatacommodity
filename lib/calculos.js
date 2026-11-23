// Datas, vencimentos, curva e base — funções puras, usadas pela página e pelas funções de /api.
// Sem dependências e sem nada do Node: este arquivo é importado pelo navegador.

/** Letra do mês de vencimento nos códigos de futuros (padrão de mercado). */
export const LETRAS_MES = { F: 1, G: 2, H: 3, J: 4, K: 5, M: 6, N: 7, Q: 8, U: 9, V: 10, X: 11, Z: 12 }
export const NOMES_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const doisDigitos = (n) => String(n).padStart(2, '0')

// ---------------------------------------------------------------- datas (AAAA-MM-DD, sem fuso)

export function dataValida(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ''))
  if (!m) return false
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]
}

const paraUtc = (s) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)))
const deUtc = (d) => `${d.getUTCFullYear()}-${doisDigitos(d.getUTCMonth() + 1)}-${doisDigitos(d.getUTCDate())}`

export function somarDias(data, n) {
  const d = paraUtc(data)
  d.setUTCDate(d.getUTCDate() + n)
  return deUtc(d)
}

export function diasEntre(de, ate) {
  return Math.round((paraUtc(ate) - paraUtc(de)) / 86400000)
}

export function fimDeSemana(data) {
  const dia = paraUtc(data).getUTCDay()
  return dia === 0 || dia === 6
}

/** Hoje no fuso de São Paulo, como AAAA-MM-DD. */
export function hojeEmSaoPaulo(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora)
}

/** "2026-11-19" → "19/11/2026" */
export function rotuloData(data) {
  return dataValida(data) ? `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}` : '—'
}

/** "2026-11-19" → "19/11" (eixo de gráfico) */
export function rotuloDataCurta(data) {
  return dataValida(data) ? `${data.slice(8, 10)}/${data.slice(5, 7)}` : '—'
}

/** Os n dias de semana anteriores a `data` (sem ela), do mais recente para o mais antigo. */
export function diasDeSemanaAntes(data, n) {
  const saida = []
  let d = data
  while (saida.length < n) {
    d = somarDias(d, -1)
    if (!fimDeSemana(d)) saida.push(d)
  }
  return saida
}

// ---------------------------------------------------------------- vencimentos

/** "BGIZ26" → { codigo: "BGI", mes: 12, ano: 2026, vencimento: "2026-12" }; null se não for futuro padrão. */
export function decomporTicker(ticker) {
  const m = /^([A-Z0-9]{3})([FGHJKMNQUVXZ])(\d{2})$/.exec(String(ticker ?? '').trim().toUpperCase())
  if (!m) return null
  const mes = LETRAS_MES[m[2]]
  const ano = 2000 + Number(m[3])
  return { codigo: m[1], mes, ano, vencimento: `${ano}-${doisDigitos(mes)}` }
}

/** "2026-12" ou "2026-12-30" → "dez/2026" */
export function rotuloVencimento(vencimento) {
  const m = /^(\d{4})-(\d{2})/.exec(String(vencimento ?? ''))
  if (!m || +m[2] < 1 || +m[2] > 12) return '—'
  return `${NOMES_MES[+m[2] - 1]}/${m[1]}`
}

/**
 * Símbolo de referência da B3, com um dígito de ano: "YKF7 - Ajuste" → { prefixo: "YK", letra: "F",
 * mes: 1, ano: 2027, vencimento: "2027-01", tipo: "Ajuste", codigo: "YKF7" }.
 * O ano é o primeiro terminado naquele dígito a partir do ano anterior ao da data de referência.
 */
export function decomporReferencia(simbolo, dataRef) {
  const m = /^([A-Z]{2,4}?)([FGHJKMNQUVXZ])(\d)\s*-\s*(Spot|Ajuste)$/i.exec(String(simbolo ?? '').trim())
  if (!m) return null
  const anoRef = dataValida(dataRef) ? Number(dataRef.slice(0, 4)) : new Date().getUTCFullYear()
  let ano = Math.floor(anoRef / 10) * 10 + Number(m[3])
  if (ano < anoRef - 1) ano += 10
  const letra = m[2].toUpperCase()
  const mes = LETRAS_MES[letra]
  const tipo = m[4][0].toUpperCase() + m[4].slice(1).toLowerCase()
  return { prefixo: m[1].toUpperCase(), letra, mes, ano, vencimento: `${ano}-${doisDigitos(mes)}`, tipo, codigo: `${m[1].toUpperCase()}${letra}${m[3]}` }
}

export function ordenarContratos(contratos) {
  return [...contratos].sort((a, b) => (a.vencimento < b.vencimento ? -1 : a.vencimento > b.vencimento ? 1 : a.ticker < b.ticker ? -1 : 1))
}

// ---------------------------------------------------------------- preços

const numero = (x) => typeof x === 'number' && Number.isFinite(x)

/** Variação entre dois preços: { abs, pct }, ou nulos quando falta um deles. */
export function variacao(atual, anterior) {
  if (!numero(atual) || !numero(anterior)) return { abs: null, pct: null }
  return { abs: atual - anterior, pct: anterior !== 0 ? (atual / anterior - 1) * 100 : null }
}

/** Base = preço físico − preço futuro (negativa: o físico está abaixo do futuro). */
export function base(fisico, futuro) {
  return variacao(fisico, futuro)
}

/**
 * Curva de um pregão: os contratos com ajuste, em ordem de vencimento, cada um com a diferença para o
 * primeiro vencimento (abs e %) e, quando há dias úteis nos dois, a taxa implícita ao ano (base 252)
 * entre o primeiro vencimento e ele.
 *   contratos   [{ ticker, vencimento, ajuste }]
 *   cadastro    { [ticker]: { dias_uteis } }  (opcional)
 */
export function montarCurva(contratos, cadastro = {}) {
  const pontos = ordenarContratos(contratos.filter((c) => numero(c.ajuste)))
  if (!pontos.length) return []
  const primeiro = pontos[0]
  const du0 = cadastro[primeiro.ticker]?.dias_uteis
  return pontos.map((c, i) => {
    const dif = variacao(c.ajuste, primeiro.ajuste)
    const du = cadastro[c.ticker]?.dias_uteis
    let taxa = null
    if (i > 0 && numero(du) && numero(du0) && du > du0 && primeiro.ajuste > 0 && c.ajuste > 0) {
      taxa = ((c.ajuste / primeiro.ajuste) ** (252 / (du - du0)) - 1) * 100
    }
    return { ...c, diferenca: i === 0 ? null : dif.abs, diferenca_pct: i === 0 ? null : dif.pct, taxa_aa: taxa }
  })
}

/** Resumo da inclinação: último vencimento contra o primeiro. */
export function inclinacao(curva) {
  if (curva.length < 2) return null
  const primeiro = curva[0]
  const ultimo = curva[curva.length - 1]
  const v = variacao(ultimo.ajuste, primeiro.ajuste)
  return { primeiro, ultimo, abs: v.abs, pct: v.pct, sentido: v.abs > 0 ? 'ascendente' : v.abs < 0 ? 'descendente' : 'plana' }
}
