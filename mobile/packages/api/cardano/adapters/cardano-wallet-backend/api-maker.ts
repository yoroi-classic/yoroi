import {Fetcher, fetcher} from '@yoroi/common'
import type {Chain, TransactionCborBase64} from '@yoroi/types'

import {freeze} from 'immer'
import {z} from 'zod'

import type {AddressUtxo, ResolvedUtxo} from '../../api-types'
import {Addresses} from '../../types'
import {isCardanoPaymentAddress} from './address-validation'

export type CardanoWalletBackendV1Config = {
  baseUrl: string
  submitExpectedNetwork?: Chain.SupportedNetworks
}

export type CardanoWalletBackendV1Api = {
  filterUsedAddresses(addresses: Addresses): Promise<Addresses>
  submitTransaction(signedTx: TransactionCborBase64): Promise<void>
  getUtxosByRef(refs: string[]): Promise<ResolvedUtxo[]>
  getAddressUtxos(address: string): Promise<AddressUtxo[]>
}

// A distinct error lets the API manager fall back only on a confirmed network mismatch.
// eslint-disable-next-line no-restricted-syntax -- An Error subtype distinguishes this fallback case from transport and validation failures.
export class CardanoWalletBackendNetworkMismatchError extends Error {
  constructor() {
    super('cardano-wallet-backend network mismatch')
    this.name = 'CardanoWalletBackendNetworkMismatchError'
  }
}

const UsedAddressesSchema = z.array(z.string())
const SubmitTransactionResponseSchema = z
  .object({txHash: z.string().regex(/^[0-9a-fA-F]{64}$/)})
  .strict()
const StatusResponseSchema = z
  .object({network: z.enum(['mainnet', 'preprod', 'preview'])})
  .passthrough()
const Base64CborSchema = z
  .string()
  .min(1)
  .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
const MinAddresses = 1
const MaxAddresses = 1000
const MaxUtxoRefs = 100
const UtxoReferenceSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{64}#(?:0|[1-9][0-9]{0,4})$/)
const ResolvedUtxoSchema = z
  .object({
    txHash: z.string().regex(/^[0-9a-fA-F]{64}$/),
    outputIndex: z.number().int().nonnegative(),
    address: z.string().min(1),
    value: z.string().regex(/^(0|[1-9][0-9]*)$/),
    assets: z.array(
      z
        .object({
          policyId: z.string().regex(/^[0-9a-fA-F]{56}$/),
          assetName: z.string().regex(/^(?:[0-9a-fA-F]{2}){0,32}$/),
          quantity: z.string().regex(/^(0|[1-9][0-9]*)$/),
        })
        .strict(),
    ),
    datumHash: z.string().optional(),
    inlineDatum: z
      .string()
      .regex(/^(?:[0-9a-fA-F]{2})+$/)
      .optional(),
    referenceScriptHash: z
      .string()
      .regex(/^[0-9a-fA-F]{56}$/)
      .optional(),
    referenceScript: z
      .object({
        hash: z.string().regex(/^[0-9a-fA-F]{56}$/),
        size: z.number().int().nonnegative().optional(),
        type: z.string().min(1).optional(),
        bytes: z.string().regex(/^(?:[0-9a-fA-F]{2})+$/).optional(),
      })
      .strict()
      .optional(),
    spent: z.boolean(),
  })
  .strict()
const AddressUtxoSchema = ResolvedUtxoSchema.omit({spent: true})

const hasConsistentReferenceScript = (utxo: {
  referenceScriptHash?: string
  referenceScript?: {hash: string; size?: number; bytes?: string}
}): boolean => {
  const referenceScript = utxo.referenceScript
  if (!referenceScript) return true
  return (
    (utxo.referenceScriptHash == null ||
      utxo.referenceScriptHash.toLowerCase() === referenceScript.hash.toLowerCase()) &&
    (referenceScript.bytes == null ||
      (referenceScript.size != null &&
        referenceScript.size === referenceScript.bytes.length / 2))
  )
}

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

export const canUseCardanoWalletBackendV1FilterUsed = (
  addresses: Addresses,
): boolean => {
  if (addresses.length < MinAddresses || addresses.length > MaxAddresses) {
    return false
  }

  try {
    return addresses.every(isCardanoPaymentAddress)
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
  const {submitExpectedNetwork} = config

  if (!baseUrl) {
    throw new Error('cardano-wallet-backend /v1 base URL is required')
  }

  return freeze({
    async getAddressUtxos(address: string): Promise<AddressUtxo[]> {
      if (!isCardanoPaymentAddress(address)) {
        throw new Error(
          'cardano-wallet-backend getAddressUtxos requires a valid payment address',
        )
      }
      if (submitExpectedNetwork == null) {
        throw new Error('cardano-wallet-backend network is not configured')
      }
      const statusResponse = await request<unknown>({
        url: `${baseUrl}/v1/status`,
        method: 'GET',
        headers: {Accept: 'application/json'},
      })
      const status = StatusResponseSchema.safeParse(statusResponse)
      if (!status.success) {
        throw new Error('Invalid cardano-wallet-backend status response')
      }
      if (status.data.network !== submitExpectedNetwork) {
        throw new CardanoWalletBackendNetworkMismatchError()
      }
      const response = await request<unknown>({
        url: `${baseUrl}/v1/addresses/utxos`,
        data: {addresses: [address]},
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
      })
      const parsed = z.array(AddressUtxoSchema).safeParse(response)
      if (
        !parsed.success ||
        parsed.data.some(
          (utxo) => utxo.address !== address || !hasConsistentReferenceScript(utxo),
        )
      ) {
        throw new Error('Invalid cardano-wallet-backend address UTxO response')
      }
      return parsed.data
    },

    async getUtxosByRef(refs: string[]): Promise<ResolvedUtxo[]> {
      if (
        refs.length < 1 ||
        refs.length > MaxUtxoRefs ||
        !refs.every((ref) => UtxoReferenceSchema.safeParse(ref).success)
      ) {
        throw new Error(
          'getUtxosByRef requires between 1 and 100 valid txHash#index references',
        )
      }
      if (submitExpectedNetwork == null) {
        throw new Error('cardano-wallet-backend network is not configured')
      }
      const statusResponse = await request<unknown>({
        url: `${baseUrl}/v1/status`,
        method: 'GET',
        headers: {Accept: 'application/json'},
      })
      const status = StatusResponseSchema.safeParse(statusResponse)
      if (!status.success) {
        throw new Error('Invalid cardano-wallet-backend status response')
      }
      if (status.data.network !== submitExpectedNetwork) {
        throw new CardanoWalletBackendNetworkMismatchError()
      }

      const response = await request<unknown>({
        url: `${baseUrl}/v1/tx/utxos`,
        data: {refs},
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
      })
      const parsed = z.array(ResolvedUtxoSchema).safeParse(response)
      if (
        !parsed.success ||
        parsed.data.some((utxo) => !hasConsistentReferenceScript(utxo))
      ) {
        throw new Error(
          'Invalid cardano-wallet-backend transaction UTxO response',
        )
      }
      const requested = new Set(refs.map((ref) => ref.toLowerCase()))
      if (
        parsed.data.some(
          (utxo) =>
            !requested.has(`${utxo.txHash}#${utxo.outputIndex}`.toLowerCase()),
        )
      ) {
        throw new Error(
          'Invalid cardano-wallet-backend transaction UTxO response',
        )
      }
      return parsed.data
    },

    async filterUsedAddresses(addresses: Addresses): Promise<Addresses> {
      if (addresses.length < MinAddresses || addresses.length > MaxAddresses) {
        throw new Error('filter-used requires between 1 and 1000 addresses')
      }
      if (!canUseCardanoWalletBackendV1FilterUsed(addresses)) {
        throw new Error(
          'cardano-wallet-backend filter-used requires valid payment addresses',
        )
      }

      if (submitExpectedNetwork == null) {
        throw new Error(
          'cardano-wallet-backend filter-used network is not configured',
        )
      }

      const statusResponse = await request<unknown>({
        url: `${baseUrl}/v1/status`,
        method: 'GET',
        headers: {Accept: 'application/json'},
      })
      const status = StatusResponseSchema.safeParse(statusResponse)
      if (!status.success) {
        throw new Error('Invalid cardano-wallet-backend status response')
      }
      if (status.data.network !== submitExpectedNetwork) {
        throw new CardanoWalletBackendNetworkMismatchError()
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
      const cbor = transactionCborHex(signedTx)
      if (submitExpectedNetwork == null) {
        throw new Error(
          'cardano-wallet-backend submit network is not configured',
        )
      }

      const statusResponse = await request<unknown>({
        url: `${baseUrl}/v1/status`,
        method: 'GET',
        headers: {Accept: 'application/json'},
      })
      const status = StatusResponseSchema.safeParse(statusResponse)
      if (!status.success) {
        throw new Error('Invalid cardano-wallet-backend status response')
      }
      if (status.data.network !== submitExpectedNetwork) {
        throw new Error('cardano-wallet-backend network mismatch')
      }

      const response = await request<unknown>({
        url: `${baseUrl}/v1/tx/submit`,
        data: {cbor},
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
