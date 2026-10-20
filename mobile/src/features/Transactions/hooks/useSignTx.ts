import {YoroiWallet} from '@yoroi/cardano-wallet'
import {UnsignedTransaction} from '@yoroi/tx'

import {UseMutationOptions, useMutation} from '@tanstack/react-query'

export const useSignTx = (
  {wallet}: {wallet: YoroiWallet},
  options: UseMutationOptions<
    Uint8Array,
    Error,
    {unsignedTx: UnsignedTransaction; rootKey: string}
  > = {},
) => {
  const mutation = useMutation({
    mutationFn: ({unsignedTx, rootKey}) => wallet.signTx(unsignedTx, rootKey),
    retry: false,
    ...options,
  })

  return {
    signTx: mutation.mutate,
    ...mutation,
  }
}
