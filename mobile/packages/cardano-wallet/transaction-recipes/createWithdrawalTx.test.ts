import {Branded} from '@yoroi/types'

import {
  addCertificate,
  addInputs,
  addWithdrawal,
  buildRecipeTransaction,
  createCardanoHaskellConfig,
  createTransactionBuilder,
  filterPureAdaUtxos,
  selectUtxosForAmount,
  setChangeAddress,
  setTTLWithBuffer,
} from '@yoroi/tx'

import {deriveRewardAddressDetails} from '../utils'
import {createWithdrawalTx} from './createWithdrawalTx'

jest.mock('@yoroi/tx', () => ({
  CertificateKind: {StakeDeregistration: 'StakeDeregistration'},
  addCertificate: jest.fn((state) => state),
  addInputs: jest.fn((state) => state),
  addWithdrawal: jest.fn((state) => state),
  buildRecipeTransaction: jest.fn(async () => ({cbor: '84a0a0f5'})),
  createCardanoHaskellConfig: jest.fn(() => ({minimumUtxoVal: '1000000'})),
  createTransactionBuilder: jest.fn(() => ({})),
  filterPureAdaUtxos: jest.fn((utxos) => utxos),
  selectUtxosForAmount: jest.fn(() => []),
  setChangeAddress: jest.fn((state) => state),
  setTTLWithBuffer: jest.fn((state) => state),
}))

jest.mock('../utils', () => ({
  deriveRewardAddressDetails: jest.fn(() => ({
    bech32: 'stake_test1uppdvs5uwtqdc8y88y37rtlywkkkzn8k6whvv8wmemh0usqdl9tqk',
    keyHashHex: '42d6429c72c0dc1c873923e1afe475ad614cf6d3aec61ddbceeefe40',
  })),
}))

describe('createWithdrawalTx', () => {
  const primaryTokenId = 'ada' as never
  const rewardAddressHex =
    'e042d6429c72c0dc1c873923e1afe475ad614cf6d3aec61ddbceeefe40'
  const utxo = {
    balance: {[primaryTokenId]: '5000000'},
  } as never
  const commonParams = {
    utxos: [utxo],
    rewardAddressHex,
    primaryTokenId,
    protocolParams: {
      coinsPerUtxoByte: '4310',
      keyDeposit: '2000000',
      linearFee: {constant: '155381', coefficient: '44'},
      poolDeposit: '500000000',
    },
    networkId: 0,
    getAbsoluteSlotNumber: async () => ({toNumber: () => 123} as never),
    getChangeAddress: () => 'addr_test1change' as never,
    getStakingKey: jest.fn(() => ({hash: jest.fn()})) as never,
    getAccountState: async () => ({
      [rewardAddressHex]: {remainingAmount: '1234567'},
    }) as never,
    shouldDeregister: false,
    addressMode: 'single' as never,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('uses CML reward-address details and preserves the transaction CBOR result', async () => {
    const result = await createWithdrawalTx(commonParams)

    expect(deriveRewardAddressDetails).toHaveBeenCalledWith(rewardAddressHex)
    expect(addWithdrawal).toHaveBeenCalledWith(
      expect.anything(),
      'stake_test1uppdvs5uwtqdc8y88y37rtlywkkkzn8k6whvv8wmemh0usqdl9tqk',
      '1234567',
    )
    expect(result).toEqual({cbor: '84a0a0f5'})
    expect(addInputs).toHaveBeenCalledWith(expect.anything(), [utxo])
    expect(buildRecipeTransaction).toHaveBeenCalledTimes(1)
  })

  it('builds without a withdrawal when there are no withdrawable rewards', async () => {
    const result = await createWithdrawalTx({
      ...commonParams,
      getAccountState: async () => ({
        [rewardAddressHex]: {remainingAmount: Branded.ZERO_QUANTITY},
      }) as never,
    })

    expect(deriveRewardAddressDetails).not.toHaveBeenCalled()
    expect(addWithdrawal).not.toHaveBeenCalled()
    expect(result).toEqual({cbor: '84a0a0f5'})
    expect(createTransactionBuilder).toHaveBeenCalledTimes(1)
    expect(createCardanoHaskellConfig).toHaveBeenCalledWith(
      commonParams.protocolParams,
      commonParams.networkId,
    )
    expect(selectUtxosForAmount).not.toHaveBeenCalled()
    expect(addCertificate).not.toHaveBeenCalled()
    expect(setChangeAddress).toHaveBeenCalledWith(
      expect.anything(),
      'addr_test1change',
    )
    expect(setTTLWithBuffer).toHaveBeenCalledWith(expect.anything(), 123)
    expect(filterPureAdaUtxos).toHaveBeenCalledWith([utxo], primaryTokenId)
  })
})
