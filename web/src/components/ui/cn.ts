import { createCn } from 'cn/config'

export const cn = createCn({
  extend: {
    theme: {
      text: [
        'page',
        'record',
        'dialog',
        'title',
        'section',
        'label',
        'metadata',
        'metric',
        'metric-compact',
      ],
    },
  },
})
