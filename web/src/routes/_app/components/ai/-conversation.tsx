import { Fragment, useEffect, useRef, useState } from 'react'
import {
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  RotateCcw,
  RotateCw,
  Square,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react'
import { toast } from 'sonner'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '@/components/ui/input-group'
import { Marker, MarkerContent } from '@/components/ui/marker'
import {
  Message,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from '@/components/ui/message'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

type Feedback = 'helpful' | 'not-helpful'

type AssistantMessage = {
  id: string
  role: 'assistant'
  text: string
  model: string
  effort: string
  status?: 'streaming' | 'complete' | 'stopped'
  feedback?: Feedback
}

type PreviewMessage =
  { id: string; role: 'user'; text: string } | AssistantMessage

const models = ['GPT-5', 'GPT-5 mini']
const efforts = ['Low', 'Medium', 'High']
const sampleReply =
  'This is a sample reply. Your message stays in this preview and does not change your workspace.'
const replyChunkSize = 8

type ResponseStream = {
  timer: number
  cancelled: boolean
}

const initialMessages: PreviewMessage[] = [
  {
    id: 'question',
    role: 'user',
    text: 'What should a launch checklist include?',
  },
  {
    id: 'answer',
    role: 'assistant',
    text: 'Start with a clear brief, review the details with your team, then choose a launch date.',
    model: 'GPT-5',
    effort: 'Medium',
  },
]

const suggestions = [
  { label: 'Plan a launch', text: 'Help me plan a project launch.' },
  {
    label: 'Review a brief',
    text: 'What should I look for in a project brief?',
  },
]

export function ConversationExample() {
  const [messages, setMessages] = useState(initialMessages)
  const [text, setText] = useState('')
  const [model, setModel] = useState('GPT-5')
  const [effort, setEffort] = useState('Medium')
  const responseRef = useRef<ResponseStream | null>(null)
  const isStreaming = messages.some(
    (message) => message.role === 'assistant' && message.status === 'streaming',
  )
  const latestMessage = messages.at(-1)
  const canRetry =
    !isStreaming &&
    latestMessage?.role === 'assistant' &&
    latestMessage.id !== 'answer'

  useEffect(() => {
    return () => {
      const response = responseRef.current
      if (response) {
        response.cancelled = true
        window.clearInterval(response.timer)
        responseRef.current = null
      }
    }
  }, [])

  function cancelResponse() {
    const response = responseRef.current
    if (!response) return
    response.cancelled = true
    window.clearInterval(response.timer)
    responseRef.current = null
  }

  function streamResponse(messageId: string) {
    const response: ResponseStream = { timer: 0, cancelled: false }
    responseRef.current = response
    let visibleCharacters = replyChunkSize

    response.timer = window.setInterval(() => {
      if (response.cancelled) return
      visibleCharacters += replyChunkSize
      const replyText = sampleReply.slice(0, visibleCharacters)
      const complete = replyText === sampleReply

      setMessages((previous) => {
        if (response.cancelled) return previous
        return previous.map((message) => {
          if (message.id !== messageId || message.role !== 'assistant') {
            return message
          }
          return {
            ...message,
            text: replyText,
            status: complete ? 'complete' : 'streaming',
          }
        })
      })

      if (complete) {
        window.clearInterval(response.timer)
        responseRef.current = null
      }
    }, 100)
  }

  function sendMessage(value: string) {
    const prompt = value.trim()
    if (!prompt || responseRef.current || isStreaming) return
    const replyId = `assistant-${messages.length}`
    setMessages((previous) => [
      ...previous,
      { id: `user-${previous.length}`, role: 'user', text: prompt },
      {
        id: replyId,
        role: 'assistant',
        text: sampleReply.slice(0, replyChunkSize),
        model,
        effort,
        status: 'streaming',
      },
    ])
    streamResponse(replyId)
    setText('')
  }

  function stopResponse() {
    cancelResponse()
    setMessages((previous) =>
      previous.map((message) => {
        if (message.role !== 'assistant' || message.status !== 'streaming') {
          return message
        }
        return { ...message, status: 'stopped' }
      }),
    )
  }

  function retryResponse() {
    if (!canRetry || !latestMessage || responseRef.current) return
    cancelResponse()
    setMessages((previous) =>
      previous.map((message) => {
        if (message.id !== latestMessage.id || message.role !== 'assistant') {
          return message
        }
        return {
          ...message,
          text: sampleReply.slice(0, replyChunkSize),
          status: 'streaming',
          feedback: undefined,
        }
      }),
    )
    streamResponse(latestMessage.id)
  }

  function resetConversation() {
    cancelResponse()
    setMessages(initialMessages)
    setText('')
  }

  function toggleFeedback(messageId: string, feedback: Feedback) {
    setMessages((previous) =>
      previous.map((message) => {
        if (
          message.id !== messageId ||
          message.role !== 'assistant' ||
          message.status === 'streaming'
        ) {
          return message
        }
        return {
          ...message,
          feedback: message.feedback === feedback ? undefined : feedback,
        }
      }),
    )
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Conversation</CardTitle>
        <CardDescription>
          Try a local chat preview. No messages leave this page.
        </CardDescription>
        <CardAction className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Reset conversation"
            title="Reset conversation"
            onClick={resetConversation}
          >
            <RotateCcw />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="min-h-0">
        <ConversationMessages
          messages={messages}
          onRestore={resetConversation}
          onRetry={retryResponse}
          onFeedbackChange={toggleFeedback}
        />
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-3">
        <div
          role="group"
          className="flex flex-wrap gap-2"
          aria-label="Example prompts"
        >
          {suggestions.map((suggestion) => (
            <Button
              key={suggestion.label}
              variant="outline"
              size="sm"
              disabled={isStreaming}
              onClick={() => sendMessage(suggestion.text)}
            >
              {suggestion.label}
            </Button>
          ))}
        </div>
        <form
          className="w-full"
          onSubmit={(event) => {
            event.preventDefault()
            sendMessage(text)
          }}
        >
          <Field>
            <FieldLabel htmlFor="example-message" className="sr-only">
              Message
            </FieldLabel>
            <InputGroup>
              <InputGroupTextarea
                id="example-message"
                rows={1}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing &&
                    event.nativeEvent.keyCode !== 229
                  ) {
                    event.preventDefault()
                    event.currentTarget.form?.requestSubmit()
                  }
                }}
                placeholder="Try an example prompt…"
                className="max-h-36 min-h-11 overflow-y-auto px-3 md:min-h-10 md:py-2"
                aria-describedby="example-message-description"
              />
              <InputGroupAddon align="block-end" className="gap-1 p-1">
                {[
                  {
                    label: 'Model',
                    value: model,
                    choices: models,
                    onValueChange: setModel,
                  },
                  {
                    label: 'Effort',
                    value: effort,
                    choices: efforts,
                    onValueChange: setEffort,
                  },
                ].map(({ label, value, choices, onValueChange }) => (
                  <DropdownMenu key={label}>
                    <DropdownMenuTrigger
                      aria-label={label}
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="min-w-0 shrink"
                        />
                      }
                    >
                      <span className="truncate">{value}</span>
                      <ChevronDown data-icon="inline-end" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="top" align="start">
                      <DropdownMenuRadioGroup
                        value={value}
                        onValueChange={onValueChange}
                        aria-label={label}
                      >
                        <DropdownMenuGroup>
                          <DropdownMenuLabel>{label}</DropdownMenuLabel>
                          {choices.map((choice) => (
                            <DropdownMenuRadioItem
                              key={choice}
                              value={choice}
                              closeOnClick
                            >
                              {choice}
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuGroup>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ))}
                <InputGroupButton
                  type={isStreaming ? 'button' : 'submit'}
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto"
                  disabled={!isStreaming && !text.trim()}
                  aria-label={isStreaming ? 'Stop response' : 'Send message'}
                  title={isStreaming ? 'Stop response' : 'Send message'}
                  onClick={
                    isStreaming
                      ? (event) => {
                          event.preventDefault()
                          stopResponse()
                        }
                      : undefined
                  }
                >
                  {isStreaming ? <Square /> : <ArrowUp />}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            <FieldDescription
              id="example-message-description"
              className="hidden md:block"
            >
              Enter to send · Shift+Enter for a new line
            </FieldDescription>
          </Field>
        </form>
      </CardFooter>
    </Card>
  )
}

function ConversationMessages({
  messages,
  onRestore,
  onRetry,
  onFeedbackChange,
}: {
  messages: PreviewMessage[]
  onRestore: () => void
  onRetry: () => void
  onFeedbackChange: (messageId: string, feedback: Feedback) => void
}) {
  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className="h-64 shrink-0 md:h-96">
        <MessageScrollerViewport>
          <MessageScrollerContent
            aria-label="Example conversation"
            className="gap-6 pb-2"
          >
            {messages.map((message, index) => (
              <Fragment key={message.id}>
                <MessageScrollerItem
                  messageId={message.id}
                  scrollAnchor={message.role === 'user'}
                >
                  <Message
                    align={message.role === 'user' ? 'end' : 'start'}
                    aria-busy={
                      message.role === 'assistant' &&
                      message.status === 'streaming'
                    }
                  >
                    <MessageContent>
                      <MessageHeader>
                        {message.role === 'user' ? 'You' : 'Acme assistant'}
                      </MessageHeader>
                      {message.role === 'user' ? (
                        <Bubble align="end" variant="muted">
                          <BubbleContent className="wrap-anywhere whitespace-pre-wrap">
                            {message.text}
                          </BubbleContent>
                        </Bubble>
                      ) : (
                        <>
                          <Bubble variant="ghost">
                            <BubbleContent className="wrap-anywhere whitespace-pre-wrap">
                              {message.text}
                            </BubbleContent>
                          </Bubble>
                          <ReplyFooter
                            key={message.status}
                            message={message}
                            replyNumber={(index + 1) / 2}
                            onFeedbackChange={(feedback) =>
                              onFeedbackChange(message.id, feedback)
                            }
                            onRetry={
                              index === messages.length - 1 &&
                              message.id !== 'answer'
                                ? onRetry
                                : undefined
                            }
                          />
                        </>
                      )}
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
                {message.id === 'answer' && (
                  <MessageScrollerItem messageId="launch-checkpoint">
                    <Marker variant="separator">
                      <MarkerContent className="inline-flex items-center gap-2">
                        Checkpoint
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={messages.length <= initialMessages.length}
                          aria-label="Restore checkpoint"
                          onClick={onRestore}
                        >
                          Restore
                        </Button>
                      </MarkerContent>
                    </Marker>
                  </MessageScrollerItem>
                )}
              </Fragment>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  )
}

function ReplyFooter({
  message,
  replyNumber,
  onFeedbackChange,
  onRetry,
}: {
  message: AssistantMessage
  replyNumber: number
  onFeedbackChange: (feedback: Feedback) => void
  onRetry?: () => void
}) {
  const [copied, setCopied] = useState(false)
  const mounted = useRef(false)
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  const actionsDisabled = message.status === 'streaming' || !message.text

  useEffect(() => {
    mounted.current = true

    return () => {
      mounted.current = false
      clearTimeout(copyTimeout.current)
    }
  }, [])

  async function copyReply() {
    if (actionsDisabled) return
    try {
      await navigator.clipboard.writeText(message.text)
      if (!mounted.current) return

      clearTimeout(copyTimeout.current)
      setCopied(true)
      copyTimeout.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      if (!mounted.current) return

      clearTimeout(copyTimeout.current)
      setCopied(false)
      toast.error('Could not copy the reply. Try again.')
    }
  }

  return (
    <MessageFooter className="flex-wrap gap-x-3 gap-y-1">
      <span className="sr-only" aria-live="polite">
        {copied ? 'Reply copied' : ''}
      </span>
      <span>
        {message.model} · {message.effort} effort
        {message.status === 'streaming' && ' · Responding…'}
        {message.status === 'stopped' && ' · Stopped'}
      </span>
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={actionsDisabled}
              />
            }
            aria-label={`Copy reply ${replyNumber}`}
            onClick={copyReply}
          >
            {copied ? <Check /> : <Copy />}
          </TooltipTrigger>
          <TooltipContent>{copied ? 'Copied' : 'Copy reply'}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={message.feedback === 'helpful' ? 'secondary' : 'ghost'}
                size="icon-sm"
                disabled={actionsDisabled}
              />
            }
            aria-label={`Helpful reply ${replyNumber}`}
            aria-pressed={message.feedback === 'helpful'}
            onClick={() => onFeedbackChange('helpful')}
          >
            <ThumbsUp />
          </TooltipTrigger>
          <TooltipContent>Helpful</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={
                  message.feedback === 'not-helpful' ? 'secondary' : 'ghost'
                }
                size="icon-sm"
                disabled={actionsDisabled}
              />
            }
            aria-label={`Not helpful reply ${replyNumber}`}
            aria-pressed={message.feedback === 'not-helpful'}
            onClick={() => onFeedbackChange('not-helpful')}
          >
            <ThumbsDown />
          </TooltipTrigger>
          <TooltipContent>Not helpful</TooltipContent>
        </Tooltip>
        {onRetry && (
          <Button
            variant="ghost"
            size="sm"
            aria-label="Retry response"
            disabled={actionsDisabled}
            onClick={onRetry}
          >
            <RotateCw data-icon="inline-start" />
            Retry
          </Button>
        )}
      </div>
    </MessageFooter>
  )
}
