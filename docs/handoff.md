# CoziCut handoff

Use this document to continue the CoziCut project in another Codex thread, IDE, or with another collaborator.

## Resume prompt

Paste the following into the new thread:

```text
Continue the CoziCut project in this repository. Read AGENTS.md first, then docs/handoff.md, docs/hld-first-milestone.md, docs/first-milestone-plan.md, and docs/local-setup.md.

Current status: Milestone 1 (single-file local audio trimming via Spring Boot and FFmpeg) is fully implemented and verified with all 17 automated tests passing and verified against live synthetic audio and ffprobe.

The next milestone will focus on either:
1. Multi-clip sequence mixing with crossfades and normalization, or
2. A lightweight web UI (React / Next.js) for visual selection and file upload.
```

## Product in one paragraph

CoziCut is an audio-first event-performance mix builder. The eventual product lets people add source media, choose snippets, arrange clips, make small edits, and export a finished mix. The first real-world target is a small private wedding beta.

## Completed milestone: Single-file audio trimming

**Goal:** trim one locally supplied audio file through a Spring Boot API and return a playable MP3.

```text
multipart audio upload + start/end seconds
  → validation
  → temporary workspace
  → FFmpeg trimming
  → streamed MP3 response
  → workspace cleanup
```

### Current state

#### Completed
- Local environment verified:
  - Java 21.0.9
  - Maven 3.9.11
  - FFmpeg 9.0.2_1 installed through Homebrew (`openssl@4` runtime restored)
- Spring Boot backend bootstrapped in `backend/` (Spring Boot 4.1.2 / Java 21).
- Health endpoint: `GET /api/v1/health` returning `{"status":"ok"}`.
- Audio trim endpoint: `POST /api/v1/audio/trims` accepting multipart audio and `startSeconds` / `endSeconds`.
- Safe process execution abstraction in `FfmpegExecutor` and `ProcessFfmpegExecutor` using `ProcessBuilder` with argument lists (no shell invocation), output capture, and configurable execution timeout.
- Request-isolated workspace management in `AudioTrimService` and `TrimmedAudio` with automatic post-streaming cleanup.
- Centralized error handling in `ApiExceptionHandler` returning structured `ApiError` (`400 Bad Request`, `422 Unprocessable Content`, `500 Internal Server Error`).
- Full automated test suite passing (17 unit and integration tests across web, service, executor, and end-to-end synthetic audio with `ffprobe` verification).
- Live manual smoke test verified via `curl` and `ffprobe`.

#### Next planned milestones
- Milestone 2: Multi-clip timeline mixing with transition fades and volume normalization.
- Milestone 3: Interactive web UI (visual waveform trimmer and sequence editor).
- Milestone 4: Docker containerization and cloud hosting for the private wedding beta.

## Repository map

```text
CoziCut/
├── AGENTS.md                         # Working agreement for Codex/collaborators
├── README.md                          # Product summary and local run command
├── backend/
│   ├── pom.xml                        # Spring Boot 4.1.2 / Java 21
│   └── src/
│       ├── main/java/com/cozicut/
│       │   ├── CoziCutApplication.java
│       │   ├── api/
│       │   │   ├── ApiError.java
│       │   │   ├── ApiExceptionHandler.java
│       │   │   ├── AudioTrimController.java
│       │   │   └── HealthController.java
│       │   ├── media/
│       │   │   ├── FfmpegExecutor.java
│       │   │   ├── MediaProcessingException.java
│       │   │   ├── MediaProcessingTimeoutException.java
│       │   │   └── ProcessFfmpegExecutor.java
│       │   └── trim/
│       │       ├── AudioTrimService.java
│       │       └── TrimmedAudio.java
│       ├── main/resources/application.properties
│       └── test/java/com/cozicut/
│           ├── AudioTrimIntegrationTest.java
│           ├── CoziCutApplicationTests.java
│           ├── api/AudioTrimControllerTest.java
│           ├── media/ProcessFfmpegExecutorTest.java
│           └── trim/AudioTrimServiceTest.java
└── docs/
    ├── first-milestone-plan.md        # Detailed checkpoint plan
    ├── hld-first-milestone.md         # HLD, sequence diagram, failure model
    ├── local-setup.md                 # Living local/remote environment setup document
    └── handoff.md                     # This document
```

## Important architectural decisions

- Backend: Java 21 + Spring Boot 4.1.2 + Maven.
- Synchronous request model for fast audio trims.
- FFmpeg is executed only via `ProcessBuilder` with argument lists (never shell concatenation).
- FFmpeg runs behind the `FfmpegExecutor` interface, enabling mocked tests.
- Isolated temporary directory per request with guaranteed cleanup upon stream completion.
- Streamed `audio/mpeg` response with `Content-Disposition: attachment; filename="trim.mp3"`.

## Local verification commands

From `backend/`:

```bash
mvn test
mvn spring-boot:run
```

Trim request:

```bash
curl --fail --form "file=@/absolute/path/to/source.wav;type=audio/wav" \
  --form "startSeconds=1.0" \
  --form "endSeconds=3.5" \
  http://localhost:8080/api/v1/audio/trims \
  --output trim.mp3
```

Inspect duration:

```bash
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 trim.mp3
```
