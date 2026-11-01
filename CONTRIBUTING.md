# Contribuer à BINTU

Guide de prise en main. Dix minutes suffisent pour savoir où est le code, comment le lancer, et ce qu'il ne faut pas changer.

## 1. Quoi

BINTU mène un diagnostic technique : le cœur choisit la prochaine vérification utile au lieu de livrer une réponse en bloc. Ce cœur est un package Python qui valide chaque décision d'un fournisseur avant de l'exécuter. Le photovoltaïque est le premier domaine ; le diagnostic porte sur un système (domaine, type, caractéristiques).

Slogan : « BINTU ne répond pas seulement. BINTU enquête. »

## 2. Carte du dépôt

Sur `develop` :

| Chemin | Rôle |
| --- | --- |
| `src/bintu_agent_core` | Cœur de diagnostic |
| `src/bintu_backend` | API FastAPI, référence fonctionnelle |
| `frontend/` | Interface React (Vite) |
| `scripts/` | Rejeu de démo, rapport de validation, essais Meta |
| `docs/` | `authentication.md`, rapport de scénarios |
| `tests/` | Tests pytest |

Sur la branche `feature/node-backend-migration` seulement :

| Chemin | Rôle |
| --- | --- |
| `backend/` | Migration Node, en cours, sur sa propre branche |
| `parity/` | Attendus figés, produits par les scripts Python |
| `scripts/export_parity_fixtures.py` | Régénère `parity/fixtures` |
| `scripts/export_http_fixtures.py` | Régénère `parity/http` |

## 3. État

`src/` (Python) est la référence fonctionnelle. `backend/` est une migration par phases, visible dans `git log` de `feature/node-backend-migration` :

| Sujet des commits | Statut |
| --- | --- |
| `feat(core)`, `test(parity)` | Core terminé |
| `feat(persistence)` | Persistance terminée |
| `feat(http)`, gel des réponses HTTP | Routes terminées |
| `feat(auth)` | Authentification terminée |

Aucun commit ne livre un adaptateur Meta Node, un serveur Node qui écoute, ni la bascule du frontend. Ces trois étapes sont à venir.

## 4. Lancer en local

Les commandes Python et frontend ci-dessous sont celles du `README.md` de `develop`. Les commandes Node sont les scripts de `backend/package.json` sur `feature/node-backend-migration`. Le dépôt ne charge pas les fichiers `.env` tout seul : exporter les variables dans le shell, ou les mettre dans `frontend/.env.local` pour Vite.

### Prérequis

Python 3.11 ou plus récent (`pyproject.toml`, `README.md`).

Version de Node.js : à vérifier. Ni `frontend/package.json` ni `backend/package.json` ne fixent de champ `engines`.

### Python et frontend (`develop`)

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[dev]"
```

Noms des variables, à partir de `.env.example` et des commandes du README. Aucune valeur ici.

Backend : `CLERK_SECRET_KEY`, `CLERK_AUTHORIZED_PARTIES`, `BINTU_ENV`, `BINTU_CORS_ORIGINS`, `BINTU_DEMO_ORGANIZATION_ID`, `BINTU_MIGRATION_USER_ID`, `MODEL_API_KEY`, `META_DECISION_TIMEOUT_SECONDS`, `BINTU_DB_PATH`.

`BINTU_DB_PATH` figure dans les commandes du README. Il n'est pas dans `.env.example`.

Frontend, fichier `frontend/.env.local` : `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_API_BASE_URL`. Le détail Clerk est dans `docs/authentication.md`.

Démarrage, copié du README :

```powershell
$env:MODEL_API_KEY="votre-cle-locale"
$env:BINTU_DB_PATH="data/bintu.sqlite3"
.\.venv\Scripts\python -m uvicorn bintu_backend.app:create_app --factory --reload
```

L'API est sur `http://127.0.0.1:8000`.

```powershell
cd frontend
npm install
npm run dev
```

L'interface est sur `http://localhost:5173`.

### Backend Node (branche `feature/node-backend-migration`)

Noms dans `backend/.env.example` : `BINTU_ENV`, `BINTU_BOOTSTRAP_CODE`, `BINTU_ALLOWED_ORIGINS`, `BINTU_SESSION_ABSOLUTE_SECONDS`, `BINTU_SESSION_IDLE_SECONDS`, `BINTU_INVITATION_SECONDS`, `BINTU_ARGON2_MEMORY_KIB`, `BINTU_ARGON2_TIME_COST`, `BINTU_ARGON2_PARALLELISM`, `BINTU_RATE_LIMIT_MAX`, `BINTU_RATE_LIMIT_WINDOW_SECONDS`, `BINTU_RATE_LIMIT_BLOCK_SECONDS`.

`backend/package.json` ne définit ni `dev` ni `start`. Le source ne contient pas d'appel `listen`. Commande de démarrage du serveur Node : à vérifier.

Installation des dépendances Node : à vérifier. Aucun README de `backend/` ne la documente.

## 5. Tests

Python, depuis la racine, commande du README :

```powershell
.\.venv\Scripts\python -m pytest
```

Frontend, dans `frontend/`, commandes du README :

```powershell
npm test
npm run typecheck
npm run build
```

Backend Node, dans `backend/` sur `feature/node-backend-migration`, scripts de `package.json` :

```powershell
npm test
npm run typecheck
npm run lint
npm run test:coverage
npm run verify:legacy
```

`verify:legacy` lit une copie locale de `data/bintu.sqlite3`. Ce fichier n'est pas dans Git.

## 6. Flux Git

Jamais de commit direct sur `main` ni sur `develop`. Créer une branche depuis `develop` : `feature/...`, `fix/...`, ou `docs/...`. Ouvrir une pull request avec une description. Messages conventionnels : `feat`, `fix`, `refactor`, `test`, `docs`, `chore`. Petits commits atomiques.

## 7. Migration Node

Ne pas travailler en parallèle sur `feature/node-backend-migration` sans prévenir le mainteneur. Une sous-branche par contributeur. Les phases sont séquentielles. Ne jamais modifier un attendu de `parity/` à la main. Régénérer avec :

```powershell
.\.venv\Scripts\python scripts\export_parity_fixtures.py
.\.venv\Scripts\python scripts\export_http_fixtures.py
```

Ces deux scripts n'existent que sur `feature/node-backend-migration`. Le premier est aussi indiqué dans `parity/README.md`.

## 8. Accord préalable

Sans accord, ne pas modifier :

- les règles du Core : validation, anti-boucle, hypothèses, catalogue de mesures, phrases de conclusion, plafond d'étapes ;
- les contrats d'API ;
- les fixtures de `parity/`.

## 9. Secrets

Jamais de secret dans Git. Chacun a son `.env` local. Une clé de développement par personne. `data/` et les bases SQLite ne sont jamais partagées ni commitées. Le `.gitignore` de `develop` ignore `.env` et `.env.*` (sauf `.env.example`). Il n'ignore pas `data/`.

Si un secret est commité : prévenir tout de suite, révoquer la clé, et ne pas se contenter de supprimer le commit.

## 10. Défauts connus

Ne pas les corriger en passant.

- `state_revision` augmente à l'enregistrement, sans verrou sur la révision lue par le client (`src/bintu_agent_core/sqlite_store.py`).
- `POST /api/investigations/{id}/transcribe` ne vérifie pas qu'une question est en attente. Le commentaire dans `src/bintu_backend/app.py` le marque comme suite à faire.
- Sans signature, le garde anti-boucle dépend de l'ordre des clés de `evidence`. La sérialisation trie ces clés. Le détail est dans `parity/README.md` sur la branche de migration.
