# Frontend Workspace

The frontend is a React 19 app built with CRACO, Tailwind CSS, Radix UI, and Framer Motion.

## Common Commands

```bash
cd frontend
npm install
npm start
npm test -- --watchAll=false
CI=true npm run build
```

## Environment

The frontend expects `REACT_APP_BACKEND_URL` to point at the backend origin, for example `http://localhost:8001` in local development.

For full project setup, use the root `README.md` and `docker/.env.example`.
