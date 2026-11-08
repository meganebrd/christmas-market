# Contribuer à Givrelune

Merci de passer par ici ! Givrelune est un petit projet chaleureux, on veut qu'y contribuer le soit aussi.

## Ajouter ta cabane au marché de démonstration

1. Fork le dépôt, puis copie `content/stalls/_template.json` vers `content/stalls/<ton-id>.json`
   (ou utilise l'Atelier des cabanes : `npm run dev` → `/editor.html`).
2. Vérifie que tout va bien : `npm test`.
3. Ouvre une pull request avec une capture d'écran de ta cabane.

## Développer

```bash
npm install
npm run dev          # http://localhost:5173  (?skipIntro pour sauter l'intro, ?debug pour les fps)
npm run typecheck
npm test             # Vitest : moteur de dialogue, scanner, plan du village
npm run e2e          # Playwright : le marché s'ouvre, on parle, on visite une vitrine
node scripts/shoot.mjs --shot "plaza|__givrelune.travelTo('plaza')|2500"   # capture d'écran headless
```

L'architecture est décrite dans [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). En résumé :

- les modules ne se parlent qu'à travers `src/core/contracts.ts` et le bus d'événements ;
- tout le décor est procédural (pas de modèles 3D à télécharger) ;
- les couleurs viennent de `src/world/palette.ts` ;
- les téléphones doivent rester fluides : matériaux partagés, `InstancedMesh`, peu de vraies lumières.

## Style

- TypeScript strict, pas de dépendance ajoutée sans en discuter dans une issue.
- Textes visibles en français, au tutoiement, sur un ton chaleureux.
- Le contenu (JSON, sites scannés) n'est jamais injecté en HTML : `textContent` uniquement.

## Code de conduite

Sois bienveillant·e, patient·e et accueillant·e, comme au coin du feu.
