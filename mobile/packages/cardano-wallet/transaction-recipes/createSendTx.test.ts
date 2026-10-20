import {Balance, Branded, Portfolio, Wallet} from '@yoroi/types'

import {buildSimplePaymentTransaction} from '@yoroi-classic/csl-mobile-bridge'
import BigNumber from 'bignumber.js'

import {createSendTx} from './createSendTx'

jest.mock('@yoroi-classic/csl-mobile-bridge', () => ({
  buildSimplePaymentTransaction: jest.fn(() => ({
    cborHex: '84a0a0f5',
    fee: '177381',
  })),
  minimumCoinForAssets: jest.fn(() => '1000000'),
}))

describe('createSendTx CML route', () => {
  beforeEach(() => jest.clearAllMocks())

  it('builds a simple wallet payment with CML and returns its CBOR/fee', async () => {
    const changeAddress = Branded.asAddress(
      'addr_test1qrg0x4sx2wfd3l26zqs658u8vyg8qz4dzqw0zke45lpy0vkr3y3kdut55a40jff00qmg74686vz44v6k363md06qkq0qzplc3l',
    )
    const inputAddress = changeAddress
    const outputAddress = changeAddress
    const primaryTokenId = '' as Portfolio.Token.Id

    const result = await createSendTx({
      utxos: [
        {
          receiver: inputAddress,
          txHash: Branded.asTransactionHash('a'.repeat(64)),
          txIndex: 0,
          balance: {[primaryTokenId]: '4000000' as Balance.Quantity},
          toTransactionUnspentOutputHex: () => '',
          toTransactionUnspentOutput: () => undefined as never,
        },
      ],
      entries: [
        {
          address: outputAddress,
          amounts: {[primaryTokenId]: '2000000' as Balance.Quantity},
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
      getChangeAddress: () => changeAddress,
      addressMode: 'single' as Wallet.AddressMode,
    })

    expect(result).toEqual({cbor: '84a0a0f5'})
    expect(buildSimplePaymentTransaction).toHaveBeenCalledTimes(1)
    expect(buildSimplePaymentTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        ttl: '100',
        changeAddress,
        outputs: [expect.objectContaining({address: outputAddress})],
      }),
    )
  })
})
