# ResellFlow — Achat Chine

Site de revente + système d'achat de produits chinois : on colle un lien, on obtient une fiche en
français (images, prix en euros, variantes, prix par variante), on remplit un panier multi-plateformes,
puis on envoie la commande à l'agent sur WhatsApp.

## Lancer

```sh
npm install
cp .env.example .env     # puis renseigner les clés (voir ci-dessous)
npm run dev              # http://localhost:3000
npm test                 # 124 tests (node:test)
npm run lint && npx tsc --noEmit && npm run build
```

## Import automatique (« comme Litbuy »)

Taobao et Weidian ne donnent pas leurs variantes dans leurs pages publiques et bloquent les lectures
depuis un serveur. Le site utilise donc, quand `APIFY_API_TOKEN` est défini, un **connecteur de données
produit** (acteurs Apify facturés à l'usage) puis, en secours, la lecture directe de la page.

| Plateforme              | Connecteur                                                                          | Données renvoyées                                                         |
| ----------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Taobao                  | `pizani/taobao-product-scraper` (≈ 3,49 $ / 1 000 produits, d'après sa fiche Apify) | titre, prix CNY, images, fiche technique, SKU (prix, stock, image)        |
| Weidian                 | `pizani/weidian-product-detail-api` (≈ 5 $ / 1 000, d'après sa fiche Apify)         | titre, prix CNY, images, SKU (prix, stock)                                |
| Tmall, 1688, AliExpress | aucun                                                                               | lecture directe seulement (métadonnées publiques) ; sinon saisie manuelle |

Ce que le site **ne** renvoie **pas** : avis clients et note (ces acteurs n'en fournissent pas — rien
n'est inventé), frais de port Chine (Weidian le fournit mais la fiche ne l'affiche pas).
Les noms d'axes (couleur / taille) ne sont pas fournis par Taobao : un seul sélecteur « Variante »,
chaque SKU étant une valeur (ex. « Jaune / S »).

### État de validation — à lire

Le connecteur est écrit d'après la **documentation publique** des acteurs et testé sur ses exemples
(`src/backend/china/apify.test.ts`). Il **n'a pas été exécuté contre l'API Apify réelle** (pas d'accès
réseau depuis l'environnement de développement). Avant de communiquer « ça marche » :

1. créez un compte Apify, copiez le jeton dans `.env` (`APIFY_API_TOKEN=…`) ;
2. importez 2-3 vrais liens Taobao et Weidian ;
3. vérifiez titre, prix, images et variantes face à la page d'origine.
   Les plateformes restent marquées `untested` dans `src/lib/china/platforms.ts` tant que ce test n'est pas fait.
   Les acteurs sont des outils communautaires tiers : leur fiabilité, leur prix et leurs conditions
   d'utilisation peuvent changer. Les liens courts (`e.tb.cn`) ne passent pas par le connecteur :
   utilisez l'adresse complète du produit.

### Activer l'import automatique (3 étapes)

1. Créez un compte sur apify.com, puis copiez votre **API token** (Settings > API & Integrations).
2. À la racine du projet, créez un fichier `.env` contenant : `APIFY_API_TOKEN=votre_jeton`
   (en ligne : ajoutez la même variable dans les secrets / variables d'environnement de votre hébergeur).
3. Relancez `npm run dev`, puis ouvrez **http://localhost:3000/api/china-status** :
   `"apifyConnector": true` confirme que le jeton est bien lu (aucune clé n'est affichée).
   Si le jeton manque, l'import affiche « Import automatique non activé… » au lieu d'une fausse erreur Taobao.

### Coût et sécurité

- Cache 30 min par produit, limite par client (30 / 10 min) et plafond quotidien global
  `APIFY_DAILY_LIMIT` (300 par défaut).
- Le jeton n'est lu que côté serveur, envoyé en en-tête `Authorization`, jamais dans une URL ni au navigateur.
- SSRF : seuls les domaines de plateformes autorisés sont acceptés (`src/lib/china/url.ts`) ; le
  connecteur n'appelle que `api.apify.com`.

## Clés d'environnement

Voir `.env.example`. Toutes optionnelles : sans `APIFY_API_TOKEN`, l'import automatique reste limité à
la lecture directe ; sans `DEEPL_API_KEY`, la traduction passe par MyMemory (gratuit, quota limité).

> **Sécurité — clé DeepL exposée.** Une clé DeepL était écrite en clair dans `keys.server.ts` (archive
> exportée). Ce fichier a été supprimé. **Régénérez cette clé sur DeepL** (elle a circulé) et placez la
> nouvelle dans `DEEPL_API_KEY` (variable d'environnement de votre hébergeur).

## Panier et WhatsApp

Panier persistant (localStorage), variantes jamais mélangées, 12+ articles, message WhatsApp généré avec
liens, quantités, variantes, prix et totaux estimés. L'envoi ouvre WhatsApp (`wa.me`) : l'utilisateur
confirme lui-même l'envoi. Un envoi automatique sans intervention exige WhatsApp Business Platform
(vérification d'entreprise, modèles de messages approuvés, facturation Meta).
