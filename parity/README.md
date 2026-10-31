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
- Question, puis réponse du technicien
- Mesure valide, type inconnu, mauvaise unité, valeur non finie
- Image acceptée, et refusée si l'action en attente n'est pas `analyze_image`
- Comparaison de deux mesures
- Conclusion valide avec une mesure citée
- Conclusion refusée au-dessus de 0,7 sans mesure citée
- Conclusion refusée si elle ne cite qu'une image
- Fin explicite pour informations insuffisantes
- Plafond `max_steps` = 20, sans appeler le fournisseur
- Anti-boucle : question, mesure, foyer d'image et comparaison
- Une conclusion n'est pas traitée comme une répétition
- Élimination sans preuve contradictoire forte
- Hypothèse déjà éliminée qui le reste
- Refus d'ouvrir un conducteur sous tension
- `generate_report` refusé sans modifier l'état
- Ancien document `installation` relu en `system` : les `null` disparaissent, les valeurs connues restent
- Système `electric_motor` écrit puis relu

## Hors de ce gel

La transcription vocale, les limites de taille des fichiers, et `state_revision` ne sont pas figés ici. Ce sont des comportements HTTP ou de persistance déjà connus, et cette phase ne les corrige pas. Les jetons Clerk ne sont pas rejoués : l'authentification sera remplacée.
