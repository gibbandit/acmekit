import { useState } from 'react'
import { Loader2, LogIn } from 'lucide-react'
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
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Button, buttonVariants } from '@/components/ui/button'
import { InlineError } from '@/components/page'
import { postJSON } from '@/lib/utils'

export function LoginDialog({
  open,
  onOpenChange,
  demoEnabled,
  githubEnabled,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  demoEnabled: boolean
  githubEnabled: boolean
}) {
  const [role, setRole] = useState<'MAINTAINER' | 'MEMBER'>('MAINTAINER')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  async function login() {
    setBusy(true)
    setError(null)
    try {
      await postJSON('/auth/demo', { role })
      window.location.assign('/')
    } catch (cause) {
      setError(cause)
      setBusy(false)
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next)
      }}
      onOpenChangeComplete={(next) => {
        if (!next) setError(null)
      }}
    >
      <DialogContent showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>
            {demoEnabled ? 'Open demo workspace' : 'Sign in'}
          </DialogTitle>
          <DialogDescription>
            {demoEnabled
              ? 'Choose a role for a private workspace with sample projects.'
              : 'Sign in to open your Acme workspace.'}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          {demoEnabled && (
            <FieldSet disabled={busy}>
              <FieldLegend variant="label" id="demo-role-label">
                Access role
              </FieldLegend>
              <RadioGroup
                name="demo-role"
                value={role}
                disabled={busy}
                onValueChange={(value) => {
                  if (value === 'MAINTAINER' || value === 'MEMBER')
                    setRole(value)
                }}
                aria-labelledby="demo-role-label"
              >
                {(
                  [
                    {
                      value: 'MAINTAINER',
                      label: 'Maintainer',
                      description: 'View, create, edit, and delete projects.',
                    },
                    {
                      value: 'MEMBER',
                      label: 'Member',
                      description: 'View projects with read-only access.',
                    },
                  ] as const
                ).map((option) => (
                  <Field
                    key={option.value}
                    orientation="horizontal"
                    data-disabled={busy || undefined}
                  >
                    <FieldLabel
                      variant="row"
                      className="items-start gap-3 rounded-xl border border-border p-4 has-data-checked:border-foreground/25 has-data-checked:bg-accent"
                      htmlFor={`demo-role-${option.value.toLowerCase()}`}
                    >
                      <RadioGroupItem
                        className="mt-0.5"
                        id={`demo-role-${option.value.toLowerCase()}`}
                        value={option.value}
                        aria-labelledby={`demo-role-${option.value.toLowerCase()}-label`}
                        aria-describedby={`demo-role-${option.value.toLowerCase()}-description`}
                      />
                      <FieldContent>
                        <FieldTitle
                          id={`demo-role-${option.value.toLowerCase()}-label`}
                        >
                          {option.label}
                        </FieldTitle>
                        <FieldDescription
                          id={`demo-role-${option.value.toLowerCase()}-description`}
                        >
                          {option.description}
                        </FieldDescription>
                      </FieldContent>
                    </FieldLabel>
                  </Field>
                ))}
              </RadioGroup>
              <FieldDescription>
                Demo data belongs to this session and is removed when you sign
                out.
              </FieldDescription>
            </FieldSet>
          )}
          {error !== null && <InlineError error={error} />}
          {!demoEnabled && !githubEnabled && (
            <InlineError error="Sign-in is not available on this server. Please contact your administrator." />
          )}
          {githubEnabled && (
            <>
              {demoEnabled && (
                <FieldSeparator className="[--background:var(--popover)]">
                  or
                </FieldSeparator>
              )}
              <Field>
                {busy ? (
                  <Button variant="outline" className="w-full" disabled>
                    <LogIn data-icon="inline-start" />
                    Continue with GitHub
                  </Button>
                ) : (
                  <a
                    href="/auth/github"
                    className={buttonVariants({
                      variant: 'outline',
                      className: 'w-full',
                    })}
                  >
                    <LogIn data-icon="inline-start" />
                    Continue with GitHub
                  </a>
                )}
              </Field>
            </>
          )}
        </FieldGroup>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          {demoEnabled && (
            <Button
              className="relative aria-[busy=true]:[&>span]:opacity-0"
              disabled={busy}
              aria-busy={busy}
              onClick={login}
            >
              {busy && <Loader2 className="absolute animate-spin" />}
              <span>Open workspace</span>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
