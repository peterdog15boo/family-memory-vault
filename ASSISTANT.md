# Assistant (Ask AI)

Natural-language help for finding photos, creating memories / slideshows, answering **product how-to** questions, and carefully assisting with **your own** private documents and Digital Legacy planning inside Family Memory Vault.

## How it works

1. **You ask** in plain language via the floating **Ask AI** panel (header, sidebar, or FAB). Deep links with `?c=` still open a conversation on `/assistant`.
2. **Intent parsing** extracts action, people, time, tone, qualities, and **visual_query / objects / scenes** (`src/lib/ai/intent.ts`). Product how-to prompts map to **`answer_help`** (not photo search).
3. **Resolution** matches people names to *your* People identities and turns time phrases into date filters (`src/lib/ai/resolve.ts`).
4. **Clarification** when names are ambiguous, missing, or the request is too broad — **not** for clear object/scene asks or product help.
5. **Help answers** load from the product knowledge base (`src/lib/ai/help/`) and may include your live plan / movie / storage limits when relevant.
6. **Media query** (search / create only) loads only **your** photos that are `moderation_status = clean` and `status = ready` (`src/lib/ai/media-query.ts`), filtered by people, dates, and/or **AI visual metadata**.
7. **Preview** for create memory / movie and any private-vault mutation.
8. **Confirm** runs the action (`src/lib/ai/actions.ts`) — creates a Memory, queues a Movie, or applies an owner-scoped private-vault change.
9. Conversations and actions are stored per user (`assistant_conversations`, `assistant_messages`, `assistant_actions`).

Orchestration: `src/lib/ai/assistant.ts` · API: `/api/assistant/*` · UI: floating `AskAiPanel` (primary) + optional `/assistant?c=`

### Opening Ask AI from other UI

```tsx
const { openAskAi } = useAskAi();

openAskAi(); // resume latest / in-memory thread
openAskAi({ prompt: "How do I invite family?" }); // prefill composer
openAskAi({ fresh: true }); // clear panel thread (server history kept)
openAskAi({ conversationId: "…" }); // resume a specific thread
```

Also: `AskAiOpenButton` / `useAskAiOptional()`, minimize via panel chrome, conversation id in `sessionStorage` (`fmv-ask-ai-conversation-id`).

## Product help (how-to)

Ask AI answers beginner-friendly questions about using the app — invites, uploads, Memories, Movies, plan limits, People, Documents, Digital Legacy, Settings, and more.

Knowledge lives in `src/lib/ai/help/knowledge.ts` (topic, summary, steps, related routes, plan notes). Retrieval + plan-aware copy: `src/lib/ai/help/retrieve.ts`.

Examples:

- “How do I invite family members to join?” → Family page steps
- “How can I make more than 5 movies per month?” → current plan cap + Billing upgrade path
- “Where do I create a Memory?” → Memories
- “Why don’t my photos show up right away?” → safety scan explanation (Photos)
- “How do I change my avatar?” → Settings

Pure how-to questions never fall through to “no photos found.” Photo search still runs for visual requests like “Show me beach photos.” Mixed asks (find photos **and** how to make a movie) search first and append a short how-to tip.

## Visual / object / scene search

Clean photos and videos are analyzed asynchronously after they become clean+ready (`media.scene` jobs):

1. Prefer **OpenAI vision** (`OPENAI_API_KEY` + `AI_VISION_MODEL`, default `gpt-4o-mini`)
2. Fall back to **AWS Rekognition DetectLabels** when vision chat is unavailable

**Videos** sample a limited set of frames (start, 25%, 50%, 75%, near end — `VIDEO_ANALYSIS_MAX_FRAMES`, default 5) via ffmpeg/`ffmpeg-static`, then aggregate labels onto the parent media row (`ai_*`, `visual_analyzed_at`). Individual frame failures are skipped; if no frames can be extracted the job completes as skipped/failed without blocking upload.

Labels cover everyday objects (cigar, suit, tie, cake, …), people categories (man, woman, boy, girl), and settings (beach, indoors, outdoors, office, …). Rekognition labels are normalized into the same friendly terms.

Results are stored on each media row:

| Field | Purpose |
|-------|---------|
| `ai_caption` / `ai_description` | Natural-language summary |
| `ai_tags` / `ai_objects` / `ai_scenes` | Searchable labels |
| `ai_embedding` | Optional vector (when provider returns one) |
| `visual_analyzed_at` | When analysis completed |
| `scene_caption` / `scene_tags` | Legacy mirror of the same pipeline |

Ask AI expands queries with a concept synonym dictionary and searches those fields (plus filename). **Person names** (`photos of Scott`) resolve via **People** + faces — not visual object tags. Results include **photos and videos** (clean+ready). Saying “photos” or “videos” alone filters to that type; “photos and videos” or bare “show me Jeff” returns both.

Example visual prompts:

- “show me photos of cigars / suits / ties”
- “show me men / women / boys / girls”
- “show me beach photos”
- “show me photos taken indoors”
- “images with inflatable obstacle courses”

### Ops

```bash
# Apply DB columns (once)
npx tsx scripts/apply-0031-media-ai-vision.ts

# Worker (or cron drain)
npm run worker:scene
# POST /api/jobs/scene  (WORKER_SECRET / CRON_SECRET)

# Backfill — prioritizes missing/sparse ai_tags & ai_scenes
npm run analyze:scenes -- --run --limit 100
npm run analyze:scenes -- --include-videos --run --limit 50
npm run analyze:scenes -- --videos-only --run --limit 20
npm run analyze:scenes -- --force --run --limit 50
npm run analyze:scenes -- --media <mediaId> --run --force

# Video backfill (scene + faces; skips seed/demo + missing R2)
npm run analyze:videos -- --limit 50
npm run analyze:videos -- --drain 20
npm run analyze:videos -- --run --limit 10
npm run analyze:videos -- --faces-only --limit 30
npm run analyze:videos -- --media <mediaId> --run --force

# Admin re-analyze one item
# POST /api/admin/media/[id]/reanalyze-vision  { "runInline": true }
```

New uploads enqueue analysis after clean/ready (same hook as face detection). Existing libraries need `analyze:scenes` / `analyze:videos` backfill so older clean photos/videos get richer labels.

## Example prompts

- “Show me images with inflatable obstacle courses”
- “Create a slideshow of bounce house photos from last summer”
- “Create a slideshow of Noah from 7th grade”
- “Make a tribute for Craig highlighting his humor and depth”
- “Photos with birthday cake”
- “Happy birthday album for Emma from last summer”
- “Create a Contracts category”
- “Add an attorney contact named Sarah for legacy planning”
- “What documents do I still need for my digital legacy checklist?”
- “How do I invite family members to join?”
- “How can I make more than 5 movies per month?”
- “Where do I create a Memory?”
- “Why don’t my photos show up right away?”
- “How do I use Digital Legacy?”
- “How do I change my avatar?”

Tribute / memorial requests prefer a **cinematic** theme, slower pacing, and warmer titles/descriptions. Birthdays lean **Bright & Airy**; celebrations lean **Holiday**.

## Safety constraints

These rules are enforced in code (`src/lib/ai/safety.ts` and the query/create path):

1. **Clean media only** — pending, rejected, adult, quarantined, or not-ready media is never queried, previewed, or attached.
2. **Owner scope** — people, faces, media, memories, and movies are limited to the signed-in user. Another user’s library cannot appear in assistant answers.
3. **No invented people** — names must resolve to your People list; ambiguous matches ask you to choose.
4. **Creates need focus** — memory/movie creation without people *and* without a time window asks for clarification first (visual object filters count as focus when present).
5. **Sparse results** — empty or too-few matches refuse empty creates and suggest next steps (including broader visual terms).
6. **Confirm before create** — the public messages API always previews; confirm via UI or “yes”.
7. **Confirm before private-vault writes** — document category changes, document filing, and Digital Legacy edits stay in preview until the user confirms.
8. **Secure items stay manual** — the assistant does not read or casually store passwords / secure-item secrets.
9. **Safe errors** — API/UI errors stay generic; details go to structured logs (`assistant.turn`, `assistant.action`, `assistant.confirm`, `assistant.failed`).

Family co-member photos may appear in the main Media gallery when clean/ready, but the assistant **does not** pull them into creates (memories/movies require media you own).

## API (authenticated)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/assistant/conversations` | Start a thread |
| `GET` | `/api/assistant/conversations` | List threads |
| `GET` | `/api/assistant/conversations/[id]` | Thread + messages |
| `POST` | `/api/assistant/conversations/[id]/messages` | Send a message |
| `POST` | `/api/assistant/confirm` | Confirm or cancel a preview (`cancel: true`) |

Turn payloads include `assistantText`, `understanding`, `mediaPreview`, `actionButtons`, and `created` links for the UI.

## Local checks

```bash
# One-time: add answer_help to assistant_action_type enum
npx tsx scripts/apply-0034-assistant-answer-help.ts

npx tsc --noEmit
npx vitest run src/lib/ai
```

Optional LLM: set `OPENAI_API_KEY` (or AI gateway keys) for richer intent parsing and vision analysis; otherwise the heuristic fallback + Rekognition labels are used.
