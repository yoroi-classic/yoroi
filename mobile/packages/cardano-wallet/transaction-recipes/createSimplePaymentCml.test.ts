import {
  buildSimplePaymentTransaction,
  minimumCoinForAssets,
} from '@yoroi-classic/csl-mobile-bridge'

import {
  buildSimplePaymentCml,
  minimumAdaForAssetsCml,
} from './createSimplePaymentCml'

jest.mock('@yoroi-classic/csl-mobile-bridge', () => ({
  addressInfoFromAddress: jest.fn((address: string) => ({bech32: address})),
  buildSimplePaymentTransaction: jest.fn(() => ({
    cborHex: '84a0a0f5',
    fee: '168581',
  })),
  minimumCoinForAssets: jest.fn(() => '1500000'),
}))

describe('buildSimplePaymentCml', () => {
  const params = {
    inputs: [
      {
        receiver: 'addr_test_input',
        txHash: 'ab'.repeat(32),
        txIndex: 0,
        balance: {'.': '10000000'},
        toTransactionUnspentOutputHex: jest.fn(),
        toTransactionUnspentOutput: jest.fn(),
      },
    ],
    outputs: [
      {
        address: 'addr_test_output',
        amounts: {'.': '2000000'},
      },
    ],
    changeAddress: 'addr_test_change',
    ttl: 123456,
    protocolParams: {
      linearFee: {coefficient: '44', constant: '155381'},
      coinsPerUtxoByte: '4310',
      keyDeposit: '2000000',
      poolDeposit: '500000000',
    },
    primaryTokenId: '.' as never,
  }

  it('routes ADA-only payments through CML and keeps quantities exact', () => {
    expect(buildSimplePaymentCml(params as never)).toEqual({
      cbor: '84a0a0f5',
      fee: 168581n,
    })
    expect(buildSimplePaymentTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        inputs: [
          {
            transactionHashHex: 'ab'.repeat(32),
            index: '0',
            address: 'addr_test_input',
            lovelace: '10000000',
            assets: [],
          },
        ],
        outputs: [
          {
            address: 'addr_test_output',
            lovelace: '2000000',
            assets: [],
            datum: undefined,
          },
        ],
      }),
    )
  })

  it('passes multiple inputs and outputs without narrowing the supported ADA shape', () => {
    const secondInput = {...params.inputs[0], txHash: 'cd'.repeat(32)}
    const secondOutput = {
      ...params.outputs[0],
      address: 'addr_test_recipient_2',
    }
    expect(
      buildSimplePaymentCml({
        ...params,
        inputs: [params.inputs[0], secondInput],
        outputs: [params.outputs[0], secondOutput],
      } as never),
    ).toEqual({cbor: '84a0a0f5', fee: 168581n})
    expect(buildSimplePaymentTransaction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        inputs: expect.arrayContaining([
          expect.objectContaining({transactionHashHex: 'cd'.repeat(32)}),
        ]),
        outputs: expect.arrayContaining([
          expect.objectContaining({address: 'addr_test_recipient_2'}),
        ]),
      }),
    )
  })

  it('passes asset ids and quantities losslessly to CML', () => {
    const tokenId = `${'ab'.repeat(28)}.00ff`
    buildSimplePaymentCml({
      ...params,
      inputs: [
        {
          ...params.inputs[0],
          balance: {'.': '10000000', [tokenId]: '9007199254740993'},
        },
      ],
      outputs: [
        {
          ...params.outputs[0],
          amounts: {'.': '2000000', [tokenId]: '9007199254740993'},
        },
      ],
    } as never)
    expect(buildSimplePaymentTransaction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        inputs: [
          expect.objectContaining({
            assets: [
              {
                policyIdHex: 'ab'.repeat(28),
                assetNameHex: '00ff',
                quantity: '9007199254740993',
              },
            ],
          }),
        ],
        outputs: [
          expect.objectContaining({
            assets: [
              {
                policyIdHex: 'ab'.repeat(28),
                assetNameHex: '00ff',
                quantity: '9007199254740993',
              },
            ],
          }),
        ],
      }),
    )
  })

  it('uses the CML bridge minimum-coin calculation for change assets', () => {
    const tokenId = `${'ab'.repeat(28)}.00ff`
    expect(
      minimumAdaForAssetsCml({
        address: 'addr_test_change',
        amounts: {'.': '4000000', [tokenId]: '9007199254740993'},
        primaryTokenId: '.' as never,
        coinsPerUtxoByte: '4310',
      }),
    ).toBe(1500000n)
    expect(minimumCoinForAssets).toHaveBeenCalledWith(
      'addr_test_change',
      [
        {
          policyIdHex: 'ab'.repeat(28),
          assetNameHex: '00ff',
          quantity: '9007199254740993',
        },
      ],
      '4310',
    )
  })

  it('normalizes legacy hex Shelley addresses before CML minimum-coin parsing', () => {
    const {addressInfoFromAddress, minimumCoinForAssets} = jest.requireMock(
      '@yoroi-classic/csl-mobile-bridge',
    )
    addressInfoFromAddress.mockReturnValueOnce({bech32: 'addr_test_normalized'})

    minimumAdaForAssetsCml({
      address: '00'.repeat(57),
      amounts: {[`${'ab'.repeat(28)}.00ff`]: '1'},
      primaryTokenId: '.' as never,
      coinsPerUtxoByte: '4310',
    })

    expect(addressInfoFromAddress).toHaveBeenCalledWith('00'.repeat(57))
    expect(minimumCoinForAssets).toHaveBeenLastCalledWith(
      'addr_test_normalized',
      [{policyIdHex: 'ab'.repeat(28), assetNameHex: '00ff', quantity: '1'}],
      '4310',
    )
  })

  it('passes inline and hash datums through to the CML output builder', () => {
    buildSimplePaymentCml({
      ...params,
      outputs: [{...params.outputs[0], datum: {data: 'd87980'}}],
    } as never)
    expect(buildSimplePaymentTransaction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        outputs: [
          expect.objectContaining({datum: {kind: 'inline', hex: 'd87980'}}),
        ],
      }),
    )
    buildSimplePaymentCml({
      ...params,
      outputs: [{...params.outputs[0], datum: {hash: 'ab'.repeat(32)}}],
    } as never)
    expect(buildSimplePaymentTransaction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        outputs: [
          expect.objectContaining({
            datum: {kind: 'hash', hex: 'ab'.repeat(32)},
          }),
        ],
      }),
    )
  })

  it('passes auxiliary metadata through to CML rather than falling back to CSL', () => {
    const metadata = [
      {
        label: '674',
        data: {msg: ['mobile|fixture', 'large integer stays a string']},
      },
    ]
    expect(buildSimplePaymentCml({...params, metadata} as never)).toEqual({
      cbor: '84a0a0f5',
      fee: 168581n,
    })
    expect(buildSimplePaymentTransaction).toHaveBeenLastCalledWith(
      expect.objectContaining({metadata}),
    )
  })

  it('passes Byron output and change addresses to the CML bridge', () => {
    const outputAddress =
      'Ae2tdPwUPEZD9QQf2ZrcYV34pYJwxK4vqXaF8EXkup1eYH73zUScHReM42b'
    const changeAddress =
      'Ae2tdPwUPEZGUEsuMAhvDcy94LKsZxDjCbgaiBBMgYpR8sKf96xJmit7Eho'
    buildSimplePaymentCml({
      ...params,
      outputs: [{...params.outputs[0], address: outputAddress}],
      changeAddress,
    } as never)
    expect(buildSimplePaymentTransaction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        inputs: [expect.objectContaining({address: 'addr_test_input'})],
        outputs: [expect.objectContaining({address: outputAddress})],
        changeAddress,
      }),
    )
  })

  it('keeps Byron source inputs on the existing signer until bootstrap witness support is wired', () => {
    expect(
      buildSimplePaymentCml({
        ...params,
        inputs: [
          {
            ...params.inputs[0],
            receiver:
              'Ae2tdPwUPEZ5uzkzh1o2DHECiUi3iugvnnKHRisPgRRP3CTF4KCMvy54Xd3',
          },
        ],
      } as never),
    ).toBeUndefined()
  })

  it('routes script-address outputs with inline Plutus data through CML', () => {
    const scriptAddress =
      'addr_test1wzzfgjazt5ts34cstrhzaac4xav8x7z2m3vg76s8qmaztzglsw8k5'
    buildSimplePaymentCml({
      ...params,
      outputs: [
        {...params.outputs[0], address: scriptAddress, datum: {data: 'd87980'}},
      ],
    } as never)
    expect(buildSimplePaymentTransaction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        outputs: [
          expect.objectContaining({
            address: scriptAddress,
            datum: {kind: 'inline', hex: 'd87980'},
          }),
        ],
      }),
    )
  })
})
