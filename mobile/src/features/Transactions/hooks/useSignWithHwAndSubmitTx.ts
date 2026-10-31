import {TxSubmissionStatus} from '@yoroi/api'
import {YoroiWallet} from '@yoroi/cardano-wallet'
import {UnsignedTransaction} from '@yoroi/tx'

import {UseMutationOptions} from '@tanstack/react-query'

import {useSubmitTx} from '~/features/Transactions/hooks/useSubmitTx'

import {useSignTxWithHW} from './useSignTxWithHW'

export const useSignWithHwAndSubmitTx = (
  {wallet}: {wallet: YoroiWallet},
  options?: {
    signTx?: UseMutationOptions<
      Uint8Array,
      Error,
      {unsignedTx: UnsignedTransaction; useUSB: boolean}
    >
    submitTx?: UseMutationOptions<TxSubmissionStatus, Error, Uint8Array>
  },
) => {
  const signTx = useSignTxWithHW(
    {wallet},
    {
      retry: false,
      ...options?.signTx,
      onSuccess: (signedTx, args, context, mutation) => {
        options?.signTx?.onSuccess?.(signedTx, args, context, mutation)
        submitTx.mutate(signedTx)
      },
    },
  )
  const submitTx = useSubmitTx<Uint8Array>(
    {wallet}, //
    {...options?.submitTx},
  )

  return {
    signAndSubmitTx: signTx.mutate,
    isLoading: signTx.isPending || submitTx.isPending,
    error: signTx.error || submitTx.error,

    signTx,
    submitTx,
  }
}
