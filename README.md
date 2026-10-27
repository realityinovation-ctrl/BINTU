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

La vision réelle, le rendu de rapport, le frontend, la voix et la persistance
sont volontairement reportés.

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

Les tests locaux se lancent avec `python -m pytest`. Ils utilisent
`httpx.MockTransport` et n'effectuent aucun appel à Meta, ne nécessitent aucune
clé réelle et ne consomment aucun crédit.

Une réponse JSON entourée de texte ou d'un unique bloc Markdown est acceptée si
elle contient exactement un objet JSON. Une réponse ambiguë, invalide ou
incompatible avec `AgentDecision` est rejetée explicitement.

## Invariants

- une donnée d'installation inconnue reste `None` ;
- une décision ne s'exécute jamais avant validation ;
- une élimination est dérivée uniquement d'une preuve contradictoire forte ;
- une conclusion cite au moins une preuve existante ;
- une demande d'ouvrir ou déconnecter un conducteur sous tension est refusée ;
- une limite d'étapes atteinte provoque un arrêt sécurisé avec raison factuelle
  dans la timeline et produit `insufficient_information` ;
- l'épuisement d'un script mock reste une erreur de test et ne modifie pas
  l'état de l'investigation ;
- la timeline contient des événements et justifications opérationnelles, pas
  de chaîne de pensée.

`generate_report` appartient au contrat v0.2 pour stabiliser l'interface, mais
son exécution est refusée sans modifier l'état. Le rendu du rapport reste hors
du périmètre de cette version.
