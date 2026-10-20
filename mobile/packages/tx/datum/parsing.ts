import {datumInfoFromOutputCborHex, hashPlutusDataCborHex} from '@yoroi-classic/csl-mobile-bridge'

import type {Datum, DatumInfo} from './types'

/**
 * Parse datum from serialized transaction-output CBOR using CML.
 *
 * @param outputCborHex - serialized transaction output CBOR
 * @returns DatumInfo if datum is present, null otherwise
 */
export function parseDatumFromOutput(
  outputCborHex: string,
): DatumInfo | null {
  const result = JSON.parse(datumInfoFromOutputCborHex(outputCborHex)) as DatumInfo | null
  return result
}

/**
 * Create Datum from DatumInfo
 */
export function datumFromInfo(info: DatumInfo): Datum {
  if (info.type === 'inline') {
    return {
      type: 'inline',
      data: info.data!,
    }
  }

  if (info.type === 'embedded') {
    return {
      type: 'embedded',
      data: info.data!,
    }
  }

  return {
    type: 'hash',
    hash: info.hash,
  }
}

/**
 * Convert legacy Datum format to enhanced format
 */
export function convertLegacyDatum(datum: {
  hash?: string
  data?: string
}): Datum | null {
  if (datum.data) {
    return {
      type: 'inline',
      data: datum.data,
    }
  }

  if (datum.hash) {
    return {
      type: 'hash',
      hash: datum.hash,
    }
  }

  return null
}

/**
 * Get datum hash from Datum
 */
export function getDatumHash(datum: Datum): string {
  if (datum.type === 'hash') {
    return datum.hash
  }

  if (datum.type === 'inline' || datum.type === 'embedded') {
    return hashPlutusDataCborHex(datum.data)
  }

  throw new Error('Invalid datum type')
}
