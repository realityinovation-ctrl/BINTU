# Fixtures de parité

Ces fichiers sont produits en exécutant le Core Python. Ils ne sont pas écrits à la main. Aucun appel Meta n'est fait. Aucune ligne de `data/bintu.sqlite3` n'est lue.

Chaque fixture contient :

- `input_state` : l'état d'entrée, ou l'ancien document `installation` pour la relecture ;
- `decision` : la décision scriptée, ou `null` quand l'opération n'est pas une décision ;
- `submission` : la réponse, la mesure ou l'image fournie par le technicien, s'il y en a une ;
- `expected` : l'état complet après l'opération, ou `error.type` et `error.message` ;
- `invariants` : pour un refus, `step_count`, hypothèses, preuves et chronologie, identiques avant et après.

Régénération :

```powershell
.\.venv\Scripts\python scripts\export_parity_fixtures.py
```

Le test `tests/test_parity_fixtures.py` échoue si un fichier ne correspond plus à ce que le Python produit.

## Comportements couverts

- Création puis première décision
- Échec de la première décision à la création : l'état reste à l'étape 0, sans chronologie
- `advance()` refusé quand le statut n'est pas `investigating`
- Question, puis réponse du technicien
- Réponse vide, réponse sans question en attente, observation ou preuve ou vérification déjà présente
- Mesure valide, type inconnu, mauvaise unité, valeur non finie, identifiant déjà utilisé
- Mesure valide, type inconnu, mauvaise unité, valeur non finie
- Image acceptée, et refusée si l'action en attente n'est pas `analyze_image`
- Comparaison de deux mesures, unités différentes, mesures inconnues
- Conclusion valide avec une mesure citée
- Conclusion acceptée à confiance exactement 0,7 sans mesure citée
- Conclusion refusée au-dessus de 0,7 sans mesure citée
- Conclusion refusée sans modifier `step_count` ni la chronologie
- Conclusion refusée si elle ne cite qu'une image
- Fin explicite pour informations insuffisantes
- Plafond `max_steps` = 20, sans appeler le fournisseur
- Anti-boucle : question, mesure, foyer d'image et comparaison
- Mesure répétée sans signature dans la chronologie, y compris si la clé de preuve manque
- Mesure répétée sans signature refusée quand une preuve chronologiquement ultérieure se trie avant la mesure
- Mesure répétée autorisée quand une preuve nouvelle existe et qu'une signature est présente
- Mesure répétée sans signature autorisée quand l'identifiant de la preuve ultérieure se trie après celui de la mesure
- Un `action_id` qui n'est pas un texte ne compte pas comme preuve directe
- Une conclusion n'est pas traitée comme une répétition
- Élimination sans preuve contradictoire forte
- Hypothèse déjà éliminée qui le reste
- Statut d'hypothèse dérivé par le Core : une proposition différente est refusée
- Impacts de vérification : étayée, plausible, éliminée, affaiblie, statut déjà étayé
- Refus d'impact : investigation inactive, liste vide, vérification inconnue, impacts déjà posés, preuve ou observation inconnue, hypothèse en double, hypothèse hors `distinguishes`
- Mise à jour d'hypothèse refusée : doublon, hors `distinguishes`, sans preuve, preuve inconnue
- Raison vide, `distinguishes` en double, preuve de conclusion inconnue, rapport pour une autre investigation
- Document déjà au format `system` relu tel quel
- Refus d'ouvrir un conducteur sous tension
- `generate_report` refusé sans modifier l'état
- Ancien document `installation` relu en `system` : les `null` disparaissent, les valeurs connues restent
- Système `electric_motor` écrit puis relu

## Défaut connu : ordre des clés de `evidence`

`SQLiteInvestigationStore` écrit `state_json` avec `sort_keys=True` (`_serialize_state`). Une relecture reconstruit le dictionnaire `evidence` dans l'ordre alphabétique des identifiants. Le garde anti-boucle sans signature (`_evidence_after`) traite comme ultérieures les clés qui suivent l'identifiant de la mesure dans cet ordre, et non les preuves ajoutées plus tard dans la chronologie.

Une preuve créée après la mesure, dont l'identifiant se trie avant celui de la mesure, autorise la répétition tant que l'état reste en mémoire. Le même état, une fois figé en JSON trié ou relu depuis la base, la refuse. Le Core Python n'est pas modifié pour cela.

Les fixtures calculent l'attendu après avoir sérialisé l'entrée comme le fichier figé, puis rechargé cet objet. `answer-shade` se trie avant `m-1` et la répétition est refusée. `z-shade` se trie après `m-1` et la répétition est acceptée.

## Hors de ce gel

La transcription vocale, les limites de taille des fichiers, et `state_revision` ne sont pas figés ici. Ce sont des comportements HTTP ou de persistance déjà connus, et cette phase ne les corrige pas. Les jetons Clerk ne sont pas rejoués : l'authentification sera remplacée.
