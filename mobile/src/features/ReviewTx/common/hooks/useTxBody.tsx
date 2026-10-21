import {transactionReviewInfoJson} from '@yoroi-classic/cml-mobile-bridge'
import * as React from 'react'

import {cmlReviewBodyToTransactionBody} from '../review-info'
import {CmlTransactionReviewInfo, TransactionBody} from '../types'

export const useTxBody = ({
  cbor,
}: {
  cbor?: string | null
}): TransactionBody | null => {
  return React.useMemo(() => {
    if (cbor != null) {
      return getCborTxBody(cbor)
    }
    return null
  }, [cbor])
}
const getCborTxBody = (cbor: string): TransactionBody => {
  const reviewInfo = JSON.parse(
    transactionReviewInfoJson(cbor),
  ) as CmlTransactionReviewInfo
  return cmlReviewBodyToTransactionBody(reviewInfo)
}
