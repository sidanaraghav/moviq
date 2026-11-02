# Environment setup

This is the source of truth for tools and runtime dependencies needed to run CoziCut. Update it whenever a dependency, required version, environment variable, port, or deployment command changes.

## Environment model

| Environment | Responsibility | How application dependencies are provided |
|---|---|---|
| Local development | Write, test, and debug the backend | Installed on the developer machine |
| Remote runtime | Run the released backend for users | Bundled into the application Docker image |

The remote server should not depend on manually installing Java, Maven, or FFmpeg. When containerization is introduced, the image will include the JRE and FFmpeg; the server will need only Docker, deployment configuration, and persistent storage where applicable.

## Local development requirements

CoziCut's first milestone needs these tools on the development machine:

| Tool | Verified version | Purpose |
|---|---:|---|
| Java | 21 | Runs Spring Boot |
| Maven | 3.9+ | Builds and tests the backend |
| FFmpeg | 9.0+ | Trims and exports audio |
| Docker Desktop | Optional for this milestone | Used later for repeatable deployment |

## macOS FFmpeg

Install FFmpeg through Homebrew:

```bash
brew install ffmpeg
ffmpeg -version
```

Homebrew currently installs the executable at `/opt/homebrew/bin/ffmpeg` on this machine. Normal developer terminals should have `/opt/homebrew/bin` on `PATH`.

## Run the backend

```bash
cd backend
mvn test
mvn spring-boot:run
```

Verify the service in another terminal:

```bash
curl http://localhost:8080/api/v1/health
```

Expected response:

```json
{"status":"ok"}
```

## Verify the trim workflow

In a second terminal while the backend is running, submit a local audio file:

```bash
curl --fail --form "file=@/absolute/path/to/source.wav;type=audio/wav" \
  --form "startSeconds=1.0" \
  --form "endSeconds=3.0" \
  http://localhost:8080/api/v1/audio/trims \
  --output trim.mp3
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 trim.mp3
```

The first milestone accepts audio uploads up to 50 MB. FFmpeg is invoked through a `ProcessBuilder` argument list, uses a request-specific temporary workspace, and defaults to a 60-second processing timeout. Workspaces are removed after the MP3 response has been streamed.

## Remote runtime requirements — planned

No remote environment is needed for the first local milestone. Before the private beta is deployed, this section must be completed with the actual provider, region, domain, and operational owner.

The intended baseline is:

| Remote dependency | Why it is needed | Installation model |
|---|---|---|
| Linux VM | Hosts the private beta | Provision from the chosen provider |
| Docker Engine + Compose plugin | Runs the versioned application image | Install once on the VM |
| CoziCut backend image | Contains Java runtime, Spring Boot application, and FFmpeg | Built and deployed per release |
| Reverse proxy + TLS | Serves HTTPS when the application is public | Defined with deployment configuration |
| Persistent disk / object storage | Holds only the data that later milestones choose to retain | Provider-managed, documented before use |

### Remote readiness checklist

Do not mark a remote deployment complete until all applicable items are recorded here:

- [ ] Provider, region, server size, and monthly cost.
- [ ] SSH access and firewall rules.
- [ ] Docker Engine and Compose versions.
- [ ] Exact image tag deployed.
- [ ] Required environment variables, with secret values stored outside Git.
- [ ] Domain, DNS, and TLS configuration.
- [ ] Storage location and media-retention policy.
- [ ] Health-check URL and a manual rollback command.
- [ ] Verified FFmpeg version inside the running container.

## Change log

| Date | Change | Verified by |
|---|---|---|
| 2026-10-24 | Initial local prerequisites: Java 21, Maven 3.9+, FFmpeg 9.0+, Docker Desktop. | Local Spring Boot health endpoint and test suite |
| 2026-11-02 | Completed local multipart trim endpoint, including FFmpeg execution, temporary cleanup, and synthetic-audio end-to-end test. | `mvn test` and `ffprobe` duration assertion |
