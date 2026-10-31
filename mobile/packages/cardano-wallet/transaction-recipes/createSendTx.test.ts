import {Balance, Branded, Portfolio, Wallet} from '@yoroi/types'

import {
  type SimplePaymentBuilderArguments,
  buildSimplePaymentTransaction,
} from '@yoroi-classic/cml-mobile-bridge'
import BigNumber from 'bignumber.js'

import {createSendTx} from './createSendTx'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  addressInfoFromAddress: jest.fn(() => ({bech32: 'addr_test_normalized'})),
  addressToHex: jest.fn(() => '01'),
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
        ttl: '7300',
        changeAddress: '01',
        outputs: [expect.objectContaining({address: '01'})],
      }),
    )
  })

  it('retries send max after CML reports an insufficient UTxO balance', async () => {
    const {buildSimplePaymentTransaction} = jest.requireMock(
      '@yoroi-classic/cml-mobile-bridge',
    )
    const insufficientBalance = () => {
      throw new Error('UTxO Balance Insufficient. Inputs: Value { coin: 0 }')
    }
    buildSimplePaymentTransaction
      .mockImplementationOnce(insufficientBalance)
      .mockImplementationOnce(insufficientBalance)
    const address = Branded.asAddress(
      'addr_test1qrg0x4sx2wfd3l26zqs658u8vyg8qz4dzqw0zke45lpy0vkr3y3kdut55a40jff00qmg74686vz44v6k363md06qkq0qzplc3l',
    )
    const primaryTokenId = '' as Portfolio.Token.Id

    await expect(
      createSendTx({
        utxos: [
          {
            receiver: address,
            txHash: Branded.asTransactionHash('a'.repeat(64)),
            txIndex: 0,
            balance: {[primaryTokenId]: '4000000' as Balance.Quantity},
            toTransactionUnspentOutputHex: () => '',
          },
        ],
        entries: [
          {
            address,
            amounts: {[primaryTokenId]: '3900000' as Balance.Quantity},
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
        getChangeAddress: () => address,
        addressMode: 'single' as Wallet.AddressMode,
        subtractFeeFromAmount: true,
      }),
    ).resolves.toEqual({cbor: '84a0a0f5'})

    expect(buildSimplePaymentTransaction).toHaveBeenCalledTimes(3)
    const outputAmounts = buildSimplePaymentTransaction.mock.calls.map(
      ([args]: [SimplePaymentBuilderArguments]) =>
        BigInt(args.outputs[0]!.lovelace),
    )
    expect(outputAmounts[1]).toBeLessThan(outputAmounts[0])
    expect(outputAmounts[2]).toBeLessThan(outputAmounts[1])
  })

  it('raises token output ADA to CML minimum before using the fast path', async () => {
    const {minimumCoinForAssets} = jest.requireMock(
      '@yoroi-classic/cml-mobile-bridge',
    )
    minimumCoinForAssets.mockReturnValue('3000000')
    const changeAddress = Branded.asAddress(
      'addr_test1qrg0x4sx2wfd3l26zqs658u8vyg8qz4dzqw0zke45lpy0vkr3y3kdut55a40jff00qmg74686vz44v6k363md06qkq0qzplc3l',
    )
    const primaryTokenId = '' as Portfolio.Token.Id
    const tokenId = `${'a'.repeat(56)}01` as Portfolio.Token.Id

    await createSendTx({
      utxos: [
        {
          receiver: changeAddress,
          txHash: Branded.asTransactionHash('a'.repeat(64)),
          txIndex: 0,
          balance: {
            [primaryTokenId]: '6000000' as Balance.Quantity,
            [tokenId]: '10' as Balance.Quantity,
          },
          toTransactionUnspentOutputHex: () => '',
        },
      ],
      entries: [
        {
          address: changeAddress,
          amounts: {
            [primaryTokenId]: '1000000' as Balance.Quantity,
            [tokenId]: '1' as Balance.Quantity,
          },
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

    expect(buildSimplePaymentTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        outputs: [expect.objectContaining({lovelace: '3000000'})],
      }),
    )
  })
})
