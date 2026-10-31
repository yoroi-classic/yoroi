import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {renderHook, waitFor} from '@testing-library/react-native'
import * as React from 'react'

import {useAirdropBanner} from './useAirdropBanner'

const mockRemoveBanner = jest.fn().mockResolvedValue(undefined)
const mockShowBanner = jest.fn()
const mockAllocations: unknown[] = [{address: 'addr_test', amount: '1'}]
const mockTotalRedeemableAmount = 1
const mockWallet = {
  id: 'mainnet-wallet',
  isMainnet: true,
  receiveAddresses: jest.fn(() => []),
}
let mockAirdropEnabled = true
let mockBackendUrl: string | undefined
const previousReferenceScriptFlag =
  process.env.EXPO_PUBLIC_CARDANO_WALLET_BACKEND_REFERENCE_SCRIPT_BYTES

jest.mock('@yoroi/notifications', () => ({
  useNotificationManager: () => ({
    events: {read: jest.fn().mockResolvedValue([]), remove: mockRemoveBanner},
  }),
}))
jest.mock('~/features/Notifications/common/banners', () => ({
  BannerIds: {Airdrop: 987654321},
  showBanner: (...args: unknown[]) => mockShowBanner(...args),
}))
jest.mock('@yoroi/wallet-manager', () => ({
  useWalletManager: () => ({
    selected: {network: 'Mainnet', wallet: mockWallet},
  }),
  useWalletEvent: jest.fn(),
}))
jest.mock('~/common/hooks/useRemoteConfig', () => ({
  useRemoteConfig: () => ({
    config: {features: {midnightAirdrop: {enabled: mockAirdropEnabled}}},
  }),
}))
jest.mock('~/kernel/constants', () => ({
  get cardanoWalletBackendUrl() {
    return mockBackendUrl
  },
}))
jest.mock('~/kernel/i18n/useStrings', () => ({
  useStrings: () => ({airdrop: {bannerTitle: '', bannerBody: ''}}),
}))
jest.mock('./useAirdropEligibility', () => ({
  useAirdropEligibility: () => ({
    allocations: mockAllocations,
    totalRedeemableAmount: mockTotalRedeemableAmount,
    isLoading: false,
  }),
}))

describe('useAirdropBanner', () => {
  beforeEach(() => {
    mockAirdropEnabled = true
    mockBackendUrl = undefined
    mockRemoveBanner.mockClear()
    mockShowBanner.mockClear()
  })

  afterEach(() => {
    if (previousReferenceScriptFlag == null) {
      delete process.env
        .EXPO_PUBLIC_CARDANO_WALLET_BACKEND_REFERENCE_SCRIPT_BYTES
    } else {
      process.env.EXPO_PUBLIC_CARDANO_WALLET_BACKEND_REFERENCE_SCRIPT_BYTES =
        previousReferenceScriptFlag
    }
  })

  it('removes a persisted banner when the backend endpoint is not configured', async () => {
    mockShowBanner.mockClear()
    process.env.EXPO_PUBLIC_CARDANO_WALLET_BACKEND_REFERENCE_SCRIPT_BYTES =
      'true'
    const queryClient = new QueryClient()
    const wrapper = ({children}: {children: React.ReactNode}) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    renderHook(() => useAirdropBanner(), {wrapper})

    await waitFor(() => expect(mockRemoveBanner).toHaveBeenCalled())
    expect(mockRemoveBanner).toHaveBeenCalledWith(987654321)
    expect(mockShowBanner).not.toHaveBeenCalled()
    queryClient.clear()
  })

  it('removes a persisted banner when the remote feature is disabled', async () => {
    mockAirdropEnabled = false
    mockBackendUrl = 'https://wallet-backend.example'
    process.env.EXPO_PUBLIC_CARDANO_WALLET_BACKEND_REFERENCE_SCRIPT_BYTES =
      'true'
    const queryClient = new QueryClient()
    const wrapper = ({children}: {children: React.ReactNode}) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    renderHook(() => useAirdropBanner(), {wrapper})

    await waitFor(() => expect(mockRemoveBanner).toHaveBeenCalled())
    expect(mockRemoveBanner).toHaveBeenCalledWith(987654321)
    expect(mockShowBanner).not.toHaveBeenCalled()
    queryClient.clear()
  })
})
