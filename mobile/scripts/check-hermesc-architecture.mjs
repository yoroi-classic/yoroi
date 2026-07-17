import {readFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const ELF_ARCHITECTURES = new Map([
  [3, 'ia32'],
  [40, 'arm'],
  [62, 'x64'],
  [183, 'arm64'],
])

const MACH_ARCHITECTURES = new Map([
  [7, 'ia32'],
  [12, 'arm'],
  [0x01000007, 'x64'],
  [0x0100000c, 'arm64'],
])

const PE_ARCHITECTURES = new Map([
  [0x014c, 'ia32'],
  [0x01c0, 'arm'],
  [0x8664, 'x64'],
  [0xaa64, 'arm64'],
])

const platformDirectory = {
  darwin: 'osx-bin',
  linux: 'linux64-bin',
  win32: 'win64-bin',
}

const readCpu = (buffer, offset, littleEndian) =>
  littleEndian ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset)

const architectureForCpu = (architectures, cpu) => architectures.get(cpu)

const uniqueArchitectures = (architectures) =>
  [...new Set(architectures.filter(Boolean))].sort()

const readElfArchitectures = (buffer) => {
  if (buffer.length < 20) return []
  const dataEncoding = buffer[5]
  if (dataEncoding !== 1 && dataEncoding !== 2) return []
  const machine =
    dataEncoding === 1 ? buffer.readUInt16LE(18) : buffer.readUInt16BE(18)
  return uniqueArchitectures([architectureForCpu(ELF_ARCHITECTURES, machine)])
}

const readMachArchitectures = (buffer) => {
  if (buffer.length < 8) return []
  // Decode the magic as big-endian bytes. The byte-swapped CIGAM values mean
  // subsequent header fields must be decoded as little-endian.
  const magic = buffer.readUInt32BE(0)
  const thinFormats = new Map([
    [0xfeedface, false],
    [0xfeedfacf, false],
    [0xcefaedfe, true],
    [0xcffaedfe, true],
  ])
  if (thinFormats.has(magic)) {
    return uniqueArchitectures([
      architectureForCpu(
        MACH_ARCHITECTURES,
        readCpu(buffer, 4, thinFormats.get(magic)),
      ),
    ])
  }

  const fatFormats = new Map([
    [0xcafebabe, {littleEndian: false, recordSize: 20}],
    [0xcafebabf, {littleEndian: false, recordSize: 32}],
    [0xbebafeca, {littleEndian: true, recordSize: 20}],
    [0xbfbafeca, {littleEndian: true, recordSize: 32}],
  ])
  const format = fatFormats.get(magic)
  if (!format) return []

  const count = readCpu(buffer, 4, format.littleEndian)
  if (count > 32 || buffer.length < 8 + count * format.recordSize) return []
  const architectures = []
  for (let index = 0; index < count; index += 1) {
    const offset = 8 + index * format.recordSize
    architectures.push(
      architectureForCpu(
        MACH_ARCHITECTURES,
        readCpu(buffer, offset, format.littleEndian),
      ),
    )
  }
  return uniqueArchitectures(architectures)
}

const readPeArchitectures = (buffer) => {
  if (buffer.length < 64) return []
  const peOffset = buffer.readUInt32LE(0x3c)
  if (
    peOffset + 6 > buffer.length ||
    buffer.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0'
  ) {
    return []
  }
  return uniqueArchitectures([
    architectureForCpu(PE_ARCHITECTURES, buffer.readUInt16LE(peOffset + 4)),
  ])
}

export const readBinaryArchitectures = (buffer) => {
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x7f &&
    buffer.toString('ascii', 1, 4) === 'ELF'
  ) {
    return readElfArchitectures(buffer)
  }
  if (buffer.length >= 2 && buffer.toString('ascii', 0, 2) === 'MZ') {
    return readPeArchitectures(buffer)
  }
  return readMachArchitectures(buffer)
}

export const hermescPath = ({
  cwd = process.cwd(),
  platform = process.platform,
} = {}) => {
  const directory = platformDirectory[platform]
  if (!directory) {
    throw new Error(
      `Hermes compiler preflight does not support platform ${platform}`,
    )
  }
  const executable = platform === 'win32' ? 'hermesc.exe' : 'hermesc'
  return path.join(
    cwd,
    'node_modules',
    'react-native',
    'sdks',
    'hermesc',
    directory,
    executable,
  )
}

export const checkHermescArchitecture = ({
  arch = process.arch,
  cwd = process.cwd(),
  platform = process.platform,
  readFile = readFileSync,
} = {}) => {
  if (!['arm', 'arm64', 'ia32', 'x64'].includes(arch)) {
    throw new Error(
      `Hermes compiler preflight does not support host architecture ${arch}`,
    )
  }

  const compilerPath = hermescPath({cwd, platform})
  let compiler
  try {
    compiler = readFile(compilerPath)
  } catch (error) {
    throw new Error(
      `Hermes compiler was not found at ${compilerPath}; run npm ci before the architecture preflight`,
      {cause: error},
    )
  }

  const binaryArchitectures = readBinaryArchitectures(
    compiler.subarray(0, 4096),
  )
  if (binaryArchitectures.length === 0) {
    throw new Error(
      `Unable to identify the Hermes compiler architecture at ${compilerPath}`,
    )
  }
  if (!binaryArchitectures.includes(arch)) {
    throw new Error(
      `Hermes compiler architecture mismatch: host is ${arch}, but ${compilerPath} contains ${binaryArchitectures.join(
        ', ',
      )}. Use a builder matching the bundled compiler for production Hermes output.`,
    )
  }

  return {arch, binaryArchitectures, compilerPath, platform}
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    const result = checkHermescArchitecture()
    console.log(
      `Hermes compiler preflight passed: host=${result.arch} binary=${result.binaryArchitectures.join(
        ',',
      )}`,
    )
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
