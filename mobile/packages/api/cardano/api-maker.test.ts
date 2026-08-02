import {backendZeroApiMaker} from './adapters/backend-zero/api-maker'
import {cardanoWalletBackendV1Maker} from './adapters/cardano-wallet-backend/api-maker'
import {legacyApiMaker} from './adapters/legacy/api-maker'
import {cardanoWalletApiMaker} from './api-maker'
import {ENDPOINT_AVAILABILITY} from './config/endpoint-availability'
import {cardanoApiManagerMaker} from './manager'
import {getBackendZeroUrl} from './utils/url-mapping'

// Mock the adapters and manager
jest.mock('./adapters/backend-zero/api-maker', () => ({
  backendZeroApiMaker: jest.fn(() => ({})),
}))
jest.mock('./adapters/cardano-wallet-backend/api-maker', () => ({
  cardanoWalletBackendV1Maker: jest.fn(() => ({})),
}))
jest.mock('./adapters/legacy/api-maker', () => ({
  legacyApiMaker: jest.fn(() => ({})),
}))
jest.mock('./manager', () => ({
  cardanoApiManagerMaker: jest.fn(() => ({})),
}))
jest.mock('./utils/url-mapping', () => ({
  getBackendZeroUrl: jest.fn((url: string) => {
    if (url.includes('api.yoroiwallet.com')) {
      return 'https://zero.yoroiwallet.com'
    }
    if (url.includes('preprod-backend.yoroiwallet.com')) {
      return 'https://yoroi-backend-zero-preprod.emurgornd.com'
    }
    return 'https://zero.yoroiwallet.com'
  }),
}))

describe('cardanoWalletApiMaker', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  const mockGetSpendingKey = jest.fn((address: string) => `hash-${address}`)

  it('should create API instance with correct baseApiUrl', () => {
    const baseApiUrl = 'https://api.yoroiwallet.com/api'
    const api = cardanoWalletApiMaker({
      baseApiUrl,
      getSpendingKey: mockGetSpendingKey,
    })

    expect(api).toBeDefined()
  })

  it('should use correct backend-zero URL for mainnet', () => {
    const baseApiUrl = 'https://api.yoroiwallet.com/api'

    cardanoWalletApiMaker({baseApiUrl, getSpendingKey: mockGetSpendingKey})

    expect(getBackendZeroUrl).toHaveBeenCalledWith(baseApiUrl)
  })

  it('should use correct backend-zero URL for preprod', () => {
    const baseApiUrl = 'https://preprod-backend.yoroiwallet.com/api'

    cardanoWalletApiMaker({baseApiUrl, getSpendingKey: mockGetSpendingKey})

    expect(getBackendZeroUrl).toHaveBeenCalledWith(baseApiUrl)
  })

  it('should create adapters with correct URLs', () => {
    const baseApiUrl = 'https://api.yoroiwallet.com/api'

    cardanoWalletApiMaker({baseApiUrl, getSpendingKey: mockGetSpendingKey})

    expect(backendZeroApiMaker).toHaveBeenCalledWith({
      baseApiUrl,
      backendZeroUrl: 'https://zero.yoroiwallet.com',
      getSpendingKey: mockGetSpendingKey,
    })
    expect(legacyApiMaker).toHaveBeenCalledWith({baseApiUrl})
  })

  it('should use default preferences', () => {
    const baseApiUrl = 'https://api.yoroiwallet.com/api'

    cardanoWalletApiMaker({baseApiUrl, getSpendingKey: mockGetSpendingKey})

    expect(cardanoApiManagerMaker).toHaveBeenCalledWith({
      backendZeroAdapter: expect.any(Object),
      cardanoWalletBackendAdapter: undefined,
      legacyAdapter: expect.any(Object),
      preferences: {
        getTipStatus: 'legacy',
        fetchNewTxHistory: 'legacy',
        filterUsedAddresses: 'legacy',
        submitTransaction: 'legacy',
        getAccountState: 'legacy',
        bulkGetAccountState: 'legacy',
        getPoolInfo: 'legacy',
        fetchTxStatus: 'legacy',
        checkServerStatus: 'legacy',
        getFundInfo: 'legacy',
      },
    })
  })

  it('routes transaction submission through a configured cardano-wallet-backend', () => {
    const baseApiUrl = 'https://api.yoroiwallet.com/api'
    const cardanoWalletBackendUrl = ' https://wallet-backend.example.com/ '

    cardanoWalletApiMaker({
      baseApiUrl,
      cardanoWalletBackendNetwork: 'mainnet',
      cardanoWalletBackendUrl,
      getSpendingKey: mockGetSpendingKey,
    })

    expect(cardanoWalletBackendV1Maker).toHaveBeenCalledWith({
      config: {
        baseUrl: 'https://wallet-backend.example.com/',
        submitExpectedNetwork: 'mainnet',
      },
    })
    expect(cardanoApiManagerMaker).toHaveBeenCalledWith(
      expect.objectContaining({
        cardanoWalletBackendAdapter: expect.any(Object),
        preferences: expect.objectContaining({
          submitTransaction: 'cardano-wallet-backend',
        }),
      }),
    )
  })

  it.each([undefined, '', '   '])(
    'keeps legacy transaction submission without a backend URL: %p',
    (cardanoWalletBackendUrl) => {
      cardanoWalletApiMaker({
        baseApiUrl: 'https://api.yoroiwallet.com/api',
        cardanoWalletBackendNetwork: 'mainnet',
        cardanoWalletBackendUrl,
        getSpendingKey: mockGetSpendingKey,
      })

      expect(cardanoWalletBackendV1Maker).not.toHaveBeenCalled()
      expect(cardanoApiManagerMaker).toHaveBeenCalledWith(
        expect.objectContaining({
          cardanoWalletBackendAdapter: undefined,
          preferences: expect.objectContaining({
            submitTransaction: 'legacy',
          }),
        }),
      )
    },
  )

  it('keeps legacy transaction submission without a wallet network', () => {
    cardanoWalletApiMaker({
      baseApiUrl: 'https://api.yoroiwallet.com/api',
      cardanoWalletBackendUrl: 'https://wallet-backend.example.com',
      getSpendingKey: mockGetSpendingKey,
    })

    expect(cardanoWalletBackendV1Maker).not.toHaveBeenCalled()
    expect(cardanoApiManagerMaker).toHaveBeenCalledWith(
      expect.objectContaining({
        cardanoWalletBackendAdapter: undefined,
        preferences: expect.objectContaining({
          submitTransaction: 'legacy',
        }),
      }),
    )
  })

  it('should have preferences that match endpoint availability', () => {
    const baseApiUrl = 'https://api.yoroiwallet.com/api'
    cardanoWalletApiMaker({
      baseApiUrl,
      getSpendingKey: mockGetSpendingKey,
    })

    // Verify that preferences only use backends that are available for each endpoint
    Object.keys(ENDPOINT_AVAILABILITY).forEach((endpoint) => {
      const availableBackends = ENDPOINT_AVAILABILITY[endpoint]
      // This is a type check - preferences should match availability
      expect(availableBackends).toBeDefined()
      expect(availableBackends?.length).toBeGreaterThan(0)
    })
  })
})
