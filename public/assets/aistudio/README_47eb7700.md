# RBI Prep OS 2027 — Reference-inspired UI MVP

Open `index.html` in Chrome or Edge. For a local web server run `python -m http.server 8000` from this directory and visit http://localhost:8000.

## Implemented
- Responsive desktop/mobile layout inspired by the supplied Timeyfi screenshot: pale gray canvas, white rounded panels, mint landscape banner, sidebar, month calendar, task capture and mint forest focus timer.
- Working task add/complete/delete with localStorage persistence.
- Subject management, notes editor with localStorage persistence, simple search, month navigation, JSON backup export.
- Countdown focus timer with pause/resume and optional completed-session recording.

## Important limitations
- This is an **initial frontend design implementation**, not the complete RBI Prep OS product.
- Screenshot and PDF uploads, Gemini integration, Firebase sync, authentication, native Android packaging and true offline synchronization are **not implemented**.
- Timer is foreground-page only; a closed tab or refreshed page will reset it. Paused time is excluded but session confirmation is basic.
- Data is saved only in this browser/device. Export backups regularly.
- The landscape banner and timer forest are CSS approximations of the user-provided reference artwork, not copied assets.
- Android access is through the responsive website for now; no APK has been produced.
