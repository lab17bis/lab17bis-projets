# lab17bis-projets

Interface de suivi des projets de l'académie de Reims, conçue par le Lab 17 bis.

L'interface prend la forme de **widgets personnalisés Grist** au **système de design de l'État (DSFR)**. Les données restent dans un document Grist sur l'instance `grist.numerique.gouv.fr`. Ce dépôt ne contient que l'interface.

## Ce que contient ce dépôt

- `widget-test/` : page de test qui vérifie que l'instance Grist accepte un widget hébergé sur GitHub Pages.
- `docs/` : modèle de données et règles d'accès attendues.
- `donnees-fictives/` : un jeu d'exemple inventé, pour développer sans données réelles.

## Ce que ce dépôt ne contient jamais

- Aucun fichier `.grist`, aucun export de document (CSV, XLSX, JSON) issu de la base réelle.
- Aucune clé API, aucun jeton, aucun identifiant ou adresse de document Grist.
- Aucun nom, aucune adresse électronique, aucun projet réel.

Le widget n'affiche rien seul : il lit les données du document Grist dans lequel il est intégré, avec les droits de la personne connectée.

## Brancher le widget de test

1. Activer GitHub Pages sur ce dépôt (Settings › Pages › branche `main`, dossier `/`).
2. Dans le document Grist, ajouter un widget **Personnalisé** sur la table `Projets`.
3. Saisir l'adresse : `https://lab17bis.github.io/lab17bis-projets/widget-test/`.
4. Accorder l'accès **Lecture de la table** au widget.

Si le widget affiche le nombre de projets visibles, l'hébergement fonctionne.
