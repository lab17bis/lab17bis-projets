# Modèle de données attendu

Le widget s'appuie sur un document Grist qui contient les tables suivantes.

| Table | Rôle |
|---|---|
| `Structures` | Arborescence des sites, directions, divisions, bureaux et services. |
| `Personnes` | Annuaire : nom, email du compte Grist, structure de rattachement. |
| `Projets` | Fiche projet : structure porteuse, porteurs, équipe, mission confiée, phase, état, visibilité, échéance. |
| `Actions` | Plan d'action du projet : intitulé, responsable, début, fin, état. Sert au kanban, à la liste et au Gantt. |
| `Journal` | Commentaires datés laissés au fil du projet. |
| `Documents` | Liens vers les documents du projet (Nextcloud, Docs). |

## Valeurs de référence

- **Phase** : Idée, Cadrage, Construction, Expérimentation, Déploiement, Bilan, Clos.
- **État** : En cours, En pause, Bloqué, Terminé, Abandonné.
- **Visibilité** : Académique (par défaut) ou Restreint.

## Droits (appliqués dans Grist, pas dans le widget)

| Rôle Grist | Droits |
|---|---|
| Propriétaire (administrateur) | Tout. |
| Éditeur (contributeur) | Consulte les projets, en déclare. Modifie les projets dont il est porteur ou créateur. Contribue au plan d'action, au journal et aux documents des projets dont il est membre de l'équipe. |
| Lecteur | Consultation. |

Un projet **restreint** n'est visible que par ses porteurs, son équipe, la personne qui a confié la mission et les administrateurs.

Le widget ne doit jamais contourner ces règles : il agit avec les droits de la personne connectée.
