const QR_VERSION = 6
const QR_SIZE = 17 + QR_VERSION * 4
const DATA_CODEWORDS = 136
const ECC_CODEWORDS_PER_BLOCK = 18
const DATA_BLOCKS = [68, 68]
const QUIET_ZONE = 4

type Matrix = {
  modules: number[][]
  reserved: boolean[][]
}

export function createQrSvgDataUrl(text: string): string {
  const matrix = createQrMatrix(text)
  const moduleCount = matrix.length
  const viewSize = moduleCount + QUIET_ZONE * 2
  const path = matrix
    .flatMap((row, y) =>
      row
        .map((dark, x) => (dark ? `M${x + QUIET_ZONE},${y + QUIET_ZONE}h1v1h-1z` : ""))
        .filter(Boolean),
    )
    .join("")
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path fill="#020617" d="${path}"/></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function createQrMatrix(text: string): boolean[][] {
  const dataCodewords = encodeDataCodewords(text)
  const codewords = addErrorCorrection(dataCodewords)
  const base = createBaseMatrix()
  const best = chooseBestMask(base, codewords)
  return best.modules.map((row) => row.map((value) => value === 1))
}

function encodeDataCodewords(text: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(text))
  if (bytes.length > 134) {
    throw new Error("TOTP 绑定 URI 太长，当前本地二维码生成器最多支持 134 字节")
  }

  const bits: number[] = []
  appendBits(bits, 0b0100, 4)
  appendBits(bits, bytes.length, 8)
  for (const byte of bytes) appendBits(bits, byte, 8)
  appendBits(bits, 0, Math.min(4, DATA_CODEWORDS * 8 - bits.length))
  while (bits.length % 8 !== 0) bits.push(0)

  const result: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0
    for (let j = 0; j < 8; j += 1) value = (value << 1) | bits[i + j]
    result.push(value)
  }
  for (let pad = 0xec; result.length < DATA_CODEWORDS; pad = pad === 0xec ? 0x11 : 0xec) {
    result.push(pad)
  }
  return result
}

function appendBits(bits: number[], value: number, length: number) {
  for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1)
}

function addErrorCorrection(data: number[]): number[] {
  const divisor = reedSolomonDivisor(ECC_CODEWORDS_PER_BLOCK)
  const blocks = DATA_BLOCKS.map((size, index) => {
    const offset = DATA_BLOCKS.slice(0, index).reduce((sum, item) => sum + item, 0)
    const blockData = data.slice(offset, offset + size)
    return { data: blockData, ecc: reedSolomonRemainder(blockData, divisor) }
  })

  const result: number[] = []
  for (let i = 0; i < Math.max(...blocks.map((block) => block.data.length)); i += 1) {
    for (const block of blocks) if (i < block.data.length) result.push(block.data[i])
  }
  for (let i = 0; i < ECC_CODEWORDS_PER_BLOCK; i += 1) {
    for (const block of blocks) result.push(block.ecc[i])
  }
  return result
}

function createBaseMatrix(): Matrix {
  const modules = Array.from({ length: QR_SIZE }, () => Array(QR_SIZE).fill(0))
  const reserved = Array.from({ length: QR_SIZE }, () => Array(QR_SIZE).fill(false))
  const matrix = { modules, reserved }

  drawFinder(matrix, 0, 0)
  drawFinder(matrix, QR_SIZE - 7, 0)
  drawFinder(matrix, 0, QR_SIZE - 7)
  drawAlignment(matrix, 34, 34)
  drawTiming(matrix)
  drawFormatBits(matrix, 0)
  setFunctionModule(matrix, 8, QR_SIZE - 8, 1)
  return matrix
}

function chooseBestMask(base: Matrix, codewords: number[]): Matrix {
  let best: Matrix | null = null
  let bestPenalty = Number.POSITIVE_INFINITY
  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = cloneMatrix(base)
    drawCodewords(candidate, codewords, mask)
    drawFormatBits(candidate, mask)
    const penalty = calculatePenalty(candidate.modules)
    if (penalty < bestPenalty) {
      best = candidate
      bestPenalty = penalty
    }
  }
  if (!best) throw new Error("二维码生成失败")
  return best
}

function cloneMatrix(matrix: Matrix): Matrix {
  return {
    modules: matrix.modules.map((row) => [...row]),
    reserved: matrix.reserved.map((row) => [...row]),
  }
}

function setFunctionModule(matrix: Matrix, x: number, y: number, dark: number) {
  if (x < 0 || y < 0 || x >= QR_SIZE || y >= QR_SIZE) return
  matrix.modules[y][x] = dark
  matrix.reserved[y][x] = true
}

function drawFinder(matrix: Matrix, left: number, top: number) {
  for (let y = -1; y <= 7; y += 1) {
    for (let x = -1; x <= 7; x += 1) {
      const xx = left + x
      const yy = top + y
      const dark =
        x >= 0
        && x <= 6
        && y >= 0
        && y <= 6
        && (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4))
      setFunctionModule(matrix, xx, yy, dark ? 1 : 0)
    }
  }
}

function drawAlignment(matrix: Matrix, centerX: number, centerY: number) {
  for (let y = -2; y <= 2; y += 1) {
    for (let x = -2; x <= 2; x += 1) {
      const dark = Math.max(Math.abs(x), Math.abs(y)) !== 1
      setFunctionModule(matrix, centerX + x, centerY + y, dark ? 1 : 0)
    }
  }
}

function drawTiming(matrix: Matrix) {
  for (let i = 8; i < QR_SIZE - 8; i += 1) {
    const dark = i % 2 === 0 ? 1 : 0
    setFunctionModule(matrix, i, 6, dark)
    setFunctionModule(matrix, 6, i, dark)
  }
}

function drawFormatBits(matrix: Matrix, mask: number) {
  const bits = formatBits(mask)
  for (let i = 0; i <= 5; i += 1) setFunctionModule(matrix, 8, i, (bits >>> i) & 1)
  setFunctionModule(matrix, 8, 7, (bits >>> 6) & 1)
  setFunctionModule(matrix, 8, 8, (bits >>> 7) & 1)
  setFunctionModule(matrix, 7, 8, (bits >>> 8) & 1)
  for (let i = 9; i < 15; i += 1) setFunctionModule(matrix, 14 - i, 8, (bits >>> i) & 1)
  for (let i = 0; i < 8; i += 1) setFunctionModule(matrix, QR_SIZE - 1 - i, 8, (bits >>> i) & 1)
  for (let i = 8; i < 15; i += 1) setFunctionModule(matrix, 8, QR_SIZE - 15 + i, (bits >>> i) & 1)
  setFunctionModule(matrix, 8, QR_SIZE - 8, 1)
}

function formatBits(mask: number): number {
  const data = (1 << 3) | mask
  let value = data << 10
  const generator = 0b10100110111
  for (let i = 14; i >= 10; i -= 1) {
    if (((value >>> i) & 1) !== 0) value ^= generator << (i - 10)
  }
  return (((data << 10) | value) ^ 0b101010000010010) & 0x7fff
}

function drawCodewords(matrix: Matrix, codewords: number[], mask: number) {
  const bits = codewords.flatMap((codeword) => Array.from({ length: 8 }, (_, i) => (codeword >>> (7 - i)) & 1))
  let bitIndex = 0
  let upward = true
  for (let right = QR_SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1
    for (let vertical = 0; vertical < QR_SIZE; vertical += 1) {
      const y = upward ? QR_SIZE - 1 - vertical : vertical
      for (let dx = 0; dx < 2; dx += 1) {
        const x = right - dx
        if (matrix.reserved[y][x]) continue
        const bit = bitIndex < bits.length ? bits[bitIndex] : 0
        matrix.modules[y][x] = bit ^ (maskApplies(mask, x, y) ? 1 : 0)
        bitIndex += 1
      }
    }
    upward = !upward
  }
}

function maskApplies(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0
    case 1: return y % 2 === 0
    case 2: return x % 3 === 0
    case 3: return (x + y) % 3 === 0
    case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0
    case 7: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
    default: return false
  }
}

function calculatePenalty(modules: number[][]): number {
  let penalty = 0
  for (const row of modules) penalty += runPenalty(row)
  for (let x = 0; x < QR_SIZE; x += 1) penalty += runPenalty(modules.map((row) => row[x]))

  for (let y = 0; y < QR_SIZE - 1; y += 1) {
    for (let x = 0; x < QR_SIZE - 1; x += 1) {
      const color = modules[y][x]
      if (modules[y][x + 1] === color && modules[y + 1][x] === color && modules[y + 1][x + 1] === color) {
        penalty += 3
      }
    }
  }

  const finder = "10111010000"
  const reverseFinder = "00001011101"
  for (const row of modules) penalty += patternPenalty(row, finder, reverseFinder)
  for (let x = 0; x < QR_SIZE; x += 1) penalty += patternPenalty(modules.map((row) => row[x]), finder, reverseFinder)

  const dark = modules.flat().filter((value) => value === 1).length
  const ratio = (dark * 100) / (QR_SIZE * QR_SIZE)
  penalty += Math.floor(Math.abs(ratio - 50) / 5) * 10
  return penalty
}

function runPenalty(values: number[]): number {
  let penalty = 0
  let runColor = values[0]
  let runLength = 1
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] === runColor) {
      runLength += 1
    } else {
      if (runLength >= 5) penalty += 3 + (runLength - 5)
      runColor = values[i]
      runLength = 1
    }
  }
  if (runLength >= 5) penalty += 3 + (runLength - 5)
  return penalty
}

function patternPenalty(values: number[], finder: string, reverseFinder: string): number {
  const text = values.join("")
  let penalty = 0
  for (let i = 0; i <= text.length - finder.length; i += 1) {
    const part = text.slice(i, i + finder.length)
    if (part === finder || part === reverseFinder) penalty += 40
  }
  return penalty
}

const EXP = new Array<number>(512)
const LOG = new Array<number>(256)
let value = 1
for (let i = 0; i < 255; i += 1) {
  EXP[i] = value
  LOG[value] = i
  value <<= 1
  if (value & 0x100) value ^= 0x11d
}
for (let i = 255; i < EXP.length; i += 1) EXP[i] = EXP[i - 255]

function gfMultiply(x: number, y: number): number {
  if (x === 0 || y === 0) return 0
  return EXP[LOG[x] + LOG[y]]
}

function reedSolomonDivisor(degree: number): number[] {
  const result = Array(degree).fill(0)
  result[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      result[j] = gfMultiply(result[j], root)
      if (j + 1 < degree) result[j] ^= result[j + 1]
    }
    root = gfMultiply(root, 2)
  }
  return result
}

function reedSolomonRemainder(data: number[], divisor: number[]): number[] {
  const result = Array(divisor.length).fill(0)
  for (const byte of data) {
    const factor = byte ^ result.shift()
    result.push(0)
    for (let i = 0; i < result.length; i += 1) result[i] ^= gfMultiply(divisor[i], factor)
  }
  return result
}
