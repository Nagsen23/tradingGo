# tradingGo

A full-stack trading platform for building, backtesting, and tracking trading strategies.

## Tech Stack

| Layer    | Technology                      |
| -------- | ------------------------------- |
| Frontend | React (Vite)                    |
| Backend  | FastAPI (Python)                |
| Auth     | Firebase Authentication         |
| Database | Cloud Firestore                 |
| Hosting  | Firebase Hosting (planned)      |

## Architecture

- **Firebase** → Authentication + Firestore database only
- **FastAPI** → All trading logic (data fetching, strategies, backtesting, metrics)
- No trading logic lives inside Firebase

## Quick Start

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

API available at [http://localhost:8000](http://localhost:8000).

## Project Structure

```
tradingGo/
├── frontend/               # React (Vite) app
│   └── src/
│       ├── components/     # Reusable UI components
│       ├── contexts/       # React Context providers
│       ├── pages/          # Page components
│       ├── firebase.js     # Firebase config
│       ├── App.jsx         # Router & layout
│       └── main.jsx        # Entry point
├── backend/                # FastAPI server
│   ├── app/
│   │   └── main.py         # API endpoints
│   └── requirements.txt
└── README.md
```

## Roadmap

- [x] Phase 1 — Auth (signup, login, dashboard)
- [ ] Phase 2 — Market data + strategy builder
- [ ] Phase 3 — Backtesting engine
- [ ] Phase 4 — Portfolio tracking + charts
