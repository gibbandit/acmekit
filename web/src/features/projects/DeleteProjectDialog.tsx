import { Loader2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { graphql, useFragment, useMutation } from 'react-relay'
import { toast } from 'sonner'
import type { DeleteProjectDialogMutation } from '@relay/DeleteProjectDialogMutation.graphql'
import type { DeleteProjectDialog_project$key } from '@relay/DeleteProjectDialog_project.graphql'
import { InlineError } from '@/components/page'

const projectFragment = graphql`
  fragment DeleteProjectDialog_project on Project {
    id
    name
  }
`

const deleteMutation = graphql`
  mutation DeleteProjectDialogMutation($input: DeleteProjectInput!) {
    deleteProject(input: $input) {
      deletedProjectId @deleteRecord
    }
  }
`
export function DeleteProjectDialog({
  open,
  onOpenChange,
  project: projectRef,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: DeleteProjectDialog_project$key
}) {
  const project = useFragment(projectFragment, projectRef)
  const [commit, busy] =
    useMutation<DeleteProjectDialogMutation>(deleteMutation)
  const mounted = useRef(false)
  const [error, setError] = useState<unknown>(null)
  const navigate = useNavigate()
  const router = useRouter()

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  function remove() {
    const entryKey = router.history.location.state.__TSR_key
    setError(null)
    commit({
      variables: { input: { id: project.id } },
      onCompleted: () => {
        toast.success('Project deleted.')
        router.clearCache()
        if (
          !mounted.current ||
          router.history.location.state.__TSR_key !== entryKey
        )
          return
        onOpenChange(false)
        void navigate({ to: '/projects' })
      },
      onError: (cause) => {
        if (
          mounted.current &&
          router.history.location.state.__TSR_key === entryKey
        )
          setError(cause)
      },
    })
  }
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete project?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes “{project.name}” from your workspace. This
            action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error !== null && <InlineError error={error} />}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            className="relative aria-[busy=true]:[&>span]:opacity-0"
            disabled={busy}
            aria-busy={busy}
            onClick={remove}
          >
            {busy && <Loader2 className="absolute animate-spin" />}
            <span>Delete project</span>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
