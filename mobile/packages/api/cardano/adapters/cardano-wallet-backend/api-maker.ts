import {Fetcher, fetcher} from '@yoroi/common'

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
      if (addresses.length < 1 || addresses.length > 1000) {
        throw new Error('filter-used requires between 1 and 1000 addresses')
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
