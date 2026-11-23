import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Alert, AlertTitle } from '@/components/ui/alert'
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { SelectControl } from '@/components/select-control'
import {
  projectStatuses,
  StatusBadge,
  type ProjectStatus,
} from '@/features/projects/project-status'
import { useHashDialog } from '@/hooks/use-hash-dialog'

import { ComponentsFrame } from '../-frame'

export const Route = createFileRoute('/_app/components/')({
  component: ControlsPage,
  pendingComponent: ControlsLoading,
})

function ControlsLoading() {
  return <ControlsView />
}

function ControlsPage() {
  const [dialogOpen, setDialogOpen] = useHashDialog('dialog')
  return (
    <ControlsView dialogOpen={dialogOpen} onDialogOpenChange={setDialogOpen} />
  )
}

function ControlsView({
  dialogOpen = false,
  onDialogOpenChange,
}: {
  dialogOpen?: boolean
  onDialogOpenChange?: (open: boolean) => void
}) {
  const [showAlert, setShowAlert] = useState(true)
  const [status, setStatus] = useState<ProjectStatus>('PLANNED')
  const [name, setName] = useState('Example project')
  const [checklist, setChecklist] = useState([
    { id: 'brief', label: 'Write a brief', checked: true },
    { id: 'details', label: 'Add project details', checked: true },
    { id: 'share', label: 'Share with the team', checked: false },
  ])
  const completed = checklist.filter((item) => item.checked).length
  const [avatarSize, setAvatarSize] = useState([40])

  return (
    <>
      <ComponentsFrame tab="controls">
        <div className="grid items-start gap-4 md:gap-6 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-4 md:gap-6">
            <ButtonsExample />

            <Card>
              <CardHeader>
                <CardTitle>Inputs</CardTitle>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="example-project-name">
                      Project name
                    </FieldLabel>
                    <Input
                      id="example-project-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Enter a project name"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="example-project-status">
                      Status
                    </FieldLabel>
                    <SelectControl
                      id="example-project-status"
                      label="Example project status"
                      value={status}
                      onChange={setStatus}
                      options={projectStatuses}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="example-project-notes">
                      Notes
                    </FieldLabel>
                    <Textarea
                      id="example-project-notes"
                      className="field-sizing-fixed"
                      placeholder="Describe what you’re working on…"
                      rows={4}
                    />
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>
          </div>

          <div className="flex min-w-0 flex-col gap-4 md:gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Feedback</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <div className="flex flex-wrap gap-2 *:w-auto">
                  <StatusBadge status="ACTIVE" />
                  <StatusBadge status="PLANNED" />
                  <StatusBadge status="ARCHIVED" />
                </div>
                <Separator />
                <Field orientation="horizontal">
                  <FieldLabel variant="row" htmlFor="example-alert-switch">
                    <span className="flex-1">Show example alert</span>
                    <Switch
                      id="example-alert-switch"
                      checked={showAlert}
                      onCheckedChange={setShowAlert}
                    />
                  </FieldLabel>
                </Field>
              </CardContent>
              <CardFooter>
                <Alert
                  variant="success"
                  className={showAlert ? undefined : 'invisible'}
                  aria-hidden={!showAlert}
                >
                  <CheckCircle2 />
                  <AlertTitle>Changes saved</AlertTitle>
                </Alert>
              </CardFooter>
            </Card>

            <DialogExample onDialogOpenChange={onDialogOpenChange} />

            <Card>
              <CardHeader>
                <CardTitle>Checklist</CardTitle>
              </CardHeader>
              <CardContent>
                <FieldSet>
                  <FieldLegend variant="label" className="sr-only">
                    Example launch tasks
                  </FieldLegend>
                  <FieldGroup className="gap-0 md:gap-4">
                    {checklist.map((item) => (
                      <Field key={item.id} orientation="horizontal">
                        <FieldLabel
                          variant="row"
                          htmlFor={'example-task-' + item.id}
                        >
                          <Checkbox
                            id={'example-task-' + item.id}
                            checked={item.checked}
                            onCheckedChange={(checked) =>
                              setChecklist((items) =>
                                items.map((task) =>
                                  task.id === item.id
                                    ? { ...task, checked }
                                    : task,
                                ),
                              )
                            }
                          />
                          {item.label}
                        </FieldLabel>
                      </Field>
                    ))}
                  </FieldGroup>
                </FieldSet>
              </CardContent>
              <CardFooter>
                <Progress value={completed} max={checklist.length}>
                  <ProgressLabel>Launch checklist</ProgressLabel>
                  <ProgressValue>
                    {(_, value) => `${value} of ${checklist.length} complete`}
                  </ProgressValue>
                </Progress>
              </CardFooter>
            </Card>
          </div>

          <div className="grid min-w-0 items-start gap-4 md:gap-6 lg:col-span-2 lg:grid-cols-2 xl:col-span-1 xl:grid-cols-1">
            <Card>
              <CardHeader>
                <CardTitle>Adjustments</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-4">
                <Field className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <FieldLabel id="example-avatar-size-label">
                      Avatar size
                    </FieldLabel>
                    <output className="text-sm text-muted-foreground tabular-nums">
                      {avatarSize[0]}px
                    </output>
                  </div>
                  <Slider
                    aria-labelledby="example-avatar-size-label"
                    value={avatarSize}
                    onValueChange={(value) =>
                      setAvatarSize(Array.isArray(value) ? value : [value])
                    }
                    min={24}
                    max={64}
                    step={4}
                  />
                </Field>
                <div className="flex size-16 shrink-0 items-center justify-center">
                  <Avatar
                    role="img"
                    aria-label="Robin Chen avatar preview"
                    style={{ width: avatarSize[0], height: avatarSize[0] }}
                  >
                    <AvatarFallback>RC</AvatarFallback>
                  </Avatar>
                </div>
              </CardContent>
            </Card>

            <PeopleExample />

            <div className="min-w-0 lg:col-span-2 xl:col-span-1">
              <AccordionExample />
            </div>
          </div>
        </div>
      </ComponentsFrame>

      <Dialog open={dialogOpen} onOpenChange={onDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm example action</DialogTitle>
            <DialogDescription>
              This demonstration will not change your projects.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onDialogOpenChange?.(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                onDialogOpenChange?.(false)
                toast.success('Example action confirmed.')
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ButtonsExample() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Buttons</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button onClick={() => toast.success('Primary action selected.')}>
          Primary
        </Button>
        <Button
          variant="secondary"
          onClick={() => toast.success('Secondary action selected.')}
        >
          Secondary
        </Button>
        <Button
          variant="outline"
          onClick={() => toast.success('Outline action selected.')}
        >
          Outline
        </Button>
        <Button
          variant="ghost"
          onClick={() => toast.success('Ghost action selected.')}
        >
          Ghost
        </Button>
        <Button disabled>Disabled</Button>
      </CardContent>
    </Card>
  )
}

function DialogExample({
  onDialogOpenChange,
}: {
  onDialogOpenChange?: (open: boolean) => void
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Dialog</CardTitle>
      </CardHeader>
      <CardFooter>
        <Button
          variant="outline"
          disabled={!onDialogOpenChange}
          onClick={() => onDialogOpenChange?.(true)}
        >
          Open dialog
        </Button>
      </CardFooter>
    </Card>
  )
}

function PeopleExample() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>People</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <Avatar size="lg" aria-hidden="true">
            <AvatarFallback>RC</AvatarFallback>
            <AvatarBadge className="bg-success-foreground" />
          </Avatar>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-medium">Robin Chen</p>
            <p className="text-sm text-muted-foreground">Available</p>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <div className="flex flex-wrap items-center gap-3">
          <AvatarGroup
            role="group"
            aria-label="Example team: Robin Chen, Jamie Lee, Sam Rivera, and three others"
          >
            <Avatar>
              <AvatarFallback>RC</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>JL</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>SR</AvatarFallback>
            </Avatar>
            <AvatarGroupCount>+3</AvatarGroupCount>
          </AvatarGroup>
          <p className="text-sm text-muted-foreground">Example team</p>
        </div>
      </CardFooter>
    </Card>
  )
}

function AccordionExample() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Accordion</CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion>
          <AccordionItem value="preview">
            <AccordionTrigger>
              Do these examples change my workspace?
            </AccordionTrigger>
            <AccordionContent>
              These controls are a preview. Changes stay on this page and do not
              update your projects.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="themes">
            <AccordionTrigger>Can I try another appearance?</AccordionTrigger>
            <AccordionContent>
              Use the Appearance tab to switch between light, dark, and system
              themes. Your preference is saved in this browser.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="keyboard">
            <AccordionTrigger>
              Can I use these controls with a keyboard?
            </AccordionTrigger>
            <AccordionContent>
              Tab between controls, use Space to toggle checkboxes, and use the
              arrow keys to adjust the slider.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  )
}
