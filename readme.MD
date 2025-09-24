Inhalt (kurz):
POKERGODS (Beta)
Local dev:
Backend: cd backend && npm ci && npm run build && node dist/index.js
Frontend: cd frontend && npm ci && npm run dev
Railway:
Backend: Root backend; Build npm ci && npm run build; Start node dist/index.js
Frontend: Root frontend; Build npm ci && npm run build; Output frontend/dist; ENV VITE_BACKEND_URL=https://<backend>.up.railway.app