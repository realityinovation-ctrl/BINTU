# Backend Node

Ce dossier porte le serveur Node de la branche `feature/node-backend-migration`.
Il ne remplace pas encore le backend Python ni le frontend.

Le processus lit les variables d'environnement. Il ne charge pas `.env` tout seul.
Les noms documentés sont dans `.env.example`. Aucune valeur secrète ne va dans Git.

## Code d'amorçage

`BINTU_BOOTSTRAP_CODE` sert à créer la première organisation au moment de
l'installation. Dès que cette organisation existe, retirez ce code de
l'environnement.

Sans ce code, une inscription ne crée plus d'organisation. Une autre
organisation n'est créée avec le même code que si
`BINTU_BOOTSTRAP_ALLOW_MULTIPLE=true`.
