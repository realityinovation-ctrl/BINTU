# Lancer BINTU avec Clerk

Clerk porte l'identité, l'e-mail, Google, la session et l'organisation active.
BINTU vérifie le jeton et décide qui peut lire ou modifier un diagnostic.
Le moteur de diagnostic ne voit ni Clerk, ni l'utilisateur, ni l'organisation.

Aucune clé réelle ne figure ici.

## 1. Créer l'application Clerk

Dans le tableau Clerk :

1. Créez une application.
2. Activez **Email** et **Google**.
3. Laissez GitHub désactivé pour cette version.
4. Activez **Organizations**.
5. Gardez les rôles gratuits `org:admin` et `org:member`. Ne créez pas de rôles personnalisés.
6. Créez les permissions et assignez-les :
   - `org:diagnostic:read`
   - `org:diagnostic:create`
   - `org:diagnostic:operate`
   - `org:organization:manage`
   - `org:admin` : les quatre
   - `org:member` : les trois permissions `diagnostic`
7. Créez une organisation, par exemple « BINTU Demo », et un utilisateur de migration.
8. Le rôle lecture seule est reporté. Il n'existe pas dans cette version.

## 2. Variables

Backend, dans le shell, jamais dans Git :

```powershell
$env:CLERK_SECRET_KEY="sk_test_..."
$env:BINTU_ENV="development"
$env:CLERK_AUTHORIZED_PARTIES="http://localhost:5173,http://127.0.0.1:5173"
$env:BINTU_DEMO_ORGANIZATION_ID="org_..."
$env:BINTU_MIGRATION_USER_ID="user_..."
```

Les deux derniers identifiants sont facultatifs. S'ils sont absents ou mal formés, les anciens diagnostics restent en base et ne sont rattachés à personne. Le code n'invente pas d'identifiant.

Frontend, fichier `frontend/.env.local` :

```text
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_API_BASE_URL=
```

`pk_test_` est une clé publique. `CLERK_SECRET_KEY` ne doit jamais commencer par `VITE_`.

En production, `BINTU_ENV=production` et `CLERK_AUTHORIZED_PARTIES` doit lister l'origine réelle du site. Une liste vide refuse tous les jetons.

## 3. Backend

```powershell
.\.venv\Scripts\python -m uvicorn bintu_backend.app:create_app --factory --reload
```

`GET /api/health` reste public. Les routes `/api/investigations` exigent `Authorization: Bearer`.

## 4. Frontend

```powershell
cd frontend
npm install
npm run dev
```

Ouvrez `http://localhost:5173`. Sans clé publique, l'écran indique que la configuration Clerk manque. Il n'ouvre pas l'application.

## 5. Organisation

Connectez-vous, puis choisissez ou créez l'organisation active. Sans organisation active, aucun diagnostic n'est demandé.

## 6. Connexion

Le bouton de déconnexion appelle Clerk. Une ancienne clé `bintu-session` dans le navigateur ne compte pas comme une identité.

## 7. Diagnostic

Créez un diagnostic depuis l'application. Il est enregistré avec l'organisation et l'utilisateur du jeton vérifié, pas avec une valeur envoyée par le formulaire.
Un utilisateur d'une autre organisation reçoit 404 s'il demande cet identifiant.
Un membre de l'organisation peut le créer et le modifier. Un admin peut en plus gérer l'organisation. Une autre organisation reçoit 404.
