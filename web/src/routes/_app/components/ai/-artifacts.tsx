import { useId, useState } from 'react'
import {
  CheckCircle2,
  ChevronRight,
  CircleX,
  FileCode2,
  FileText,
  FlaskConical,
  Folder,
  Layers,
  LoaderCircle,
  RotateCcw,
  Terminal,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
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
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockLine,
  CodeBlockTitle,
} from '@/components/ui/code-block'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from '@/components/ui/trace'

type CheckStatus = 'failed' | 'running' | 'passed'

type ArtifactFile = {
  name: string
  content: string
  diff: { text: string; variant: 'default' | 'added' | 'removed' }[]
}

const files: ArtifactFile[] = [
  {
    name: 'launch-plan.json',
    content:
      '{\n  "project": "Atlas",\n  "owner": "Maya Chen",\n  "status": "ready"\n}',
    diff: [
      { text: '{', variant: 'default' },
      { text: '  "project": "Atlas",', variant: 'default' },
      { text: '  "owner": null,', variant: 'removed' },
      { text: '  "owner": "Maya Chen",', variant: 'added' },
      { text: '  "status": "draft"', variant: 'removed' },
      { text: '  "status": "ready"', variant: 'added' },
      { text: '}', variant: 'default' },
    ],
  },
  {
    name: 'checklist.md',
    content:
      '# Atlas launch\n\n- [x] Draft the brief\n- [x] Assign an owner\n- [ ] Schedule the announcement',
    diff: [
      { text: '# Atlas launch', variant: 'default' },
      { text: '', variant: 'default' },
      { text: '- [x] Draft the brief', variant: 'default' },
      { text: '- [ ] Assign an owner', variant: 'removed' },
      { text: '- [x] Assign an owner', variant: 'added' },
      { text: '- [ ] Schedule the announcement', variant: 'default' },
    ],
  },
]

const checks = ['preserves the project name', 'requires a launch owner']
const frameworkFrames = [
  'runTest (node_modules/example-runner/run.js:94:12)',
  'runSuite (node_modules/example-runner/suite.js:61:8)',
]
const terminalOutput = {
  failed:
    'RUN  Atlas launch checks\n\nPASS  preserves the project name\nFAIL  requires a launch owner\n\nTests  1 passed, 1 failed (2)\nExit code 1',
  running: 'RUN  Atlas launch checks\n\nChecking the example launch files…',
  passed:
    'RUN  Atlas launch checks\n\nPASS  preserves the project name\nPASS  requires a launch owner\n\nTests  2 passed (2)\nExit code 0',
}

export function AgentArtifactExamples() {
  return (
    <div className="grid items-start gap-4 md:gap-6 xl:grid-cols-2">
      <FilesExample />
      <DiagnosticsExample />
    </div>
  )
}

function FilesExample() {
  const [selectedFile, setSelectedFile] = useState(0)
  const [showDiff, setShowDiff] = useState(false)
  const previewId = useId()
  const file = files[selectedFile]

  return (
    <Card className="min-w-0" aria-labelledby="files-example-title">
      <CardHeader>
        <CardTitle id="files-example-title">Files</CardTitle>
        <CardDescription>Read-only example files</CardDescription>
      </CardHeader>
      <CardContent className="@container/artifacts min-w-0">
        <div className="grid min-w-0 gap-4 @2xl/artifacts:grid-cols-[12rem_minmax(0,1fr)]">
          <div role="group" aria-label="Example files" className="min-w-0">
            <Collapsible defaultOpen>
              <CollapsibleTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                  />
                }
              >
                <ChevronRight
                  data-icon="inline-start"
                  className="transition-transform motion-control group-data-panel-open/button:rotate-90"
                />
                <Folder />
                project
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="ml-4 flex min-w-0 flex-col gap-1">
                  {files.map((item, index) => (
                    <Button
                      key={item.name}
                      variant={selectedFile === index ? 'secondary' : 'ghost'}
                      size="sm"
                      className="w-full justify-start"
                      aria-pressed={selectedFile === index}
                      aria-controls={previewId}
                      onClick={() => setSelectedFile(index)}
                    >
                      <FileText data-icon="inline-start" />
                      <span className="truncate">{item.name}</span>
                    </Button>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
          <CodeBlock size="sm">
            <CodeBlockHeader className="flex-wrap">
              <CodeBlockTitle title={`project/${file.name}`}>
                {file.name}
              </CodeBlockTitle>
              <CodeBlockActions>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-pressed={showDiff}
                  aria-controls={previewId}
                  onClick={() => setShowDiff((previous) => !previous)}
                >
                  Diff
                </Button>
                <CodeBlockCopyButton
                  value={file.content}
                  aria-label={`Copy project/${file.name}`}
                  title="Copy selected file"
                />
              </CodeBlockActions>
            </CodeBlockHeader>
            <CodeBlockContent
              id={previewId}
              wrap
              lineNumbers
              aria-label={`${file.name} ${showDiff ? 'diff' : 'preview'}`}
              className="max-h-72"
            >
              {showDiff
                ? file.diff.map((line, index) => (
                    <CodeBlockLine key={index} variant={line.variant}>
                      {line.text}
                    </CodeBlockLine>
                  ))
                : file.content}
            </CodeBlockContent>
          </CodeBlock>
        </div>
      </CardContent>
    </Card>
  )
}

function DiagnosticsExample() {
  const [status, setStatus] = useState<CheckStatus>('failed')
  const running = status === 'running'
  const failed = status === 'failed'
  const failedCount = failed ? 1 : 0
  const passedCount = running ? 0 : checks.length - failedCount
  const summary = running
    ? `Running ${checks.length} checks`
    : `${passedCount} passed, ${failedCount} failed`

  return (
    <Card className="min-w-0" aria-labelledby="diagnostics-example-title">
      <CardHeader>
        <CardTitle id="diagnostics-example-title">Diagnostics</CardTitle>
        <CardDescription>Local example output</CardDescription>
        <CardAction>
          <Badge
            variant={failed ? 'destructive' : running ? 'secondary' : 'success'}
          >
            {running ? 'Running' : failed ? '1 failed' : 'Passed'}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p role="status" aria-live="polite" className="sr-only">
          {summary}
        </p>
        <Trace>
          <TestResultsExample status={status} summary={summary} />
          <TerminalOutputExample status={status} />
        </Trace>
      </CardContent>
      <CardFooter>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setStatus(running ? 'passed' : 'running')}
        >
          {running ? (
            <CheckCircle2 data-icon="inline-start" />
          ) : (
            <RotateCcw data-icon="inline-start" />
          )}
          {running ? 'Finish checks' : 'Rerun checks'}
        </Button>
      </CardFooter>
    </Card>
  )
}

function TestResultsExample({
  status,
  summary,
}: {
  status: CheckStatus
  summary: string
}) {
  const [suiteOpen, setSuiteOpen] = useState(true)
  const [failureOpen, setFailureOpen] = useState(true)
  const [frameworkOpen, setFrameworkOpen] = useState(false)
  const running = status === 'running'
  const failed = status === 'failed'

  return (
    <TraceCollapsible defaultOpen>
      <TraceCollapsibleTrigger className="min-h-11 md:min-h-8">
        <TraceLine status={running ? 'running' : failed ? 'error' : undefined}>
          <TraceIcon>
            <FlaskConical />
          </TraceIcon>
          <TraceTitle className="wrap-anywhere whitespace-normal">
            {summary}
          </TraceTitle>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent>
        <Trace>
          <TraceCollapsible open={suiteOpen} onOpenChange={setSuiteOpen}>
            <TraceCollapsibleTrigger className="min-h-11 md:min-h-8">
              <TraceLine
                status={failed ? 'error' : undefined}
                className="flex-wrap"
              >
                <TraceIcon>
                  <FileCode2 />
                </TraceIcon>
                <TraceTitle className="wrap-anywhere whitespace-normal">
                  launch-plan.test.ts
                </TraceTitle>
                <TraceDescription>{checks.length} tests</TraceDescription>
              </TraceLine>
            </TraceCollapsibleTrigger>
            <TraceCollapsibleContent>
              <Trace>
                {checks.map((check, index) =>
                  failed && index === 1 ? (
                    <TraceCollapsible
                      key={check}
                      open={failureOpen}
                      onOpenChange={setFailureOpen}
                    >
                      <TraceCollapsibleTrigger className="min-h-11 md:min-h-8">
                        <TraceLine status="error">
                          <TraceIcon>
                            <CircleX />
                          </TraceIcon>
                          <TraceTitle className="wrap-anywhere whitespace-normal">
                            {check}
                          </TraceTitle>
                        </TraceLine>
                      </TraceCollapsibleTrigger>
                      <TraceCollapsibleContent className="flex flex-col gap-3">
                        <CodeBlock size="sm" variant="destructive">
                          <CodeBlockContent wrap>
                            {
                              'AssertionError: Expected a launch owner, received null\n\nvalidatePlan (project/validate-plan.ts:18:9)\nlaunch-plan.test.ts:12:3'
                            }
                          </CodeBlockContent>
                        </CodeBlock>
                        <Trace>
                          <TraceCollapsible
                            open={frameworkOpen}
                            onOpenChange={setFrameworkOpen}
                          >
                            <TraceCollapsibleTrigger className="min-h-11 md:min-h-8">
                              <TraceLine>
                                <TraceIcon>
                                  <Layers />
                                </TraceIcon>
                                <TraceTitle>
                                  {frameworkFrames.length} framework frames
                                </TraceTitle>
                              </TraceLine>
                            </TraceCollapsibleTrigger>
                            <TraceCollapsibleContent>
                              <CodeBlock size="sm">
                                <CodeBlockContent wrap>
                                  {frameworkFrames.join('\n')}
                                </CodeBlockContent>
                              </CodeBlock>
                            </TraceCollapsibleContent>
                          </TraceCollapsible>
                        </Trace>
                      </TraceCollapsibleContent>
                    </TraceCollapsible>
                  ) : (
                    <TraceLine
                      key={check}
                      status={running ? 'running' : undefined}
                    >
                      <TraceIcon>
                        {running ? <LoaderCircle /> : <CheckCircle2 />}
                      </TraceIcon>
                      <TraceTitle className="wrap-anywhere whitespace-normal">
                        <span className="sr-only">
                          {running ? 'Running. ' : 'Passed. '}
                        </span>
                        {check}
                      </TraceTitle>
                    </TraceLine>
                  ),
                )}
              </Trace>
            </TraceCollapsibleContent>
          </TraceCollapsible>
        </Trace>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  )
}

function TerminalOutputExample({ status }: { status: CheckStatus }) {
  const running = status === 'running'
  const failed = status === 'failed'

  return (
    <TraceCollapsible>
      <TraceCollapsibleTrigger className="min-h-11 md:min-h-8">
        <TraceLine status={running ? 'running' : failed ? 'error' : undefined}>
          <TraceIcon>
            <Terminal />
          </TraceIcon>
          <TraceTitle>Terminal output</TraceTitle>
          {!running && (
            <TraceDescription>exit {failed ? 1 : 0}</TraceDescription>
          )}
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent>
        <CodeBlock size="sm">
          <CodeBlockHeader>
            <CodeBlockTitle>Example checks</CodeBlockTitle>
            <CodeBlockActions>
              <CodeBlockCopyButton
                value={terminalOutput[status]}
                aria-label="Copy terminal output"
              />
            </CodeBlockActions>
          </CodeBlockHeader>
          <CodeBlockContent wrap className="max-h-64">
            {terminalOutput[status]}
          </CodeBlockContent>
        </CodeBlock>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  )
}
