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

L'intégration Meta, la vision réelle, le rendu de rapport, le frontend, la
voix, la persistance et les services réseau sont volontairement reportés.

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

Un futur adaptateur Meta devra rester hors du cœur : convertir l'état dans le
format d'appel du fournisseur, traduire le `tool_call` reçu en
`AgentDecision`, puis laisser le cœur appliquer ses propres validations.

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
