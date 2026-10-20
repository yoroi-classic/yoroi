import {
  signWalletTransactionHex,
  signWalletTransactionPathsHex,
} from '@yoroi-classic/csl-mobile-bridge'

import {
  signWalletTransaction,
  signWalletTransactionWithPaths,
} from './signing-operations'

jest.mock('@yoroi-classic/csl-mobile-bridge', () => ({
  signWalletTransactionHex: jest.fn(() => '0304'),
  signWalletTransactionPathsHex: jest.fn(() => '0506'),
}))

describe('signWalletTransaction', () => {
  beforeEach(() => jest.clearAllMocks())

  it('delegates account and staking derivation and signing to CML', () => {
    const unsignedTransaction = {
      cbor: 'unsigned-cbor',
      certificates: [],
      withdrawals: [{}],
      outputs: [],
    } as never

    const result = signWalletTransaction(
      unsignedTransaction,
      'aabbcc',
      7,
      'cardano-cip1852',
    )

    expect(signWalletTransactionHex).toHaveBeenCalledWith({
      transactionHex: 'unsigned-cbor',
      masterKeyHex: 'aabbcc',
      purpose: '2147485500',
      coinType: '2147485463',
      accountIndex: '7',
      stakingRole: '2',
      stakingIndex: '0',
    })
    expect(Array.from(result)).toEqual([3, 4])
  })

  it('does not request a staking path for a Byron implementation', () => {
    signWalletTransaction(
      {
        cbor: 'unsigned-cbor',
        certificates: [],
        withdrawals: [],
        outputs: [],
      } as never,
      'aabbcc',
      0,
      'cardano-bip44',
    )

    expect(signWalletTransactionHex).toHaveBeenCalledWith({
      transactionHex: 'unsigned-cbor',
      masterKeyHex: 'aabbcc',
      purpose: '2147483692',
      coinType: '2147485463',
      accountIndex: '0',
    })
  })

  it('rejects missing transaction CBOR before invoking native signing', () => {
    expect(() =>
      signWalletTransaction(
        {cbor: undefined, certificates: [], withdrawals: [], outputs: []} as never,
        'aabbcc',
        0,
        'cardano-cip1852',
      ),
    ).toThrow('UnsignedTransaction must have CBOR to sign')
    expect(signWalletTransactionHex).not.toHaveBeenCalled()
  })

  it('signs a transaction with multiple wallet paths through CML', () => {
    const paths = [
      [2147485500, 2147485463, 0x80000007, 0, 3],
      [2147485500, 2147485463, 0x80000007, 2, 0],
    ]
    expect(
      Array.from(
        signWalletTransactionWithPaths('unsigned-cbor', 'aabbcc', paths),
      ),
    ).toEqual([5, 6])
    expect(signWalletTransactionPathsHex).toHaveBeenCalledWith({
      transactionHex: 'unsigned-cbor',
      masterKeyHex: 'aabbcc',
      signerPaths: paths,
    })
  })
})
