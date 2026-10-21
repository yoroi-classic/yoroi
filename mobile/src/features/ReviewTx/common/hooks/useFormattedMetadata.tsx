import {isString} from '@yoroi/common'

import * as React from 'react'

import {FormattedMetadata, TransactionBody} from '../types'

export const formatMetadata = (
  cbor: string | null,
  txBody: TransactionBody,
): FormattedMetadata => {
  const hash = txBody.auxiliary_data_hash ?? null
  let metadata = null
  let allLabels: Record<string, unknown> | null = null
  let scripts: Array<{scriptHash: string; scriptBytes: string}> | null = null

  if (cbor != null && hash != null) {
    const auxiliaryData = txBody.cmlReviewInfo?.auxiliaryData
    if (auxiliaryData) {
      if (auxiliaryData.metadata.length > 0) {
        const labels = Object.fromEntries(
          auxiliaryData.metadata.map((entry) => [
            entry.label,
            parseBasicConversionsJson(entry.basicConversionsJson) ??
              entry.json ??
              entry.cmlJson,
          ]),
        )
        allLabels = labels

        if (Object.hasOwn(labels, '674')) {
          const cip674 = labels['674']
          const message =
            cip674 != null && typeof cip674 === 'object' && 'msg' in cip674
              ? ((cip674 as {msg?: Array<string> | string}).msg ?? [''])
              : ['']
          metadata = {msg: [parseMsg(message)]}
        }
      }

      const auxiliaryScripts = [
        ...auxiliaryData.nativeScripts,
        ...auxiliaryData.plutusScripts,
      ]
      if (auxiliaryScripts.length > 0) {
        scripts = auxiliaryScripts.map((script) => ({
          scriptHash: script.hashHex,
          scriptBytes: script.cborHex,
        }))
      }
    }
  }

  return {
    hash,
    metadata,
    allLabels,
    scripts,
  }
}

const parseBasicConversionsJson = (value: string | null): unknown | null => {
  if (value == null) return null
  try {
    return JSON.parse(preserveUnsafeIntegerLiterals(value)) as unknown
  } catch {
    return value
  }
}

const preserveUnsafeIntegerLiterals = (json: string): string => {
  let result = ''
  let index = 0

  while (index < json.length) {
    const current = json[index]
    if (current === '"') {
      const start = index++
      while (index < json.length) {
        if (json[index] === '\\') {
          index += 2
          continue
        }
        if (json[index++] === '"') break
      }
      result += json.slice(start, index)
      continue
    }

    if (current === '-' || (current != null && /[0-9]/.test(current))) {
      const token = json
        .slice(index)
        .match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)?.[0]
      if (token) {
        const isInteger = !/[.eE]/.test(token)
        result +=
          isInteger && isUnsafeInteger(token) ? JSON.stringify(token) : token
        index += token.length
        continue
      }
    }

    result += current
    index++
  }

  return result
}

const isUnsafeInteger = (value: string): boolean => {
  const digits = value.replace(/^-?0*/, '') || '0'
  const limit = '9007199254740991'
  return (
    digits.length > limit.length ||
    (digits.length === limit.length && digits > limit)
  )
}

const parseMsg = (msg: Array<string> | string): string => {
  const messageToParse = Array.isArray(msg) ? msg.join('') : msg

  try {
    const parsed: unknown = JSON.parse(messageToParse)
    if (isString(parsed)) return parsed
    return JSON.stringify(parsed)
  } catch {
    return messageToParse
  }
}

export const useFormattedMetadata = ({
  cbor,
  txBody,
}: {
  cbor: string | null
  txBody: TransactionBody | null
}) => {
  return React.useMemo(() => {
    if (txBody == null) {
      return {hash: null, metadata: null, allLabels: null, scripts: null}
    }
    return formatMetadata(cbor, txBody)
  }, [cbor, txBody])
}
