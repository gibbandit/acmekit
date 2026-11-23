import { useSyncExternalStore } from 'react'

const MOBILE_BREAKPOINT = 768

function subscribe(onChange: () => void) {
  const media = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

function snapshot() {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches
}

function serverSnapshot() {
  return false
}

export function useIsMobile() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot)
}
