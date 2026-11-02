# CoziCut

CoziCut is an audio-first event-performance mix builder. It will let a user collect source media, select snippets, arrange them into a sequence, make final edits, and export a finished mix.

## Current stage

The first implementation milestone is complete: a local Spring Boot service trims a supplied audio file with FFmpeg and returns an MP3 download.

The interaction and component boundaries are documented in [the first-milestone HLD](docs/hld-first-milestone.md). The build checkpoints are in [the implementation plan](docs/first-milestone-plan.md).

Local tool installation and verification are in [the local setup guide](docs/local-setup.md).

To resume in another Codex thread or hand the project to a collaborator, start with [the handoff document](docs/handoff.md).

## Intended layout

```text
backend/     Spring Boot API and media-processing code
frontend/    React/TypeScript editor UI
docs/        Product decisions and setup notes
```

## Principles

- The user drives product and backend decisions.
- Build and test locally before deploying.
- Deliver the simplest useful end-to-end workflow before adding advanced features.
- Use Codex as a UI collaborator and code reviewer, not as an unreviewed code generator.

See [AGENTS.md](AGENTS.md) for the working agreement.

## Run the backend

From `backend/`:

```bash
mvn spring-boot:run
```

Then request `GET http://localhost:8080/api/v1/health`. A successful response is `{"status":"ok"}`.

## Trim audio

With the backend running, submit an audio file and a time range in seconds:

```bash
curl --fail --form "file=@/absolute/path/to/source.wav;type=audio/wav" \
  --form "startSeconds=1.0" \
  --form "endSeconds=3.0" \
  http://localhost:8080/api/v1/audio/trims \
  --output trim.mp3
```

The endpoint accepts audio uploads up to 50 MB and responds with `audio/mpeg`. Invalid ranges return a structured `400` response. FFmpeg processing failures return `422`; the service times out after 60 seconds.
