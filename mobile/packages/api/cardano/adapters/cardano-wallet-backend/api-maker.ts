import {CardanoMobileWrapped, Fetcher, fetcher} from '@yoroi/common'
import type {TransactionCborBase64} from '@yoroi/types'

import type {WasmModuleProxy} from '@emurgo/cross-csl-core'
import * as bech32 from 'bech32'
import {freeze} from 'immer'
import {z} from 'zod'

import {Addresses} from '../../types'

export type CardanoWalletBackendV1Config = {
  baseUrl: string
}

export type CardanoWalletBackendV1Api = {
  filterUsedAddresses(addresses: Addresses): Promise<Addresses>
  submitTransaction(signedTx: TransactionCborBase64): Promise<void>
}

const UsedAddressesSchema = z.array(z.string())
const SubmitTransactionResponseSchema = z
  .object({txHash: z.string().regex(/^[0-9a-fA-F]{64}$/)})
  .strict()
const Base64CborSchema = z
  .string()
  .min(1)
  .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
const Bech32Limit = 1023
const PaymentAddressPrefixes = new Set(['addr', 'addr_test'])
const PaymentAddressMaxType = 7
const MainnetNetworkId = 1
const MinAddresses = 1
const MaxAddresses = 1000

const transactionCborHex = (signedTx: TransactionCborBase64): string => {
  const encoded = String(signedTx)
  if (!Base64CborSchema.safeParse(encoded).success) {
    throw new Error('Invalid base64 transaction CBOR')
  }

  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.length === 0 || bytes.toString('base64') !== encoded) {
    throw new Error('Invalid base64 transaction CBOR')
  }

  return bytes.toString('hex')
}

const isShelleyPaymentAddress = (
  address: string,
  csl: WasmModuleProxy,
): boolean => {
  const decoded = bech32.decodeUnsafe(address, Bech32Limit)
  if (decoded == null || !PaymentAddressPrefixes.has(decoded.prefix)) {
    return false
  }

  const header = bech32.fromWordsUnsafe(decoded.words)?.[0]
  if (
    header == null ||
    Math.floor(header / 16) > PaymentAddressMaxType ||
    (decoded.prefix === 'addr') !== (header % 16 === MainnetNetworkId)
  ) {
    return false
  }

  const parsed = csl.Address.fromBech32(address)
  return parsed != null && !parsed.isMalformed()
}

export const canUseCardanoWalletBackendV1FilterUsed = (
  addresses: Addresses,
): boolean => {
  if (addresses.length < MinAddresses || addresses.length > MaxAddresses) {
    return false
  }

  try {
    return CardanoMobileWrapped.cslScope((csl) =>
      addresses.every(
        (address) =>
          isShelleyPaymentAddress(address, csl) ||
          csl.ByronAddress.isValid(address),
      ),
    )
  } catch {
    return false
  }
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
          'cardano-wallet-backend filter-used requires valid Shelley or Byron payment addresses',
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

    async submitTransaction(signedTx: TransactionCborBase64): Promise<void> {
      const response = await request<unknown>({
        url: `${baseUrl}/v1/tx/submit`,
        data: {cbor: transactionCborHex(signedTx)},
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
      })

      if (!SubmitTransactionResponseSchema.safeParse(response).success) {
        throw new Error(
          'Invalid cardano-wallet-backend transaction submission response',
        )
      }
    },
  })
}
