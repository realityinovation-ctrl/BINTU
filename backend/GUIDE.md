# Lancer BINTU

Le serveur se lance depuis ce dossier :

```powershell
python server.py
```

Il écoute sur toutes les interfaces (`BINTU_HOST=0.0.0.0`, port 8000) pour que le téléphone du réseau local l'atteigne. Depuis ce PC, l'adresse reste `http://127.0.0.1:8000`. MySQL doit déjà tourner, avec la base `bintu` importée depuis `bdd.sql`.

## 1. Base XAMPP

1. Ouvrez le panneau XAMPP et démarrez **MySQL**.
2. Ouvrez phpMyAdmin : `http://localhost/phpmyadmin`.
3. Onglet **Importer**, choisissez `backend/bdd.sql`, exécutez.
4. La base `bintu` contient `users`, `auth_sessions`, `usage_quotas`, `investigations`, `overlay_payloads` (schéma v3).

Le compte local par défaut est `root` sans mot de passe, sur `127.0.0.1:3306`. Si votre MySQL a un mot de passe, mettez-le dans `.env`.

## Connexion Google (Cloud Console)

1. Créez un projet sur [Google Cloud Console](https://console.cloud.google.com/).
2. **APIs & Services → Identifiants → Créer → ID client OAuth → Application Web**.
3. Origines JavaScript autorisées : `http://localhost:8081`, `http://127.0.0.1:8081` (et l’IP LAN si besoin).
4. Copiez le **Client ID** dans `backend/.env` (`GOOGLE_CLIENT_ID=...`) et dans `phone/.env` (`EXPO_PUBLIC_GOOGLE_CLIENT_ID=...`).
5. Réimportez `bdd.sql` (v3), redémarrez `python server.py`, ouvrez l’app → page **Connexion**.

Sessions free (style ChatGPT au démarrage) : 12 h de validité, 40 messages / 15 min Live / 5 diagnostics par jour UTC.

## 2. Python

Python 3.11 ou plus récent.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
copy .env.example .env
```

Remplissez dans `.env` au moins une clé de modèle, puis forcez le stack avec `BINTU_AI_PROVIDER` :

| `BINTU_AI_PROVIDER` | Clé requise | Usage |
|---------------------|-------------|--------|
| `chatgpt` / `openai` | `OPENAI_API_KEY` | décisions, images, Whisper |
| `gemini` | `GEMINI_API_KEY` | décisions, images ; Live caméra/micro |
| `meta` | `MODEL_API_KEY` + `META_MODEL` | décisions, images, Muse Voice |
| *(vide)* | première clé trouvée | auto : Meta → Gemini → OpenAI |

Contrôle du switch : `GET http://127.0.0.1:8000/api/ai`.

- `OPENAI_MODEL` défaut `gpt-4o-mini`
- `GEMINI_MODEL` défaut `gemini-3.5-flash-lite`
- `GEMINI_LIVE_MODEL` défaut Live native-audio Google
- Le **Live** (`/api/live`) reste toujours Gemini, même si le diagnostic tourne sur ChatGPT ou Meta.

## Assistant contextuel (mémoire + entités)

Le diagnostic n’est plus un chatbot linéaire. Avant chaque décision, un graphe LangGraph :

1. extrait les entités (ville, secteur, équipement…),
2. met à jour la mémoire longue (JSON local par défaut),
3. récupère les notes pertinentes,
4. compacte l’historique si la timeline grossit.

Variables : `BINTU_ASSISTANT_MEMORY=1`, `BINTU_MEM0=0` (passer à `1` + `pip install mem0ai` + `OPENAI_API_KEY` pour Mem0). Statut dans `GET /api/ai` → `assistant_memory`. Le champ `state.assistant_context` est renvoyé avec chaque investigation.

## Live multimodal (test recommandé)

BINTU proxye Gemini Live en WebSocket (la clé reste sur le serveur) :

1. Relancez `python server.py` après avoir installé `websockets`.
2. Ouvrez `http://127.0.0.1:8000/live-test` sur le PC (casque conseillé).
3. Autorisez caméra + micro : JPEG ~1 FPS et PCM 16 kHz partent vers `/api/live`.

Sur le téléphone, l’ouverture de la caméra live envoie aussi des images JPEG vers le même endpoint. Voir le [README racine](../README.md) pour le contrat de messages et les dépôts de référence.

`server.py` charge `.env` tout seul. Une variable déjà présente dans le terminal reste prioritaire. Sans aucune clé, la création d'un diagnostic refuse la requête : le serveur n'invente pas de réponse.

Le téléphone (`phone/`) appelle la même API. Sur Expo Go, il reprend l'adresse du débogueur et le port 8000. `EXPO_PUBLIC_API_URL` force une autre adresse, par exemple `http://192.168.1.20:8000`. Le PC et le téléphone doivent être sur le même réseau, et le pare-feu doit laisser passer le port 8000. Après un changement de `.env`, relancez `python server.py`.

## 3. Démarrage

```powershell
python server.py
```

Contrôle :

```powershell
curl http://127.0.0.1:8000/api/health
```

La réponse attendue est `{"status":"ok"}`.

Le frontend Vite, dans `frontend/`, parle à cette API sans jeton. `GET /api/health` est public. Les diagnostics sont enregistrés pour l'atelier local `org_local`.

## 4. Dossiers

```text
server.py              lancement
bdd.sql                schéma MySQL
bintu/config           variables d'environnement
bintu/auth             atelier local et permissions
bintu/core             moteur d'enquête, règles, contrat
bintu/voice            transcription WAV
bintu/vision           observation d'une image
bintu/overlay          payload AR (coordonnées 0 à 1)
bintu/live             proxy Gemini Live (WSS)
bintu/persistence      lecture et écriture MySQL
bintu/api              routes HTTP + WebSocket
```

`GET /api/investigations/{id}/overlay` renvoie le JSON dessiné par le calque mobile : boîte, flèche, formule, bulle, et l'action demandée (mesure, image ou réponse). Chaque payload est aussi archivé dans `overlay_payloads`.

Les coordonnées sont des ancres normalisées déduites de l'étape en cours. Le dessin 60 images par seconde reste côté mobile. La vision continue ne passe pas par WebRTC : ce sont des JPEG périodiques + PCM sur `/api/live`, comme l’API Live officielle.

À la création d'un diagnostic, le serveur cherche le modèle cité sur le web public. Il conserve la composition et les pannes fréquentes seulement si les pages les soutiennent. L'analyse d'image compare ensuite ce qui est visible à ce dossier. Sans résultat de recherche, BINTU demande la plaque signalétique.

## 5. VPS avec PM2

Un seul processus, sans `--reload` :

```bash
pm2 start .venv/bin/python --name bintu-api --interpreter none -- server.py
```

Le dossier de travail est `backend`. Renseignez les variables de production : `BINTU_ENV=production`, `BINTU_CORS_ORIGINS`, `MODEL_API_KEY`, et les `MYSQL_*` de la base du serveur. Le mode cluster de PM2 ne convient pas à une seule écriture MySQL partagée sans pool prévu pour ça : gardez une instance.
