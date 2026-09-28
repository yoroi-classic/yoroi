/* eslint-disable no-bitwise -- Cardano addresses and CRC32 use byte-level encodings. */
import {base58} from '@scure/base'
import * as bech32 from 'bech32'

const Bech32Limit = 1023
const ByronAddressMaxLength = 1024

const isShelleyPaymentAddress = (address: string): boolean => {
  const decoded = bech32.decodeUnsafe(address, Bech32Limit)
  if (decoded == null) return false

  const bytes = bech32.fromWordsUnsafe(decoded.words)
  if (bytes == null || bytes.length === 0) return false

  const addressBytes = Uint8Array.from(bytes)
  const header = addressBytes[0]!
  const type = header >> 4
  const networkId = header & 0x0f
  if (type > 7 || networkId > 1) return false
  if (decoded.prefix !== (networkId === 1 ? 'addr' : 'addr_test')) return false

  if (type <= 3) return addressBytes.length === 57
  if (type <= 5) return hasPointerPayload(addressBytes)
  return addressBytes.length === 29
}

const nextPointerPart = (
  bytes: Uint8Array,
  offset: number,
): number | undefined => {
  for (let index = offset; index < bytes.length; index += 1) {
    const byte = bytes[index]!
    const length = index - offset + 1
    if (length > 10) return undefined
    if (length === 1 && (byte & 0x80) !== 0 && (byte & 0x7f) === 0) {
      return undefined
    }
    if (length === 10 && (bytes[offset]! & 0x7f) > 1) return undefined
    if ((byte & 0x80) === 0) return index + 1
  }

  return undefined
}

const hasPointerPayload = (bytes: Uint8Array): boolean => {
  let offset = 29
  for (let part = 0; part < 3; part += 1) {
    const next = nextPointerPart(bytes, offset)
    if (next === undefined) return false
    offset = next
  }

  return offset === bytes.length
}

type CborHeader = {
  majorType: number
  value: number
  headerLength: number
}

const byteAt = (bytes: Uint8Array, offset: number): number => {
  const value = bytes[offset]
  if (value === undefined) throw new Error('truncated CBOR item')
  return value
}

const readCborHeader = (bytes: Uint8Array, offset: number): CborHeader => {
  const first = byteAt(bytes, offset)
  const majorType = first >> 5
  const info = first & 0x1f

  if (info < 24) return {majorType, value: info, headerLength: 1}
  if (info === 24) {
    return {majorType, value: byteAt(bytes, offset + 1), headerLength: 2}
  }
  if (info === 25) {
    const value = (byteAt(bytes, offset + 1) << 8) | byteAt(bytes, offset + 2)
    return {majorType, value, headerLength: 3}
  }
  if (info === 26) {
    const value =
      byteAt(bytes, offset + 1) * 0x1000000 +
      ((byteAt(bytes, offset + 2) << 16) |
        (byteAt(bytes, offset + 3) << 8) |
        byteAt(bytes, offset + 4))
    return {majorType, value, headerLength: 5}
  }

  throw new Error(`unsupported CBOR additional info ${info}`)
}

const skipCborItem = (bytes: Uint8Array, offset: number): number => {
  const header = readCborHeader(bytes, offset)
  let next = offset + header.headerLength
  switch (header.majorType) {
    case 0:
    case 1:
      return next
    case 2:
    case 3:
      if (next + header.value > bytes.length)
        throw new Error('truncated CBOR string')
      return next + header.value
    case 4:
      for (let index = 0; index < header.value; index += 1) {
        next = skipCborItem(bytes, next)
      }
      return next
    case 5:
      for (let index = 0; index < header.value; index += 1) {
        next = skipCborItem(bytes, next)
        next = skipCborItem(bytes, next)
      }
      return next
    case 6:
      return skipCborItem(bytes, next)
    default:
      throw new Error(`unsupported CBOR major type ${header.majorType}`)
  }
}

const isByronPayload = (payload: Uint8Array): boolean => {
  let offset = 0
  const body = readCborHeader(payload, offset)
  if (body.majorType !== 4 || body.value !== 3) return false
  offset += body.headerLength

  const root = readCborHeader(payload, offset)
  if (root.majorType !== 2 || root.value !== 28) return false
  offset += root.headerLength
  if (offset + root.value > payload.length) return false
  offset += root.value

  const attributes = readCborHeader(payload, offset)
  if (attributes.majorType !== 5) return false
  offset += attributes.headerLength
  for (let index = 0; index < attributes.value; index += 1) {
    offset = skipCborItem(payload, offset)
    offset = skipCborItem(payload, offset)
  }

  const type = readCborHeader(payload, offset)
  if (type.majorType !== 0 || type.value > 2) return false
  offset += type.headerLength
  return offset === payload.length
}

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1)
      crc = (crc >>> 1) ^ (0xedb88320 & mask)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

const isByronPaymentAddress = (address: string): boolean => {
  if (address.length === 0 || address.length > ByronAddressMaxLength)
    return false

  try {
    const bytes = base58.decode(address)
    let offset = 0

    const array = readCborHeader(bytes, offset)
    if (array.majorType !== 4 || array.value !== 2) return false
    offset += array.headerLength

    const tag = readCborHeader(bytes, offset)
    if (tag.majorType !== 6 || tag.value !== 24) return false
    offset += tag.headerLength

    const payloadHeader = readCborHeader(bytes, offset)
    if (payloadHeader.majorType !== 2) return false
    offset += payloadHeader.headerLength
    if (offset + payloadHeader.value > bytes.length) return false
    const payload = bytes.subarray(offset, offset + payloadHeader.value)
    offset += payloadHeader.value

    const checksum = readCborHeader(bytes, offset)
    if (checksum.majorType !== 0) return false
    offset += checksum.headerLength
    if (offset !== bytes.length || !isByronPayload(payload)) return false

    return crc32(payload) === checksum.value
  } catch {
    return false
  }
}

export const isCardanoPaymentAddress = (address: string): boolean =>
  isShelleyPaymentAddress(address) || isByronPaymentAddress(address)
