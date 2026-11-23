import { lazy, Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  ArrowUp,
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  Info,
  Paperclip,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react'
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from '@/components/ui/attachment'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '@/components/ui/input-group'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { ComponentsFrame } from '../-frame'

const AIExamples = lazy(() => import('./-examples'))

export const Route = createFileRoute('/_app/components/ai')({
  component: AIPage,
  pendingComponent: AILoading,
})

function AIPage() {
  return (
    <ComponentsFrame tab="ai">
      <Suspense fallback={<AIContentLoading />}>
        <AIExamples />
      </Suspense>
    </ComponentsFrame>
  )
}

function AILoading() {
  return (
    <ComponentsFrame tab="ai">
      <AIContentLoading />
    </ComponentsFrame>
  )
}

function AIContentLoading() {
  return (
    <>
      <span role="status" aria-label="Loading AI examples" className="sr-only">
        Loading AI examples
      </span>
      <div aria-busy="true" className="flex flex-col gap-4 md:gap-6">
        <div className="grid items-start gap-4 md:gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Conversation</CardTitle>
              <CardDescription>
                Try a local chat preview. No messages leave this page.
              </CardDescription>
              <CardAction>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled
                  aria-label="Reset conversation"
                >
                  <RotateCcw />
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full md:h-96" />
            </CardContent>
            <CardFooter className="flex flex-col items-stretch gap-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled>
                  Plan a launch
                </Button>
                <Button variant="outline" size="sm" disabled>
                  Review a brief
                </Button>
              </div>
              <Field data-disabled>
                <FieldLabel htmlFor="example-message" className="sr-only">
                  Message
                </FieldLabel>
                <InputGroup data-disabled>
                  <InputGroupTextarea
                    id="example-message"
                    rows={1}
                    disabled
                    placeholder="Try an example prompt…"
                    className="max-h-36 min-h-11 overflow-y-auto px-3 md:min-h-10 md:py-2"
                    aria-describedby="example-message-description"
                  />
                  <InputGroupAddon align="block-end" className="gap-1 p-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled
                      aria-label="Model"
                      className="min-w-0 shrink"
                    >
                      <span className="truncate">GPT-5</span>
                      <ChevronDown data-icon="inline-end" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled
                      aria-label="Effort"
                      className="min-w-0 shrink"
                    >
                      <span className="truncate">Medium</span>
                      <ChevronDown data-icon="inline-end" />
                    </Button>
                    <InputGroupButton
                      variant="ghost"
                      size="icon-sm"
                      disabled
                      className="ml-auto"
                      aria-label="Send message"
                    >
                      <ArrowUp />
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
                <FieldDescription
                  id="example-message-description"
                  className="hidden md:block"
                >
                  Enter to send · Shift+Enter for a new line
                </FieldDescription>
              </Field>
            </CardFooter>
          </Card>
          <div className="flex min-w-0 flex-col gap-8 p-4 sm:p-6">
            <Card variant="ghost">
              <CardHeader>
                <CardTitle>Reasoning</CardTitle>
              </CardHeader>
              <CardContent>
                <div aria-hidden="true" className="flex flex-col gap-2">
                  {[0, 1].map((index) => (
                    <div
                      key={index}
                      className="flex min-h-11 items-center gap-2 md:min-h-8"
                    >
                      <Skeleton className="size-4 shrink-0" />
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="ml-auto size-4 shrink-0" />
                    </div>
                  ))}
                </div>
              </CardContent>
              <CardFooter>
                <Button variant="outline" size="sm" disabled>
                  Run reasoning
                </Button>
              </CardFooter>
            </Card>
            <Separator />
            <Card variant="ghost">
              <CardHeader>
                <CardTitle>Confirmation</CardTitle>
              </CardHeader>
              <CardContent>
                <Item size="sm" className="border-0 p-0">
                  <ItemMedia variant="icon">
                    <ShieldCheck />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>Update a project?</ItemTitle>
                  </ItemContent>
                  <ItemActions className="min-h-11 w-full justify-end md:min-h-8">
                    <Button variant="outline" size="sm" disabled>
                      Decline
                    </Button>
                    <Button size="sm" disabled>
                      Approve
                    </Button>
                  </ItemActions>
                </Item>
              </CardContent>
            </Card>
          </div>
        </div>
        <AIReferenceLoading />
        <AgentSectionLoading />
      </div>
    </>
  )
}

function AIReferenceLoading() {
  return (
    <div className="grid items-start gap-4 md:gap-6 lg:grid-cols-2 xl:grid-cols-3">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Attachments</CardTitle>
        </CardHeader>
        <CardContent>
          <AttachmentGroup>
            {[
              { name: 'launch-brief.md', size: '1.2KB' },
              { name: 'screenshot.png', size: '84.6KB' },
            ].map((file) => (
              <Attachment key={file.name}>
                <AttachmentMedia>
                  <FileText />
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle>{file.name}</AttachmentTitle>
                  <AttachmentDescription>{file.size}</AttachmentDescription>
                </AttachmentContent>
                <AttachmentActions>
                  <AttachmentAction disabled aria-label={`Remove ${file.name}`}>
                    <X />
                  </AttachmentAction>
                </AttachmentActions>
              </Attachment>
            ))}
          </AttachmentGroup>
        </CardContent>
        <CardFooter>
          <Button variant="outline" size="sm" disabled>
            <Paperclip data-icon="inline-start" />
            Attach files
          </Button>
        </CardFooter>
      </Card>
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Sources</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm/6">
            Load data with the route{' '}
            <Button
              variant="link"
              size="xs"
              className="min-w-6 px-1 align-baseline"
              disabled
              aria-label="View source 1"
            >
              [1]
            </Button>{' '}
            and keep component requirements in fragments{' '}
            <Button
              variant="link"
              size="xs"
              className="min-w-6 px-1 align-baseline"
              disabled
              aria-label="View source 2"
            >
              [2]
            </Button>
            .
          </p>
          <Button variant="ghost" size="sm" disabled className="w-fit px-0">
            <BookOpen data-icon="inline-start" />2 references
            <ChevronRight data-icon="inline-end" />
          </Button>
        </CardContent>
      </Card>
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Context</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Progress value={2400} max={8000} aria-label="Context used" />
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground tabular-nums">
              2,400 / 8,000 tokens
            </p>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled
              aria-label="Inspect context usage"
            >
              <Info />
            </Button>
          </div>
        </CardContent>
        <CardFooter>
          <Button variant="outline" size="sm" disabled>
            Add sample turn
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled
            aria-label="Reset context"
          >
            <RotateCcw />
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

function AgentSectionLoading() {
  return (
    <>
      <div className="grid items-start gap-4 md:gap-6 lg:grid-cols-2">
        {['Tools', 'Plan', 'Queue', 'Subagents'].map((title) => (
          <Card key={title} className="min-w-0">
            <CardHeader>
              <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid items-start gap-4 md:gap-6 xl:grid-cols-2">
        {['Files', 'Diagnostics'].map((title) => (
          <Card key={title} className="min-w-0">
            <CardHeader>
              <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  )
}
