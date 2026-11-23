export type VariableBinding = {
  source: 'path' | 'query' | 'literal'
  name?: string
  type?: 'string' | 'int' | 'boolean'
  value?: unknown
  default?: unknown
  values?: readonly string[]
  min?: number
  max?: number
}

export type InvalidVariable = (name: string) => Error

/** Match the small binding contract consumed by Go; no callbacks cross the build. */
export function resolveVariables(
  bindings: Record<string, VariableBinding>,
  params: Record<string, string | undefined>,
  search: Pick<URLSearchParams, 'get'>,
  invalidVariable: InvalidVariable = (name) =>
    new Error(`Invalid value for ${name}.`),
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(bindings).map(([name, binding]) => {
      if (binding.source === 'literal') return [name, binding.value ?? null]
      const raw =
        binding.source === 'path'
          ? Object.hasOwn(params, binding.name ?? name)
            ? params[binding.name ?? name]
            : undefined
          : search.get(binding.name ?? name)?.trim()
      if (raw == null || (binding.source === 'query' && raw === '')) {
        return [name, binding.default ?? null]
      }
      let value: string | number | boolean = raw
      const invalid = () => {
        throw invalidVariable(name)
      }
      if (binding.type === 'int') {
        if (!/^-?(0|[1-9][0-9]*)$/.test(raw)) invalid()
        value = Number(raw)
        if (
          !Number.isInteger(value) ||
          value < -2147483648 ||
          value > 2147483647 ||
          value < (binding.min ?? -Infinity) ||
          value > (binding.max ?? Infinity)
        )
          invalid()
      } else if (binding.type === 'boolean') {
        if (raw !== 'true' && raw !== 'false') invalid()
        value = raw === 'true'
      }
      if (binding.values && !binding.values.includes(String(value))) invalid()
      return [name, value]
    }),
  )
}
