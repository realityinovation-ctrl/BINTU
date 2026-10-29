# BINTU Agent Core

BINTU Agent Core v0.2 est un package Python pur qui orchestre une investigation
photovoltaïque sans dépendre d'un fournisseur d'IA, du réseau, d'une base de
données ou d'un framework web.

Le cœur sépare strictement les observations, les hypothèses, les vérifications
et les conclusions. Toute information inconnue reste `None`. Les décisions d'un
fournisseur sont validées par le cœur avant leur exécution.

## Développement

Prérequis : Python 3.11 ou plus récent.

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[dev]"
.\.venv\Scripts\python -m pytest
```

## Périmètre v0.2

- état en mémoire et boucle d'investigation ;
- contrat typé et indépendant du fournisseur ;
- fournisseur mock déterministe par décisions scriptées ;
- garde-fous métier et sécurité ;
- tests sans réseau.

La segmentation d'image, le rendu de rapport et les traitements visuels
avancés restent hors périmètre.

## Frontière fournisseur

Le moteur dépend uniquement de `AIProvider.decide_next(state)`. Il transmet
une copie structurée de l'état et reçoit un `AgentDecision` composé d'un outil,
de ses arguments typés et d'une justification opérationnelle. Il ne manipule
aucun message brut propre à un fournisseur. Une décision ne peut contenir ni
preuve ni changement de statut d'hypothèse.

Le cœur transforme chaque résultat d'outil validé en quatre concepts séparés :
une `Observation` factuelle, une `Evidence` qui référence cette observation,
une `Verification` qui relie le résultat à l'action, puis éventuellement un
impact validé dont le cœur dérive seul le statut des hypothèses.

`MockAIProvider` rejoue une séquence fournie par les tests. Les diagnostics
présents dans `tests/fixtures/` sont des données de scénario, pas des règles de
diagnostic du produit.

`MetaAIProvider` est un adaptateur mince et isolé : il envoie une copie
sérialisée de l'état à `muse-spark-1.3`, convertit la réponse en
`AgentDecision`, puis laisse le cœur appliquer ses validations existantes.
Il ne modifie jamais l'état et n'exécute aucun outil.

## Configuration Meta

La clé est lue uniquement depuis `MODEL_API_KEY` :

```powershell
$env:MODEL_API_KEY="votre-cle-locale"
```

Le fichier `.env.example` documente le nom de la variable sans contenir de
secret. Le package ne charge pas automatiquement les fichiers `.env`.

Une décision Meta attend au plus `META_DECISION_TIMEOUT_SECONDS` secondes.
La valeur par défaut est 60, le maximum accepté est 120. Passé ce délai, le
fournisseur renvoie une erreur de timeout. L'attente n'est jamais illimitée.
La voix et l'analyse d'image conservent leur propre plafond de 60 secondes.

## Trois contextes distincts

1. Runtime réel : `uvicorn` construit `MetaAIProvider`. Chaque décision vient
   de Meta. BINTU choisit la prochaine vérification utile. L'ordre question,
   image, mesure, puis diagnostic n'est pas garanti.
2. Démonstration déterministe : `MockAIProvider` rejoue
   `tests/fixtures/full_investigation_scenario.json` et l'enregistre dans
   SQLite. Ce parcours contrôlé ne prétend pas que Meta produit cette séquence.

```powershell
$env:BINTU_DB_PATH="data/bintu.sqlite3"
.\.venv\Scripts\python scripts\replay_demo_scenario.py
```

L'adresse affichée ouvre l'investigation déjà terminée. La consultation ne
relance pas l'enquête.
3. Tests automatisés : le Core et les API sont exercés avec `MockAIProvider`,
   sans réseau et sans crédit Meta.

Les tests locaux se lancent avec `python -m pytest`. Ils utilisent
`httpx.MockTransport` et n'effectuent aucun appel à Meta, ne nécessitent aucune
clé réelle et ne consomment aucun crédit.

Une réponse JSON entourée de texte ou d'un unique bloc Markdown est acceptée si
elle contient exactement un objet JSON. Une réponse ambiguë, invalide ou
incompatible avec `AgentDecision` est rejetée explicitement.

## Rapport de validation fonctionnelle

Les quatre scénarios scriptés peuvent être réellement rejoués par le moteur et
le rapport régénéré en une commande :

```powershell
.\.venv\Scripts\python scripts\generate_validation_report.py
```

La sortie est écrite dans `docs/validation/agent-core-scenarios.md`. Ces
scénarios démontrent la mécanique du Core, pas l'intelligence diagnostique.

## Persistance SQLite

`SQLiteInvestigationStore` sauvegarde localement un instantané complet de
`InvestigationState` dans une table `investigations`. Le JSON persistant est
versionné avec `schema_version: 1` et conserve exactement le contrat actuel du
Core, y compris les valeurs `null`, les preuves, vérifications, actions en
attente, conclusions et événements de timeline.

```python
from bintu_agent_core import SQLiteInvestigationStore

store = SQLiteInvestigationStore("data/bintu.sqlite3")
state = store.create_investigation()
store.save_investigation(state)
restored = store.get_investigation(state.investigation_id)
```

Les tests utilisent exclusivement des fichiers SQLite temporaires :

```powershell
.\.venv\Scripts\python -m pytest
```

## Backend FastAPI

Le backend MVP expose la création, la consultation et la réponse textuelle à
une investigation. Il utilise SQLite et délègue toutes les transitions métier
à `InvestigationEngine`. Les tests remplacent systématiquement
`MetaAIProvider` et n'appellent jamais Meta.

```powershell
$env:MODEL_API_KEY="votre-cle-locale"
$env:BINTU_DB_PATH="data/bintu.sqlite3"
.\.venv\Scripts\python -m uvicorn bintu_backend.app:create_app --factory --reload
```

L'API est alors disponible sur `http://127.0.0.1:8000`. Le CORS est limité aux
origines locales courantes sur les ports 3000 et 5173. Le endpoint `message`
répond à `ask_technician`. Une mesure passe par
`POST /api/investigations/{id}/measurement` uniquement lorsque le Core attend
`request_measurement`.

Le catalogue fermé est défini dans `measurement_catalog.py` : tension DC/AC,
courant DC/AC et puissance AC, avec leur unité imposée. Le frontend affiche ce
catalogue mais ne peut ni l'étendre ni imposer une unité. La valeur devient un
`Measurement`, une observation factuelle et une `Evidence` de type
`measurement`. Elle ne modifie aucune hypothèse et ne produit aucune conclusion.

## Frontend React

Le frontend mobile-first se trouve dans `frontend/`. En développement, Vite
redirige `/api` vers FastAPI sur le port 8000.

```powershell
cd frontend
npm install
npm run dev
```

L'interface est disponible sur `http://localhost:5173`. Pour la validation :

```powershell
npm test
npm run typecheck
npm run build
```

### Entrée vocale

Pour une question textuelle, le technicien peut enregistrer une réponse,
relire et corriger la transcription, puis la confirmer. Le navigateur encode
directement un WAV mono PCM 16-bit à 16 kHz. FastAPI valide le format, la durée
et la taille avant d'appeler `muse-voice-transcribe-1.0`. L'audio reste
temporaire et la transcription n'est jamais envoyée au moteur avant
confirmation.

Seule la transcription fichier HTTP est utilisée. Aucun WebSocket vocal,
synthèse vocale ou enregistrement permanent n'est inclus.

### Entrée image

Lorsque le Core demande explicitement `analyze_image`, le technicien peut
prendre ou sélectionner une image JPEG, PNG ou WebP de 10 Mo maximum, vérifier
son aperçu, puis déclencher l'analyse. FastAPI envoie alors l'image à
`muse-spark-1.3` via l'interface multimodale de Meta.

Le résultat accepté contient uniquement une description visuelle et une
certitude. Le Core l'enregistre comme `Observation` et `Evidence` avec
`source_type=image_analysis`, sans créer de mesure ni modifier une hypothèse.
L'image n'est pas conservée après la requête. Les tests utilisent un transport
HTTP local et n'appellent jamais Meta.

### Mesures électriques

Quand BINTU demande une mesure, le formulaire mobile reprend le type et
l'emplacement demandés, affiche l'unité du catalogue et envoie la valeur
confirmée. Le rechargement de l'investigation restitue cette mesure depuis
SQLite. Aucune règle du type « 38,4 V signifie un panneau défectueux » n'est
codée.

## Invariants

- une donnée d'installation inconnue reste `None` ;
- une décision ne s'exécute jamais avant validation ;
- une élimination est dérivée uniquement d'une preuve contradictoire forte ;
- une proposition `hypothesis_updates` est refusée si une preuve est absente,
  si le statut proposé ne correspond pas à la dérivation du Core, ou si une
  élimination n'est pas contradictoire et forte ;
- une confiance supérieure à 0,7 exige une preuve de mesure et ne peut pas
  reposer uniquement sur une analyse d'image ;
- une conclusion cite au moins une preuve existante ;
- une demande d'ouvrir ou déconnecter un conducteur sous tension est refusée ;
- une limite d'étapes atteinte provoque un arrêt sécurisé avec raison factuelle
  dans la timeline et produit `insufficient_information` ;
- l'épuisement d'un script mock reste une erreur de test et ne modifie pas
  l'état de l'investigation ;
- la timeline contient des événements et justifications opérationnelles, pas
  de chaîne de pensée.

`generate_report` appartient au contrat v0.2 pour stabiliser l'interface, mais
son exécution est refusée sans modifier l'état. L'écran de rapport lit
uniquement l'état déjà enregistré.
