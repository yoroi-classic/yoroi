import {Exchange} from '@yoroi/types'

import {QueryClient} from '@tanstack/react-query'
import {act, renderHook, waitFor} from '@testing-library/react-native'

import {queryClientFixture} from '../../../fixtures/query-client'
import {wrapper as wrapperFixture} from '../../../fixtures/wrapper'
import {useCreateReferralLink} from './useCreateReferralLink'

describe('useCreateReferralLink', () => {
  let queryClient: QueryClient
  beforeEach(() => {
    jest.clearAllMocks()
    queryClient = queryClientFixture()
  })

  afterEach(() => {
    queryClient.clear()
  })

  it('success', async () => {
    const mockReferralLinkCreate = jest
      .fn()
      .mockResolvedValue(new URL('https://example.com'))

    const providerId = 'banxa'
    const queries: Exchange.ReferralUrlQueryStringParams = {
      orderType: 'buy',
      fiatType: 'USD',
      coinType: 'ADA',
      walletAddress: 'address',
    }
    const wrapper = wrapperFixture({
      queryClient,
    })
    const {result} = renderHook(
      () =>
        useCreateReferralLink({
          providerId,
          queries,
          referralLinkCreate: mockReferralLinkCreate,
        }),
      {wrapper},
    )

    expect(result.current.referralLink).toEqual('')
    expect(result.current.isPending).toBe(false)

    await act(async () => {
      result.current.createReferralLink()
    })

    await waitFor(() => {
      expect(result.current.referralLink.toString()).toEqual(
        'https://example.com/',
      )
    })

    expect(mockReferralLinkCreate).toHaveBeenCalledWith(
      {
        providerId: 'banxa',
        queries: {
          orderType: 'buy',
          fiatType: 'USD',
          coinType: 'ADA',
          walletAddress: 'address',
        },
      },
      undefined,
    )
  })

  it('empty', async () => {
    const mockReferralLinkCreate = jest.fn().mockResolvedValue(null)

    const wrapper = wrapperFixture({
      queryClient,
    })
    const {result} = renderHook(
      () =>
        useCreateReferralLink({
          providerId: 'banxa',
          queries: {} as any,
          referralLinkCreate: mockReferralLinkCreate,
        }),
      {wrapper},
    )

    expect(result.current.referralLink).toEqual('')

    await act(async () => {
      result.current.createReferralLink()
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.referralLink).toEqual('')
  })
})
