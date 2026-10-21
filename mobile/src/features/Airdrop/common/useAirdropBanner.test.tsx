import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {renderHook, waitFor} from '@testing-library/react-native'
import * as React from 'react'

import {useAirdropBanner} from './useAirdropBanner'

const mockRemoveBanner = jest.fn().mockResolvedValue(undefined)
const mockWallet = {
  id: 'mainnet-wallet',
  isMainnet: true,
  receiveAddresses: jest.fn(() => []),
}

jest.mock('@yoroi/notifications', () => ({
  useNotificationManager: () => ({events: {remove: mockRemoveBanner}}),
}))
jest.mock('@yoroi/wallet-manager', () => ({
  useWalletManager: () => ({selected: {network: 'Mainnet', wallet: mockWallet}}),
  useWalletEvent: jest.fn(),
}))
jest.mock('~/common/hooks/useRemoteConfig', () => ({
  useRemoteConfig: () => ({config: {features: {midnightAirdrop: {enabled: true}}}}),
}))
jest.mock('~/kernel/constants', () => ({cardanoWalletBackendUrl: undefined}))
jest.mock('~/kernel/i18n/useStrings', () => ({
  useStrings: () => ({airdrop: {bannerTitle: '', bannerBody: ''}}),
}))
jest.mock('./useAirdropEligibility', () => ({
  useAirdropEligibility: () => ({
    allocations: [],
    totalRedeemableAmount: 0,
    isLoading: false,
  }),
}))

describe('useAirdropBanner', () => {
  it('removes a persisted banner when the backend endpoint is not configured', async () => {
    const queryClient = new QueryClient()
    const wrapper = ({children}: {children: React.ReactNode}) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    renderHook(() => useAirdropBanner(), {wrapper})

    await waitFor(() => expect(mockRemoveBanner).toHaveBeenCalled())
    expect(mockRemoveBanner).toHaveBeenCalledWith(987654321)
    queryClient.clear()
  })
})
