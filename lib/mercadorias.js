// Catálogo único das mercadorias — a função e a página importam este arquivo. Não duplicar a lista
// no index.html.
//
// Tamanho do contrato, moeda e tipo de liquidação: Cadastro de instrumentos da B3 (Boletim Diário,
// tabela InstrumentsDerivatives), conferido em 19/11/2026. Símbolos dos indicadores: tabela
// EconomicIndicators do mesmo boletim, segmento Commodities, na mesma data.
//
//   fisico      indicadores do mercado físico que a B3 publica para o contrato (simbolo = IndcSymb).
//               O preço de liquidação é a média das últimas cotações do indicador do dia — conferido
//               nas séries de 21/10 a 19/11/2026 (boi e etanol: cinco cotações; milho: três).
//   ocultar     símbolos repetidos de outro indicador (mesmo valor com outro nome)
//   referencia  preços de ajuste do contrato de referência no exterior, um por vencimento; o símbolo
//               vem como "<prefixo><letra do mês><último dígito do ano> - Ajuste"
//   cepea       grupo de indicadores do widget do CEPEA mostrado junto (ver GRUPOS_CEPEA)

export const MERCADORIAS = [
  {
    id: 'boi',
    codigo: 'BGI',
    nome: 'Boi gordo',
    contrato: 'Futuro de Boi Gordo',
    moeda: 'BRL',
    unidade: 'R$/@',
    tamanho: 330,
    tamanhoTexto: '330 arrobas líquidas',
    liquidacao: 'Financeira',
    casas: 2,
    fisico: [
      { simbolo: 'RTBGI', nome: 'Indicador do boi gordo (cotação do dia)', praca: 'Estado de São Paulo', principal: true },
      { simbolo: 'BGILIQ', nome: 'Média das últimas cinco cotações (preço de liquidação)', praca: 'Estado de São Paulo' },
    ],
    cepea: 'boi',
  },
  {
    id: 'milho',
    codigo: 'CCM',
    nome: 'Milho',
    contrato: 'Futuro de Milho',
    moeda: 'BRL',
    unidade: 'R$/saca',
    tamanho: 450,
    tamanhoTexto: '450 sacas de 60 kg',
    liquidacao: 'Financeira',
    casas: 2,
    fisico: [
      { simbolo: 'IAMILAVR$', nome: 'Indicador do milho (à vista)', praca: 'Campinas (SP)', principal: true },
      { simbolo: 'IAMILPZR$', nome: 'Indicador do milho (a prazo)', praca: 'Campinas (SP)' },
      { simbolo: 'IAMILPZVPZ', nome: 'Prazo médio de pagamento', praca: 'Campinas (SP)', unidade: 'dias', casas: 2, semBase: true },
      { simbolo: 'CNILIQ', nome: 'Média das últimas três cotações (preço de liquidação)', praca: 'Campinas (SP)' },
    ],
    ocultar: ['RTCNI'],
    cepea: 'milho',
  },
  {
    id: 'soja',
    codigo: 'SJC',
    nome: 'Soja CME',
    contrato: 'Minicontrato de Soja do CME Group',
    moeda: 'USD',
    unidade: 'US$/saca',
    tamanho: 450,
    tamanhoTexto: '450 sacas de 60 kg',
    liquidacao: 'Financeira',
    casas: 2,
    fisico: [],
    referencia: {
      prefixo: 'YK',
      nome: 'Soja no CME Group (minicontrato)',
      unidade: 'US¢/bushel',
      casas: 2,
      // bushel de soja = 60 libras; saca = 60 kg
      paraUnidadeDoContrato: (v) => (v / 100) * (60 / (60 * 0.45359237)),
    },
    cepea: 'soja',
  },
  {
    id: 'soja-santos',
    codigo: 'SOY',
    nome: 'Soja FOB Santos',
    contrato: 'Futuro de Soja FOB Santos',
    moeda: 'USD',
    unidade: 'US$/t',
    tamanho: 34,
    tamanhoTexto: '34 toneladas',
    liquidacao: 'Financeira',
    casas: 2,
    fisico: [
      { simbolo: 'SOYMD', nome: 'Soja FOB Santos — média de divulgação', praca: 'Porto de Santos (FOB)', principal: true },
    ],
    referencia: {
      prefixo: 'SSL',
      nome: 'Preço de referência do contrato (código SSL)',
      unidade: 'US$/t',
      casas: 2,
      paraUnidadeDoContrato: (v) => v,
    },
    cepea: 'soja',
  },
  {
    id: 'cafe-arabica',
    codigo: 'ICF',
    nome: 'Café arábica',
    contrato: 'Futuro de Café Arábica 4/5',
    moeda: 'USD',
    unidade: 'US$/saca',
    tamanho: 100,
    tamanhoTexto: '100 sacas de 60 kg',
    liquidacao: 'Entrega física',
    casas: 2,
    fisico: [],
    referencia: {
      prefixo: 'KC',
      nome: 'Café arábica na ICE (contrato C)',
      unidade: 'US¢/lb',
      casas: 2,
      // saca de 60 kg em libras
      paraUnidadeDoContrato: (v) => (v / 100) * (60 / 0.45359237),
    },
    cepea: 'cafe',
  },
  {
    id: 'cafe-conilon',
    codigo: 'CNL',
    nome: 'Café conilon',
    contrato: 'Futuro de Café Conilon',
    moeda: 'BRL',
    unidade: 'R$/saca',
    tamanho: 100,
    tamanhoTexto: '100 sacas de 60 kg',
    liquidacao: 'Entrega física',
    casas: 2,
    fisico: [],
    cepea: 'cafe',
  },
  {
    id: 'etanol',
    codigo: 'ETH',
    nome: 'Etanol hidratado',
    contrato: 'Futuro de Etanol Hidratado',
    moeda: 'BRL',
    unidade: 'R$/m³',
    tamanho: 30,
    tamanhoTexto: '30 m³',
    liquidacao: 'Financeira',
    casas: 2,
    fisico: [
      { simbolo: 'RTETHAVR$/M3', nome: 'Indicador do etanol hidratado (à vista)', praca: 'Paulínia (SP)', principal: true },
      { simbolo: 'ALPPHLIQ', nome: 'Média das últimas cinco cotações (preço de liquidação)', praca: 'Paulínia (SP)' },
    ],
    ocultar: ['RTETHAVR$/M'],
    cepea: 'etanol',
  },
]

/** Códigos de mercadoria da B3 cobertos pela ferramenta (prefixo de três letras do contrato). */
export const CODIGOS = new Set(MERCADORIAS.map((m) => m.codigo))

export function mercadoriaDe(idOuCodigo) {
  const chave = String(idOuCodigo ?? '').trim().toLowerCase()
  if (!chave) return null
  return MERCADORIAS.find((m) => m.id === chave || m.codigo.toLowerCase() === chave) ?? null
}

/** Símbolo do dólar que a B3 usa para converter os contratos cotados em dólar. */
export const SIMBOLO_DOLAR = 'RTDOLD1'

// Indicadores do widget "Cotações do Cepea no seu site" (https://www.cepea.org.br/br/widget.aspx),
// conferidos em 23/11/2026. O número é o id_indicador do widget.
export const GRUPOS_CEPEA = [
  { id: 'boi', nome: 'Boi e bezerro', indicadores: [[2, 'Boi gordo'], [3, 'Bezerro — SP'], [8, 'Bezerro — MS']] },
  { id: 'milho', nome: 'Milho', indicadores: [[77, 'Milho']] },
  { id: 'soja', nome: 'Soja', indicadores: [[92, 'Soja — Paranaguá'], [12, 'Soja — PR']] },
  { id: 'cafe', nome: 'Café', indicadores: [[23, 'Café arábica'], [24, 'Café robusta']] },
  {
    id: 'etanol',
    nome: 'Etanol',
    indicadores: [
      [103, 'Hidratado — SP'], [119, 'Hidratado — GO'], [76, 'Hidratado — MT'], [100, 'Hidratado — PE'], [209, 'Hidratado — AL'], [210, 'Hidratado — PB'],
      [104, 'Anidro — SP'], [75, 'Anidro — MT'], [101, 'Anidro — PE'], [208, 'Anidro — AL'], [211, 'Anidro — PB'],
    ],
  },
  { id: 'acucar', nome: 'Açúcar', indicadores: [[53, 'Açúcar — SP'], [308, 'Açúcar — Santos'], [50, 'Açúcar — AL'], [35, 'Açúcar — PE'], [149, 'Açúcar — PB']] },
  { id: 'trigo-arroz', nome: 'Trigo e arroz', indicadores: [[178, 'Trigo — PR'], [179, 'Trigo — RS'], [91, 'Arroz em casca — RS']] },
  { id: 'algodao', nome: 'Algodão', indicadores: [[54, 'Algodão']] },
]

export function grupoCepeaDe(id) {
  return GRUPOS_CEPEA.find((g) => g.id === id) ?? null
}
