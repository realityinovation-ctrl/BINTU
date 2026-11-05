# Pause — référence Node, non utilisée comme runtime produit

Ce dossier est l’ancienne migration Fastify (`feature/node-backend-migration`).
Il n’est **pas** le serveur HTTP du produit. Le runtime actif est
[`../backend/`](../backend/) (FastAPI + MySQL + Google OAuth).

Ne pas faire évoluer ce code tant que le backend Python produit n’est pas
stable. Il reste une référence pour la sécurité (CSRF, Argon2, proxies) et
les tests de parité.

---

## Contenu historique

Le processus Node lit les variables d'environnement. Il ne charge pas `.env`
tout seul. Les noms documentés sont dans `.env.example`.

### Code d'amorçage

`BINTU_BOOTSTRAP_CODE` sert à créer la première organisation. Après
installation, retirez-le. Une autre organisation n’est créée que si
`BINTU_BOOTSTRAP_ALLOW_MULTIPLE=true`.

### Production

Quand `BINTU_ENV=production`, la lecture s’arrête si `BINTU_CSRF_SECRET` ou
`BINTU_SESSION_SECRET` est absent ou fait moins de 32 octets, ou si un
paramètre Argon2 est sous le minimum. Le message ne répète pas la valeur.

### Proxy de confiance

`BINTU_TRUSTED_PROXIES` : liste explicite. Vide = ignore `X-Forwarded-For`.
Pair de confiance = premier saut (à gauche) de l’en-tête.
