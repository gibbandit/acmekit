import { useState } from 'react'
import {
  ArrowUp,
  CheckCircle2,
  Circle,
  CircleDot,
  ListChecks,
  ListTodo,
  Play,
  RotateCcw,
  Search,
  ShieldX,
  Square,
  Users,
  X,
} from 'lucide-react'
import { SelectControl } from '@/components/select-control'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  CodeBlock,
  CodeBlockContent,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ui/code-block'
import { Field, FieldLabel } from '@/components/ui/field'
import { Item, ItemActions, ItemContent } from '@/components/ui/item'
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

const toolOutcomes = [
  { value: 'success', label: 'Success' },
  { value: 'failure', label: 'Failure' },
  { value: 'denied', label: 'Denied' },
] as const

type ToolOutcome = (typeof toolOutcomes)[number]['value']
type ToolStatus = ToolOutcome | 'running' | 'stopped'

const toolStates = {
  success: {
    label: 'Completed',
    title: 'Ran search_files',
    output: '{\n  "file": "launch-brief.md",\n  "matches": 3\n}',
  },
  failure: {
    label: 'Failed',
    title: 'Failed to run search_files',
    output:
      'FILE_NOT_FOUND\nThe example file launch-brief.md could not be found.',
  },
  denied: {
    label: 'Denied',
    title: 'Denied search_files',
    output: '',
  },
  running: {
    label: 'Running',
    title: 'Running search_files',
    output: '',
  },
  stopped: {
    label: 'Stopped',
    title: 'Stopped search_files',
    output: 'The example tool call was stopped.',
  },
}

const planSteps = [
  'Draft the launch brief',
  'Review project details',
  'Schedule the launch',
]

const initialQueue = {
  pending: [
    { id: 'review', title: 'Review the launch brief' },
    { id: 'announcement', title: 'Draft the announcement' },
    { id: 'notes', title: 'Prepare release notes' },
  ],
  completed: [{ id: 'brief', title: 'Create the project brief' }],
}

const agents = [
  {
    id: 'research',
    name: 'research agent',
    model: 'GPT-5 mini',
    tool: 'search_files',
    task: 'Find launch requirements in the brief.',
    result: 'Found a launch date, owner, and approval checklist.',
  },
  {
    id: 'review',
    name: 'review agent',
    model: 'GPT-5',
    tool: 'read_file',
    task: 'Check the launch checklist for missing owners.',
    result: 'Every launch task has an owner.',
  },
]

export function AgentWorkflowExamples() {
  return (
    <div className="grid items-start gap-4 md:gap-6 lg:grid-cols-2">
      <ToolsExample />
      <PlanExample />
      <QueueExample />
      <SubagentsExample />
    </div>
  )
}

function ToolsExample() {
  const [outcome, setOutcome] = useState<ToolOutcome>('success')
  const [status, setStatus] = useState<ToolStatus>('success')
  const state = toolStates[status]
  const running = status === 'running'
  const failed = status === 'failure'
  const retryable = failed || status === 'stopped'

  return (
    <Card className="min-w-0" aria-labelledby="tools-example-title">
      <CardHeader>
        <CardTitle id="tools-example-title">Tools</CardTitle>
        <CardAction aria-live="polite" role="status">
          <Badge variant={failed ? 'destructive' : 'secondary'}>
            {state.label}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="tool-example-outcome">Example result</FieldLabel>
          <SelectControl
            id="tool-example-outcome"
            label="Tool outcome"
            value={outcome}
            options={toolOutcomes}
            size="sm"
            disabled={running}
            onChange={setOutcome}
          />
        </Field>
        <ToolTrace status={status} />
      </CardContent>
      <CardFooter className="flex-wrap">
        {running ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStatus(outcome)}
            >
              <CheckCircle2 data-icon="inline-start" />
              Finish example
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStatus('stopped')}
            >
              <Square data-icon="inline-start" />
              Stop example
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStatus('running')}
          >
            {retryable ? (
              <RotateCcw data-icon="inline-start" />
            ) : (
              <Play data-icon="inline-start" />
            )}
            {retryable ? 'Retry example' : 'Run example'}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

function ToolTrace({ status }: { status: ToolStatus }) {
  const state = toolStates[status]
  const running = status === 'running'
  const failed = status === 'failure'

  return (
    <Trace>
      {running || status === 'denied' ? (
        <TraceLine status={running ? 'running' : undefined}>
          <TraceIcon>
            {status === 'denied' ? <ShieldX /> : <Search />}
          </TraceIcon>
          <TraceTitle className="wrap-anywhere whitespace-normal">
            {state.title}
          </TraceTitle>
        </TraceLine>
      ) : (
        <TraceCollapsible defaultOpen>
          <TraceCollapsibleTrigger className="min-h-11 md:min-h-8">
            <TraceLine status={failed ? 'error' : undefined}>
              <TraceIcon>
                <Search />
              </TraceIcon>
              <TraceTitle className="wrap-anywhere whitespace-normal">
                {state.title}
              </TraceTitle>
            </TraceLine>
          </TraceCollapsibleTrigger>
          <TraceCollapsibleContent className="flex flex-col gap-3">
            <CodeBlock size="sm">
              <CodeBlockHeader>
                <CodeBlockTitle>Arguments</CodeBlockTitle>
              </CodeBlockHeader>
              <CodeBlockContent wrap>
                {'{\n  "file": "launch-brief.md",\n  "query": "launch"\n}'}
              </CodeBlockContent>
            </CodeBlock>
            <CodeBlock size="sm">
              <CodeBlockHeader>
                <CodeBlockTitle>{failed ? 'Error' : 'Result'}</CodeBlockTitle>
              </CodeBlockHeader>
              <CodeBlockContent wrap>{state.output}</CodeBlockContent>
            </CodeBlock>
          </TraceCollapsibleContent>
        </TraceCollapsible>
      )}
    </Trace>
  )
}

function PlanExample() {
  const [completedSteps, setCompletedSteps] = useState(1)
  const finished = completedSteps === planSteps.length

  return (
    <Card className="min-w-0" aria-labelledby="plan-example-title">
      <CardHeader>
        <CardTitle id="plan-example-title">Plan</CardTitle>
      </CardHeader>
      <CardContent>
        <Trace>
          <TraceCollapsible defaultOpen>
            <TraceCollapsibleTrigger className="min-h-11 w-full md:min-h-8">
              <TraceLine
                status={finished ? undefined : 'running'}
                className="flex-1 flex-wrap"
              >
                <TraceIcon>
                  <ListChecks />
                </TraceIcon>
                <TraceTitle className="wrap-anywhere whitespace-normal">
                  Launch checklist
                </TraceTitle>
                <TraceDescription className="ml-auto">
                  {completedSteps} of {planSteps.length} done
                </TraceDescription>
              </TraceLine>
            </TraceCollapsibleTrigger>
            <TraceCollapsibleContent>
              <Trace>
                {planSteps.map((step, index) => {
                  const completed = index < completedSteps
                  const running = index === completedSteps

                  return (
                    <TraceLine
                      key={step}
                      status={
                        completed ? undefined : running ? 'running' : 'pending'
                      }
                    >
                      <TraceIcon>
                        {completed ? (
                          <CheckCircle2 />
                        ) : running ? (
                          <CircleDot />
                        ) : (
                          <Circle />
                        )}
                      </TraceIcon>
                      <TraceTitle className="wrap-anywhere whitespace-normal">
                        <span className="sr-only">
                          {completed
                            ? 'Completed. '
                            : running
                              ? 'In progress. '
                              : 'Pending. '}
                        </span>
                        {step}
                      </TraceTitle>
                    </TraceLine>
                  )
                })}
              </Trace>
            </TraceCollapsibleContent>
          </TraceCollapsible>
        </Trace>
        <span role="status" aria-live="polite" className="sr-only">
          {completedSteps} of {planSteps.length} plan steps complete
        </span>
      </CardContent>
      <CardFooter className="flex-wrap">
        <Button
          variant="outline"
          size="sm"
          disabled={finished}
          onClick={() =>
            setCompletedSteps((count) => Math.min(count + 1, planSteps.length))
          }
        >
          Complete next step
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Reset plan"
          title="Reset plan"
          onClick={() => setCompletedSteps(0)}
        >
          <RotateCcw />
        </Button>
      </CardFooter>
    </Card>
  )
}

function QueueExample() {
  const [queue, setQueue] = useState(initialQueue)
  const [announcement, setAnnouncement] = useState('')

  function completeNextTask() {
    setQueue((previous) => {
      const [nextTask, ...pending] = previous.pending
      if (!nextTask) return previous
      return { pending, completed: [...previous.completed, nextTask] }
    })
    setAnnouncement('')
  }

  function moveTaskUp(taskId: string) {
    setQueue((previous) => {
      const index = previous.pending.findIndex((task) => task.id === taskId)
      if (index <= 0) return previous
      const pending = [...previous.pending]
      const task = pending[index]
      pending[index] = pending[index - 1]
      pending[index - 1] = task
      return { ...previous, pending }
    })
  }

  return (
    <Card className="min-w-0" aria-labelledby="queue-example-title">
      <CardHeader>
        <CardTitle id="queue-example-title">Queue</CardTitle>
      </CardHeader>
      <CardContent>
        <Trace>
          <TraceCollapsible defaultOpen>
            <TraceCollapsibleTrigger className="min-h-11 md:min-h-8">
              <TraceLine>
                <TraceIcon>
                  <ListTodo />
                </TraceIcon>
                <TraceTitle>{queue.pending.length} to do</TraceTitle>
              </TraceLine>
            </TraceCollapsibleTrigger>
            <TraceCollapsibleContent>
              {queue.pending.length > 0 ? (
                <Trace>
                  {queue.pending.map((task, index) => (
                    <Item
                      key={task.id}
                      size="sm"
                      className="min-w-0 flex-nowrap items-start gap-2 border-0 p-0"
                    >
                      <ItemContent className="min-w-0">
                        <TraceLine
                          status="pending"
                          className="min-h-11 md:min-h-8"
                        >
                          <TraceIcon>
                            <Circle />
                          </TraceIcon>
                          <TraceTitle className="wrap-anywhere whitespace-normal">
                            {task.title}
                          </TraceTitle>
                        </TraceLine>
                      </ItemContent>
                      <ItemActions className="gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={index === 0}
                          aria-label={`Move ${task.title} up`}
                          title={`Move ${task.title} up`}
                          onClick={() => {
                            moveTaskUp(task.id)
                            setAnnouncement(
                              `${task.title} moved to position ${index}.`,
                            )
                          }}
                        >
                          <ArrowUp />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${task.title}`}
                          title={`Remove ${task.title}`}
                          onClick={() => {
                            setQueue((previous) => ({
                              ...previous,
                              pending: previous.pending.filter(
                                (pendingTask) => pendingTask.id !== task.id,
                              ),
                            }))
                            setAnnouncement(`${task.title} removed.`)
                          }}
                        >
                          <X />
                        </Button>
                      </ItemActions>
                    </Item>
                  ))}
                </Trace>
              ) : (
                <p>Queue empty</p>
              )}
            </TraceCollapsibleContent>
          </TraceCollapsible>
          <TraceCollapsible defaultOpen>
            <TraceCollapsibleTrigger className="min-h-11 md:min-h-8">
              <TraceLine>
                <TraceIcon>
                  <ListChecks />
                </TraceIcon>
                <TraceTitle>{queue.completed.length} completed</TraceTitle>
              </TraceLine>
            </TraceCollapsibleTrigger>
            <TraceCollapsibleContent>
              <Trace>
                {queue.completed.map((task) => (
                  <TraceLine key={task.id}>
                    <TraceIcon>
                      <CheckCircle2 />
                    </TraceIcon>
                    <TraceTitle className="wrap-anywhere whitespace-normal">
                      {task.title}
                    </TraceTitle>
                  </TraceLine>
                ))}
              </Trace>
            </TraceCollapsibleContent>
          </TraceCollapsible>
        </Trace>
        <span role="status" aria-live="polite" className="sr-only">
          {queue.pending.length} queued tasks, {queue.completed.length}{' '}
          completed.
          {announcement}
        </span>
      </CardContent>
      <CardFooter className="flex-wrap">
        <Button
          variant="outline"
          size="sm"
          disabled={queue.pending.length === 0}
          onClick={completeNextTask}
        >
          Complete next task
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Reset queue"
          title="Reset queue"
          onClick={() => {
            setQueue(initialQueue)
            setAnnouncement('Queue reset.')
          }}
        >
          <RotateCcw />
        </Button>
      </CardFooter>
    </Card>
  )
}

function SubagentsExample() {
  const [completedAgents, setCompletedAgents] = useState<number | null>(null)
  const started = completedAgents !== null
  const finished = completedAgents === agents.length

  return (
    <Card className="min-w-0" aria-labelledby="subagents-example-title">
      <CardHeader>
        <CardTitle id="subagents-example-title">Subagents</CardTitle>
        <CardAction role="status" aria-live="polite">
          <Badge variant="secondary">
            {completedAgents ?? 0} of {agents.length} done
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Trace>
          {agents.map((agent, index) => {
            const completed = started && index < completedAgents
            const running = started && !completed

            return (
              <TraceCollapsible key={agent.id} defaultOpen={index === 0}>
                <TraceCollapsibleTrigger className="min-h-11 md:min-h-8">
                  <TraceLine
                    status={
                      running ? 'running' : started ? undefined : 'pending'
                    }
                  >
                    <TraceIcon>
                      {completed ? <CheckCircle2 /> : <Users />}
                    </TraceIcon>
                    <TraceTitle className="wrap-anywhere whitespace-normal">
                      {completed ? 'Ran' : running ? 'Running' : 'Run'} the{' '}
                      {agent.name}
                    </TraceTitle>
                  </TraceLine>
                </TraceCollapsibleTrigger>
                <TraceCollapsibleContent className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline">{agent.model}</Badge>
                    <Badge variant="outline">{agent.tool}</Badge>
                  </div>
                  <p>{agent.task}</p>
                  <Trace>
                    {completed ? (
                      <TraceCollapsible>
                        <TraceCollapsibleTrigger className="min-h-11 md:min-h-8">
                          <TraceLine>
                            <TraceIcon>
                              <Search />
                            </TraceIcon>
                            <TraceTitle className="wrap-anywhere whitespace-normal">
                              Ran {agent.tool}
                            </TraceTitle>
                          </TraceLine>
                        </TraceCollapsibleTrigger>
                        <TraceCollapsibleContent>
                          <CodeBlock size="sm">
                            <CodeBlockContent wrap>
                              {agent.result}
                            </CodeBlockContent>
                          </CodeBlock>
                        </TraceCollapsibleContent>
                      </TraceCollapsible>
                    ) : (
                      <TraceLine status={running ? 'running' : 'pending'}>
                        <TraceIcon>
                          <Search />
                        </TraceIcon>
                        <TraceTitle className="wrap-anywhere whitespace-normal">
                          {running ? 'Running' : 'Run'} {agent.tool}
                        </TraceTitle>
                      </TraceLine>
                    )}
                  </Trace>
                  {completed && <p>{agent.result}</p>}
                </TraceCollapsibleContent>
              </TraceCollapsible>
            )
          })}
        </Trace>
      </CardContent>
      <CardFooter>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setCompletedAgents((count) =>
              count === null || count === agents.length ? 0 : count + 1,
            )
          }
        >
          {finished ? (
            <RotateCcw data-icon="inline-start" />
          ) : started ? (
            <CheckCircle2 data-icon="inline-start" />
          ) : (
            <Play data-icon="inline-start" />
          )}
          {finished
            ? 'Replay agents'
            : started
              ? 'Finish next agent'
              : 'Run agents'}
        </Button>
      </CardFooter>
    </Card>
  )
}
