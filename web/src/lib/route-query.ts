import { createRouteQueries } from '@acmekit/route-adapter/runtime'
import { RequestError } from './errors'

export const { defineRouteQuery, resolveVariables } = createRouteQueries({
  invalidVariable: (name) =>
    new RequestError(`Invalid value for ${name}.`, ['BAD_USER_INPUT']),
})
