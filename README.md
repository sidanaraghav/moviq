# CoziCut

CoziCut is a multi-clip audio and video trimmer and medley mixer. It lets a user collect source media (audio or video), select snippets, arrange them into a sequence, preview the audio flow, and export a finished mix.

## Current stage

Milestone 2 is complete:
- Single-clip trimming: `POST /api/v1/audio/trims`
- Multi-clip sequence mixing (clean cut or optional crossfade, with audio and video inputs): `POST /api/v1/audio/mixes`

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
- Clean cuts by default; crossfades and volume normalization are optional.
- Stateless, on-the-fly execution without permanent media retention or databases.

See [AGENTS.md](AGENTS.md) for the working agreement.

## Run the backend

From `backend/`:

```bash
mvn spring-boot:run
```

Then request `GET http://localhost:8080/api/v1/health`. A successful response is `{"status":"ok"}`.

## Run the frontend

From `frontend/`:

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

## Trim single audio

```bash
curl --fail --form "file=@/absolute/path/to/source.wav;type=audio/wav" \
  --form "startSeconds=1.0" \
  --form "endSeconds=3.0" \
  http://localhost:8080/api/v1/audio/trims \
  --output trim.mp3
```

## Mix multiple clips (Audio & Video)

Combine multiple song snippets or video screen recordings into a single master MP3.

### Clean cut (Default: 0s crossfade)

```bash
curl --fail \
  --form "files=@song1.mp3" \
  --form "files=@dance_reel.mp4" \
  --form 'manifest={"crossfadeSeconds": 0.0, "normalizeVolume": false, "clips": [{"fileIndex": 0, "startSeconds": 10.0, "endSeconds": 25.0}, {"fileIndex": 1, "startSeconds": 5.0, "endSeconds": 20.0}]}' \
  http://localhost:8080/api/v1/audio/mixes \
  --output master_mix.mp3
```

### With optional crossfade and volume normalization

```bash
curl --fail \
  --form "files=@song1.mp3" \
  --form "files=@song2.wav" \
  --form 'manifest={"crossfadeSeconds": 2.0, "normalizeVolume": true, "clips": [{"fileIndex": 0, "startSeconds": 0.0, "endSeconds": 30.0}, {"fileIndex": 1, "startSeconds": 15.0, "endSeconds": 45.0}]}' \
  http://localhost:8080/api/v1/audio/mixes \
  --output master_mix.mp3
```

Supported formats:
- Audio: `.mp3`, `.wav`, `.m4a`, `.aac`, `.flac`, `.ogg`, `.opus`, `.wma`, `.aiff`, `.weba`
- Video: `.mp4`, `.mov`, `.mkv`, `.webm`, `.avi`, `.m4v`, `.3gp`, `.flv`, `.wmv` (audio track extracted automatically)
