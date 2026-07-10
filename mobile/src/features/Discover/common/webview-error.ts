type WebViewErrorMetadata = Error & {
  code?: unknown
  index?: unknown
  info?: unknown
}

export const serializeWebViewError = (error: unknown): unknown => {
  if (error == null) return null
  if (Array.isArray(error)) return error.map(serializeWebViewErrorEntry)
  if (hasWebViewErrorMetadata(error)) return serializeWebViewErrorEntry(error)
  if (error instanceof Error) return error.message
  return error
}

const serializeWebViewErrorEntry = (error: unknown): unknown => {
  if (error instanceof Error) {
    const metadata = error as WebViewErrorMetadata
    return {
      message: error.message,
      info: metadata.info ?? error.message,
      code: metadata.code,
      index: metadata.index,
    }
  }
  return error
}

const hasWebViewErrorMetadata = (
  error: unknown,
): error is WebViewErrorMetadata => {
  return (
    error instanceof Error &&
    ('info' in error || 'code' in error || 'index' in error)
  )
}
