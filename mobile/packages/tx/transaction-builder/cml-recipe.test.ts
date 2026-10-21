import {primaryTokenId} from '@yoroi/portfolio'
import {Address, Balance, TransactionHash} from '@yoroi/types'

import {addressToHex} from '@yoroi-classic/cml-mobile-bridge'
import {buildTransactionRecipeCml} from '@yoroi-classic/cml-mobile-bridge'

import {CardanoHaskellConfig} from '../types'
import {ModernUtxo} from '../utxo/models'
import {createTransactionBuilder} from './builder'
import type {TransactionBuilderState} from './builder'
import {toCmlTransactionRecipeArguments} from './cml-recipe'
import {buildCmlTransactionRecipe} from './cml-recipe'

jest.mock('@yoroi-classic/cml-mobile-bridge', () => ({
  addressToHex: jest.fn(() => `01${'00'.repeat(28)}`),
  buildTransactionRecipeCml: jest.fn(() => ({cborHex: '84a0a0f5', fee: '100'})),
}))

describe('toCmlTransactionRecipeArguments', () => {
  const tokenId = `${'ab'.repeat(28)}.00ff`
  const config: CardanoHaskellConfig = {
    keyDeposit: '2000000',
    linearFee: {coefficient: '44', constant: '155381'},
    minimumUtxoVal: '1000000',
    coinsPerUtxoByte: '4310',
    poolDeposit: '500000000',
    networkId: 0,
  }
  const utxo = (hash: string, balance: Balance.Amounts): ModernUtxo => ({
    receiver: 'addr_test1qfixture' as Address,
    txHash: hash as TransactionHash,
    txIndex: 3,
    balance,
    toTransactionUnspentOutputHex: () => 'unused',
  })

  it('preserves exact values and every represented recipe field in normalized CML DTOs', () => {
    const state: TransactionBuilderState = {
      ...createTransactionBuilder(),
      inputs: [
        {
          utxo: {
            ...utxo('11'.repeat(32), {
              [primaryTokenId]: '9007199254740993' as Balance.Quantity,
              [tokenId]: '18446744073709551615' as Balance.Quantity,
            }),
            inlineDatumCborHex: 'd87980',
            datumHashHex: '22'.repeat(32),
            referenceScript: {
              hash: '33'.repeat(28),
              type: 'plutusV3',
              size: 2,
              bytes: '4e00',
            },
          },
        },
      ],
      outputs: [
        {
          address: 'addr_test1qout' as Address,
          amounts: {
            [primaryTokenId]: '9007199254740993' as Balance.Quantity,
            [tokenId]: '18446744073709551615' as Balance.Quantity,
          },
          datum: {hash: '44'.repeat(32) as never},
        },
      ],
      referenceInputs: [
        {
          utxo: utxo('55'.repeat(32), {
            [primaryTokenId]: '7' as Balance.Quantity,
          }),
        },
      ],
      collateralInputs: [
        {
          utxo: utxo('66'.repeat(32), {
            [primaryTokenId]: '3000000' as Balance.Quantity,
          }),
        },
      ],
      metadata: [{label: '674', data: {msg: ['fixture']}}],
      options: {
        changeAddress: 'addr_test1qchange' as Address,
        ttl: 999,
        validityInterval: {start: 100, end: 999},
        manualFee: {[primaryTokenId]: '123456' as Balance.Quantity},
        manualChangeOutput: {
          address: 'addr_test1qchange' as Address,
          amounts: {[primaryTokenId]: '42' as Balance.Quantity},
          datum: {data: 'd87980' as never},
        },
        mints: [
          {
            policyId: '77'.repeat(28),
            script: {type: 'plutus', plutusVersion: 'plutusV2', script: '4e00'},
            assets: [{assetName: '00ff', amount: '-9007199254740993'}],
            redeemer: 'd87980',
            redeemerExUnits: {mem: '100000', steps: '200000'},
          },
        ],
      },
    }

    const args = toCmlTransactionRecipeArguments(state, config, primaryTokenId)

    expect(args.inputs[0]).toMatchObject({
      txHashHex: '11'.repeat(32),
      index: '3',
      addressHex: `01${'00'.repeat(28)}`,
      isBootstrap: false,
      lovelace: '9007199254740993',
      assets: [
        {
          policyIdHex: 'ab'.repeat(28),
          assetNameHex: '00ff',
          quantity: '18446744073709551615',
        },
      ],
      inlineDatumCborHex: 'd87980',
      datumHashHex: '22'.repeat(32),
      referenceScript: {
        hash: '33'.repeat(28),
        type: 'plutusV3',
        size: 2,
        bytes: '4e00',
      },
    })
    expect(args.outputs[0]).toEqual({
      address: 'addr_test1qout',
      lovelace: '9007199254740993',
      assets: [
        {
          policyIdHex: 'ab'.repeat(28),
          assetNameHex: '00ff',
          quantity: '18446744073709551615',
        },
      ],
      datum: {kind: 'hash', hex: '44'.repeat(32)},
    })
    expect(args.referenceInputs[0]).toMatchObject({
      txHashHex: '55'.repeat(32),
      index: '3',
      lovelace: '7',
    })
    expect(args.collateralInputs[0]).toMatchObject({
      txHashHex: '66'.repeat(32),
      lovelace: '3000000',
    })
    expect(args.metadata).toEqual([{label: '674', data: {msg: ['fixture']}}])
    expect(args.mints[0]).toEqual({
      policyIdHex: '77'.repeat(28),
      scriptType: 'plutusV2',
      scriptCborHex: '4e00',
      assets: [{assetNameHex: '00ff', quantity: '-9007199254740993'}],
      redeemerCborHex: 'd87980',
      redeemerMem: '100000',
      redeemerSteps: '200000',
    })
    expect(args.options).toEqual({
      changeAddress: 'addr_test1qchange',
      ttl: '999',
      validityIntervalStart: '100',
      validityIntervalEnd: '999',
      manualFee: '123456',
      manualChangeOutput: {
        address: 'addr_test1qchange',
        lovelace: '42',
        assets: [],
        datum: {kind: 'inline', hex: 'd87980'},
      },
    })
    expect(args.protocolParams).toMatchObject({
      linearFee: {coefficient: '44', constant: '155381'},
      coinsPerUtxoByte: '4310',
      keyDeposit: '2000000',
      poolDeposit: '500000000',
      maxValueSize: '5000',
      maxTxSize: '16384',
    })
  })

  it('identifies Byron UTxOs from CML serialized address bytes', () => {
    jest.mocked(addressToHex).mockReturnValueOnce(`80${'00'.repeat(28)}`)
    const state = {
      ...createTransactionBuilder(),
      inputs: [
        {
          utxo: utxo('11'.repeat(32), {
            [primaryTokenId]: '1000000' as Balance.Quantity,
          }),
        },
      ],
      options: {changeAddress: 'Ae2fixture' as Address},
    } as unknown as TransactionBuilderState

    expect(
      toCmlTransactionRecipeArguments(state, config, primaryTokenId).inputs[0],
    ).toMatchObject({
      addressHex: `80${'00'.repeat(28)}`,
      isBootstrap: true,
    })
  })

  it('preserves explicitly balanced manual-fee transactions without a change address', () => {
    const state = {
      ...createTransactionBuilder(),
      inputs: [
        {
          utxo: utxo('11'.repeat(32), {
            [primaryTokenId]: '1000000' as Balance.Quantity,
          }),
        },
      ],
      outputs: [
        {
          address: 'addr_test1qrecipient' as Address,
          amounts: {[primaryTokenId]: '999900' as Balance.Quantity},
        },
      ],
      options: {manualFee: {[primaryTokenId]: '100' as Balance.Quantity}},
    } as unknown as TransactionBuilderState

    expect(
      toCmlTransactionRecipeArguments(state, config, primaryTokenId).options,
    ).toEqual({
      manualFee: '100',
    })
  })

  it('carries native-script input witness data without converting counts through Number', () => {
    const state = {
      ...createTransactionBuilder(),
      inputs: [
        {
          utxo: utxo('11'.repeat(32), {
            [primaryTokenId]: '1000000' as Balance.Quantity,
          }),
          kind: 'nativeScript' as const,
          nativeScriptCborHex: `8200581c${'cd'.repeat(28)}`,
          nativeScriptWitnessCount: '2',
        },
      ],
      options: {changeAddress: 'addr_test1qchange' as Address},
    }

    expect(
      toCmlTransactionRecipeArguments(state, config, primaryTokenId).inputs[0],
    ).toMatchObject({
      kind: 'nativeScript',
      nativeScriptCborHex: `8200581c${'cd'.repeat(28)}`,
      nativeScriptWitnessCount: '2',
    })
  })

  it('rejects empty native-script signer-count metadata', () => {
    const state = {
      ...createTransactionBuilder(),
      inputs: [
        {
          utxo: utxo('11'.repeat(32), {
            [primaryTokenId]: '1000000' as Balance.Quantity,
          }),
          kind: 'nativeScript' as const,
          nativeScriptCborHex: `8200581c${'cd'.repeat(28)}`,
          nativeScriptWitnessCount: '',
        },
      ],
      options: {changeAddress: 'addr_test1qchange' as Address},
    }

    expect(() =>
      toCmlTransactionRecipeArguments(state, config, primaryTokenId),
    ).toThrow('Native-script input requires signer-count metadata')
  })

  it('requires an explicit Plutus language for new inline-script recipes', () => {
    const state = {
      ...createTransactionBuilder(),
      scriptInputs: [
        {
          utxo: utxo('11'.repeat(32), {
            [primaryTokenId]: '1000000' as Balance.Quantity,
          }),
          scriptHash: '22'.repeat(28),
          inlineScriptCborHex: '4e00',
          redeemer: 'd87980',
          redeemerExUnits: {mem: '1', steps: '2'},
          datumSource: {data: 'd87980'},
        },
      ],
      options: {changeAddress: 'addr_test1qchange' as Address},
    } as unknown as TransactionBuilderState

    expect(() =>
      toCmlTransactionRecipeArguments(state, config, primaryTokenId),
    ).toThrow('Inline Plutus script requires a language version')
  })

  it('fails instead of dropping an incomplete Plutus mint witness recipe', () => {
    const state = {
      ...createTransactionBuilder(),
      options: {
        changeAddress: 'addr_test1qchange' as Address,
        mints: [
          {
            policyId: '77'.repeat(28),
            script: {type: 'plutus' as const, script: '4e00'},
            assets: [{assetName: '00ff', amount: '1'}],
          },
        ],
      },
    } as unknown as TransactionBuilderState

    expect(() =>
      toCmlTransactionRecipeArguments(state, config, primaryTokenId),
    ).toThrow('Plutus mint requires a script language version')
  })

  it('computes ceil(fee * collateral percentage / 100), conserves return value, and converges after fee size changes', () => {
    const state: TransactionBuilderState = {
      ...createTransactionBuilder(),
      scriptInputs: [
        {
          utxo: utxo('11'.repeat(32), {
            [primaryTokenId]: '1000000' as Balance.Quantity,
          }),
          scriptHash: '22'.repeat(28),
          redeemer: 'd87980',
          redeemerExUnits: {mem: '1', steps: '2'},
          datumSource: {data: 'd87980'},
          referenceScriptUtxo: {
            txHash: '33'.repeat(32),
            txIndex: 0,
            langVersion: 'v3',
            scriptSize: 2,
            output: {
              address: 'addr_test1qref' as Address,
              lovelace: '1000000',
              assets: [],
              scriptCborHex: '4e00',
            },
          },
        },
      ],
      collateralInputs: [
        {
          utxo: utxo('44'.repeat(32), {
            [primaryTokenId]: '1000' as Balance.Quantity,
            [tokenId]: '5' as Balance.Quantity,
          }),
        },
      ],
      options: {changeAddress: 'addr_test1qchange' as Address},
    }
    const build = jest.mocked(buildTransactionRecipeCml)
    build.mockReset()
    build.mockReturnValueOnce({cborHex: 'base', fee: '101'})
    build.mockReturnValueOnce({cborHex: 'with-return-152', fee: '102'})
    build.mockReturnValueOnce({cborHex: 'with-return-153', fee: '102'})

    expect(
      buildCmlTransactionRecipe(
        state,
        {...config, collateralPercentage: '150'},
        primaryTokenId,
      ),
    ).toEqual({
      cborHex: 'with-return-153',
      fee: '102',
    })
    expect(build).toHaveBeenCalledTimes(3)
    expect(build.mock.calls[1]?.[0]).toMatchObject({
      totalCollateral: '152',
      collateralReturn: {
        lovelace: '848',
        assets: [
          {policyIdHex: 'ab'.repeat(28), assetNameHex: '00ff', quantity: '5'},
        ],
      },
    })
    expect(build.mock.calls[2]?.[0].totalCollateral).toBe('153')
    build.mockReset()
  })

  it('rejects collateral below the protocol-derived minimum', () => {
    const state: TransactionBuilderState = {
      ...createTransactionBuilder(),
      scriptInputs: [
        {
          utxo: utxo('11'.repeat(32), {
            [primaryTokenId]: '1000000' as Balance.Quantity,
          }),
          scriptHash: '22'.repeat(28),
          redeemer: 'd87980',
          redeemerExUnits: {mem: '1', steps: '2'},
          datumSource: {data: 'd87980'},
          referenceScriptUtxo: {
            txHash: '33'.repeat(32),
            txIndex: 0,
            langVersion: 'v3',
            scriptSize: 2,
            output: {
              address: 'addr_test1qref' as Address,
              lovelace: '1000000',
              assets: [],
              scriptCborHex: '4e00',
            },
          },
        },
      ],
      collateralInputs: [
        {
          utxo: utxo('44'.repeat(32), {
            [primaryTokenId]: '100' as Balance.Quantity,
          }),
        },
      ],
      options: {changeAddress: 'addr_test1qchange' as Address},
    }
    jest
      .mocked(buildTransactionRecipeCml)
      .mockReturnValue({cborHex: 'base', fee: '101'})

    expect(() =>
      buildCmlTransactionRecipe(
        state,
        {...config, collateralPercentage: '150'},
        primaryTokenId,
      ),
    ).toThrow('Collateral contains 100 lovelace but 152 is required')
  })
})
