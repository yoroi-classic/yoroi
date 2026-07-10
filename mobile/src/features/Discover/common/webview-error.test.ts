import {serializeWebViewError} from './webview-error'

describe('serializeWebViewError', () => {
  it('preserves WebView error metadata on top-level errors', () => {
    const error = Object.assign(new Error('fallback message'), {
      code: -1,
      index: 2,
      info: 'cip103 failure',
    })

    expect(serializeWebViewError(error)).toEqual({
      code: -1,
      index: 2,
      info: 'cip103 failure',
      message: 'fallback message',
    })
  })

  it('preserves WebView error metadata inside submit result arrays', () => {
    const error = Object.assign(new Error('fallback message'), {
      code: -2,
      index: 1,
      info: 'submit failure',
    })

    expect(serializeWebViewError(['tx-id', error])).toEqual([
      'tx-id',
      {
        code: -2,
        index: 1,
        info: 'submit failure',
        message: 'fallback message',
      },
    ])
  })

  it('keeps ordinary top-level errors as message strings', () => {
    expect(serializeWebViewError(new Error('plain failure'))).toBe(
      'plain failure',
    )
  })
})
