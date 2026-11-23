import type { ComponentProps, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { SelectControl } from '@/components/select-control'
import {
  projectStatuses,
  type ProjectStatus,
} from '@/features/projects/project-status'

type FieldProps<Value = string> = {
  value: Value
  onChange?: (value: Value) => void
  onBlur?: () => void
  errors?: ComponentProps<typeof FieldError>['errors']
  disabled?: boolean
  unknownValues?: boolean
}

export function ProjectFormNameField({
  value,
  onChange,
  onBlur,
  errors = [],
  disabled = false,
  unknownValues = false,
}: FieldProps) {
  return (
    <Field
      orientation="responsive"
      className="gap-2 @md/field-group:items-start @md/field-group:gap-8"
      data-invalid={errors.length > 0}
      data-disabled={disabled || undefined}
    >
      <FieldContent className="@md/field-group:shrink-0 @md/field-group:grow-0 @md/field-group:basis-44">
        <FieldLabel htmlFor="project-name">Project name</FieldLabel>
        <FieldDescription id="project-name-description">
          Required. Use up to 80 characters.
        </FieldDescription>
      </FieldContent>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="relative">
          <Input
            id="project-name"
            autoComplete="off"
            placeholder={unknownValues ? undefined : 'Customer portal'}
            disabled={disabled}
            value={value}
            onChange={(event) => onChange?.(event.target.value)}
            onBlur={onBlur}
            aria-invalid={errors.length > 0}
            aria-describedby={
              errors.length ? 'project-name-error' : 'project-name-description'
            }
          />
          {unknownValues && (
            <Skeleton className="pointer-events-none absolute top-1/2 left-3 h-4 w-40 -translate-y-1/2" />
          )}
        </div>
        <FieldError id="project-name-error" errors={errors} />
      </div>
    </Field>
  )
}

export function ProjectFormDescriptionField({
  value,
  onChange,
  onBlur,
  errors = [],
  disabled = false,
  unknownValues = false,
}: FieldProps) {
  return (
    <Field
      orientation="responsive"
      className="gap-2 @md/field-group:items-start @md/field-group:gap-8"
      data-invalid={errors.length > 0}
      data-disabled={disabled || undefined}
    >
      <FieldContent className="@md/field-group:shrink-0 @md/field-group:grow-0 @md/field-group:basis-44">
        <FieldLabel htmlFor="project-description">Description</FieldLabel>
      </FieldContent>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="relative">
          <Textarea
            id="project-description"
            className="field-sizing-fixed"
            rows={4}
            placeholder={
              unknownValues
                ? undefined
                : 'Describe the scope and purpose of this project.'
            }
            disabled={disabled}
            value={value}
            onChange={(event) => onChange?.(event.target.value)}
            onBlur={onBlur}
            aria-invalid={errors.length > 0}
            aria-describedby={
              errors.length
                ? 'project-description-hint project-description-error'
                : 'project-description-hint'
            }
          />
          {unknownValues && (
            <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-col gap-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          )}
        </div>
        <FieldDescription id="project-description-hint">
          {unknownValues ? (
            'Optional. Up to 1,200 characters.'
          ) : (
            <>
              Optional. {[...value].length.toLocaleString()} of 1,200
              characters.
            </>
          )}
        </FieldDescription>
        <FieldError id="project-description-error" errors={errors} />
      </div>
    </Field>
  )
}

export function ProjectFormStatusField({
  value,
  onChange,
  errors = [],
  disabled = false,
  unknownValues = false,
}: FieldProps<ProjectStatus>) {
  return (
    <Field
      orientation="responsive"
      className="gap-2 @md/field-group:items-start @md/field-group:gap-8"
      data-invalid={errors.length > 0}
      data-disabled={disabled || undefined}
    >
      <FieldContent className="@md/field-group:shrink-0 @md/field-group:grow-0 @md/field-group:basis-44">
        <FieldLabel htmlFor="project-status">Status</FieldLabel>
      </FieldContent>
      <div className="flex min-w-0 flex-1 flex-col gap-2 @md/field-group:max-w-52">
        <div className="relative">
          <SelectControl
            id="project-status"
            label="Project status"
            value={unknownValues ? null : value}
            disabled={disabled}
            onChange={(next) => onChange?.(next)}
            options={projectStatuses}
          />
          {unknownValues && (
            <Skeleton className="pointer-events-none absolute top-1/2 left-3 h-4 w-16 -translate-y-1/2" />
          )}
        </div>
        <FieldError errors={errors} />
      </div>
    </Field>
  )
}

export function ProjectFormLayout({
  mode,
  disabled = false,
  submitting = false,
  loading = false,
  onSubmit,
  onCancel,
  children,
  error,
}: {
  mode: 'create' | 'edit'
  disabled?: boolean
  submitting?: boolean
  loading?: boolean
  onSubmit?: ComponentProps<'form'>['onSubmit']
  onCancel?: () => void
  children: ReactNode
  error?: ReactNode
}) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 md:gap-8">
      <PageHeader title={mode === 'edit' ? 'Edit project' : 'New project'} />
      <form
        id="project-form"
        data-slot="project-form"
        aria-label={mode === 'edit' ? 'Edit project' : 'New project'}
        aria-busy={disabled || undefined}
        className="flex flex-col gap-6 md:gap-8"
        onSubmit={onSubmit}
      >
        {loading && (
          <span role="status" className="sr-only">
            Loading project form
          </span>
        )}
        <Separator />
        <FieldSet disabled={disabled}>
          <FieldGroup className="gap-6 md:gap-8">{children}</FieldGroup>
        </FieldSet>
        {error}
        <Separator />
        <div data-slot="form-actions" className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="project-form"
            className="relative aria-[busy=true]:[&>span]:opacity-0"
            disabled={disabled}
            aria-busy={submitting}
          >
            {submitting && <Loader2 className="absolute animate-spin" />}
            <span>{mode === 'edit' ? 'Save changes' : 'Create project'}</span>
          </Button>
        </div>
      </form>
    </div>
  )
}

export function ProjectFormLoading({ mode }: { mode: 'create' | 'edit' }) {
  const unknownValues = mode === 'edit'
  return (
    <ProjectFormLayout mode={mode} disabled loading>
      <ProjectFormNameField value="" disabled unknownValues={unknownValues} />
      <Separator />
      <ProjectFormDescriptionField
        value=""
        disabled
        unknownValues={unknownValues}
      />
      <Separator />
      <ProjectFormStatusField
        value="PLANNED"
        disabled
        unknownValues={unknownValues}
      />
    </ProjectFormLayout>
  )
}
