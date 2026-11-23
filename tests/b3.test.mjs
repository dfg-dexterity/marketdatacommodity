// node --test — sem rede: amostras reais da B3 (pregão de 19/11/2026) em tests/fixtures/.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ErroFonte, comPosicoes, nomeDoArquivoDoPregao, normalizarCadastro, normalizarIndicadores, normalizarNegocios, normalizarPosicoes,
  normalizarPregoes, normalizarSerie, normalizarSerieDeIndicadores, parsearPregao, xmlDoPregao,
} from '../lib/b3.js'
import { listarZip } from '../lib/zip.js'
import { CODIGOS, MERCADORIAS, GRUPOS_CEPEA, grupoCepeaDe, mercadoriaDe } from '../lib/mercadorias.js'

const fixture = (nome) => readFileSync(new URL(`./fixtures/${nome}`, import.meta.url))
const tabela = (nome) => JSON.parse(fixture(nome))
const xml = fixture('pregao-amostra.xml').toString('utf8')

// ---------------------------------------------------------------- arquivo histórico (Pesquisa por Pregão)

test('ZIP da B3: abre o ZIP de dentro e fica com o último XML', () => {
  const zip = fixture('SPRD-amostra.zip')
  assert.deepEqual(listarZip(zip).map((e) => e.nome), ['SPRD261119.zip'])
  const lido = xmlDoPregao(zip)
  // o XML mais antigo do mesmo pregão traz o BGIZ26 com ajuste 400; vale o republicado (409,75)
  assert.equal(parsearPregao(lido).contratos.find((c) => c.ticker === 'BGIZ26').ajuste, 409.75)
  assert.equal(lido, xml)
})

test('ZIP vazio (dia sem pregão) devolve null; lixo vira ErroFonte', () => {
  assert.equal(xmlDoPregao(fixture('SPRD-vazio.zip')), null)
  assert.throws(() => xmlDoPregao(Buffer.from('<html>erro</html> e mais um pouco de texto')), ErroFonte)
})

test('arquivo: só futuros do catálogo, por mercadoria e vencimento', () => {
  const { data, contratos } = parsearPregao(xml)
  assert.equal(data, '2026-11-19')
  assert.deepEqual(
    contratos.map((c) => c.ticker),
    ['BGIX26', 'BGIZ26', 'BGIK27', 'CCMF27', 'CCMH27', 'CNLX26', 'ETHZ26', 'ETHK27', 'ICFZ26', 'SJCF27', 'SOYH27'],
  )
  // dólar, DI, peso argentino, opção sobre futuro e rolagem ficam de fora
  for (const c of contratos) assert.ok(CODIGOS.has(c.codigo) && c.ticker.length === 6)
})

test('arquivo: campos do contrato', () => {
  const boi = parsearPregao(xml).contratos.find((c) => c.ticker === 'BGIZ26')
  assert.deepEqual(boi, {
    ticker: 'BGIZ26',
    codigo: 'BGI',
    vencimento: '2026-12',
    abertura: 409.4,
    minimo: 408.95,
    maximo: 410.8,
    medio: 409.89,
    ultimo: 409.65,
    ajuste: 409.75,
    ajuste_anterior: 409.35,
    variacao: 0.4,
    variacao_pct: 0.097716,
    contratos_em_aberto: 19144, // posição de antes do pregão; o boletim traz a do fim do dia (19.535)
    variacao_em_aberto: null,
    negocios: 1274,
    contratos_negociados: null,
    volume: null,
    ajuste_por_contrato: null,
    moeda: 'BRL',
  })
  const soja = parsearPregao(xml).contratos.find((c) => c.ticker === 'SJCF27')
  assert.equal(soja.moeda, 'USD')
  assert.equal(soja.ajuste, 26.6204)
  assert.equal(soja.variacao, -0.2039)
})

test('arquivo: contrato sem negócio fica com nulos, não com zero', () => {
  const semNegocio = parsearPregao(xml).contratos.find((c) => c.ticker === 'SOYH27')
  assert.equal(semNegocio.ultimo, null)
  assert.equal(semNegocio.negocios, null)
  assert.equal(semNegocio.ajuste, 434.6)
})

// ---------------------------------------------------------------- Boletim Diário

test('boletim: negócios consolidados só com futuros do catálogo, por mercadoria e vencimento', () => {
  const contratos = normalizarNegocios(tabela('negocios-amostra.json'))
  assert.deepEqual(
    contratos.map((c) => c.ticker),
    ['BGIX26', 'BGIZ26', 'BGIK27', 'CCMF27', 'CCMH27', 'CNLX26', 'ETHZ26', 'ETHK27', 'ICFZ26', 'SJCF27', 'SOYH27'],
  )
  // dólar e minidólar (outro segmento), opção sobre futuro e rolagem de milho ficam de fora
  assert.ok(contratos.every((c) => c.data === '2026-11-19'))
})

test('boletim: campos do contrato e posição em aberto do fim do pregão', () => {
  const contratos = comPosicoes(normalizarNegocios(tabela('negocios-amostra.json')), normalizarPosicoes(tabela('posicoes-amostra.json')))
  assert.deepEqual(contratos.find((c) => c.ticker === 'BGIZ26'), {
    data: '2026-11-19',
    ticker: 'BGIZ26',
    codigo: 'BGI',
    vencimento: '2026-12',
    abertura: 409.4,
    minimo: 408.95,
    maximo: 410.8,
    medio: 409.89,
    ultimo: 409.65,
    ajuste: 409.75,
    ajuste_anterior: 409.35,
    variacao: 0.4,
    variacao_pct: 0.097716,
    contratos_em_aberto: 19535,
    variacao_em_aberto: 391,
    negocios: 1274,
    contratos_negociados: 2253,
    volume: 304751254.5,
    ajuste_por_contrato: 132,
    moeda: 'BRL',
  })
  // a moeda vem do catálogo (a tabela não traz); contrato sem posição nem negócio fica com nulos
  assert.equal(contratos.find((c) => c.ticker === 'SJCF27').moeda, 'USD')
  const semPosicao = contratos.find((c) => c.ticker === 'SOYH27')
  assert.equal(semPosicao.contratos_em_aberto, null)
  assert.equal(semPosicao.ultimo, null)
  assert.equal(semPosicao.ajuste, 434.6)
})

test('boletim: posições em aberto só de futuros do catálogo', () => {
  const posicoes = normalizarPosicoes(tabela('posicoes-amostra.json'))
  assert.deepEqual(Object.keys(posicoes).sort(), ['BGIK27', 'BGIX26', 'BGIZ26', 'CCMF27', 'CCMH27', 'ETHZ26', 'ICFZ26', 'SJCF27'])
  assert.deepEqual(posicoes.BGIX26, { contratos_em_aberto: 20679, variacao_em_aberto: -513 })
  // sem a tabela de posições, os contratos seguem como vieram
  assert.equal(comPosicoes([{ ticker: 'BGIZ26', contratos_em_aberto: null }], undefined)[0].contratos_em_aberto, null)
})

test('boletim: série de um contrato em ordem de data', () => {
  const serie = normalizarSerie(tabela('serie-amostra.json'), 'BGIZ26')
  assert.deepEqual(serie.map((p) => [p.data, p.ajuste]), [
    ['2026-11-12', 407.3], ['2026-11-13', 408.1], ['2026-11-16', 409.25], ['2026-11-17', 406.7], ['2026-11-18', 409.35], ['2026-11-19', 409.75],
  ])
  assert.deepEqual(Object.keys(serie[0]), ['data', 'ajuste', 'ultimo', 'minimo', 'maximo', 'negocios', 'contratos_negociados'])
  // contrato que não está na tabela devolve série vazia
  assert.deepEqual(normalizarSerie(tabela('serie-amostra.json'), 'BGIF27'), [])
})

test('boletim: série do físico sem as referências por vencimento e sem o dólar', () => {
  const serie = normalizarSerieDeIndicadores(tabela('indicadores-serie-amostra.json'), 'SOY')
  assert.deepEqual(serie, [
    { data: '2026-11-17', simbolo: 'SOYMD', valor: 498.08 },
    { data: '2026-11-18', simbolo: 'SOYMD', valor: 498.08 },
    { data: '2026-11-19', simbolo: 'SOYMD', valor: 495.58 },
  ])
  assert.deepEqual(normalizarSerieDeIndicadores(tabela('indicadores-serie-amostra.json'), 'BGI'), [])
})

test('boletim: coluna que falta vira ErroFonte', () => {
  assert.throws(() => normalizarNegocios({ colunas: ['RptDt', 'TckrSymb'], linhas: [] }), ErroFonte)
  assert.throws(() => normalizarPosicoes({ colunas: ['TckrSymb'], linhas: [] }), ErroFonte)
})

test('nome do arquivo e calendário', () => {
  assert.equal(nomeDoArquivoDoPregao('2026-11-19'), 'SPRD261119.zip')
  assert.deepEqual(normalizarPregoes(['2026-11-18T00:00:00', '2026-11-19T00:00:00', '2026-11-18T00:00:00', 'x']), ['2026-11-19', '2026-11-18'])
})

test('indicadores: mercado físico, referências e dólar', () => {
  const { dolar, indicadores } = normalizarIndicadores(tabela('indicadores-amostra.json'))
  assert.equal(dolar, 5.9029)
  const de = (codigo, simbolo) => indicadores.find((i) => i.codigo === codigo && i.simbolo === simbolo)?.valor
  assert.equal(de('BGI', 'RTBGI'), 396.44)
  assert.equal(de('BGI', 'BGILIQ'), 395.73)
  assert.equal(de('CCM', 'IAMILAVR$'), 67.68)
  assert.equal(de('CCM', 'IAMILPZR$'), 68.52)
  assert.equal(de('ETH', 'RTETHAVR$/M3'), 3083)
  assert.equal(de('SOY', 'SOYMD'), 495.58)
  assert.equal(de('ICF', 'KCH7 - Ajuste'), 276)
  // o dólar não entra como indicador de mercadoria; outros mercados ficam de fora; sem repetição
  assert.ok(indicadores.every((i) => i.simbolo !== 'RTDOLD1' && CODIGOS.has(i.codigo)))
  assert.equal(new Set(indicadores.map((i) => `${i.codigo}|${i.simbolo}`)).size, indicadores.length)
})

test('indicadores: coluna que falta vira ErroFonte', () => {
  assert.throws(() => normalizarIndicadores({ colunas: ['TckrSymb', 'IndcSymb'], linhas: [] }), ErroFonte)
})

test('cadastro: vencimento exato dos futuros do catálogo', () => {
  const contratos = normalizarCadastro(tabela('cadastro-amostra.json'))
  assert.deepEqual(Object.keys(contratos).sort(), ['BGIK27', 'BGIX26', 'BGIZ26', 'CCMF27', 'CCMH27', 'CNLX26', 'ETHZ26', 'ICFZ26', 'SJCF27', 'SOYH27'])
  assert.deepEqual(contratos.BGIZ26, { codigo: 'BGI', vencimento: '2026-12-30', dias_uteis: 26, dias_corridos: 41, multiplicador: 330, moeda: 'BRL', entrega: 'Financial' })
  assert.equal(contratos.CCMF27.vencimento, '2027-01-15')
  assert.equal(contratos.SOYH27.multiplicador, 34)
})

test('catálogo: cada mercadoria com o que a página precisa', () => {
  assert.equal(new Set(MERCADORIAS.map((m) => m.id)).size, MERCADORIAS.length)
  assert.equal(CODIGOS.size, MERCADORIAS.length)
  for (const m of MERCADORIAS) {
    assert.match(m.codigo, /^[A-Z]{3}$/)
    assert.ok(['BRL', 'USD'].includes(m.moeda))
    assert.ok(m.nome && m.contrato && m.unidade && m.tamanhoTexto && m.liquidacao)
    assert.ok(grupoCepeaDe(m.cepea), `grupo CEPEA de ${m.id}`)
    assert.ok(m.fisico.filter((f) => f.principal).length <= 1)
  }
  assert.equal(mercadoriaDe('MILHO').codigo, 'CCM')
  assert.equal(mercadoriaDe('sjc').id, 'soja')
  assert.equal(mercadoriaDe('ouro'), null)
  const ids = GRUPOS_CEPEA.flatMap((g) => g.indicadores.map((i) => i[0]))
  assert.equal(new Set(ids).size, ids.length)
})

test('catálogo: conversão da referência para a unidade do contrato', () => {
  // soja: 1.207,50 US¢/bushel = US$ 26,62 por saca de 60 kg (o ajuste do SJCF27 no mesmo dia foi 26,6204)
  assert.ok(Math.abs(mercadoriaDe('soja').referencia.paraUnidadeDoContrato(1207.5) - 26.6204) < 0.001)
  // café: 282,05 US¢/lb = US$ 373,09 por saca de 60 kg
  assert.ok(Math.abs(mercadoriaDe('cafe-arabica').referencia.paraUnidadeDoContrato(282.05) - 373.09) < 0.01)
  assert.equal(mercadoriaDe('soja-santos').referencia.paraUnidadeDoContrato(434.6), 434.6)
})
