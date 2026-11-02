# CoziCut handoff

Use this document to continue the CoziCut project in another Codex thread, IDE, or with another collaborator.

## Resume prompt

Paste the following into the new thread:

```text
Continue the CoziCut project in this repository. Read AGENTS.md first, then docs/handoff.md, docs/hld-first-milestone.md, docs/first-milestone-plan.md, and docs/local-setup.md.

Current status: Milestone 1 (single-file local audio trimming) and Milestone 2 (multi-clip timeline mixing with clean cuts, optional crossfade, volume normalization, and audio/video input format support) are fully implemented and verified with 28 automated tests passing.

The next milestone is:
Milestone 3: Interactive Web UI (Next.js / React with Wavesurfer.js waveform trimmer and sequence editor).
```

## Product in one paragraph

CoziCut is a multi-clip audio and video trimmer and medley mixer. The application lets anyone upload audio and video media, choose snippets, arrange clips, preview sequences, and export a finished high-quality audio mix.

## Completed milestones

### Milestone 1: Single-file audio trimming
`POST /api/v1/audio/trims` trims one locally supplied audio file and returns a playable MP3.

### Milestone 2: Multi-clip audio/video mixing
`POST /api/v1/audio/mixes` takes multiple uploaded media files (audio or video), trims each snippet to specified timestamps, and stitches them in sequence order into `master_mix.mp3`.
- **Default:** Clean cut (0s crossfade, instant transition between clips).
- **Optional:** User-selected crossfade duration (`crossfadeSeconds > 0`).
- **Optional:** EBU R128 loudness normalization (`normalizeVolume = true`).
- **Formats:** Accepts both audio (`.mp3`, `.wav`, `.m4a`, etc.) and video (`.mp4`, `.mov`, `.mkv`, etc., with audio extracted).
- **Stateless:** Operates completely on-the-fly in an ephemeral temporary workspace without any database or retained media files.

## Repository map

```text
CoziCut/
├── AGENTS.md                         # Working agreement for Codex/collaborators
├── README.md                          # Product summary and local run commands
├── backend/
│   ├── pom.xml                        # Spring Boot 4.1.2 / Java 21
│   └── src/
│       ├── main/java/com/cozicut/
│       │   ├── CoziCutApplication.java
│       │   ├── api/
│       │   │   ├── ApiError.java
│       │   │   ├── ApiExceptionHandler.java
│       │   │   ├── AudioMixController.java
│       │   │   ├── AudioTrimController.java
│       │   │   └── HealthController.java
│       │   ├── media/
│       │   │   ├── FfmpegExecutor.java
│       │   │   ├── MediaProcessingException.java
│       │   │   ├── MediaProcessingTimeoutException.java
│       │   │   └── ProcessFfmpegExecutor.java
│       │   ├── mix/
│       │   │   ├── AudioMixService.java
│       │   │   ├── ClipSpec.java
│       │   │   ├── MixManifest.java
│       │   │   └── MixRequest.java
│       │   └── trim/
│       │       ├── AudioTrimService.java
│       │       └── TrimmedAudio.java
│       ├── main/resources/application.properties
│       └── test/java/com/cozicut/
│           ├── AudioMixIntegrationTest.java
│           ├── AudioTrimIntegrationTest.java
│           ├── CoziCutApplicationTests.java
│           ├── api/AudioMixControllerTest.java
│           ├── api/AudioTrimControllerTest.java
│           ├── media/ProcessFfmpegExecutorTest.java
│           ├── mix/AudioMixServiceTest.java
│           └── trim/AudioTrimServiceTest.java
└── docs/
    ├── first-milestone-plan.md        # Detailed checkpoint plan
    ├── hld-first-milestone.md         # HLD, sequence diagram, failure model
    ├── local-setup.md                 # Living local/remote environment setup document
    └── handoff.md                     # This document
```

## Local verification commands

From `backend/`:

```bash
mvn test
mvn spring-boot:run
```
