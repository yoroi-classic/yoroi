import {Fetcher} from '@yoroi/common'
import {Branded} from '@yoroi/types'

import {createCardanoWalletBackendUtxoSource} from './current-state-utxo-source'

const TX_HASH = 'ab'.repeat(32)
const POLICY_ID = 'cd'.repeat(28)
const STAKE_ADDRESS = Branded.asStakingAddress('stake_test1account')

describe('cardano-wallet-backend current-state UTxO source', () => {
  it('reads the complete account state and preserves integer quantities', async () => {
    const request = jest.fn(async () => [
      {
        txHash: TX_HASH,
        outputIndex: 2,
        address: 'addr_test1receiver',
        value: '9007199254740993000000',
        assets: [
          {
            policyId: POLICY_ID,
            assetName: '414243',
            quantity: '9007199254740993000001',
          },
        ],
        datumHash: 'deadbeef',
        inlineDatum: 'd87980',
        referenceScriptHash: 'cafe',
      },
    ]) as unknown as jest.MockedFunction<Fetcher>
    const source = createCardanoWalletBackendUtxoSource(
      'https://wallet.example/',
      request,
    )

    await expect(source.getAccountUtxos(STAKE_ADDRESS)).resolves.toEqual([
      {
        utxoId: `${TX_HASH}:2`,
        txHash: TX_HASH,
        txIndex: 2,
        receiver: 'addr_test1receiver',
        amount: '9007199254740993000000',
        assets: [
          {
            assetId: `${POLICY_ID}.414243`,
            policyId: POLICY_ID,
            name: '414243',
            amount: '9007199254740993000001',
          },
        ],
        datumHash: 'deadbeef',
        inlineDatum: 'd87980',
        referenceScriptHash: 'cafe',
      },
    ])
    expect(request).toHaveBeenCalledWith({
      url: `https://wallet.example/v1/account/${STAKE_ADDRESS}/utxos`,
      method: 'GET',
      headers: {Accept: 'application/json'},
    })
  })

  it('rejects malformed responses before they reach transaction construction', async () => {
    const request = jest.fn(async () => [
      {
        txHash: TX_HASH,
        outputIndex: 0,
        address: 'addr_test1receiver',
        value: 42,
        assets: [],
      },
    ]) as unknown as jest.MockedFunction<Fetcher>
    const source = createCardanoWalletBackendUtxoSource(
      'https://wallet.example',
      request,
    )

    await expect(source.getAccountUtxos(STAKE_ADDRESS)).rejects.toThrow(
      'Invalid cardano-wallet-backend account UTxO response',
    )
  })

  it('propagates request errors so the sync layer can apply retry policy', async () => {
    const request = jest.fn(async () => {
      throw new Error('backend unavailable')
    }) as unknown as jest.MockedFunction<Fetcher>
    const source = createCardanoWalletBackendUtxoSource(
      'https://wallet.example',
      request,
    )

    await expect(source.getAccountUtxos(STAKE_ADDRESS)).rejects.toThrow(
      'backend unavailable',
    )
  })

  it('requires a configured backend URL', () => {
    expect(() => createCardanoWalletBackendUtxoSource('///')).toThrow(
      'cardano-wallet-backend base URL is required',
    )
  })
})
