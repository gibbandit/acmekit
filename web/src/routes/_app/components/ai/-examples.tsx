import { useState } from 'react'
import {
  CheckCircle2,
  Lightbulb,
  ListChecks,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from '@/components/ui/trace'
import { ConversationExample } from './-conversation'
import { AIReferenceExamples } from './-references'
import { AgentWorkflowExamples } from './-workflow'
import { AgentArtifactExamples } from './-artifacts'

export default function AIExamples() {
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="grid items-start gap-4 md:gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <ConversationExample />
        <div className="flex min-w-0 flex-col gap-8 p-4 sm:p-6">
          <ActivityExample />
          <Separator />
          <ConfirmationExample />
        </div>
      </div>
      <AIReferenceExamples />
      <AgentWorkflowExamples />
      <AgentArtifactExamples />
    </div>
  )
}

function ActivityExample() {
  const [phase, setPhase] = useState<'idle' | 'running' | 'complete'>('idle')
  const [expanded, setExpanded] = useState<boolean | undefined>(undefined)
  const running = phase === 'running'

  return (
    <Card variant="ghost" className="min-w-0">
      <CardHeader>
        <CardTitle>Reasoning</CardTitle>
      </CardHeader>
      <CardContent>
        <Trace className="gap-2">
          <TraceCollapsible
            open={expanded ?? running}
            onOpenChange={setExpanded}
          >
            <TraceCollapsibleTrigger
              aria-label="Reasoning summary"
              className="min-h-11 w-full md:min-h-8"
            >
              <TraceLine status={running ? 'running' : undefined}>
                <TraceIcon>
                  {phase === 'complete' ? <CheckCircle2 /> : <ListChecks />}
                </TraceIcon>
                <TraceTitle>
                  {running
                    ? 'Reviewing requirements'
                    : phase === 'complete'
                      ? 'Plan prepared'
                      : 'Planning summary'}
                </TraceTitle>
              </TraceLine>
            </TraceCollapsibleTrigger>
            <TraceCollapsibleContent>
              Review scope and dependencies before preparing the launch plan.
            </TraceCollapsibleContent>
          </TraceCollapsible>
          <TraceCollapsible>
            <TraceCollapsibleTrigger
              aria-label="How this example was prepared"
              className="min-h-11 w-full justify-between md:min-h-8"
            >
              <TraceLine className="flex-1">
                <TraceIcon>
                  <Lightbulb />
                </TraceIcon>
                <TraceTitle>Planning approach</TraceTitle>
              </TraceLine>
            </TraceCollapsibleTrigger>
            <TraceCollapsibleContent>
              The sample plan groups preparation, review, and launch into a
              short checklist.
            </TraceCollapsibleContent>
          </TraceCollapsible>
        </Trace>
      </CardContent>
      <CardFooter>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPhase(running ? 'complete' : 'running')}
        >
          {running ? 'Finish reasoning' : 'Run reasoning'}
        </Button>
      </CardFooter>
    </Card>
  )
}

function ConfirmationExample() {
  const [decision, setDecision] = useState<'approved' | 'declined' | null>(null)
  return (
    <Card variant="ghost" className="min-w-0">
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
            {decision === null ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Decline example"
                  onClick={() => setDecision('declined')}
                >
                  Decline
                </Button>
                <Button
                  size="sm"
                  aria-label="Approve example"
                  onClick={() => setDecision('approved')}
                >
                  Approve
                </Button>
              </>
            ) : (
              <>
                <p role="status" className="mr-auto">
                  <Badge
                    variant={decision === 'approved' ? 'success' : 'secondary'}
                  >
                    {decision === 'approved'
                      ? 'Example approved'
                      : 'Example declined'}
                  </Badge>
                </p>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Reset approval"
                  title="Reset approval"
                  onClick={() => setDecision(null)}
                >
                  <RotateCcw />
                </Button>
              </>
            )}
          </ItemActions>
        </Item>
      </CardContent>
    </Card>
  )
}
