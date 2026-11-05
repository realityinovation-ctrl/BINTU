# Migrations MySQL versionnées

`bdd.sql` reste le **bootstrap** d’une base neuve (phpMyAdmin / import one-shot).

Les évolutions suivantes passent par ce dossier : fichiers `NNN_description.sql`
appliqués dans l’ordre par :

```powershell
cd backend
python migrate.py
```

Table de suivi : `schema_migrations` (`version` = nom du fichier sans `.sql`).

Règles :

1. Un fichier = une évolution additive (pas de DROP destructif sans revue).
2. Scripts **idempotents** autant que possible (`IF NOT EXISTS`, tests `information_schema`).
3. Desk et mobile partagent la même base : une migration casse les deux clients.
4. En prod VPS : `python migrate.py` **avant** de redémarrer l’API (ou `BINTU_AUTO_MIGRATE=1`).
