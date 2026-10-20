import {RawUtxo} from '@yoroi/api'

import {calcLockedDeposit, calcOptimizedLockedDeposit} from './assetUtils'

jest.mock('@yoroi-classic/csl-mobile-bridge', () => ({
  addressInfoFromAddress: jest.fn((address: string) => ({bech32: address})),
  minimumCoinForAssets: jest.fn(),
}))

const makeUtxo = ({
  index,
  address,
  tokenId,
  amount,
}: {
  index: number
  address: string
  tokenId: string
  amount: string
}): RawUtxo => {
  const [policyId = '', name = ''] = tokenId.split('.')
  return {
    amount: '2000000' as never,
    receiver: address as never,
    tx_hash: `${index}`.padStart(64, '0') as never,
    tx_index: index,
    utxo_id: `${index}` as never,
    assets: [
      {
        amount: amount as never,
        tokenId: tokenId as never,
        policyId: policyId as never,
        name: name as never,
      },
    ],
  }
}

describe('assetUtils CML minimum-ADA calculations', () => {
  const tokenId = `${'ab'.repeat(28)}.00ff`

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('sums per-UTxO CML min-ADA values with exact asset quantities', async () => {
    const {minimumCoinForAssets} = jest.requireMock(
      '@yoroi-classic/csl-mobile-bridge',
    )
    minimumCoinForAssets
      .mockReturnValueOnce('1500000')
      .mockReturnValueOnce('1600000')

    const result = await calcLockedDeposit({
      rawUtxos: [
        makeUtxo({
          index: 1,
          address: 'addr_test_one',
          tokenId,
          amount: '9007199254740993',
        }),
        makeUtxo({index: 2, address: 'addr_test_two', tokenId, amount: '3'}),
      ],
      coinsPerUtxoByteStr: '4310',
    })
    expect(result.toString()).toBe('3100000')

    expect(minimumCoinForAssets).toHaveBeenNthCalledWith(
      1,
      'addr_test_one',
      [
        {
          policyIdHex: 'ab'.repeat(28),
          assetNameHex: '00ff',
          quantity: '9007199254740993',
        },
      ],
      '4310',
    )
    expect(minimumCoinForAssets).toHaveBeenNthCalledWith(
      2,
      'addr_test_two',
      [{policyIdHex: 'ab'.repeat(28), assetNameHex: '00ff', quantity: '3'}],
      '4310',
    )
  })

  it('uses CML minimum-ADA values for the optimized consolidation estimate', async () => {
    const {minimumCoinForAssets} = jest.requireMock(
      '@yoroi-classic/csl-mobile-bridge',
    )
    minimumCoinForAssets
      .mockReturnValueOnce('1000000')
      .mockReturnValueOnce('800000')

    const result = await calcOptimizedLockedDeposit({
      rawUtxos: [
        makeUtxo({index: 1, address: 'addr_test_one', tokenId, amount: '2'}),
      ],
      coinsPerUtxoByteStr: '4310',
      maxIterations: 1,
    })

    expect(result.current.toString()).toBe('1000000')
    expect(result.optimized.toString()).toBe('800000')
    expect(result.savings.toString()).toBe('200000')
  })
})
