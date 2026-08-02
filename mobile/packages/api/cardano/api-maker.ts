import type {Chain} from '@yoroi/types'

import {backendZeroApiMaker} from './adapters/backend-zero/api-maker'
import {cardanoWalletBackendV1Maker} from './adapters/cardano-wallet-backend/api-maker'
import {legacyApiMaker} from './adapters/legacy/api-maker'
import {cardanoApiManagerMaker} from './manager'
import {EndpointPreference, ManagedCardanoApi} from './types'
import {getBackendZeroUrl} from './utils/url-mapping'

export const cardanoWalletApiMaker = ({
  baseApiUrl,
  cardanoWalletBackendNetwork,
  cardanoWalletBackendUrl,
  getSpendingKey,
}: {
  baseApiUrl: string
  cardanoWalletBackendNetwork?: Chain.SupportedNetworks
  cardanoWalletBackendUrl?: string
  getSpendingKey: (address: string) => string | null
}): ManagedCardanoApi => {
  const backendZeroUrl = getBackendZeroUrl(baseApiUrl)
  const backendZeroAdapter = backendZeroApiMaker({
    baseApiUrl,
    backendZeroUrl,
    getSpendingKey,
  })
  const legacyAdapter = legacyApiMaker({baseApiUrl})
  const normalizedCardanoWalletBackendUrl = cardanoWalletBackendUrl?.trim()
  const cardanoWalletBackendAdapter =
    normalizedCardanoWalletBackendUrl && cardanoWalletBackendNetwork
      ? cardanoWalletBackendV1Maker({
          config: {
            baseUrl: normalizedCardanoWalletBackendUrl,
            submitExpectedNetwork: cardanoWalletBackendNetwork,
          },
        })
      : undefined

  // Default preferences matching develop branch usage
  // All endpoints use legacyApiBaseUrl in develop branch
  const defaultPreferences: EndpointPreference = {
    getTipStatus: 'legacy', // Uses legacyApiBaseUrl in develop (via syncTxs)
    fetchNewTxHistory: 'legacy', // Uses legacyApiBaseUrl in develop (via syncTxs)
    filterUsedAddresses: 'legacy', // Uses legacyApiBaseUrl in develop
    submitTransaction:
      cardanoWalletBackendAdapter == null ? 'legacy' : 'cardano-wallet-backend',
    getAccountState: 'legacy', // Uses legacyApiBaseUrl in develop
    bulkGetAccountState: 'legacy', // Uses legacyApiBaseUrl in develop
    getPoolInfo: 'legacy', // Uses legacyApiBaseUrl in develop
    fetchTxStatus: 'legacy', // Uses legacyApiBaseUrl in develop
    checkServerStatus: 'legacy', // Legacy only
    getFundInfo: 'legacy', // Legacy only
  } as const

  return cardanoApiManagerMaker({
    backendZeroAdapter,
    cardanoWalletBackendAdapter,
    legacyAdapter,
    preferences: defaultPreferences,
  })
}
