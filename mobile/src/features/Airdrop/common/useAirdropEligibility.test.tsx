import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {renderHook} from '@testing-library/react-native'
import * as React from 'react'

import {redemptionApi} from '../api/redemptionApi'
import {useAirdropEligibility} from './useAirdropEligibility'

const mockWallet = {
  id: 'mainnet-wallet',
  isMainnet: true,
  receiveAddresses: jest.fn(() => ['addr1']),
}

jest.mock('@yoroi/wallet-manager', () => ({
  useWalletManager: () => ({selected: {wallet: mockWallet}}),
  useWalletEvent: jest.fn(),
}))
jest.mock('~/common/hooks/useRemoteConfig', () => ({
  useRemoteConfig: () => ({
    config: {features: {midnightAirdrop: {enabled: true}}},
  }),
}))
jest.mock('~/features/WalletManager/hooks/useIsByronWallet', () => ({
  useIsByronWallet: () => false,
}))
jest.mock('~/kernel/constants', () => ({cardanoWalletBackendUrl: undefined}))
jest.mock('./airdropAddressCache', () => ({
  useAirdropAddressCache: () => ({
    getEligibleAddresses: jest.fn(),
    getNotEligibleAddresses: jest.fn(),
    getExternalAddresses: jest.fn(),
    shouldCheckAddress: jest.fn(),
    clearAddressesCache: jest.fn(),
  }),
}))
jest.mock('../api/redemptionApi', () => ({
  redemptionApi: {getThawSchedule: jest.fn()},
}))

describe('useAirdropEligibility', () => {
  it('does not query airdrop eligibility without a backend URL', () => {
    const queryClient = new QueryClient()
    const wrapper = ({children}: {children: React.ReactNode}) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    renderHook(() => useAirdropEligibility(), {wrapper})

    expect(mockWallet.receiveAddresses).not.toHaveBeenCalled()
    expect(redemptionApi.getThawSchedule).not.toHaveBeenCalled()
    queryClient.clear()
  })
})
