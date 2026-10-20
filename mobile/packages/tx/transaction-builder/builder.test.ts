import {primaryTokenId} from '@yoroi/portfolio'
import * as cmlMobileBridge from '@yoroi-classic/csl-mobile-bridge'
import {
  Address,
  Amount,
  Balance,
  Chain,
  DatumHash,
  KeyHash,
  TransactionHash,
  UtxoId,
} from '@yoroi/types'

import {NoOutputsError} from '../errors'
import {addMint} from '../minting/mint'
import {ModernUtxo} from '../utxo/models'
import {
  addCertificate,
  addCertificates,
  addCollateralInput,
  addCollateralInputs,
  addInput,
  addInputs,
  addMetadata,
  addOutput,
  addOutputs,
  addReferenceInput,
  addScriptInput,
  addWithdrawal,
  buildTransaction,
  buildTransactionCBOR,
  createTransactionBuilder,
  excludeUtxo,
  excludeUtxos,
  getTransactionState,
  isTransactionReady,
  removeCollateralInput,
  removeInput,
  setChangeAddress,
  setChangeOutput,
  setFee,
  setTTL,
  setTTLWithBuffer,
  setValidityInterval,
} from './builder'
import {createCardanoHaskellConfig} from './helpers'
import type {
  TransactionCertificate,
  TransactionOutput,
  TransactionWithdrawal,
} from './types'

jest.mock('@yoroi-classic/csl-mobile-bridge', () => ({
  buildSimplePaymentTransaction: jest.fn(() => ({cborHex: '84a0a0f5', fee: '168581'})),
  buildEscrowRedeemTransactionCml: jest.fn(() => ({cborHex: '84a0a0f5', fee: '168581'})),
}))

describe('transaction builder', () => {
  const createMockUtxo = (
    txHash: string,
    txIndex: number,
    balance: Balance.Amounts,
  ): ModernUtxo => ({
    receiver: 'addr_test1' as Address,
    txHash: txHash as TransactionHash,
    txIndex,
    balance,
    toTransactionUnspentOutputHex: jest.fn(() => 'hex'),
    toTransactionUnspentOutput: jest.fn(),
  })

  describe('createTransactionBuilder', () => {
    it('should create initial state with empty arrays', () => {
      const state = createTransactionBuilder()
      expect(state.inputs).toEqual([])
      expect(state.outputs).toEqual([])
      expect(state.certificates).toEqual([])
      expect(state.withdrawals).toEqual([])
      expect(state.referenceInputs).toEqual([])
      expect(state.collateralInputs).toEqual([])
      expect(state.metadata).toEqual([])
      expect(state.options.mints).toEqual([])
      expect(state.excludedUtxos).toEqual(new Set())
    })
  })

  describe('addInput', () => {
    it('should add single input', () => {
      const state = createTransactionBuilder()
      const utxo = createMockUtxo('hash1', 0, {
        [primaryTokenId]: '1000000' as Balance.Quantity,
      })
      const newState = addInput(state, utxo)
      expect(newState.inputs).toHaveLength(1)
      expect(newState.inputs[0]?.utxo).toBe(utxo)
      expect(state.inputs).toHaveLength(0) // Original unchanged
    })

    it('should add multiple inputs', () => {
      const state = createTransactionBuilder()
      const utxo1 = createMockUtxo('hash1', 0, {
        [primaryTokenId]: '1000000' as Balance.Quantity,
      })
      const utxo2 = createMockUtxo('hash2', 1, {
        [primaryTokenId]: '2000000' as Balance.Quantity,
      })
      const newState = addInputs(state, [utxo1, utxo2])
      expect(newState.inputs).toHaveLength(2)
    })
  })

  describe('removeInput', () => {
    it('should remove input by txHash and txIndex', () => {
      const state = createTransactionBuilder()
      const utxo1 = createMockUtxo('hash1', 0, {
        [primaryTokenId]: '1000000' as Balance.Quantity,
      })
      const utxo2 = createMockUtxo('hash2', 1, {
        [primaryTokenId]: '2000000' as Balance.Quantity,
      })
      const stateWithInputs = addInputs(state, [utxo1, utxo2])
      const newState = removeInput(
        stateWithInputs,
        'hash1' as TransactionHash,
        0,
      )
      expect(newState.inputs).toHaveLength(1)
      expect(newState.inputs[0]?.utxo.txHash).toBe('hash2')
    })
  })

  describe('addOutput', () => {
    it('should add single output', () => {
      const state = createTransactionBuilder()
      const amounts: Balance.Amounts = {
        [primaryTokenId]: '1000000' as Balance.Quantity,
      }
      const newState = addOutput(state, 'addr_test1', amounts)
      expect(newState.outputs).toHaveLength(1)
      expect(newState.outputs[0]).toEqual({
        address: 'addr_test1' as Address,
        amounts,
        datum: undefined,
      })
    })

    it('should add output with datum', () => {
      const state = createTransactionBuilder()
      const amounts: Balance.Amounts = {
        [primaryTokenId]: '1000000' as Balance.Quantity,
      }
      const datum = {hash: 'datum_hash' as DatumHash}
      const newState = addOutput(state, 'addr_test1', amounts, datum)
      expect(newState.outputs[0]?.datum).toBe(datum)
    })

    it('should add multiple outputs', () => {
      const state = createTransactionBuilder()
      const outputs: TransactionOutput[] = [
        {
          address: 'addr1' as Address,
          amounts: {[primaryTokenId]: '1000000' as Balance.Quantity},
        },
        {
          address: 'addr2' as Address,
          amounts: {[primaryTokenId]: '2000000' as Balance.Quantity},
        },
      ]
      const newState = addOutputs(state, outputs)
      expect(newState.outputs).toHaveLength(2)
    })
  })

  describe('addCertificate', () => {
    it('should add single certificate', () => {
      const state = createTransactionBuilder()
      const cert: TransactionCertificate = {
        kind: 'StakeRegistration',
        stakeCredentialKeyHashHex: 'hash' as KeyHash,
      }
      const newState = addCertificate(state, cert)
      expect(newState.certificates).toHaveLength(1)
      expect(newState.certificates[0]?.kind).toBe('StakeRegistration')
    })

    it('should add multiple certificates', () => {
      const state = createTransactionBuilder()
      const certs: TransactionCertificate[] = [
        {
          kind: 'StakeRegistration',
          stakeCredentialKeyHashHex: 'hash1' as KeyHash,
        },
        {
          kind: 'StakeDelegation',
          stakeCredentialKeyHashHex: 'hash2' as KeyHash,
          poolKeyHash: 'pool1' as KeyHash,
        },
      ]
      const newState = addCertificates(state, certs)
      expect(newState.certificates).toHaveLength(2)
    })
  })

  describe('addWithdrawal', () => {
    it('should add withdrawal', () => {
      const state = createTransactionBuilder()
      const withdrawal: TransactionWithdrawal = {
        rewardAddress: 'stake_test1' as Address,
        amount: '1000000' as Amount,
      }
      const newState = addWithdrawal(
        state,
        withdrawal.rewardAddress,
        withdrawal.amount,
      )
      expect(newState.withdrawals).toHaveLength(1)
      expect(newState.withdrawals[0]).toEqual(withdrawal)
    })
  })

  describe('addReferenceInput', () => {
    it('should add reference input', () => {
      const state = createTransactionBuilder()
      const utxo = createMockUtxo('hash1', 0, {
        [primaryTokenId]: '1000000' as Balance.Quantity,
      })
      const newState = addReferenceInput(state, utxo)
      expect(newState.referenceInputs).toHaveLength(1)
      expect(newState.referenceInputs[0]?.utxo).toBe(utxo)
    })
  })

  describe('addCollateralInput', () => {
    it('should add single collateral input', () => {
      const state = createTransactionBuilder()
      const utxo = createMockUtxo('hash1', 0, {
        [primaryTokenId]: '5000000' as Balance.Quantity,
      })
      const newState = addCollateralInput(state, utxo)
      expect(newState.collateralInputs).toHaveLength(1)
      expect(newState.collateralInputs[0]?.utxo).toBe(utxo)
    })

    it('should add multiple collateral inputs', () => {
      const state = createTransactionBuilder()
      const utxos = [
        createMockUtxo('hash1', 0, {
          [primaryTokenId]: '5000000' as Balance.Quantity,
        }),
        createMockUtxo('hash2', 1, {
          [primaryTokenId]: '5000000' as Balance.Quantity,
        }),
      ]
      const newState = addCollateralInputs(state, utxos)
      expect(newState.collateralInputs).toHaveLength(2)
    })

    it('should remove collateral input', () => {
      const state = createTransactionBuilder()
      const utxo1 = createMockUtxo('hash1', 0, {
        [primaryTokenId]: '5000000' as Balance.Quantity,
      })
      const utxo2 = createMockUtxo('hash2', 1, {
        [primaryTokenId]: '5000000' as Balance.Quantity,
      })
      const stateWithCollateral = addCollateralInputs(state, [utxo1, utxo2])
      const newState = removeCollateralInput(stateWithCollateral, 'hash1', 0)
      expect(newState.collateralInputs).toHaveLength(1)
      expect(newState.collateralInputs[0]?.utxo.txHash).toBe('hash2')
    })
  })

  describe('excludeUtxo', () => {
    it('should exclude single UTXO', () => {
      const state = createTransactionBuilder()
      const newState = excludeUtxo(state, 'hash1' as TransactionHash, 0)
      expect(newState.excludedUtxos.has('hash1:0' as UtxoId)).toBe(true)
      expect(state.excludedUtxos.has('hash1:0' as UtxoId)).toBe(false) // Original unchanged
    })

    it('should exclude multiple UTXOs', () => {
      const state = createTransactionBuilder()
      const utxos = [
        createMockUtxo('hash1', 0, {
          [primaryTokenId]: '1000000' as Balance.Quantity,
        }),
        createMockUtxo('hash2', 1, {
          [primaryTokenId]: '2000000' as Balance.Quantity,
        }),
      ]
      const newState = excludeUtxos(state, utxos)
      expect(newState.excludedUtxos.has('hash1:0' as UtxoId)).toBe(true)
      expect(newState.excludedUtxos.has('hash2:1' as UtxoId)).toBe(true)
    })
  })

  describe('addMetadata', () => {
    it('should add metadata', () => {
      const state = createTransactionBuilder()
      const newState = addMetadata(state, '674', {msg: 'test'})
      expect(newState.metadata).toHaveLength(1)
      expect(newState.metadata[0]).toEqual({label: '674', data: {msg: 'test'}})
    })
  })

  describe('setChangeAddress', () => {
    it('should set change address', () => {
      const state = createTransactionBuilder()
      const newState = setChangeAddress(state, 'addr_test1' as Address)
      expect(newState.options.changeAddress).toBe('addr_test1')
    })
  })

  describe('setChangeOutput', () => {
    it('should set manual change output', () => {
      const state = createTransactionBuilder()
      const amounts: Balance.Amounts = {
        [primaryTokenId]: '5000000' as Balance.Quantity,
      }
      const newState = setChangeOutput(state, 'addr_test1', amounts)
      expect(newState.options.manualChangeOutput).toEqual({
        address: 'addr_test1' as Address,
        amounts,
      })
    })
  })

  describe('setFee', () => {
    it('should set manual fee', () => {
      const state = createTransactionBuilder()
      const amounts: Balance.Amounts = {
        [primaryTokenId]: '170000' as Balance.Quantity,
      }
      const newState = setFee(state, amounts)
      expect(newState.options.manualFee).toBe(amounts)
    })
  })

  describe('setTTL', () => {
    it('should set TTL', () => {
      const state = createTransactionBuilder()
      const newState = setTTL(state, 1000000)
      expect(newState.options.ttl).toBe(1000000)
    })
  })

  describe('setTTLWithBuffer', () => {
    it('should set TTL with default buffer', () => {
      const state = createTransactionBuilder()
      const newState = setTTLWithBuffer(state, 1000000)
      expect(newState.options.ttl).toBe(1000000 + 7200)
    })

    it('should set TTL with custom buffer', () => {
      const state = createTransactionBuilder()
      const newState = setTTLWithBuffer(state, 1000000, 3600)
      expect(newState.options.ttl).toBe(1000000 + 3600)
    })
  })

  describe('setValidityInterval', () => {
    it('should set validity interval', () => {
      const state = createTransactionBuilder()
      const newState = setValidityInterval(state, 1000, 2000)
      expect(newState.options.validityInterval).toEqual({
        start: 1000,
        end: 2000,
      })
    })
  })

  describe('getTransactionState', () => {
    it('should return current state', () => {
      const state = createTransactionBuilder()
      const utxo = createMockUtxo('hash1', 0, {
        [primaryTokenId]: '1000000' as Balance.Quantity,
      })
      const stateWithInput = addInput(state, utxo)
      const currentState = getTransactionState(stateWithInput)
      expect(currentState.inputs).toHaveLength(1)
      expect(currentState.inputs[0]?.utxo).toBe(utxo)
    })
  })

  describe('isTransactionReady', () => {
    it('should return false when no inputs', () => {
      const state = createTransactionBuilder()
      const amounts: Balance.Amounts = {
        [primaryTokenId]: '1000000' as Balance.Quantity,
      }
      const stateWithOutput = addOutput(state, 'addr_test1', amounts)
      expect(isTransactionReady(stateWithOutput)).toBe(false)
    })

    it('should return false when no outputs', () => {
      const state = createTransactionBuilder()
      const utxo = createMockUtxo('hash1', 0, {
        [primaryTokenId]: '1000000' as Balance.Quantity,
      })
      const stateWithInput = addInput(state, utxo)
      expect(isTransactionReady(stateWithInput)).toBe(false)
    })

    it('should return true when has inputs and outputs', () => {
      const state = createTransactionBuilder()
      const utxo = createMockUtxo('hash1', 0, {
        [primaryTokenId]: '1000000' as Balance.Quantity,
      })
      const amounts: Balance.Amounts = {
        [primaryTokenId]: '500000' as Balance.Quantity,
      }
      const stateWithBoth = addOutput(
        addInput(state, utxo),
        'addr_test1',
        amounts,
      )
      expect(isTransactionReady(stateWithBoth)).toBe(true)
    })
  })

  describe('buildTransaction', () => {
    const protocolParams: Pick<
      Chain.Cardano.ProtocolParams,
      | 'keyDeposit'
      | 'linearFee'
      | 'coinsPerUtxoByte'
      | 'poolDeposit'
      | 'epoch'
      | 'maxBlockBodySize'
      | 'maxBlockHeaderSize'
      | 'maxTxSize'
      | 'maxReferenceScriptsSize'
      | 'stakePoolPledgeInfluence'
      | 'monetaryExpansion'
      | 'treasuryExpansion'
      | 'minPoolCost'
      | 'maxExecutionUnits'
      | 'minFeeReferenceScript'
    > = {
      linearFee: {coefficient: '44', constant: '155381'},
      poolDeposit: '500000000',
      keyDeposit: '2000000',
      coinsPerUtxoByte: '4310',
      epoch: 0,
      maxBlockBodySize: '90112',
      maxBlockHeaderSize: '1100',
      maxTxSize: '16384',
      maxReferenceScriptsSize: '204800',
      stakePoolPledgeInfluence: {numerator: '3', denominator: '10'},
      monetaryExpansion: {numerator: '3', denominator: '1000'},
      treasuryExpansion: {numerator: '1', denominator: '5'},
      minPoolCost: '340000000',
      maxExecutionUnits: {
        perTransaction: {memory: '14000000', cpu: '10000000000'},
        perBlock: {memory: '62000000', cpu: '20000000000'},
      },
      minFeeReferenceScript: {
        coinsPerByte: {numerator: '15', denominator: '1'},
        tierStepBytes: '25600',
        multiplier: '1.2',
      },
    }
    const protocolConfig = createCardanoHaskellConfig(protocolParams, 0)

    it('routes generic Shelley payment recipes through the CML bridge and preserves the unsigned transaction contract', async () => {
      const bridgeBuilder = jest.spyOn(cmlMobileBridge, 'buildSimplePaymentTransaction').mockReturnValue({
        cborHex: '84a0a0f5',
        fee: '168581',
      })
      const policyId = 'ab'.repeat(28)
      const assetName = '00ff'
      const tokenId = `${policyId}.${assetName}` as never
      const utxo = {
        ...createMockUtxo('01'.repeat(32), 0, {
          [primaryTokenId]: '10000000' as Balance.Quantity,
        }),
        receiver: 'addr_test1qqqqpvpu82s99aguppk9f02qt84d95hyy6kgn7jt8njpe0cqqzcrcw4q2t63czrv2j75qk026tfwgf4v38ayk08yrjls8jdlam' as Address,
      }
      let state = addInput(createTransactionBuilder(), utxo)
      state = addOutput(state, 'addr_test1qqqqpvpu82s99aguppk9f02qt84d95hyy6kgn7jt8njpe0cqqzcrcw4q2t63czrv2j75qk026tfwgf4v38ayk08yrjls8jdlam', {
        [primaryTokenId]: '5000000' as Balance.Quantity,
        [tokenId]: '1' as Balance.Quantity,
      })
      state = setChangeAddress(state, 'addr_test1qqqqpvpu82s99aguppk9f02qt84d95hyy6kgn7jt8nj8')
      state = setTTL(state, 123456)
      state = addMint(state, {
        policyId,
        assets: [{assetName, amount: '1'}],
        script: {type: 'native', script: `8200581c${'cd'.repeat(28)}`},
      })

      const built = await buildTransaction(state, protocolConfig)

      expect(built.cbor).toBe('84a0a0f5')
      expect(bridgeBuilder).toHaveBeenCalledWith(expect.objectContaining({
        nativeMints: [{
          policyIdHex: policyId,
          scriptCborHex: `8200581c${'cd'.repeat(28)}`,
          assets: [{assetNameHex: assetName, quantity: '1'}],
        }],
      }))
      bridgeBuilder.mockRestore()
    })

    it('routes ordinary reference inputs through the CML payment recipe', async () => {
      const bridgeBuilder = jest.spyOn(cmlMobileBridge, 'buildSimplePaymentTransaction').mockReturnValue({
        cborHex: '84a0a0f5',
        fee: '168581',
      })
      const address = 'addr_test1qqqqpvpu82s99aguppk9f02qt84d95hyy6kgn7jt8njpe0cqqzcrcw4q2t63czrv2j75qk026tfwgf4v38ayk08yrjls8jdlam' as Address
      const paymentUtxo = {
        ...createMockUtxo('01'.repeat(32), 0, {
          [primaryTokenId]: '10000000' as Balance.Quantity,
        }),
        receiver: address,
      }
      const referenceUtxo = {
        ...createMockUtxo('02'.repeat(32), 1, {
          [primaryTokenId]: '1000000' as Balance.Quantity,
        }),
        receiver: address,
      }
      let state = addInput(createTransactionBuilder(), paymentUtxo)
      state = addReferenceInput(state, referenceUtxo)
      state = addOutput(state, address, {[primaryTokenId]: '5000000' as Balance.Quantity})
      state = setChangeAddress(state, address)
      state = setTTL(state, 123456)

      await buildTransaction(state, protocolConfig)

      expect(bridgeBuilder).toHaveBeenCalledWith(expect.objectContaining({
        referenceInputs: [{
          transactionHashHex: '02'.repeat(32),
          index: '1',
          address,
          lovelace: '1000000',
          assets: [],
        }],
      }))
      bridgeBuilder.mockRestore()
    })

    it('routes a single inline-datum Plutus V3 reference-script spend with collateral return through CML', async () => {
      const bridgeBuilder = jest.spyOn(cmlMobileBridge, 'buildEscrowRedeemTransactionCml').mockReturnValue({
        cborHex: '84a0a0f5',
        fee: '168581',
      })
      const address = 'addr_test1qqqqpvpu82s99aguppk9f02qt84d95hyy6kgn7jt8njpe0cqqzcrcw4q2t63czrv2j75qk026tfwgf4v38ayk08yrjls8jdlam' as Address
      const fundingUtxo = {
        ...createMockUtxo('01'.repeat(32), 0, {[primaryTokenId]: '10000000' as Balance.Quantity}),
        receiver: address,
      }
      const scriptUtxo = {
        ...createMockUtxo('02'.repeat(32), 0, {[primaryTokenId]: '5000000' as Balance.Quantity}),
        receiver: address,
        inlineDatumCborHex: 'd87980',
      }
      const collateralUtxo = {
        ...createMockUtxo('03'.repeat(32), 0, {[primaryTokenId]: '5000000' as Balance.Quantity}),
        receiver: address,
      }
      let state = addInput(createTransactionBuilder(), fundingUtxo)
      state = addScriptInput(state, {
        utxo: scriptUtxo,
        scriptHash: 'ab'.repeat(28),
        redeemer: 'd87980',
        redeemerExUnits: {mem: '900000', steps: '250000000'},
        referenceScriptUtxo: {
          txHash: '04'.repeat(32),
          txIndex: 0,
          langVersion: 'v3',
          scriptSize: 3,
          output: {
            address,
            lovelace: '2000000',
            assets: [],
            scriptCborHex: '010000',
          },
        },
        datumSource: 'inline',
      })
      state = addCollateralInput(state, collateralUtxo)
      state = addOutput(state, address, {[primaryTokenId]: '2000000' as Balance.Quantity})
      state = setChangeAddress(state, address)
      state = setValidityInterval(state, 100, 1000)
      const plutusProtocolConfig = {
        ...protocolConfig,
        collateralPercentage: '150',
        scriptExecutionPrices: {
          memory: {numerator: '577', denominator: '10000'},
          cpu: {numerator: '721', denominator: '10000000'},
        },
        plutusV3CostModel: [0],
      }

      const built = await buildTransaction(state, plutusProtocolConfig)

      expect(built.cbor).toBe('84a0a0f5')
      expect(bridgeBuilder).toHaveBeenCalledWith(expect.objectContaining({
        scriptInput: expect.objectContaining({
          txHashHex: '02'.repeat(32),
          inlineDatumCborHex: 'd87980',
        }),
        referenceScriptCborHex: '010000',
        referenceScriptSize: '3',
        redeemerCborHex: 'd87980',
        redeemerMem: '900000',
        redeemerSteps: '250000000',
        collateralReturn: expect.objectContaining({lovelace: '4000000'}),
      }))
      bridgeBuilder.mockRestore()
    })

    it('routes multiasset outputs and metadata through CML when no CSL-only recipe fields are present', async () => {
      const bridgeBuilder = jest.spyOn(cmlMobileBridge, 'buildSimplePaymentTransaction').mockReturnValue({
        cborHex: '84a0a0f5',
        fee: '168581',
      })
      const policyId = 'ab'.repeat(28)
      const tokenId = `${policyId}.00ff` as never
      let state = addInput(createTransactionBuilder(), createMockUtxo('02'.repeat(32), 1, {
        [primaryTokenId]: '5000000' as Balance.Quantity,
        [tokenId]: '12' as Balance.Quantity,
      }))
      state = addOutput(state, 'addr_test1qrecipient', {
        [primaryTokenId]: '2000000' as Balance.Quantity,
        [tokenId]: '7' as Balance.Quantity,
      })
      state = setChangeAddress(state, 'addr_test1qchange')
      state = setTTL(state, 123456)
      state = addMetadata(state, '674', {msg: ['fixture']})

      const built = await buildTransaction(state, protocolConfig)

      expect(built.cbor).toBe('84a0a0f5')
      expect(bridgeBuilder).toHaveBeenCalledWith(expect.objectContaining({
        inputs: [expect.objectContaining({
          transactionHashHex: '02'.repeat(32),
          assets: [{policyIdHex: policyId, assetNameHex: '00ff', quantity: '12'}],
        })],
        outputs: [expect.objectContaining({
          assets: [{policyIdHex: policyId, assetNameHex: '00ff', quantity: '7'}],
        })],
        metadata: [{label: '674', data: {msg: ['fixture']}}],
      }))
      bridgeBuilder.mockRestore()
    })

    it('routes stake delegation certificates with their key-hash fields through CML', async () => {
      const bridgeBuilder = jest.spyOn(cmlMobileBridge, 'buildSimplePaymentTransaction').mockReturnValue({
        cborHex: '84a0a0f5',
        fee: '168581',
      })
      let state = addInput(createTransactionBuilder(), createMockUtxo('03'.repeat(32), 2, {
        [primaryTokenId]: '10000000' as Balance.Quantity,
      }))
      state = addOutput(state, 'addr_test1qrecipient', {
        [primaryTokenId]: '2000000' as Balance.Quantity,
      })
      state = setChangeAddress(state, 'addr_test1qchange')
      state = setTTL(state, 123456)
      state = addCertificate(state, {
        kind: 'StakeDelegation',
        stakeCredentialKeyHashHex: 'aa'.repeat(28) as KeyHash,
        poolKeyHash: 'bb'.repeat(28) as KeyHash,
      })

      await buildTransaction(state, protocolConfig)

      expect(bridgeBuilder).toHaveBeenCalledWith(expect.objectContaining({
        certificates: [{
          kind: 'StakeDelegation',
          stakeCredentialKeyHashHex: 'aa'.repeat(28),
          poolKeyHash: 'bb'.repeat(28),
        }],
      }))
      bridgeBuilder.mockRestore()
    })

    it('routes standalone key withdrawals through CML and preserves the reward-account address', async () => {
      const bridgeBuilder = jest.spyOn(cmlMobileBridge, 'buildSimplePaymentTransaction').mockReturnValue({
        cborHex: '84a0a0f5',
        fee: '168581',
      })
      let state = addInput(createTransactionBuilder(), createMockUtxo('04'.repeat(32), 3, {
        [primaryTokenId]: '10000000' as Balance.Quantity,
      }))
      state = addOutput(state, 'addr_test1qrecipient', {
        [primaryTokenId]: '2000000' as Balance.Quantity,
      })
      state = setChangeAddress(state, 'addr_test1qchange')
      state = setTTL(state, 123456)
      state = addWithdrawal(state, 'stake_test1uqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq', '3500000')

      await buildTransaction(state, protocolConfig)

      expect(bridgeBuilder).toHaveBeenCalledWith(expect.objectContaining({
        withdrawals: [{
          rewardAddress: 'stake_test1uqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq',
          amount: '3500000',
        }],
      }))
      bridgeBuilder.mockRestore()
    })

    it('routes vote delegation and DRep data through CML', async () => {
      const bridgeBuilder = jest.spyOn(cmlMobileBridge, 'buildSimplePaymentTransaction').mockReturnValue({
        cborHex: '84a0a0f5',
        fee: '168581',
      })
      let state = addInput(createTransactionBuilder(), createMockUtxo('05'.repeat(32), 4, {
        [primaryTokenId]: '10000000' as Balance.Quantity,
      }))
      state = addOutput(state, 'addr_test1qrecipient', {
        [primaryTokenId]: '2000000' as Balance.Quantity,
      })
      state = setChangeAddress(state, 'addr_test1qchange')
      state = setTTL(state, 123456)
      state = addCertificate(state, {
        kind: 'VoteDelegation',
        stakeCredentialKeyHashHex: 'aa'.repeat(28) as KeyHash,
        drep: {KeyHash: 'bb'.repeat(28) as KeyHash},
      })

      await buildTransaction(state, protocolConfig)

      expect(bridgeBuilder).toHaveBeenCalledWith(expect.objectContaining({
        certificates: [{
          kind: 'VoteDelegation',
          stakeCredentialKeyHashHex: 'aa'.repeat(28),
          drep: {KeyHash: 'bb'.repeat(28)},
        }],
      }))
      bridgeBuilder.mockRestore()
    })

    it('routes combined stake/vote registration with the configured deposit through CML', async () => {
      const bridgeBuilder = jest.spyOn(cmlMobileBridge, 'buildSimplePaymentTransaction').mockReturnValue({
        cborHex: '84a0a0f5',
        fee: '168581',
      })
      let state = addInput(createTransactionBuilder(), createMockUtxo('06'.repeat(32), 5, {
        [primaryTokenId]: '10000000' as Balance.Quantity,
      }))
      state = addOutput(state, 'addr_test1qrecipient', {
        [primaryTokenId]: '2000000' as Balance.Quantity,
      })
      state = setChangeAddress(state, 'addr_test1qchange')
      state = setTTL(state, 123456)
      state = addCertificate(state, {
        kind: 'StakeVoteRegistrationAndDelegation',
        stakeCredentialKeyHashHex: 'aa'.repeat(28) as KeyHash,
        poolKeyHash: 'bb'.repeat(28) as KeyHash,
        drep: 'AlwaysAbstain',
      })

      await buildTransaction(state, protocolConfig)

      expect(bridgeBuilder).toHaveBeenCalledWith(expect.objectContaining({
        certificates: [{
          kind: 'StakeVoteRegistrationAndDelegation',
          stakeCredentialKeyHashHex: 'aa'.repeat(28),
          poolKeyHash: 'bb'.repeat(28),
          drep: 'AlwaysAbstain',
        }],
      }))
      bridgeBuilder.mockRestore()
    })

    it('routes the validity interval start and end through CML', async () => {
      const bridgeBuilder = jest.spyOn(cmlMobileBridge, 'buildSimplePaymentTransaction').mockReturnValue({
        cborHex: '84a0a0f5',
        fee: '168581',
      })
      let state = addInput(createTransactionBuilder(), createMockUtxo('07'.repeat(32), 6, {
        [primaryTokenId]: '10000000' as Balance.Quantity,
      }))
      state = addOutput(state, 'addr_test1qrecipient', {
        [primaryTokenId]: '2000000' as Balance.Quantity,
      })
      state = setChangeAddress(state, 'addr_test1qchange')
      state = setValidityInterval(state, 120000, 123456)

      await buildTransaction(state, protocolConfig)

      expect(bridgeBuilder).toHaveBeenCalledWith(expect.objectContaining({
        ttl: '123456',
        validityStart: '120000',
      }))
      bridgeBuilder.mockRestore()
    })

    it('should throw NoOutputsError when no outputs and no change address', async () => {
      const state = createTransactionBuilder()
      const utxo = createMockUtxo('hash1', 0, {
        [primaryTokenId]: '1000000' as Balance.Quantity,
      })
      const stateWithInput = addInput(state, utxo)

      await expect(
        buildTransaction(stateWithInput, protocolConfig),
      ).rejects.toThrow(NoOutputsError)
    })

    it('should throw error when excluded UTXO is used as input', async () => {
      const state = createTransactionBuilder()
      const utxo = createMockUtxo('hash1', 0, {
        [primaryTokenId]: '1000000' as Balance.Quantity,
      })
      const stateWithInput = addInput(state, utxo)
      const stateWithExclusion = excludeUtxo(
        stateWithInput,
        'hash1' as TransactionHash,
        0,
      )
      const stateWithOutput = addOutput(stateWithExclusion, 'addr_test1', {
        [primaryTokenId]: '500000' as Balance.Quantity,
      })

      await expect(
        buildTransaction(stateWithOutput, protocolConfig),
      ).rejects.toThrow('excluded but used as input')
    })

    it('should throw error when excluded UTXO is used as collateral', async () => {
      const state = createTransactionBuilder()
      const utxo = createMockUtxo('hash1', 0, {
        [primaryTokenId]: '1000000' as Balance.Quantity,
      })
      const stateWithCollateral = addCollateralInput(state, utxo)
      const stateWithExclusion = excludeUtxo(
        stateWithCollateral,
        'hash1' as TransactionHash,
        0,
      )
      const stateWithOutput = addOutput(stateWithExclusion, 'addr_test1', {
        [primaryTokenId]: '500000' as Balance.Quantity,
      })
      // The UTXO is already in collateralInputs from stateWithCollateral
      // Don't add it as input, just build with the excluded collateral

      await expect(
        buildTransaction(stateWithOutput, protocolConfig),
      ).rejects.toThrow('excluded but used as collateral')
    })
  })

  describe('buildTransactionCBOR', () => {
    const protocolParams: Pick<
      Chain.Cardano.ProtocolParams,
      | 'keyDeposit'
      | 'linearFee'
      | 'coinsPerUtxoByte'
      | 'poolDeposit'
      | 'epoch'
      | 'maxBlockBodySize'
      | 'maxBlockHeaderSize'
      | 'maxTxSize'
      | 'maxReferenceScriptsSize'
      | 'stakePoolPledgeInfluence'
      | 'monetaryExpansion'
      | 'treasuryExpansion'
      | 'minPoolCost'
      | 'maxExecutionUnits'
      | 'minFeeReferenceScript'
    > = {
      linearFee: {coefficient: '44', constant: '155381'},
      poolDeposit: '500000000',
      keyDeposit: '2000000',
      coinsPerUtxoByte: '4310',
      epoch: 0,
      maxBlockBodySize: '90112',
      maxBlockHeaderSize: '1100',
      maxTxSize: '16384',
      maxReferenceScriptsSize: '204800',
      stakePoolPledgeInfluence: {numerator: '3', denominator: '10'},
      monetaryExpansion: {numerator: '3', denominator: '1000'},
      treasuryExpansion: {numerator: '1', denominator: '5'},
      minPoolCost: '340000000',
      maxExecutionUnits: {
        perTransaction: {memory: '14000000', cpu: '10000000000'},
        perBlock: {memory: '62000000', cpu: '20000000000'},
      },
      minFeeReferenceScript: {
        coinsPerByte: {numerator: '15', denominator: '1'},
        tierStepBytes: '25600',
        multiplier: '1.2',
      },
    }
    const protocolConfig = createCardanoHaskellConfig(protocolParams, 0)

    it('should throw NoOutputsError when no outputs and no change address', async () => {
      const state = createTransactionBuilder()
      const utxo = createMockUtxo('hash1', 0, {
        [primaryTokenId]: '1000000' as Balance.Quantity,
      })
      const stateWithInput = addInput(state, utxo)

      await expect(
        buildTransactionCBOR(stateWithInput, protocolConfig),
      ).rejects.toThrow(NoOutputsError)
    })
  })
})
