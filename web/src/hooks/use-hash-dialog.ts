import { useEffect, useRef } from 'react'
import { useLocation, useNavigate, useRouter } from '@tanstack/react-router'

type HashDialogState = {
  dialog: string
  pathname: string
  searchStr: string
  returnHash: string
}

declare module '@tanstack/react-router' {
  interface HistoryState {
    hashDialog?: HashDialogState
  }
}

export function useHashDialog(name: string, fallbackHash = '') {
  const location = useLocation()
  const navigate = useNavigate()
  const router = useRouter()
  const closing = useRef<typeof location | null>(null)
  const open = location.hash === name

  useEffect(() => {
    // Forward can reopen the exact entry that Cancel previously popped.
    closing.current = null
  }, [open])

  function setOpen(next: boolean) {
    // Invalidation can replace the location object without leaving this entry.
    // A callback from a different history entry must still be ignored.
    const current = router.state.location
    if (
      current.href !== location.href ||
      current.state.__TSR_key !== location.state.__TSR_key ||
      next === open
    )
      return

    if (next) {
      void navigate({
        hash: name,
        search: true,
        resetScroll: false,
        hashScrollIntoView: false,
        state: (previous) => ({
          ...previous,
          hashDialog: {
            dialog: name,
            pathname: location.pathname,
            searchStr: location.searchStr,
            returnHash: location.hash,
          },
        }),
      })
      return
    }

    // Back settles asynchronously; repeated close events must pop only once.
    if (
      closing.current?.href === location.href &&
      closing.current.state.__TSR_key === location.state.__TSR_key
    )
      return
    closing.current = location
    const marker = location.state.hashDialog
    if (
      marker?.dialog === name &&
      marker.pathname === location.pathname &&
      marker.searchStr === location.searchStr
    ) {
      router.history.back()
      return
    }

    // Direct links have no owned background entry to safely return to.
    void navigate({
      hash:
        marker?.dialog === name && marker.pathname === location.pathname
          ? marker.returnHash
          : fallbackHash,
      search: true,
      replace: true,
      resetScroll: false,
      hashScrollIntoView: false,
      state: ({ hashDialog: _hashDialog, ...previous }) => previous,
    })
  }

  return [open, setOpen] as const
}
