# Briefing R6

Site pour préparer nos parties de Rainbow Six Siege : 14 maps ranked, bans, compos et strats par site, adaptées au nombre de joueurs inscrits (1 à 5).

## Mettre le site en ligne (GitHub Pages)

1. Sur github.com, ouvre ce dépôt, puis **Settings** → **Pages**.
2. Dans « Build and deployment », choisis **Deploy from a branch**, branche **main**, dossier **/ (root)**, puis **Save**.
3. Après une minute, l'adresse du site s'affiche en haut de la page (du type `https://ton-pseudo.github.io/r6-briefing/`). Envoie-la à tes amis.

## Inscriptions partagées (Firebase)

Sans Firebase, le site marche en « mode local » : la liste reste sur ton appareil et tu l'envoies avec « Copier le lien de l'équipe ».
Pour que chacun s'inscrive depuis son téléphone et que tout le monde voie la même liste :

1. Va sur https://console.firebase.google.com, clique **Créer un projet** (Google Analytics inutile).
2. Dans le menu de gauche : **Créer** → **Realtime Database** → **Créer une base de données**, choisis l'Europe, puis **Démarrer en mode verrouillé**.
3. Onglet **Règles** de la base, remplace tout par ceci puis **Publier** :

   ```json
   {
     "rules": {
       "squad": {
         ".read": true,
         "$night": {
           "$player": {
             ".write": true,
             ".validate": "newData.hasChildren(['name','ts']) && newData.child('name').isString() && newData.child('name').val().length <= 16"
           }
         }
       }
     }
   }
   ```

4. Roue dentée → **Paramètres du projet** → en bas, **Ajouter une application** → icône **Web** (`</>`), donne un nom, valide.
5. Firebase affiche un bloc `const firebaseConfig = { ... }`. Copie son contenu dans `firebase-config.js` à la place de `null` (garde bien la ligne `databaseURL`).

Ces clés Firebase sont faites pour être publiques ; les règles ci-dessus limitent ce qu'on peut écrire. N'importe qui ayant l'adresse du site peut quand même ajouter ou retirer un pseudo : partage le lien seulement avec tes amis.

## Modifier le contenu

Tout le contenu (maps, sites, bans, compos, strats, conseils par nombre de joueurs) est dans `data.js`.
Les compos sont classées par priorité : avec 3 joueurs, le site donne les 3 premiers opérateurs à l'équipe et propose les autres aux randoms.

## Pièces des maps

`rooms.js` contient toutes les pièces de chaque étage (nom, position sur le plan, nom français quand il existe). Il est généré à partir de :
- [SiteRep](https://siterep.gg) : 12 maps à jour (noms du projet communautaire R6Calls, placés sur les plans officiels Ubisoft) ;
- [R6Maps](https://github.com/capajon/r6maps) (licence MIT, voir `LICENSE-R6Maps.txt`) : Kanal (plan d'avant le rework de juin 2026) et les noms français ;
- [siegestrats](https://siegestrats.com) : Villa (noms seulement, étages à vérifier).

Dans `data.js`, `SITE_ROOMS` indique quelles pièces forment chaque site (elles s'allument sur le plan).

## Plans et strats

- `plans/` : les plans officiels Ubisoft, un fichier par étage (`<map>-<étage>.jpg`, étages `b`, `1f`, `2f`, `3f`, `r` pour le toit). Les noms des pièces sont placés dessus grâce aux positions SiteRep, qui sont calées sur ces mêmes plans (1600 × 900). Les fichiers `unused-*` et `outback-*` ne servent pas.
- `strats.js` : pour chaque site, en attaque et en défense, la pièce de départ de chaque opérateur (affichée sur le plan), 3 étapes, le mur clé et les plans B quand l'adversaire banne un de nos opérateurs.

## Fichiers

- `index.html`, `style.css`, `app.js` : le site
- `data.js` : le contenu (bans, compos, strats)
- `rooms.js` : les pièces de chaque étage
- `strats.js` : les strats et plans B
- `plans/` : les plans Ubisoft
- `firebase-config.js` : la connexion à la base (facultatif)
