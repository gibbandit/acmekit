import { expect, test } from 'vitest'
import { cn } from './cn'

test.each([
  'page',
  'record',
  'dialog',
  'title',
  'section',
  'label',
  'metadata',
  'metric',
  'metric-compact',
])('keeps the %s typography role alongside text colors', (role) => {
  const typography = `text-${role}`
  expect(cn(typography, 'text-foreground')).toBe(
    `${typography} text-foreground`,
  )
  expect(cn('text-muted-foreground', typography)).toBe(
    `text-muted-foreground ${typography}`,
  )
  expect(cn(typography, 'text-foreground', 'text-destructive')).toBe(
    `${typography} text-destructive`,
  )
})

test('resolves custom and standard typography overrides within each breakpoint', () => {
  expect(cn('text-label text-foreground', 'text-sm')).toBe(
    'text-foreground text-sm',
  )
  expect(cn('text-sm text-foreground', 'text-label')).toBe(
    'text-foreground text-label',
  )
  expect(cn('text-label md:text-section', 'md:text-title')).toBe(
    'text-label md:text-title',
  )
})
