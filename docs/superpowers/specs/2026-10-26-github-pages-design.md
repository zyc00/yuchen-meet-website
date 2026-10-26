# Meeting website on GitHub Pages

The user explicitly chose GitHub Pages, alongside the existing academic homepage, and rejected OpenAI Sites hosting. Keep the current plain booking interface, exact homepage colors/fonts, 30/60 minute meetings, visitor timezone selection and booking recovery behavior. The header homepage link, Zoom subtitle and admin link stay removed.

Use a separate public `zyc00/yuchen-meet-website` repository with a custom domain `meet.yuchenzh.com`. Publish a static React/Vite build. Only the public UI and browser-safe code go in this repository; no credentials, private booking data or prior hosting-account configuration. CNAME points to `zyc00.github.io`.

GitHub Pages cannot execute the existing Calendar API server. Isolate the API origin behind a browser client adapter. Until an independent backend is connected, availability remains closed and no booking request is submitted. The backend choice is pending the user's answer: own Cloudflare Workers account (recommended because the existing backend uses Worker/D1 APIs) or their server. No further deployment to OpenAI Sites.

Alternatives: continuing the full-stack Sites deployment conflicts with the user's hosting preference. Rewriting the backend as Google Apps Script would introduce a different storage/auth model and lose much of the existing tested backend. Frontend migration can proceed independently of backend provider choice.
