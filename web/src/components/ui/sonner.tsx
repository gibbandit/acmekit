'use client'

import { useTheme } from 'next-themes'
import { Toaster as Sonner, type ToasterProps } from 'sonner'
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from 'lucide-react'

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      offset={{
        bottom: 'max(1.5rem, env(safe-area-inset-bottom))',
        left: 'max(1.5rem, env(safe-area-inset-left))',
        right: 'max(1.5rem, env(safe-area-inset-right))',
      }}
      mobileOffset={{
        bottom: 'max(1rem, env(safe-area-inset-bottom))',
        // Sonner sizes mobile toasts using twice the left offset.
        left: 'max(1rem, env(safe-area-inset-left), env(safe-area-inset-right))',
        right:
          'max(1rem, env(safe-area-inset-left), env(safe-area-inset-right))',
      }}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--glass-edge)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      toastOptions={{
        style: {
          backgroundColor: 'var(--glass-background)',
          boxShadow: 'var(--glass-highlight), var(--menu-shadow)',
        },
        classNames: {
          toast: 'glass-surface',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
