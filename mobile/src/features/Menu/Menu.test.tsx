import {render, screen} from '@testing-library/react-native'
import * as React from 'react'

import {MenuNavigator} from './Menu'

let mockBackendUrl: string | undefined

jest.mock('@react-navigation/stack', () => {
  const React = require('react')
  const {Text, View} = require('react-native')

  return {
    createStackNavigator: () => ({
      Navigator: ({children}: {children: React.ReactNode}) => (
        <View>{children}</View>
      ),
      Screen: ({name}: {name: string}) => (
        <Text testID={`menu-route-${name}`}>{name}</Text>
      ),
    }),
  }
})
jest.mock('@yoroi/theme', () => ({
  atoms: {},
  useTheme: () => ({palette: {}, atoms: {}}),
}))
jest.mock('~/common/hooks/useRemoteConfig', () => ({
  useRemoteConfig: () => ({
    config: {features: {midnightAirdrop: {enabled: true}}},
  }),
}))
jest.mock('~/kernel/constants', () => ({
  get cardanoWalletBackendUrl() {
    return mockBackendUrl
  },
}))
jest.mock('~/kernel/i18n/useStrings', () => ({
  useStrings: () => ({
    menu: {menu: 'Menu'},
    transactions: {
      utxo: {utxoListTitle: 'UTxOs'},
      utxoConsolidationTitle: 'Consolidate UTxOs',
      messageSigning: {
        messageSigningTitle: 'Sign message',
        messageSigningResultTitle: 'Message signing result',
      },
    },
  }),
}))
jest.mock('~/kernel/navigation/common/helpers', () => ({
  defaultStackNavigationOptions: () => ({}),
}))
jest.mock('~/features/Airdrop/ui/AirdropNavigator', () => ({
  AirdropNavigator: () => null,
}))
jest.mock('~/features/Settings/ui/shared/NetworkTag', () => ({
  NetworkTag: () => null,
}))
jest.mock(
  '~/features/Transactions/useCases/MessageSigning/MessageSigningResultScreen',
  () => ({
    MessageSigningResultScreen: () => null,
  }),
)
jest.mock(
  '~/features/Transactions/useCases/MessageSigning/MessageSigningScreen',
  () => ({
    MessageSigningScreen: () => null,
  }),
)
jest.mock(
  '~/features/Transactions/useCases/UtxoConsolidation/UtxoConsolidation/UtxoConsolidation',
  () => ({
    UtxoConsolidation: () => null,
  }),
)
jest.mock('~/features/Transactions/useCases/UtxoList/UtxoList', () => ({
  UtxoList: () => null,
}))
jest.mock('../RegisterCatalyst/common/InsufficientFundsModal', () => ({
  InsufficientFundsModal: () => null,
}))

describe('MenuNavigator airdrop route', () => {
  it('omits the route when the backend URL is not configured', () => {
    mockBackendUrl = undefined

    render(<MenuNavigator />)

    expect(screen.queryByTestId('menu-route-airdrop')).toBeNull()
  })

  it('includes the route when the backend URL is configured', () => {
    mockBackendUrl = 'https://wallet-backend.example'

    render(<MenuNavigator />)

    expect(screen.getByTestId('menu-route-airdrop')).toBeTruthy()
  })
})
