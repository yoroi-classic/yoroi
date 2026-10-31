import {YoroiWallet} from '@yoroi/cardano-wallet'
import {UnsignedTransaction} from '@yoroi/tx'

import {UseMutationOptions, useMutation} from '@tanstack/react-query'

export const useSignTxWithPassword = (
  {wallet}: {wallet: YoroiWallet},
  options: UseMutationOptions<
    Uint8Array,
    Error,
    {unsignedTx: UnsignedTransaction; password: string}
  > = {},
) => {
  const mutation = useMutation({
    mutationFn: async ({unsignedTx, password}) => {
      const rootKey = await wallet.encryptedStorage.xpriv.read(password)
      return wallet.signTx(unsignedTx, rootKey.value)
    },
    retry: false,
    ...options,
  })

  return {
    signTx: mutation.mutate,
    ...mutation,
  }
}
