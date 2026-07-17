import assert from 'node:assert/strict'
import {Buffer} from 'node:buffer'
import {describe, it} from 'node:test'

import {
  checkHermescArchitecture,
  hermescPath,
  hermescPaths,
  readBinaryArchitectures,
} from './check-hermesc-architecture.mjs'

const elf = (machine) => {
  const buffer = Buffer.alloc(64)
  buffer.set([0x7f, 0x45, 0x4c, 0x46, 2, 1])
  buffer.writeUInt16LE(machine, 18)
  return buffer
}

const mach = (cpu, littleEndian) => {
  const buffer = Buffer.alloc(32)
  // Magic is decoded as big-endian bytes; CIGAM identifies a little-endian
  // header, while MAGIC identifies a big-endian header.
  buffer.writeUInt32BE(littleEndian ? 0xcffaedfe : 0xfeedfacf, 0)
  if (littleEndian) buffer.writeUInt32LE(cpu, 4)
  else buffer.writeUInt32BE(cpu, 4)
  return buffer
}

const fatMach = (cpus) => {
  const buffer = Buffer.alloc(8 + cpus.length * 20)
  buffer.writeUInt32BE(0xcafebabe, 0)
  buffer.writeUInt32BE(cpus.length, 4)
  cpus.forEach((cpu, index) => buffer.writeUInt32BE(cpu, 8 + index * 20))
  return buffer
}

const pe = (machine) => {
  const buffer = Buffer.alloc(256)
  buffer.write('MZ', 0, 'ascii')
  buffer.writeUInt32LE(128, 0x3c)
  buffer.write('PE\0\0', 128, 'ascii')
  buffer.writeUInt16LE(machine, 132)
  return buffer
}

describe('Hermes compiler architecture preflight', () => {
  it('recognizes ELF, Mach-O, universal Mach-O, and PE architectures', () => {
    assert.deepEqual(readBinaryArchitectures(elf(62)), ['x64'])
    assert.deepEqual(readBinaryArchitectures(elf(183)), ['arm64'])
    assert.deepEqual(readBinaryArchitectures(elf(7)), [])
    assert.deepEqual(readBinaryArchitectures(mach(0x0100000c, true)), ['arm64'])
    assert.deepEqual(readBinaryArchitectures(mach(0x01000007, false)), ['x64'])
    assert.deepEqual(
      readBinaryArchitectures(fatMach([0x01000007, 0x0100000c])),
      ['arm64', 'x64'],
    )
    assert.deepEqual(readBinaryArchitectures(pe(0x8664)), ['x64'])
  })

  it('accepts a compiler containing the host architecture', () => {
    const result = checkHermescArchitecture({
      arch: 'arm64',
      cwd: '/workspace/mobile',
      platform: 'darwin',
      readFile: () => fatMach([0x01000007, 0x0100000c]),
    })

    assert.equal(result.arch, 'arm64')
    assert.deepEqual(result.binaryArchitectures, ['arm64', 'x64'])
    assert.equal(
      result.compilerPath,
      '/workspace/mobile/node_modules/react-native/sdks/hermesc/osx-bin/hermesc',
    )
  })

  it('fails before a build when the bundled compiler cannot run on the host', () => {
    assert.throws(
      () =>
        checkHermescArchitecture({
          arch: 'arm64',
          cwd: '/workspace/mobile',
          platform: 'linux',
          readFile: () => elf(62),
        }),
      /architecture mismatch: host is arm64.*contains x64.*matching the bundled compiler/,
    )
  })

  it('prefers the compiler React Native builds from source on Linux', () => {
    const reads = []
    const result = checkHermescArchitecture({
      arch: 'arm64',
      cwd: '/workspace/mobile',
      platform: 'linux',
      readFile: (compilerPath) => {
        reads.push(compilerPath)
        return elf(183)
      },
    })

    assert.deepEqual(reads, [
      '/workspace/mobile/node_modules/react-native/sdks/hermes/build/bin/hermesc',
    ])
    assert.equal(result.compilerPath, reads[0])
  })

  it('reports a missing install instead of failing after Metro', () => {
    assert.throws(
      () =>
        checkHermescArchitecture({
          cwd: '/workspace/mobile',
          platform: 'linux',
          readFile: () => {
            throw new Error('missing')
          },
        }),
      /run npm ci before the architecture preflight/,
    )
  })

  it('uses the packaged compiler location for each supported platform', () => {
    assert.match(
      hermescPath({cwd: '/app', platform: 'linux'}),
      /linux64-bin\/hermesc$/,
    )
    assert.match(
      hermescPath({cwd: '/app', platform: 'darwin'}),
      /osx-bin\/hermesc$/,
    )
    assert.match(
      hermescPath({cwd: '/app', platform: 'win32'}),
      /win64-bin\/hermesc\.exe$/,
    )
  })

  it('falls back from React Native source output to the packaged Linux compiler', () => {
    const candidates = hermescPaths({cwd: '/app', platform: 'linux'})
    assert.deepEqual(candidates, [
      '/app/node_modules/react-native/sdks/hermes/build/bin/hermesc',
      '/app/node_modules/react-native/sdks/hermesc/linux64-bin/hermesc',
    ])

    const result = checkHermescArchitecture({
      arch: 'x64',
      cwd: '/app',
      platform: 'linux',
      readFile: (compilerPath) => {
        if (compilerPath === candidates[0]) throw new Error('missing')
        return elf(62)
      },
    })
    assert.equal(result.compilerPath, candidates[1])
  })
})
