import {isMidnightAirdropAvailable} from './feature-state'

describe('isMidnightAirdropAvailable', () => {
  const previousReferenceScriptFlag =
    process.env.EXPO_PUBLIC_CARDANO_WALLET_BACKEND_REFERENCE_SCRIPT_BYTES

  afterEach(() => {
    if (previousReferenceScriptFlag == null) {
      delete process.env
        .EXPO_PUBLIC_CARDANO_WALLET_BACKEND_REFERENCE_SCRIPT_BYTES
    } else {
      process.env.EXPO_PUBLIC_CARDANO_WALLET_BACKEND_REFERENCE_SCRIPT_BYTES =
        previousReferenceScriptFlag
    }
  })

  it('requires remote enablement, a CWB endpoint, and reference-script bytes support', () => {
    delete process.env.EXPO_PUBLIC_CARDANO_WALLET_BACKEND_REFERENCE_SCRIPT_BYTES
    expect(
      isMidnightAirdropAvailable(true, 'https://wallet-backend.example'),
    ).toBe(false)
    expect(isMidnightAirdropAvailable(true, undefined)).toBe(false)
    expect(isMidnightAirdropAvailable(true, '  ')).toBe(false)
    expect(
      isMidnightAirdropAvailable(false, 'https://wallet-backend.example'),
    ).toBe(false)
    expect(
      isMidnightAirdropAvailable(undefined, 'https://wallet-backend.example'),
    ).toBe(false)

    process.env.EXPO_PUBLIC_CARDANO_WALLET_BACKEND_REFERENCE_SCRIPT_BYTES =
      'true'
    expect(
      isMidnightAirdropAvailable(true, 'https://wallet-backend.example'),
    ).toBe(true)
    process.env.EXPO_PUBLIC_CARDANO_WALLET_BACKEND_REFERENCE_SCRIPT_BYTES =
      'false'
    expect(
      isMidnightAirdropAvailable(true, 'https://wallet-backend.example'),
    ).toBe(false)
  })
})
