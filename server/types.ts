export type StopType = 'button' | 'link' | 'input' | 'textarea' | 'other'

export type IssueKind = 'no-label' | 'low-contrast' | 'invisible-focus'

export type ScannedIssue = {
  kind: IssueKind
  detail: string
}

export type ScannedStop = {
  tag: string
  type: StopType
  label: string
  rect: { x: number; y: number; w: number; h: number }
  issue?: ScannedIssue
}

export type ScanResponse = {
  url: string
  finalUrl: string
  viewport: { w: number; h: number }
  screenshot: string
  stops: ScannedStop[]
  durationMs: number
}

export type ScanHtmlResponse = {
  screenshot: string
  stops: ScannedStop[]
  durationMs: number
}

export type ScanError = {
  error: string
  detail?: string
}
