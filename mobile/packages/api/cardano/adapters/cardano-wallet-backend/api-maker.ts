import {Fetcher, fetcher} from '@yoroi/common'

import * as bech32 from 'bech32'
import {freeze} from 'immer'
import {z} from 'zod'

import {Addresses} from '../../types'

export type CardanoWalletBackendV1Config = {
  baseUrl: string
}

export type CardanoWalletBackendV1Api = {
  filterUsedAddresses(addresses: Addresses): Promise<Addresses>
}

const UsedAddressesSchema = z.array(z.string())
const Bech32Limit = 1023
const PaymentAddressPrefixes = new Set(['addr', 'addr_test'])
const PaymentAddressMaxType = 7
const MinAddresses = 1
const MaxAddresses = 1000

/**
 * The backend route currently accepts Shelley payment addresses only. Callers
 * can use this predicate when selecting an adapter so Byron batches remain on
 * the legacy backend until cardano-wallet-backend#90 is implemented.
 */
export const canUseCardanoWalletBackendV1FilterUsed = (
  addresses: Addresses,
): boolean => {
  if (addresses.length < MinAddresses || addresses.length > MaxAddresses) {
    return false
  }

  return addresses.every((address) => {
    const decoded = bech32.decodeUnsafe(address, Bech32Limit)
    if (decoded == null || !PaymentAddressPrefixes.has(decoded.prefix)) {
      return false
    }

    const header = bech32.fromWordsUnsafe(decoded.words)?.[0]
    return header != null && Math.floor(header / 16) <= PaymentAddressMaxType
  })
}

export const cardanoWalletBackendV1Maker = ({
  config,
  request = fetcher,
}: {
  config: CardanoWalletBackendV1Config
  request?: Fetcher
}): Readonly<CardanoWalletBackendV1Api> => {
  const baseUrl = config.baseUrl.replace(/\/+$/, '')

  if (!baseUrl) {
    throw new Error('cardano-wallet-backend /v1 base URL is required')
  }

  return freeze({
    async filterUsedAddresses(addresses: Addresses): Promise<Addresses> {
      if (addresses.length < MinAddresses || addresses.length > MaxAddresses) {
        throw new Error('filter-used requires between 1 and 1000 addresses')
      }
      if (!canUseCardanoWalletBackendV1FilterUsed(addresses)) {
        throw new Error(
          'cardano-wallet-backend filter-used requires Shelley bech32 payment addresses (addr / addr_test); keep Byron addresses on the legacy backend',
        )
      }

      const response = await request<unknown>({
        url: `${baseUrl}/v1/addresses/filter-used`,
        data: {addresses},
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
      })
      const parsed = UsedAddressesSchema.safeParse(response)

      if (!parsed.success) {
        throw new Error('Invalid cardano-wallet-backend filter-used response')
      }

      const requested = new Set(addresses)
      if (
        parsed.data.some(
          (address) => !requested.has(address as Addresses[number]),
        )
      ) {
        throw new Error('Invalid cardano-wallet-backend filter-used response')
      }

      const used = new Set(parsed.data)
      return addresses.filter((address) => used.has(address))
    },
  })
}
