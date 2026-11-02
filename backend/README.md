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

## Production

Quand `BINTU_ENV=production`, la lecture de la configuration s'arrête si
`BINTU_CSRF_SECRET` ou `BINTU_SESSION_SECRET` est absent ou fait moins de
32 octets, ou si un paramètre Argon2 est absent ou inférieur au minimum
documenté. Le message cite le nom de la variable et n'affiche pas sa valeur.

## Proxy de confiance

`BINTU_TRUSTED_PROXIES` est une liste explicite d'adresses ou de plages.
Vide, `X-Forwarded-For` est ignoré. Si le pair TCP n'appartient pas à cette
liste, l'en-tête est aussi ignoré. Si le pair est de confiance, le quota
utilise le premier saut de `X-Forwarded-For`, celui de gauche. Ce n'est pas
le parcours « plus à droite hors proxy ».
