import { Moon, Sun } from 'lucide-react'

import { useTheme } from '@/components/theme-provider'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function ModeToggle({
  variant = 'outline',
  size = 'icon',
}: {
  variant?: 'outline' | 'ghost'
  size?: 'icon' | 'icon-sm'
}) {
  const { setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant={variant}
            size={size}
            className="relative max-md:size-11"
          />
        }
      >
        <Sun
          className="scale-100 rotate-0 transition-transform dark:scale-0 dark:-rotate-90"
          aria-hidden="true"
        />
        <Moon
          className="absolute scale-0 rotate-90 transition-transform dark:scale-100 dark:rotate-0"
          aria-hidden="true"
        />
        <span className="sr-only">Toggle theme</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem closeOnClick onClick={() => setTheme('light')}>
            Light
          </DropdownMenuItem>
          <DropdownMenuItem closeOnClick onClick={() => setTheme('dark')}>
            Dark
          </DropdownMenuItem>
          <DropdownMenuItem closeOnClick onClick={() => setTheme('system')}>
            System
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
