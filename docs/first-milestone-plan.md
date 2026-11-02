# First milestone: trim one audio file locally

## Goal

Prove the CoziCut media-processing core with one complete local flow:

1. A client uploads one audio file and supplies a start and end time.
2. Spring Boot validates the request and creates a temporary workspace.
3. The backend invokes FFmpeg safely.
4. The API returns a trimmed MP3 file.
5. Temporary input/output files are removed after the response completes.

This milestone deliberately excludes link import, persistence, authentication, a UI, clip combining, queues, deployment, and video.

## Success criteria

- `POST /api/v1/audio/trims` accepts a multipart request containing an audio file, `startSeconds`, and `endSeconds`.
- A valid request returns `200 OK`, `audio/mpeg`, and a playable MP3 containing only the requested range.
- Invalid inputs return a useful `400 Bad Request` response.
- FFmpeg is called with a `ProcessBuilder` argument list, never through a shell command.
- The Java build and unit tests pass locally.
- A manual test using one non-sensitive local sample audio file succeeds.

## Proposed request contract

```http
POST /api/v1/audio/trims
Content-Type: multipart/form-data

file: <audio file>
startSeconds: 15.5
endSeconds: 42.0
```

Initial response:

```http
200 OK
Content-Type: audio/mpeg
Content-Disposition: attachment; filename="trim.mp3"
```

The request is synchronous for this first milestone. A later export job will become asynchronous when rendering takes long enough to warrant a queue.

## Project shape

```text
backend/
  src/main/java/com/cozicut/
    CoziCutApplication.java
    api/AudioTrimController.java
    media/FfmpegExecutor.java
    media/ProcessFfmpegExecutor.java
    trim/AudioTrimService.java
    trim/TrimRequest.java
  src/test/java/com/cozicut/
    media/ProcessFfmpegExecutorTest.java
    trim/AudioTrimServiceTest.java
  pom.xml
```

Use Java 21, Maven, Spring Boot, Spring Web, Spring Validation, and Spring Boot Test. Do not add a database, Docker, or frontend for this milestone.

## Checkpoint 0 — developer environment

**Outcome:** the local machine can build a Java service and run FFmpeg.

1. Verify Java 21: `java --version`.
2. Verify Maven: `mvn --version`.
3. Verify FFmpeg: `ffmpeg -version`.
4. Install any missing item before generating application code.
5. Create a short `docs/local-setup.md` later only if setup required non-obvious steps.

**You should understand:** FFmpeg is an installed executable. Spring Boot will orchestrate it; it is not a Java audio library.

## Checkpoint 1 — bootstrap the backend

**Outcome:** a minimal Spring Boot service starts and has a passing test suite.

1. Create `backend/` using Spring Initializr or an equivalent Maven setup.
2. Choose Java 21 and add only Spring Web, Validation, and Spring Boot Test.
3. Start the application and confirm the embedded server listens locally.
4. Add a health endpoint only if the generated setup does not already expose a simple way to prove the application is running.
5. Make the first Git commit after you have inspected the generated project.

**You should understand:** the Maven lifecycle (`test`, `package`, `spring-boot:run`) and the role of a Spring Boot application class.

## Checkpoint 2 — define the HTTP boundary

**Outcome:** the API accepts a valid multipart request and rejects invalid data before any media processing occurs.

1. Create `AudioTrimController` with the endpoint described above.
2. Validate that a file is present, `startSeconds >= 0`, and `endSeconds > startSeconds`.
3. Set conservative initial limits: accept audio only and reject files larger than a small, documented limit (for example 50 MB).
4. Return a structured validation error for bad requests.
5. Add controller tests using `MockMvc`.

**You should understand:** multipart uploads, request validation, HTTP status codes, and why validation happens before spawning a process.

## Checkpoint 3 — isolate FFmpeg execution

**Outcome:** Java can run a known FFmpeg command safely and report failures clearly.

1. Create an `FfmpegExecutor` interface that accepts a list of command arguments and a working directory.
2. Implement it with `ProcessBuilder`.
3. Capture standard output/error, wait for completion, and throw a domain-specific exception if the exit code is non-zero.
4. Add a timeout so an unexpectedly hung process cannot consume the server forever.
5. Unit-test command construction and error handling without relying on an installed FFmpeg binary.

**You should understand:** why invoking a process with an argument list prevents shell-injection bugs and makes commands testable.

## Checkpoint 4 — implement trimming

**Outcome:** a service creates a trimmed MP3 in an isolated temporary directory.

1. Create `AudioTrimService` with input file, start time, end time, and an output destination.
2. Generate a unique temporary workspace per request.
3. Build the FFmpeg argument list. Start with a predictable MP3 output format; avoid trying to preserve every possible input codec in version one.
4. Confirm that FFmpeg produced a non-empty output file.
5. Ensure all temporary files are deleted in a `finally` block or equivalent lifecycle handling.
6. Add service tests with a fake executor plus one optional local smoke test that runs real FFmpeg.

**You should understand:** service boundaries, temporary-file lifecycle, external-process failures, and the difference between unit tests and an end-to-end smoke test.

## Checkpoint 5 — stream the result and verify end to end

**Outcome:** the endpoint returns a downloadable, playable MP3.

1. Connect the controller to `AudioTrimService`.
2. Stream the output file in the response with `audio/mpeg` and a safe download filename.
3. Do not delete the response file until streaming has completed.
4. Make a manual request using curl, Postman, or the IDE HTTP client.
5. Listen to the exported file and compare its approximate duration with the requested interval.
6. Run `mvn test` and document the verified request in the README.

**You should understand:** response streaming and why cleanup must happen after—not before—the client receives the file.

## Suggested working rhythm

Work in 60–90 minute blocks. Stop after each checkpoint even if you have time left; test, inspect the diff, and make a commit only if you want a checkpoint saved.

Before asking Codex for help, phrase tasks narrowly:

```text
I am implementing Checkpoint 3 from docs/first-milestone-plan.md.
Explain the role of FfmpegExecutor and ProcessBuilder first.
Do not write application code until I show you my attempt or ask for it.
Review only the files involved in this checkpoint.
```

For frontend work later, replace the final instruction with:

```text
Implement this UI slice, then explain the component tree, state flow,
and how I can test it. Do not make backend architecture decisions.
```

## Explicitly deferred

- Combining multiple clips and transitions
- URL-based media import
- React editor and waveform timeline
- Persistent projects or a database
- Login, invites, payments, analytics, and rate limiting
- Background processing and progress updates
- Docker and cloud deployment
- Video output

The next milestone begins only after this one produces a reliable local MP3.
