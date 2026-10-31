// Cardano asset utilities
// Functions for working with Cardano assets and tokens
import {Balance, TokenId} from '@yoroi/types'

import {
  valueFromAmountsHex,
  valueFromHexInfoJson,
} from '@yoroi-classic/cml-mobile-bridge'
import {BigNumber} from 'bignumber.js'

import {RemoteUnspentOutput, SendToken} from '../types'

/**
 * Convert Balance.Amounts to Cardano Value
 *
 * The bridge serializes the value as CBOR hex and preserves quantities as decimal strings.
 */
export function cardanoValueFromAmounts(
  amounts: Balance.Amounts,
  primaryTokenId: TokenId,
): string {
  return valueFromAmountsHex({
    coin: String(amounts[primaryTokenId] ?? '0'),
    assets: Object.entries(amounts)
      .filter(([id, quantity]) => id !== primaryTokenId && quantity !== '0')
      .map(([id, quantity]) => {
        const [policyIdHex, assetNameHex] = id.split('.')
        if (
          !policyIdHex ||
          !/^[0-9a-f]{56}$/i.test(policyIdHex) ||
          assetNameHex === undefined ||
          !/^(?:[0-9a-f]{2}){0,32}$/i.test(assetNameHex)
        ) {
          throw new Error(`Invalid asset identifier: ${id}`)
        }
        return {policyIdHex, assetNameHex, quantity: String(quantity)}
      }),
  })
}

/**
 * Convert Cardano Value to Balance.Amounts
 *
 * The input is serialized Cardano Value CBOR hex; decoded quantities remain decimal strings.
 */
export function amountsFromCardanoValue(
  valueCborHex: string,
  primaryTokenId: TokenId,
): Balance.Amounts {
  const parsed: unknown = JSON.parse(valueFromHexInfoJson(valueCborHex))
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('coin' in parsed) ||
    typeof parsed.coin !== 'string' ||
    !/^(0|[1-9][0-9]*)$/.test(parsed.coin) ||
    !('assets' in parsed) ||
    !Array.isArray(parsed.assets)
  ) {
    throw new Error('Invalid CML value response')
  }
  const amounts: Balance.Amounts = {} as Balance.Amounts
  amounts[primaryTokenId] = parsed.coin as Balance.Quantity
  for (const asset of parsed.assets) {
    if (
      typeof asset !== 'object' ||
      asset === null ||
      !('policyIdHex' in asset) ||
      typeof asset.policyIdHex !== 'string' ||
      !/^[0-9a-f]{56}$/i.test(asset.policyIdHex) ||
      !('assetNameHex' in asset) ||
      typeof asset.assetNameHex !== 'string' ||
      !/^(?:[0-9a-f]{2}){0,32}$/i.test(asset.assetNameHex) ||
      !('quantity' in asset) ||
      typeof asset.quantity !== 'string' ||
      !/^(0|[1-9][0-9]*)$/.test(asset.quantity)
    ) {
      throw new Error('Invalid CML value asset response')
    }
    const id = `${asset.policyIdHex}.${asset.assetNameHex}` as TokenId
    amounts[id] = asset.quantity as Balance.Quantity
  }

  return amounts
}

/**
 * Convert Cardano asset to identifier string
 */
export function cardanoAssetToIdentifier(
  policyIdHex: string,
  assetNameHex: string,
): string {
  // note: possible for name to be empty causing a trailing hyphen
  if (
    !/^[0-9a-f]{56}$/i.test(policyIdHex) ||
    !/^(?:[0-9a-f]{2}){0,32}$/i.test(assetNameHex)
  ) {
    throw new Error('Invalid Cardano asset identifier parts')
  }
  return `${policyIdHex.toLowerCase()}.${assetNameHex.toLowerCase()}`
}

/**
 * Convert identifier string to Cardano asset
 */
export function identifierToCardanoAsset(identifier: string): {
  policyIdHex: string
  assetNameHex: string
} {
  const parts = identifier.split('.')
  if (parts.length !== 2)
    throw new Error(`Invalid asset identifier: ${identifier}`)
  const [policyIdHex, assetNameHex] = parts
  if (!policyIdHex || assetNameHex === undefined)
    throw new Error(`Invalid asset identifier: ${identifier}`)
  cardanoAssetToIdentifier(policyIdHex, assetNameHex)
  return {
    policyIdHex: policyIdHex.toLowerCase(),
    assetNameHex: assetNameHex.toLowerCase(),
  }
}

/**
 * Build send token list from tokens and UTXOs
 */
export function buildSendTokenList(
  _primaryTokenId: string,
  tokens: SendToken[],
  utxos: Array<Balance.Amounts>,
): Balance.Amounts {
  const amounts: Balance.Amounts = {} as Balance.Amounts

  for (const token of tokens) {
    if (token.amount != null) {
      // if we add a specific amount of a specific token to the output, just add it
      const tokenId = token.token.identifier
      const currentAmount = amounts[tokenId] || '0'
      const newAmount = new BigNumber(currentAmount)
        .plus(token.amount)
        .toString()
      amounts[tokenId] = newAmount as Balance.Quantity
    } else if (token.shouldSendAll) {
      // if we want to send all of a specific token, sum it from all utxos
      const tokenId = token.token.identifier
      const total = utxos.reduce((sum, utxo) => {
        const tokenAmount = utxo[tokenId]
        if (tokenAmount != null) {
          return sum.plus(tokenAmount)
        }
        return sum
      }, new BigNumber(0))

      amounts[tokenId] = total.toString() as Balance.Quantity
    }
  }

  return amounts
}

/**
 * Convert remote UTXO format to Balance.Amounts
 * Now simply returns the balance field directly since RemoteUnspentOutput uses Balance.Amounts
 */
export function amountsFromRemote(
  utxo: RemoteUnspentOutput,
  _primaryTokenId: string, // Kept for backward compatibility but not used
): Balance.Amounts {
  return utxo.balance
}

/**
 * Parse token list from MultiAsset
 */
export function parseTokenList(
  valueCborHex: string,
): Array<{assetId: string; amount: string}> {
  const parsed: unknown = JSON.parse(valueFromHexInfoJson(valueCborHex))
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('assets' in parsed) ||
    !Array.isArray(parsed.assets)
  ) {
    throw new Error('Invalid CML value response')
  }
  return parsed.assets.map((asset) => {
    if (
      typeof asset !== 'object' ||
      asset === null ||
      !('policyIdHex' in asset) ||
      typeof asset.policyIdHex !== 'string' ||
      !('assetNameHex' in asset) ||
      typeof asset.assetNameHex !== 'string' ||
      !('quantity' in asset) ||
      typeof asset.quantity !== 'string'
    ) {
      throw new Error('Invalid CML value asset response')
    }
    return {
      assetId: cardanoAssetToIdentifier(asset.policyIdHex, asset.assetNameHex),
      amount: asset.quantity,
    }
  })
}

/**
 * ASCII asset name blacklist
 */
export const ASCII_ASSET_NAME_BLACKLIST = [
  'ADA',
  'ADAF',
  'ADAT',
  'ADAB',
  'ADAN',
  'ADAC',
  'ADAL',
  'ADAR',
  'ADAS',
  'ADAI',
  'ADAM',
  'ADAP',
  'ADAU',
  'ADAV',
  'ADAW',
  'ADAX',
  'ADAY',
  'ADAZ',
] as const

/**
 * Resolve CIP-67 tag from asset name hex
 * CIP-67 tags are 4 bytes (8 hex chars)
 */
export function resolveCip67Tag(assetNameHEX: string): {
  hexName: string
  tag: string | null
} {
  if (assetNameHEX.length < 8) {
    return {hexName: assetNameHEX, tag: null}
  }

  // First, check if the entire hex decodes to valid ASCII
  // If it does, it's likely not a tagged asset name
  try {
    const fullBytes = Buffer.from(assetNameHEX, 'hex')
    const fullAscii = fullBytes.toString('ascii')
    if (/^[\x20-\x7E]*$/.test(fullAscii)) {
      // Entire hex is valid ASCII, no tag
      return {hexName: assetNameHEX, tag: null}
    }
  } catch {
    // Not valid hex or not ASCII, continue to check for tag
  }

  // Extract potential tag (first 8 hex chars = 4 bytes)
  const tag = assetNameHEX.substring(0, 8)
  const hexName = assetNameHEX.substring(8)

  // CIP-67 tags are 4 bytes (8 hex chars)
  // Check if remaining hex can be decoded as ASCII
  if (hexName.length > 0) {
    try {
      const remainingBytes = Buffer.from(hexName, 'hex')
      const remainingAscii = remainingBytes.toString('ascii')
      // If remaining hex is valid ASCII, it's likely a CIP-67 tag
      if (/^[\x20-\x7E]*$/.test(remainingAscii)) {
        return {hexName, tag}
      }
    } catch {
      // Invalid hex, not a tag
    }
  }

  // Not a valid CIP-67 tag, return original hex as hexName
  return {hexName: assetNameHEX, tag: null}
}

/**
 * Resolve ASCII name from hex
 */
export function resolveAsciiName(hexName: string): string | null {
  try {
    const bytes = Buffer.from(hexName, 'hex')
    const ascii = bytes.toString('ascii')
    // Check if it's valid ASCII (printable characters)
    if (/^[\x20-\x7E]*$/.test(ascii)) {
      return ascii
    }
  } catch {
    // Invalid hex
  }
  return null
}

/**
 * Resolve asset properties (tag + ASCII name)
 */
export function resolveAssetProperties(assetNameHEX: string): {
  tag: string | null
  asciiName: string | null
} {
  const {hexName, tag} = resolveCip67Tag(assetNameHEX)
  const asciiName = resolveAsciiName(hexName)
  return {tag, asciiName}
}

/**
 * Asset name utilities (for backward compatibility)
 * @deprecated Use individual functions instead
 */
export const AssetNameUtils = {
  ASCII_ASSET_NAME_BLACKLIST,
  resolveCip67Tag,
  resolveAsciiName,
  resolveProperties: resolveAssetProperties,
} as const
