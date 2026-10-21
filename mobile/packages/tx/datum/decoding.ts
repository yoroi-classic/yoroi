import {decodePlutusDataCborHex} from '@yoroi-classic/cml-mobile-bridge'

import type {Datum} from './types'

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | {[key: string]: JsonValue}

export type DecodedDatum =
  | {type: 'integer'; value: string}
  | {type: 'bytes'; value: string}
  | {type: 'string'; value: string}
  | {type: 'list'; items: DecodedDatum[]}
  | {type: 'map'; entries: Array<{key: DecodedDatum; value: DecodedDatum}>}
  | {type: 'constructor'; index: number; fields: DecodedDatum[]}
  | {type: 'unknown'; hex: string}

/** Decode Plutus CBOR into Yoroi's human-readable datum structure with CML. */
export function decodeDatum(datumHex: string): DecodedDatum | null {
  try {
    return JSON.parse(decodePlutusDataCborHex(datumHex)) as DecodedDatum
  } catch {
    return null
  }
}

export function formatDecodedDatum(datum: DecodedDatum, indent = 0): string {
  const spaces = '  '.repeat(indent)
  switch (datum.type) {
    case 'integer': return `${spaces}${datum.value}`
    case 'bytes': return `${spaces}0x${datum.value}`
    case 'string': return `${spaces}"${datum.value}"`
    case 'list':
      return datum.items.length === 0
        ? `${spaces}[]`
        : `${spaces}[\n${datum.items.map((item) => formatDecodedDatum(item, indent + 1)).join(',\n')}\n${spaces}]`
    case 'map':
      return datum.entries.length === 0
        ? `${spaces}{}`
        : `${spaces}{\n${datum.entries.map((entry) => `${formatDecodedDatum(entry.key, indent + 1)}: ${formatDecodedDatum(entry.value, indent + 1)}`).join(',\n')}\n${spaces}}`
    case 'constructor':
      return `${spaces}Constructor(${datum.index})[\n${datum.fields.map((field) => formatDecodedDatum(field, indent + 1)).join(',\n')}\n${spaces}]`
    case 'unknown': return `${spaces}<unknown: ${datum.hex}>`
  }
}

export function decodeDatumToJson(datum: Datum): JsonValue | null {
  if (datum.type === 'hash') return null
  const decoded = decodeDatum(datum.data)
  return decoded ? decodedDatumToJson(decoded) : null
}

function decodedDatumToJson(datum: DecodedDatum): JsonValue {
  switch (datum.type) {
    case 'integer': return BigInt(datum.value).toString()
    case 'bytes': return `0x${datum.value}`
    case 'string': return datum.value
    case 'list': return datum.items.map(decodedDatumToJson)
    case 'map':
      return Object.fromEntries(datum.entries.map((entry) => [decodedDatumToJson(entry.key), decodedDatumToJson(entry.value)]))
    case 'constructor':
      return {constructor: datum.index, fields: datum.fields.map(decodedDatumToJson)}
    case 'unknown': return {unknown: datum.hex}
  }
}
