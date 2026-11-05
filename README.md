# Moviq 🎬🎵

> **The easiest, quickest, and smoothest way to create dance medleys just by pasting links from different sources.**

Moviq is a modern web application built for choreographers, performers, and party planners to trim, sequence, and blend audio and video tracks into seamless performance medleys.

---

## ✨ Key Features

- **Link Import (Universal):** Paste links directly from YouTube, Instagram, Spotify, and more.
- **Dynamic Format Preservation:** Video links download as 720p MP4; audio tracks stay as high-quality MP3.
- **Multi-Section Trimming:** Select multiple non-contiguous cuts from the same video or song with interactive waveform and video players.
- **Drag-and-Drop Sequence Reordering:** Reorder cuts effortlessly with touch and mouse handles.
- **Section & Full Medley Video Previews:** Watch the stitched sequence with audio visualizer title cards before exporting.
- **Session Auto-Save:** Edits and media blobs survive page reloads automatically via `localStorage` and `IndexedDB`.
- **Fast 720p HD Video & Audio Export:** Combines segments in seconds using FFmpeg.

---

## 🚀 Quick Start (Docker)

Run locally with Docker:

```bash
docker compose up -d --build
```

Then visit: [http://localhost:80](http://localhost:80)

---

## 🛠️ Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, WaveSurfer.js, Lucide Icons
- **Backend:** Java 21, Spring Boot 4.1.2, FFmpeg, yt-dlp, Node.js
- **Container:** Multi-stage Docker image
