import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/components')({
  component: Outlet,
  head: () => ({ meta: [{ title: 'Components · Acme' }] }),
})
