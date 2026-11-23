import type { ReactNode } from 'react'
import { Link, useHydrated } from '@tanstack/react-router'
import { PageHeader } from '@/components/page'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export function ComponentsFrame({
  tab,
  children,
}: {
  tab: 'controls' | 'ai' | 'appearance'
  children: ReactNode
}) {
  const hydrated = useHydrated()
  return (
    <Tabs value={tab} className="gap-6 md:gap-8">
      <div className="flex flex-col gap-4">
        <PageHeader title="Components" />
        <TabsList
          variant="line"
          className="gap-6 p-0"
          aria-label="Component examples"
          activateOnFocus={false}
        >
          <TabsTrigger
            value="controls"
            className="px-0"
            nativeButton={false}
            render={
              hydrated ? (
                <Link to="/components" search resetScroll={false} />
              ) : (
                <a href="/components" />
              )
            }
          >
            Controls
          </TabsTrigger>
          <TabsTrigger
            value="ai"
            className="px-0"
            nativeButton={false}
            render={
              hydrated ? (
                <Link to="/components/ai" search resetScroll={false} />
              ) : (
                <a href="/components/ai" />
              )
            }
          >
            AI Elements
          </TabsTrigger>
          <TabsTrigger
            value="appearance"
            className="px-0"
            nativeButton={false}
            render={
              hydrated ? (
                <Link to="/components/appearance" search resetScroll={false} />
              ) : (
                <a href="/components/appearance" />
              )
            }
          >
            Appearance
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value={tab}>{children}</TabsContent>
    </Tabs>
  )
}
