import * as bech32Module from 'bech32'

export const parseDrepId = (
  drepId: string,
): {type: 'key'; hash: string} | {type: 'script'; hash: string} => {
  const cip129 = /^(22|23)([0-9a-fA-F]{56})$/.exec(drepId)
  if (cip129?.[1] && cip129[2]) {
    return {
      type: cip129[1] === '22' ? 'key' : 'script',
      hash: cip129[2].toLowerCase(),
    }
  }

  const decoded = decodeBech32Hash(drepId)
  if (decoded) return decoded

  if (drepId.startsWith('drep1') && drepId.length === 58) {
    const base32Parsed = base32ToHex(drepId)
    if (!base32Parsed) {
      throw new Error('Invalid key DRep ID. Must have 58 hex characters')
    }
    return parseDrepId(base32Parsed)
  }

  throw new Error(
    'Invalid DRep ID. Must have a valid key or script bech32 format',
  )
}

const decodeBech32Hash = (
  drepId: string,
): {type: 'key'; hash: string} | {type: 'script'; hash: string} | null => {
  try {
    const decoded = bech32Module.decode(drepId, drepId.length)
    const hash = convertBase32ToHex(decoded.words)
    if (!/^[0-9a-f]{56}$/.test(hash)) return null
    if (decoded.prefix === 'drep_vkh' || decoded.prefix === 'drep') {
      return {type: 'key', hash}
    }
    if (decoded.prefix === 'drep_script') return {type: 'script', hash}
  } catch {
    return null
  }
  return null
}

export const convertHexKeyHashToBech32Format = (drepId: string): string => {
  if (!/^[0-9a-fA-F]{56}$/.test(drepId)) {
    throw new Error('Invalid key hash hex')
  }
  return bech32Module.encode(
    'drep',
    bech32Module.toWords(Buffer.from(drepId, 'hex')),
  )
}

const base32ToHex = (base32: string): string | null => {
  try {
    const base32Words = bech32Module.decode(base32, base32.length)
    return base32Words?.words ? convertBase32ToHex(base32Words.words) : null
  } catch (e) {
    return null
  }
}

const convertBase32ToHex = (words: number[]): string => {
  return Buffer.from(bech32Module.fromWords(words)).toString('hex')
}

export const convertDrepHashToCIP129Format = (
  hash: string,
  kind: 'key' | 'script',
) => {
  const prefix = kind === 'script' ? '23' : '22'
  return hexToBase32(prefix + hash, 'drep')
}

export const convertDrepHashToCIP105Format = (hash: string) => {
  return hexToBase32(hash, 'drep')
}

const hexToBase32 = (hex: string, prefix: string): string => {
  return bech32Module.encode(
    prefix,
    bech32Module.toWords(Buffer.from(hex, 'hex')),
  )
}
