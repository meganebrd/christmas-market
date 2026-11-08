# Créer son propre marché de Noël

Givrelune se personnalise **sans écrire de code** : tout se passe dans le dossier `content/`.

```
content/
├── market.json          ← ton village : nom, histoire, musique, personnages, zones
├── stalls/              ← une cabane = un fichier JSON
│   ├── _template.json   ← modèle à copier (les fichiers qui commencent par « _ » sont ignorés)
│   └── la-meche-doree.json …
└── generated/           ← écrit automatiquement par `npm run scan` (ne pas modifier à la main)
```

Ouvre le projet dans VS Code : grâce aux schémas de `docs/schema/`, tu as l'autocomplétion et
la validation des champs dans tous ces fichiers.

## 1. Le village (`content/market.json`)

| Champ | À quoi ça sert |
|---|---|
| `meta.title`, `meta.town`, `meta.tagline` | le nom du marché, du village et la phrase d'accroche de l'écran titre |
| `theme.timeOfDay` | `"dusk"` (heure bleue, horizon doré) ou `"night"` (nuit profonde) |
| `theme.aurora`, `theme.snow` | aurore boréale (oui/non) et densité de neige (0 à 3) |
| `story.intro` / `story.finale` | les phrases racontées pendant l'introduction et le final |
| `story.stars` | nombre d'étoiles de verre à retrouver (1 à 7) ; `story.enabled: false` désactive la quête |
| `music` | la playlist (voir plus bas) |
| `cast` | les habitants : guide, tenancier du bar, crêpière, verrier… (nom, apparence, répliques) |
| `zones` | renomme ou désactive un lieu : `"zones": { "rink": { "enabled": false } }` |

Les lieux disponibles : `gate` (l'entrée), `plaza` (le Grand Sapin), `bar`, `food`, `workshop`,
`rink` (patinoire), `belvedere`, `fair` (chamboule-tout), `carousel` (manège).

## 2. Ajouter une cabane

1. Copie `content/stalls/_template.json` vers `content/stalls/<identifiant>.json`.
2. Remplis au minimum `id` (identique au nom du fichier), `name` et `owner.name`.
3. Lance `npm run dev` : ta cabane apparaît dans l'allée.

Ou plus simple : ouvre **l'Atelier des cabanes** (`npm run dev` puis http://localhost:5173/editor.html).
Tu y règles les couleurs et la déco, tu réordonnes produits et décorations par glisser-déposer, et tu
testes la conversation avec ton personnage. Il ne reste qu'à exporter le JSON.

### L'ordre compte

- `order` place la cabane dans l'allée : les plus petits numéros sont près de l'entrée.
- L'ordre du tableau `products` est l'ordre de l'étal : les produits `featured` vont devant, sur le comptoir.
- L'ordre du tableau `decorations` est l'ordre de remplissage des emplacements libres. Tu peux aussi
  imposer un emplacement avec `slot` : `roof-ridge`, `sign`, `front-left`, `front-right`,
  `counter-left`, `counter-right`, `side-left`, `side-right`, `ground-left`, `ground-right`, `back-wall`…

Décorations disponibles : `wreath`, `garland`, `lantern`, `mini-tree`, `candles`, `gift-pile`,
`snowman`, `star-sign`, `pinecones`, `ribbon`, `teddy`, `nutcracker`, `holly`, `mistletoe`, `reindeer`,
`bell`, `sled`, `crate-apples`, `pot-plant`, `chalkboard` (avec `text`), `bunting`.

### Les produits

Deux façons de faire, qu'on peut mélanger :

```jsonc
"products": [
  // 1. juste le lien : `npm run scan` récupère le nom, l'image et le prix sur ta page produit
  { "url": "https://ma-boutique.fr/produits/bougie-sapin" },
  // 2. tout à la main
  { "name": "Bougie Sapin", "price": 24, "image": "/images/bougie.jpg", "url": "https://ma-boutique.fr/…", "featured": true }
]
```

Si `products` est vide et que le scan trouve des produits sur ton site, les 6 premiers sont affichés
(`knowledge.scan.autoProducts` pour changer ce nombre).

> **Images** : pour qu'une image s'affiche sur l'étal en 3D, le serveur qui l'héberge doit autoriser
> le CORS. Sinon, le produit est représenté par un joli paquet cadeau, mais l'image reste visible dans
> la vitrine. Pour être tranquille : `npm run scan -- --download-images` copie les images dans `public/generated/`.

## 3. Faire parler son personnage (sans IA)

Quand un visiteur pose une question, Givrelune cherche la réponse **dans tes propres textes**,
avec un petit moteur de recherche qui comprend le français (accents, pluriels, synonymes :
« tarif », « combien », « ça coûte » → prix). Rien n'est inventé.

- `knowledge.description` : écris à la première personne, comme si tu parlais devant ta cabane.
  Sépare les paragraphes par une ligne vide.
- `knowledge.faq` : les questions qu'on te pose vraiment au marché.
- `knowledge.facts` : des faits courts rangés par sujet (`livraison`, `prix`, `horaires`,
  `matières`, `contact`, `allergènes`, `entretien`…), parfaits pour des réponses précises.
- `owner.mood` donne le ton des petites phrases autour des réponses : `chaleureux`, `timide`, `enjoue`, `sage`, `farceur`.

### Scanner son site

```bash
npm run scan                       # toutes les cabanes qui ont un site
npm run scan -- la-meche-doree     # une seule cabane
npm run scan -- --url https://ma-boutique.fr --id ma-cabane
npm run scan -- --download-images  # copie aussi les images en local
```

Le scanner lit les données structurées (JSON-LD, OpenGraph), sait interroger Shopify et WooCommerce,
puis parcourt quelques pages (à propos, FAQ, livraison, contact…) en respectant `robots.txt`.
Le résultat va dans `content/generated/<id>.json` et enrichit les réponses de ton personnage.

## 4. La musique

Par défaut, une boîte à musique joue en direct des chants de Noël **du domaine public**
(Douce nuit, Mon beau sapin, Il est né le divin enfant, Les anges dans nos campagnes, Vive le vent,
Deck the Halls, We Wish You a Merry Christmas, Greensleeves) et une valse originale.
Tu es maître de la playlist :

```jsonc
"music": {
  "enabled": true,
  "volume": 0.5,
  "shuffle": false,
  "tracks": [
    { "type": "procedural", "song": "douce-nuit" },
    { "type": "file", "src": "/music/ma-chanson.mp3", "title": "Ma chanson", "author": "Moi", "license": "CC BY 4.0" }
  ]
}
```

Les fichiers audio vont dans `public/music/`. Vérifie que tu as le droit de les diffuser :
titre, auteur et licence s'affichent dans les crédits.

## 5. Publier

```bash
npm run build      # → dossier dist/ : un site statique
```

`dist/` s'héberge n'importe où (Netlify, Vercel, un hébergement mutualisé…). Pour GitHub Pages, un
workflow est fourni (`.github/workflows/deploy-pages.yml`) : active Pages (source « GitHub Actions »)
et pousse sur `main`.
