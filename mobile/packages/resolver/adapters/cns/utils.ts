import {Api} from '@yoroi/types'

import {resolveCnsAddressRecord} from '@yoroi-classic/cml-mobile-bridge'

import {
  AssocMap,
  BuiltinByteString,
} from './types'
import {CNSUserRecord} from './types'

export const validateCNSUserRecord = (
  cnsUserRecord: CNSUserRecord,
): boolean => {
  const constructorCorrect = cnsUserRecord.constructor === 0
  const numberOfFieldsCorrect = cnsUserRecord.fields.length === 3

  /**
   * TODO: Validate the following:
   * 1. virtualDomains is an AssocMap
   * 2. socialProfiles is an AssocMap
   * 3. otherRecords is an AssocMap
   * 4. Value of virtualDomains is an Address
   * 5. All other key value is a BuiltinByteString
   */

  return constructorCorrect && numberOfFieldsCorrect
}

export const validateExpiry = (metadata: Api.Cardano.NftMetadata) => {
  const {expiry} = metadata
  const millisecondsNow = Date.now()

  return (expiry as number) > millisecondsNow
}

export const validateVirtualSubdomainEnabled = (
  metadata: Api.Cardano.NftMetadata,
) => {
  const {virtualSubdomainEnabled} = metadata
  return virtualSubdomainEnabled === 'Enabled'
}

/* istanbul ignore next */
export const stringToHex = (str: string) =>
  Buffer.from(str, 'utf8').toString('hex')
/* istanbul ignore next */
export const hexToString = (hex: string) =>
  Buffer.from(hex, 'hex').toString('utf8')

export const parseAssocMapAsync = async <T>(
  assocMapVal: AssocMap<BuiltinByteString, T>,
  itemParser: (args0: T) => Promise<string>,
  limit = 5,
): Promise<string[][]> => {
  const parsedAssocMap: string[][] = []
  const promises: Promise<string>[] = []

  for (let i = 0; i < limit; i += 1) {
    if (i >= assocMapVal.map.length) continue
    const mapItem = assocMapVal.map[i]
    if (!mapItem) throw new Error('bad data')
    promises.push(itemParser(mapItem.v))
  }

  const valueArray = await Promise.all(promises)
  for (let i = 0; i < limit; i += 1) {
    if (i >= assocMapVal.map.length) continue
    const mapItem = assocMapVal.map[i]
    // fixed in ts 5
    /* istanbul ignore next */
    if (!mapItem) throw new Error('bad data')
    const key = hexToString(mapItem.k.bytes)
    const value = valueArray[i]
    if (!value) throw new Error('bad data')
    parsedAssocMap.push([key, value])
  }
  return parsedAssocMap
}

export const parsePlutusAddressToBech32 = (
  plutusAddress: unknown,
  networkId: number,
): string => {
  return resolveCnsAddressRecord({
    plutusAddressJson: JSON.stringify(plutusAddress),
    networkId,
  }).addressBech32
}
