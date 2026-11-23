import { useEffect, useRef, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useCanGoBack, useRouter } from '@tanstack/react-router'
import { graphql, useFragment, useMutation } from 'react-relay'
import { z } from 'zod'
import { toast } from 'sonner'
import type { ProjectFormCreateMutation } from '@relay/ProjectFormCreateMutation.graphql'
import type { ProjectFormUpdateMutation } from '@relay/ProjectFormUpdateMutation.graphql'
import type { ProjectForm_project$key } from '@relay/ProjectForm_project.graphql'
import { InlineError } from '@/components/page'
import { Separator } from '@/components/ui/separator'
import {
  ProjectFormLayout,
  ProjectFormNameField,
  ProjectFormDescriptionField,
  ProjectFormStatusField,
} from '@/features/projects/ProjectFormLayout'

declare module '@tanstack/react-router' {
  interface HistoryState {
    projectFormSource?: boolean
  }
}

const projectFragment = graphql`
  fragment ProjectForm_project on Project {
    id
    slug
    name
    description
    status
  }
`

const createMutation = graphql`
  mutation ProjectFormCreateMutation($input: CreateProjectInput!) {
    createProject(input: $input) {
      project {
        ...ProjectForm_project
        createdAt
        updatedAt
      }
    }
  }
`
const updateMutation = graphql`
  mutation ProjectFormUpdateMutation($input: UpdateProjectInput!) {
    updateProject(input: $input) {
      project {
        ...ProjectForm_project
        createdAt
        updatedAt
      }
    }
  }
`
const projectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter a project name.')
    .refine(
      (value) => [...value].length <= 80,
      'Keep the name to 80 characters.',
    )
    .refine(
      (value) => !/[\r\n]/.test(value),
      'Use a single line for the name.',
    ),
  description: z
    .string()
    .trim()
    .refine(
      (value) => [...value].length <= 1200,
      'Keep the description to 1,200 characters.',
    ),
  status: z.enum(['ACTIVE', 'PLANNED', 'ARCHIVED']),
})
export function ProjectForm({
  mode,
  project,
}: {
  mode: 'create' | 'edit'
  project?: ProjectForm_project$key
}) {
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const projectData = useFragment(projectFragment, project ?? null)
  const mounted = useRef(false)
  const [error, setError] = useState<unknown>(null)
  const [create] = useMutation<ProjectFormCreateMutation>(createMutation)
  const [update] = useMutation<ProjectFormUpdateMutation>(updateMutation)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  function returnToSource() {
    if (router.history.location.state.projectFormSource && canGoBack) {
      router.history.back()
      return
    }
    if (mode === 'edit' && projectData) {
      void router.navigate({
        to: '/projects/$projectSlug',
        params: { projectSlug: projectData.slug },
        search: true,
        replace: true,
      })
      return
    }
    void router.navigate({ to: '/projects', search: true, replace: true })
  }

  const form = useForm({
    defaultValues: {
      name: projectData?.name ?? '',
      description: projectData?.description ?? '',
      status:
        projectData?.status === 'ACTIVE' || projectData?.status === 'ARCHIVED'
          ? projectData.status
          : 'PLANNED',
    } satisfies z.input<typeof projectSchema>,
    validators: { onSubmit: projectSchema },
    onSubmit: async ({ value }) => {
      if (mode === 'edit' && !projectData) return
      const entryKey = router.history.location.state.__TSR_key
      setError(null)
      const input = {
        name: value.name.trim(),
        description: value.description.trim(),
        status: value.status,
      }
      try {
        await new Promise<void>((resolve, reject) => {
          const callbacks = {
            onCompleted: () => resolve(),
            onError: reject,
          }
          if (mode === 'edit' && projectData)
            update({
              variables: { input: { ...input, id: projectData.id } },
              ...callbacks,
            })
          else create({ variables: { input }, ...callbacks })
        })
        toast.success(
          mode === 'edit' ? 'Project changes saved.' : 'Project created.',
        )
        if (mode === 'edit') router.clearCache()
        else await router.invalidate({ sync: true })
        if (
          mounted.current &&
          router.history.location.state.__TSR_key === entryKey
        )
          returnToSource()
      } catch (cause) {
        setError(cause)
      }
    },
  })
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(submitting) => (
        <ProjectFormLayout
          mode={mode}
          disabled={submitting}
          submitting={submitting}
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            if (!form.state.isSubmitting) void form.handleSubmit()
          }}
          onCancel={returnToSource}
          error={error !== null ? <InlineError error={error} /> : undefined}
        >
          <form.Field name="name">
            {(field) => (
              <ProjectFormNameField
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                errors={field.state.meta.errors}
                disabled={submitting}
              />
            )}
          </form.Field>
          <Separator />
          <form.Field name="description">
            {(field) => (
              <ProjectFormDescriptionField
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                errors={field.state.meta.errors}
                disabled={submitting}
              />
            )}
          </form.Field>
          <Separator />
          <form.Field name="status">
            {(field) => (
              <ProjectFormStatusField
                value={field.state.value}
                onChange={field.handleChange}
                errors={field.state.meta.errors}
                disabled={submitting}
              />
            )}
          </form.Field>
        </ProjectFormLayout>
      )}
    </form.Subscribe>
  )
}
