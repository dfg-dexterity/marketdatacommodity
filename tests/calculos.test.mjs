// node --test — funções puras de lib/calculos.js.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  base, dataValida, decomporReferencia, decomporTicker, diasDeSemanaAntes, diasEntre, fimDeSemana, hojeEmSaoPaulo,
  inclinacao, montarCurva, ordenarContratos, rotuloData, rotuloDataCurta, rotuloVencimento, somarDias, variacao,
} from '../lib/calculos.js'
import { cacheDoPregao, cacheDoVazio } from '../lib/http.js'

test('datas', () => {
  assert.ok(dataValida('2026-11-19'))
  assert.ok(dataValida('2028-02-29'))
  for (const ruim of ['2026-02-30', '2026-13-01', '19/11/2026', '', null, '2026-1-1']) assert.equal(dataValida(ruim), false)
  assert.equal(somarDias('2026-12-31', 1), '2027-01-01')
  assert.equal(somarDias('2026-03-01', -1), '2026-02-28')
  assert.equal(diasEntre('2026-11-19', '2026-11-23'), 4)
  assert.equal(fimDeSemana('2026-11-21'), true)
  assert.equal(fimDeSemana('2026-11-23'), false)
  assert.equal(rotuloData('2026-11-19'), '19/11/2026')
  assert.equal(rotuloDataCurta('2026-11-19'), '19/11')
  assert.equal(rotuloData('x'), '—')
  // 02:30 UTC ainda é o dia anterior em São Paulo
  assert.equal(hojeEmSaoPaulo(new Date('2026-11-23T02:30:00Z')), '2026-11-22')
})

test('dias de semana anteriores pulam sábado e domingo', () => {
  assert.deepEqual(diasDeSemanaAntes('2026-11-23', 3), ['2026-11-20', '2026-11-19', '2026-11-18'])
})

test('código do contrato', () => {
  assert.deepEqual(decomporTicker('BGIZ26'), { codigo: 'BGI', mes: 12, ano: 2026, vencimento: '2026-12' })
  assert.deepEqual(decomporTicker('ccmf27'), { codigo: 'CCM', mes: 1, ano: 2027, vencimento: '2027-01' })
  // opção sobre futuro, rolagem e letra que não é mês
  for (const nao of ['BGIZ26C041200', 'MR1H27K27', 'BGIA26', 'BGI', '', null]) assert.equal(decomporTicker(nao), null)
  assert.equal(rotuloVencimento('2026-12'), 'dez/2026')
  assert.equal(rotuloVencimento('2027-01-15'), 'jan/2027')
  assert.equal(rotuloVencimento('2027-13'), '—')
})

test('símbolo de referência com um dígito de ano', () => {
  assert.deepEqual(decomporReferencia('YKF7 - Ajuste', '2026-11-19'), { prefixo: 'YK', letra: 'F', mes: 1, ano: 2027, vencimento: '2027-01', tipo: 'Ajuste', codigo: 'YKF7' })
  assert.equal(decomporReferencia('KCZ6 - Spot', '2026-11-19').vencimento, '2026-12')
  assert.equal(decomporReferencia('KCZ6 - Spot', '2026-11-19').tipo, 'Spot')
  // dígito 0 em 2026 é 2030, não 2020
  assert.equal(decomporReferencia('YKN0 - Ajuste', '2026-11-19').vencimento, '2030-07')
  // contrato que venceu no ano anterior ainda aparece em janeiro
  assert.equal(decomporReferencia('KCZ6 - Ajuste', '2027-01-05').ano, 2026)
  // prefixo de três letras cuja terceira não é mês
  assert.deepEqual(
    [decomporReferencia('SSLH7 - Ajuste', '2026-11-19').prefixo, decomporReferencia('SSLH7 - Ajuste', '2026-11-19').vencimento],
    ['SSL', '2027-03'],
  )
  for (const nao of ['RTBGI', 'SOYMD', 'IAMILAVR$', '', null]) assert.equal(decomporReferencia(nao, '2026-11-19'), null)
})

test('variação e base', () => {
  assert.deepEqual(variacao(110, 100), { abs: 10, pct: 10.000000000000009 })
  assert.deepEqual(variacao(null, 100), { abs: null, pct: null })
  assert.deepEqual(variacao(5, 0), { abs: 5, pct: null })
  // físico abaixo do futuro: base negativa
  const b = base(396.44, 409.75)
  assert.ok(Math.abs(b.abs + 13.31) < 1e-9 && b.pct < 0)
})

test('curva: ordem, diferença para o primeiro vencimento e taxa implícita', () => {
  const contratos = [
    { ticker: 'CCMH27', vencimento: '2027-03', ajuste: 76.93 },
    { ticker: 'CCMF27', vencimento: '2027-01', ajuste: 71.48 },
    { ticker: 'CCMK27', vencimento: '2027-05', ajuste: null },
  ]
  assert.deepEqual(ordenarContratos(contratos).map((c) => c.ticker), ['CCMF27', 'CCMH27', 'CCMK27'])
  const curva = montarCurva(contratos, { CCMF27: { dias_uteis: 36 }, CCMH27: { dias_uteis: 75 } })
  assert.equal(curva.length, 2) // sem ajuste não entra
  assert.equal(curva[0].diferenca, null)
  assert.ok(Math.abs(curva[1].diferenca - 5.45) < 1e-9)
  assert.ok(Math.abs(curva[1].diferenca_pct - 7.6245) < 0.001)
  // (76,93 / 71,48) ^ (252 / 39) − 1
  assert.ok(Math.abs(curva[1].taxa_aa - ((76.93 / 71.48) ** (252 / 39) - 1) * 100) < 1e-9)
  // sem dias úteis não há taxa
  assert.equal(montarCurva(contratos)[1].taxa_aa, null)
  const inc = inclinacao(curva)
  assert.equal(inc.sentido, 'ascendente')
  assert.equal(inc.ultimo.ticker, 'CCMH27')
  assert.equal(inclinacao(curva.slice(0, 1)), null)
  assert.deepEqual(montarCurva([]), [])
})

test('cache: pregão antigo fica um dia na borda; recente, quinze minutos', () => {
  assert.match(cacheDoPregao('2026-11-19', '2026-11-23'), /^s-maxage=900,/)
  assert.match(cacheDoPregao('2026-11-10', '2026-11-23'), /^s-maxage=86400,/)
  assert.equal(cacheDoVazio('2026-11-20', '2026-11-23'), 300)
  assert.equal(cacheDoVazio('2026-09-07', '2026-11-23'), 86400)
})
