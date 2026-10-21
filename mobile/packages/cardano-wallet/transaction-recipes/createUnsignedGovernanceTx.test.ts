import {Portfolio, Wallet} from '@yoroi/types'

import BigNumber from 'bignumber.js'

import {createUnsignedGovernanceTx} from './createUnsignedGovernanceTx'

jest.mock('@yoroi/tx', () => ({
  CertificateKind: {StakeRegistration: 'StakeRegistration'},
  addCertificate: jest.fn((state, certificate) => ({
    ...state,
    certificates: [...state.certificates, certificate],
  })),
  addInputs: jest.fn((state) => state),
  buildRecipeTransaction: jest.fn(async () => ({cbor: '84a0a0f5'})),
  createCardanoHaskellConfig: jest.fn(() => ({minimumUtxoVal: '1000000'})),
  createTransactionBuilder: jest.fn(() => ({certificates: []})),
  filterPureAdaUtxos: jest.fn((utxos) => utxos),
  selectUtxosForAmount: jest.fn(() => []),
  setChangeAddress: jest.fn((state) => state),
  setTTLWithBuffer: jest.fn((state) => state),
}))

describe('createUnsignedGovernanceTx', () => {
  it('forwards serializable governance certificate data without CSL conversion', async () => {
    const primaryTokenId = '' as Portfolio.Token.Id
    const certificates = [
      {
        kind: 'StakeRegistration' as const,
        stakeCredentialKeyHashHex: 'aa'.repeat(28) as never,
      },
      {
        kind: 'VoteDelegation' as const,
        stakeCredentialKeyHashHex: 'aa'.repeat(28) as never,
        drep: {KeyHash: 'bb'.repeat(28) as never},
      },
    ]

    const result = await createUnsignedGovernanceTx({
      utxos: [
        {
          receiver: 'addr_test1change' as never,
          txHash: 'cc'.repeat(32) as never,
          txIndex: 0,
          balance: {[primaryTokenId]: '10000000' as never},
          toTransactionUnspentOutputHex: () => '',
        },
      ],
      primaryTokenId,
      protocolParams: {
        coinsPerUtxoByte: '4310',
        keyDeposit: '2000000',
        linearFee: {constant: '155381', coefficient: '44'},
        poolDeposit: '500000000',
      },
      networkId: 0,
      getAbsoluteSlotNumber: async () => new BigNumber(100),
      getChangeAddress: () => 'addr_test1change',
      votingCertificates: certificates,
      addressMode: 'single' as Wallet.AddressMode,
    })

    expect(result).toEqual({cbor: '84a0a0f5'})
    expect(jest.requireMock('@yoroi/tx').addCertificate).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      certificates[0],
    )
    expect(jest.requireMock('@yoroi/tx').addCertificate).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      certificates[1],
    )
  })
})
