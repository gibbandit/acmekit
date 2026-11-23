import { StrictMode, startTransition } from 'react'
import { hydrateRoot } from '@tanstack/redact/dom-client'
import { StartClient } from '@tanstack/react-start/client'

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
    // The loading HTML is prerendered with React's useId() convention.
    {
      identifierStrategy: 'react',
      onRecoverableError: (error) => console.error(error),
    },
  )
})
