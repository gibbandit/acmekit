import { createFileRoute, useHydrated } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useTheme } from '@/components/theme-provider'
import { ComponentsFrame } from '../-frame'

export const Route = createFileRoute('/_app/components/appearance')({
  component: AppearancePage,
  pendingComponent: AppearancePage,
})

function AppearancePage() {
  const { theme, setTheme } = useTheme()
  const mounted = useHydrated()

  return (
    <ComponentsFrame tab="appearance">
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent className="@container/appearance">
          <FieldSet className="@md/appearance:block">
            <FieldLegend
              variant="label"
              id="theme-label"
              className="@md/appearance:float-left @md/appearance:mb-0 @md/appearance:w-28"
            >
              Theme
            </FieldLegend>
            <RadioGroup
              className="@md/appearance:ml-34 @md/appearance:w-auto"
              value={mounted ? (theme ?? 'system') : ''}
              disabled={!mounted}
              onValueChange={(value) => {
                if (value === 'light' || value === 'dark' || value === 'system')
                  setTheme(value)
              }}
              aria-labelledby="theme-label"
            >
              {[
                {
                  value: 'light',
                  label: 'Light',
                  description: undefined,
                },
                {
                  value: 'dark',
                  label: 'Dark',
                  description: undefined,
                },
                {
                  value: 'system',
                  label: 'System',
                  description: 'Match your device appearance.',
                },
              ].map((option) => (
                <Field
                  key={option.value}
                  orientation="horizontal"
                  data-disabled={!mounted || undefined}
                >
                  <FieldLabel variant="row" htmlFor={'theme-' + option.value}>
                    <RadioGroupItem
                      id={'theme-' + option.value}
                      value={option.value}
                      aria-labelledby={'theme-' + option.value + '-label'}
                      aria-describedby={
                        option.description
                          ? 'theme-' + option.value + '-description'
                          : undefined
                      }
                    />
                    <FieldContent>
                      <FieldTitle id={'theme-' + option.value + '-label'}>
                        {option.label}
                      </FieldTitle>
                      {option.description && (
                        <FieldDescription
                          id={'theme-' + option.value + '-description'}
                        >
                          {option.description}
                        </FieldDescription>
                      )}
                    </FieldContent>
                  </FieldLabel>
                </Field>
              ))}
            </RadioGroup>
          </FieldSet>
        </CardContent>
      </Card>
    </ComponentsFrame>
  )
}
