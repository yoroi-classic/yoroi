import {render, screen} from '@testing-library/react-native'
import * as React from 'react'

import {Menu, MenuNavigator} from './Menu'

let mockBackendUrl: string | undefined
let mockAirdropEnabled = true
const previousReferenceScriptFlag =
  process.env.EXPO_PUBLIC_CARDANO_WALLET_BACKEND_REFERENCE_SCRIPT_BYTES

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
jest.mock('@yoroi/wallet-manager', () => ({
  useSelectedWallet: () => ({wallet: {}}),
}))
jest.mock('~/features/Airdrop/common/useHasRedeemableThaws', () => ({
  useHasRedeemableThaws: () => ({hasRedeemableThaws: false}),
}))
jest.mock('~/features/WalletManager/hooks/useIsByronWallet', () => ({
  useIsByronWallet: () => false,
}))
jest.mock('../Staking/Staking/PoolTransition/usePoolTransition', () => ({
  usePoolTransition: () => ({isPoolRetiring: false}),
}))
jest.mock('~/features/Dashboard/ui/shared/StakePoolInfos', () => ({
  usePrefetchStakingInfo: () => jest.fn(),
}))
jest.mock('~/features/RegisterCatalyst/common/hooks', () => ({
  useCanVote: () => ({sufficientFunds: true, isLoading: false}),
}))
jest.mock('~/kernel/navigation/hooks/useWalletNavigation', () => ({
  useWalletNavigation: () => ({
    navigateToSettings: jest.fn(),
    navigateToGovernanceCentre: jest.fn(),
    navigateToStakingDashboard: jest.fn(),
    navigateToCatalystVotingDashboard: jest.fn(),
    navigateToUtxoList: jest.fn(),
    navigateToMessageSigning: jest.fn(),
    navigateToAirdrop: jest.fn(),
  }),
}))
jest.mock('~/ui/Modal/context/ModalContext', () => ({
  useModal: () => ({openModal: jest.fn()}),
}))
jest.mock('~/ui/Space/Space', () => ({
  Space: {
    Width: {sm: () => null, lg: () => null},
    Height: {sm: () => null, lg: () => null},
  },
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
  useStrings: () => ({
    menu: {
      menu: 'Menu',
      airdrop: 'Airdrop',
      attention: 'Attention',
      catalystVoting: 'Catalyst',
      governanceCentre: 'Governance',
      knowledgeBase: 'Knowledge base',
      messageSigning: 'Message signing',
      settings: 'Settings',
      stakingCenter: 'Staking',
      supportLink: 'Support',
      supportTitle: 'Support',
      utxoList: 'UTxO list',
    },
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
  afterEach(() => {
    mockAirdropEnabled = true
    mockBackendUrl = undefined
    if (previousReferenceScriptFlag == null) {
      delete process.env
        .EXPO_PUBLIC_CARDANO_WALLET_BACKEND_REFERENCE_SCRIPT_BYTES
    } else {
      process.env.EXPO_PUBLIC_CARDANO_WALLET_BACKEND_REFERENCE_SCRIPT_BYTES =
        previousReferenceScriptFlag
    }
  })

  it('omits the route when the backend URL is not configured', () => {
    mockBackendUrl = undefined

    render(<MenuNavigator />)

    expect(screen.queryByTestId('menu-route-airdrop')).toBeNull()
  })

  it('does not render the airdrop menu entry when the backend URL is not configured', () => {
    mockBackendUrl = undefined

    render(<Menu />)

    expect(screen.queryByText('Airdrop')).toBeNull()
  })

  it('omits the route when the remote airdrop feature is disabled', () => {
    mockBackendUrl = 'https://wallet-backend.example'
    mockAirdropEnabled = false
    process.env.EXPO_PUBLIC_CARDANO_WALLET_BACKEND_REFERENCE_SCRIPT_BYTES =
      'true'

    render(<MenuNavigator />)

    expect(screen.queryByTestId('menu-route-airdrop')).toBeNull()
  })

  it('hides the menu entry when the remote airdrop feature is disabled', () => {
    mockBackendUrl = 'https://wallet-backend.example'
    mockAirdropEnabled = false
    process.env.EXPO_PUBLIC_CARDANO_WALLET_BACKEND_REFERENCE_SCRIPT_BYTES =
      'true'

    render(<Menu />)

    expect(screen.queryByText('Airdrop')).toBeNull()
  })

  it('includes the route when the backend URL is configured', () => {
    mockBackendUrl = 'https://wallet-backend.example'
    process.env.EXPO_PUBLIC_CARDANO_WALLET_BACKEND_REFERENCE_SCRIPT_BYTES =
      'true'

    render(<MenuNavigator />)

    expect(screen.getByTestId('menu-route-airdrop')).toBeTruthy()
  })
})
