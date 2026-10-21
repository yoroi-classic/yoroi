import {time} from '@yoroi/common'
import {useNotificationManager} from '@yoroi/notifications'
import {Notifications} from '@yoroi/types'
import {useWalletEvent, useWalletManager} from '@yoroi/wallet-manager'

import {useQuery, useQueryClient} from '@tanstack/react-query'
import * as React from 'react'

import {useRemoteConfig} from '~/common/hooks/useRemoteConfig'
import {BannerIds, showBanner} from '~/features/Notifications/common/banners'
import {cardanoWalletBackendUrl} from '~/kernel/constants'
import {useStrings} from '~/kernel/i18n/useStrings'
import {logger} from '~/kernel/logger/logger'

import {isMidnightAirdropAvailable} from './feature-state'
import {useAirdropEligibility} from './useAirdropEligibility'
import {formatAmount} from './utils'

export const useAirdropBanner = () => {
  const walletManager = useWalletManager()
  const manager = useNotificationManager()
  const {config} = useRemoteConfig()
  const isAirdropEnabled = isMidnightAirdropAvailable(
    config?.features?.midnightAirdrop?.enabled,
    cardanoWalletBackendUrl,
  )
  const {
    selected: {network, wallet},
  } = walletManager

  const {allocations, totalRedeemableAmount, isLoading} =
    useAirdropEligibility()
  const strings = useStrings()
  const queryClient = useQueryClient()

  const queryKey = ['airdropBanner', wallet?.id, network] as const

  // The query is disabled when the feature flag or backend endpoint is absent,
  // so cleanup cannot live only in its queryFn. Remove persisted banners when
  // the feature becomes unavailable to avoid showing stale entry points.
  React.useEffect(() => {
    if (isAirdropEnabled && wallet?.isMainnet === true && wallet) return

    void manager.events
      .remove(BannerIds.Airdrop)
      .then(() =>
        queryClient.invalidateQueries({
          queryKey: ['receivedNotificationEvents'],
        }),
      )
      .catch((error) => {
        logger.warn('Failed to remove unavailable airdrop banner', {error})
      })
  }, [isAirdropEnabled, manager.events, queryClient, wallet])

  useWalletEvent(wallet ?? null, 'utxos', () => {
    if (wallet) {
      queryClient.invalidateQueries({queryKey})
    }
  })

  useQuery({
    queryKey: [...queryKey, totalRedeemableAmount],
    enabled:
      !isLoading && wallet?.isMainnet === true && !!wallet && isAirdropEnabled,
    staleTime: time.fiveMinutes,
    queryFn: async () => {
      const onMainnet = wallet?.isMainnet === true
      if (!onMainnet || !wallet || !isAirdropEnabled) {
        // Remove banner if flag is disabled
        await manager.events.remove(BannerIds.Airdrop)
        queryClient.invalidateQueries({
          queryKey: ['receivedNotificationEvents'],
        })
        return false
      }

      // Only show banner if there are eligible addresses with redeemable tokens
      if (allocations.length === 0 || totalRedeemableAmount === 0) {
        await manager.events.remove(BannerIds.Airdrop)
        queryClient.invalidateQueries({
          queryKey: ['receivedNotificationEvents'],
        })
        return false
      }

      logger.debug('Airdrop banner prerequisites', {
        walletId: wallet?.id,
        allocationsCount: allocations.length,
        totalRedeemableAmount,
      })

      const last = (await manager.events.read()).find(
        (ev) =>
          ev.trigger === Notifications.Trigger.Banner &&
          ev.id === BannerIds.Airdrop,
      )

      // Format amount (divide by 10^6 to account for NIGHT decimals)
      const formattedAmount = formatAmount(totalRedeemableAmount)

      if (!last || new Date(last.date).getTime() + time.oneWeek < Date.now()) {
        showBanner({
          id: BannerIds.Airdrop,
          title: strings.airdrop.bannerTitle,
          body: strings.airdrop.bannerBody.replace('{amount}', formattedAmount),
          isRead: !!last,
        })
      }
      return true
    },
  })
}
