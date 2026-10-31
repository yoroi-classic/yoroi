import {createVotingRegTxFromWallet} from '@yoroi/cardano-wallet'
import {YoroiWallet} from '@yoroi/cardano-wallet'
import {Wallet} from '@yoroi/types'

import * as React from 'react'

import {UsePromiseOptions, usePromise} from '~/common/hooks/usePromise'

type VotingRegTxAndEncryptedKey = {
  votingRegTx: {cbor: string}
}

export const useVotingRegTx = (
  {
    wallet,
  }: {
    wallet: YoroiWallet
    implementation: Wallet.Implementation
  },
  options?: UsePromiseOptions<
    VotingRegTxAndEncryptedKey,
    [
      {
        catalystKeyHex: string
        supportsCIP36: boolean
        addressMode: Wallet.AddressMode
        implementation: Wallet.Implementation
      },
    ]
  >,
) => {
  const createVotingRegTxHelper = React.useCallback(
    async ({
      catalystKeyHex,
      supportsCIP36,
      addressMode,
      implementation,
    }: {
      catalystKeyHex: string
      supportsCIP36: boolean
      addressMode: Wallet.AddressMode
      implementation: Wallet.Implementation
    }) => {
      return await createVotingRegTxFromWallet(wallet, {
        catalystKeyHex,
        supportsCIP36,
        addressMode,
        implementation,
      })
    },
    [wallet],
  )

  const promise = usePromise({
    shouldThrow: true,
    ...options,
    promise: createVotingRegTxHelper,
  })

  return {
    ...promise,
    createVotingRegTx: promise.resolve,
  }
}
