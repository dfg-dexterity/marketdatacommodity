// Leitor mínimo de ZIP para as funções de /api (Node, sem dependências): diretório central, arquivos
// guardados (método 0) e comprimidos com deflate (método 8). É o que a B3 usa na Pesquisa por Pregão.
import { inflateRawSync } from 'node:zlib'

const FIM_DO_DIRETORIO = 0x06054b50
const ENTRADA_DO_DIRETORIO = 0x02014b50
const CABECALHO_LOCAL = 0x04034b50
const TAMANHO_MAXIMO = 96 * 1024 * 1024 // o XML do pregão tem ~5 MB; isto só barra arquivo malformado

/** Entradas do ZIP: [{ nome, metodo, tamanhoComprimido, tamanho, posicao }]. ZIP vazio devolve []. */
export function listarZip(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new Error('não é um ZIP')
  // O registro de fim do diretório fica no final, antes de um comentário de até 65.535 bytes
  const limite = Math.max(0, buf.length - 22 - 0xffff)
  let fim = buf.length - 22
  while (fim >= limite && buf.readUInt32LE(fim) !== FIM_DO_DIRETORIO) fim--
  if (fim < limite) throw new Error('não é um ZIP (fim do diretório não encontrado)')

  const total = buf.readUInt16LE(fim + 10)
  let p = buf.readUInt32LE(fim + 16)
  const entradas = []
  for (let i = 0; i < total; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== ENTRADA_DO_DIRETORIO) throw new Error('diretório do ZIP corrompido')
    const tamanhoNome = buf.readUInt16LE(p + 28)
    entradas.push({
      nome: buf.toString('utf8', p + 46, p + 46 + tamanhoNome),
      metodo: buf.readUInt16LE(p + 10),
      tamanhoComprimido: buf.readUInt32LE(p + 20),
      tamanho: buf.readUInt32LE(p + 24),
      posicao: buf.readUInt32LE(p + 42),
    })
    p += 46 + tamanhoNome + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32)
  }
  return entradas
}

/** Conteúdo de uma entrada devolvida por listarZip. */
export function extrairDoZip(buf, entrada) {
  const p = entrada.posicao
  if (p + 30 > buf.length || buf.readUInt32LE(p) !== CABECALHO_LOCAL) throw new Error(`ZIP corrompido em ${entrada.nome}`)
  if (entrada.tamanho > TAMANHO_MAXIMO) throw new Error(`${entrada.nome} é grande demais`)
  const inicio = p + 30 + buf.readUInt16LE(p + 26) + buf.readUInt16LE(p + 28)
  const bruto = buf.subarray(inicio, inicio + entrada.tamanhoComprimido)
  if (entrada.metodo === 0) return bruto
  if (entrada.metodo === 8) return inflateRawSync(bruto, { maxOutputLength: TAMANHO_MAXIMO })
  throw new Error(`compressão ${entrada.metodo} não suportada em ${entrada.nome}`)
}
