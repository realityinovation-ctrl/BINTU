# Backend produit BINTU

Runtime HTTP actif : FastAPI + MySQL + Google OAuth (Bearer).

Le guide détaillé (XAMPP, Google Cloud, Live, PM2) est dans [GUIDE.md](GUIDE.md).

```powershell
# 1) MySQL (XAMPP) : importer backend/bdd.sql (schéma v3)
# 2) Depuis ce dossier
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
copy .env.example .env
# Renseigner GOOGLE_CLIENT_ID et au moins une clé IA
python server.py
```

- Santé : `GET http://127.0.0.1:8000/api/health`
- Auth : `/api/auth/config`, `/api/auth/google`, `/api/auth/me`, `/api/auth/logout`
- Diagnostic : `/api/investigations` — pour un message qui avance le graphe, envoyer `"commit": true`
- Live : `ws://127.0.0.1:8000/api/live` (clé `GEMINI_API_KEY`)

La migration Node est en pause dans [`../backend_node/`](../backend_node/).
Le package historique `src/bintu_agent_core` reste une référence de règles ;
le moteur runtime enrichi est `bintu/core/` dans ce dossier.
