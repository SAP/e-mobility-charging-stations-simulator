import type { ZodError } from 'zod'

export interface FieldError {
  message: string
  path: string
}

export const mapZodIssuesToFieldErrors = (zodError: ZodError): FieldError[] =>
  zodError.issues.map(issue => ({
    message: issue.message,
    path: issue.path.join('.'),
  }))

export const formatFieldErrorsSummary = (fieldErrors: readonly FieldError[]): string =>
  fieldErrors.map(e => `  - ${e.path !== '' ? e.path : '(root)'}: ${e.message}`).join('\n')
