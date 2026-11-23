import { useRef, useState } from 'react'
import {
  ArrowUpRight,
  BookOpen,
  FileText,
  Info,
  Paperclip,
  RotateCcw,
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
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  DescriptionList,
  DescriptionListDetails,
  DescriptionListItem,
  DescriptionListTerm,
} from '@/components/ui/description-list'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { Progress } from '@/components/ui/progress'
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from '@/components/ui/trace'

const initialAttachments = [
  { id: 'brief', name: 'launch-brief.md', size: 1240 },
  { id: 'image', name: 'screenshot.png', size: 84600 },
]

const attachmentSizeFormat = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

const references = [
  {
    title: 'Route loaders',
    site: 'tanstack.com',
    href: 'https://tanstack.com/router/latest/docs/guide/data-loading',
    description: 'Load route data before rendering the view.',
  },
  {
    title: 'Relay fragments',
    site: 'relay.dev',
    href: 'https://relay.dev/docs/tutorial/fragments-1/',
    description: 'Declare a component’s data requirements alongside its UI.',
  },
]

export function AIReferenceExamples() {
  return (
    <div className="grid items-start gap-4 md:gap-6 lg:grid-cols-2 xl:grid-cols-3">
      <AttachmentsExample />
      <SourcesExample />
      <ContextExample />
    </div>
  )
}

function AttachmentsExample() {
  const [files, setFiles] = useState(initialAttachments)
  const picker = useRef<HTMLInputElement>(null)

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Attachments</CardTitle>
      </CardHeader>
      <CardContent>
        <AttachmentGroup role="group" aria-label="Example attachments">
          {files.map((file) => (
            <Attachment key={file.id}>
              <AttachmentMedia>
                <FileText />
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle title={file.name}>{file.name}</AttachmentTitle>
                <AttachmentDescription>
                  {attachmentSizeFormat.format(file.size)}B
                </AttachmentDescription>
              </AttachmentContent>
              <AttachmentActions>
                <AttachmentAction
                  aria-label={`Remove ${file.name}`}
                  onClick={() =>
                    setFiles((previous) =>
                      previous.filter((item) => item.id !== file.id),
                    )
                  }
                >
                  <X />
                </AttachmentAction>
              </AttachmentActions>
            </Attachment>
          ))}
        </AttachmentGroup>
        <p className="sr-only" aria-live="polite">
          {files.length} files attached
        </p>
      </CardContent>
      <CardFooter>
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          aria-label="Choose files"
          onChange={(event) => {
            const selected = Array.from(event.currentTarget.files ?? []).map(
              (file) => ({
                id: crypto.randomUUID(),
                name: file.name,
                size: file.size,
              }),
            )
            setFiles((previous) => [...previous, ...selected])
            event.currentTarget.value = ''
          }}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => picker.current?.click()}
        >
          <Paperclip data-icon="inline-start" />
          Attach files
        </Button>
      </CardFooter>
    </Card>
  )
}

function SourceCitation({ index }: { index: number }) {
  const source = references[index]!
  const [open, setOpen] = useState(false)

  return (
    <HoverCard open={open} onOpenChange={setOpen}>
      <HoverCardTrigger
        render={
          <Button
            variant="link"
            size="xs"
            className="min-w-6 px-1 align-baseline"
          />
        }
        onClick={() => setOpen(true)}
        aria-label={`View source ${index + 1}`}
      >
        [{index + 1}]
      </HoverCardTrigger>
      <HoverCardContent align="start" aria-label={source.title}>
        <div className="flex flex-col gap-2">
          <p className="font-medium">{source.title}</p>
          <p className="text-muted-foreground">{source.description}</p>
          <a
            href={source.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 text-info-foreground underline-offset-4 hover:underline md:min-h-8"
          >
            {source.site}
            <ArrowUpRight className="size-4" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

function SourcesExample() {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Sources</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm/6">
          Load data with the route <SourceCitation index={0} /> and keep
          component requirements in fragments <SourceCitation index={1} />.
        </p>
        <Trace>
          <TraceCollapsible>
            <TraceCollapsibleTrigger className="min-h-11 md:min-h-8">
              <TraceLine>
                <TraceIcon>
                  <BookOpen />
                </TraceIcon>
                <TraceTitle>2 references</TraceTitle>
              </TraceLine>
            </TraceCollapsibleTrigger>
            <TraceCollapsibleContent>
              <Trace>
                {references.map((source) => (
                  <a
                    key={source.href}
                    href={source.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-11 items-center md:min-h-8"
                  >
                    <TraceLine>
                      <TraceIcon>
                        <BookOpen />
                      </TraceIcon>
                      <TraceTitle>
                        {source.title}
                        <span className="sr-only"> (opens in a new tab)</span>
                      </TraceTitle>
                      <TraceIcon>
                        <ArrowUpRight />
                      </TraceIcon>
                    </TraceLine>
                  </a>
                ))}
              </Trace>
            </TraceCollapsibleContent>
          </TraceCollapsible>
        </Trace>
      </CardContent>
    </Card>
  )
}

function ContextExample() {
  const [used, setUsed] = useState(2400)
  const [open, setOpen] = useState(false)
  const limit = 8000

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Context</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Progress value={used} max={limit} aria-label="Context used" />
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground tabular-nums">
            {used.toLocaleString('en-US')} / {limit.toLocaleString('en-US')}{' '}
            tokens
          </p>
          <HoverCard open={open} onOpenChange={setOpen}>
            <HoverCardTrigger
              render={<Button variant="ghost" size="icon-sm" />}
              aria-label="Inspect context usage"
              onClick={() => setOpen(true)}
            >
              <Info />
            </HoverCardTrigger>
            <HoverCardContent align="end" aria-label="Context usage">
              <p className="mb-3 font-medium">Context usage</p>
              <DescriptionList>
                <DescriptionListItem>
                  <DescriptionListTerm>Input</DescriptionListTerm>
                  <DescriptionListDetails>1,800</DescriptionListDetails>
                </DescriptionListItem>
                <DescriptionListItem>
                  <DescriptionListTerm>Output</DescriptionListTerm>
                  <DescriptionListDetails>
                    {(used - 1800).toLocaleString('en-US')}
                  </DescriptionListDetails>
                </DescriptionListItem>
                <DescriptionListItem>
                  <DescriptionListTerm>Remaining</DescriptionListTerm>
                  <DescriptionListDetails>
                    {(limit - used).toLocaleString('en-US')}
                  </DescriptionListDetails>
                </DescriptionListItem>
              </DescriptionList>
            </HoverCardContent>
          </HoverCard>
        </div>
      </CardContent>
      <CardFooter>
        <Button
          variant="outline"
          size="sm"
          disabled={used === limit}
          onClick={() => setUsed((value) => Math.min(value + 512, limit))}
        >
          Add sample turn
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Reset context"
          onClick={() => setUsed(2400)}
        >
          <RotateCcw />
        </Button>
      </CardFooter>
    </Card>
  )
}
