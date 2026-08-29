import type { StageEvent } from './types'

export const stageBlueprint: StageEvent[] = [
  { id: 'request.received', name: 'request.received', label: 'Request received', status: 'queued', detail: 'Payload accepted.', tone: 'info' },
  { id: 'pii.scan', name: 'pii.scan', label: 'PII scan', status: 'queued', detail: 'Scanning for sensitive data.', tone: 'info' },
  { id: 'injection.scan', name: 'injection.scan', label: 'Injection scan', status: 'queued', detail: 'Evaluating prompt safety.', tone: 'info' },
  { id: 'complexity.classify', name: 'complexity.classify', label: 'Complexity', status: 'queued', detail: 'Determining compute tier.', tone: 'info' },
  { id: 'usecase.detect', name: 'usecase.detect', label: 'Use case detected', status: 'queued', detail: 'Classifying intent.', tone: 'info' },
  { id: 'policy.evaluate', name: 'policy.evaluate', label: 'Policy evaluation', status: 'queued', detail: 'Checking rules.', tone: 'info' },
  { id: 'routing.select', name: 'routing.select', label: 'Route selected', status: 'queued', detail: 'Choosing model.', tone: 'info' },
  { id: 'generation.stream', name: 'generation.stream', label: 'Streaming gate', status: 'queued', detail: 'Buffering output.', tone: 'info' },
  { id: 'verification', name: 'verification', label: 'Verification', status: 'queued', detail: 'Checking claims.', tone: 'info' },
  { id: 'trust.calculated', name: 'trust.calculated', label: 'Trust calculated', status: 'queued', detail: 'Finalizing score.', tone: 'info' }
]
