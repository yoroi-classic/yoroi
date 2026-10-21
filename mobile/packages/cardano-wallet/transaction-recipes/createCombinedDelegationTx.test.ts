import {addCertificate} from '@yoroi/tx'
import {Wallet} from '@yoroi/types'

import {normalizePoolIdentifier} from '@yoroi-classic/cml-mobile-bridge'
import BigNumber from 'bignumber.js'

import {createCombinedDelegationTx} from './createCombinedDelegationTx'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  normalizePoolIdentifier: jest.fn(() => ({
    id: 'pool1normalized',
    hash: 'bb'.repeat(28),
  })),
}))

jest.mock('@yoroi/tx', () => ({
  CertificateKind: {StakeDelegation: 'StakeDelegation'},
  RegistrationStatus: {
    DelegateOnly: 'DelegateOnly',
    RegisterAndDelegate: 'RegisterAndDelegate',
  },
  addCertificate: jest.fn((state, certificate) => ({
    ...state,
    certificates: [...state.certificates, certificate],
  })),
  addInputs: jest.fn((state) => state),
  buildRecipeTransaction: jest.fn(async () => ({cbor: 'cml-tx'})),
  createCardanoHaskellConfig: jest.fn(() => ({minimumUtxoVal: '1000000'})),
  createTransactionBuilder: jest.fn(() => ({certificates: []})),
  filterPureAdaUtxos: jest.fn((utxos) => utxos),
  selectUtxosForAmount: jest.fn(() => []),
  setChangeAddress: jest.fn((state) => state),
  setTTLWithBuffer: jest.fn((state) => state),
}))

describe('createCombinedDelegationTx', () => {
  it('normalizes a bech32 pool ID with CML and forwards its hash to the recipe', async () => {
    const result = await createCombinedDelegationTx({
      utxos: [],
      primaryTokenId: '' as never,
      protocolParams: {
        coinsPerUtxoByte: '4310',
        keyDeposit: '2000000',
        linearFee: {constant: '155381', coefficient: '44'},
        poolDeposit: '500000000',
      },
      networkId: 0,
      getAbsoluteSlotNumber: async () => new BigNumber(100),
      getChangeAddress: () => 'addr_test1change',
      getStakingKeyHashHex: () => 'aa'.repeat(28) as never,
      getDelegationStatus: () => ({isRegistered: true}),
      poolId: 'pool1original',
      addressMode: 'single' as Wallet.AddressMode,
    })

    expect(result).toEqual({cbor: 'cml-tx'})
    expect(normalizePoolIdentifier).toHaveBeenCalledWith('pool1original')
    expect(addCertificate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kind: 'StakeDelegation',
        poolKeyHash: 'bb'.repeat(28),
      }),
    )
  })
})
