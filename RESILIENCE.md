# Error handling & resilience

## API responses

Shared helpers in `src/lib/http/api-error.ts`:

```json
{ "error": "Human-readable message", "code": "not_found", "details": {} }
```

Domain mappers (`memoryApiErrorResponse`, `familyApiErrorResponse`, `peopleApiErrorResponse`, `movieApiErrorResponse`) all route through `apiErrorFromUnknown`.

Client copy mapping: `src/lib/http/user-messages.ts` → `userFacingApiError()`.

## Jobs

| Path | Behavior |
|------|----------|
| Moderation | Terminal states complete without re-scan. CSAM quarantined **without** `ncmecReportId` resumes NCMEC only. |
| Movies | Retryable failures keep `processing` until attempts exhausted; then `failed`. Enqueue failure marks movie `failed` (no stuck `queued`). |
| `failJob` | Returns `{ willRetry }` so workers can update domain rows correctly. |

## Webhooks

Stripe: claim → handle → on failure **release claim** and return 500 so Stripe retries. Signature failures return 400 (no retry loop).

## Upload

Finalize failures leave media `pending_moderation` (not shown in library). Enqueue is retried 3×; remaining failures are logged for ops requeue.
