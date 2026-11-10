# Modèle de données attendu

Le widget s'appuie sur un document Grist qui contient les tables suivantes.

| Table | Rôle |
|---|---|
| `Structures` | Arborescence des sites, directions, divisions, bureaux et services. |
| `Personnes` | Annuaire : nom, structure de rattachement. L'email est calculé : saisi par un administrateur (`Email_saisi`) ou repris du compte rattaché. |
| `Comptes` | Une ligne par personne qui a ouvert le suivi. Grist y inscrit lui-même l'email du compte connecté. `Profil` relie le compte à sa ligne de l'annuaire. |
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

## Annuaire ouvert

- À la première ouverture, le widget crée la ligne `Comptes` de la personne connectée, puis lui propose « Qui êtes-vous ? ».
- Elle crée son profil, ou se rattache à un profil qu'un collègue a créé pour elle et qui n'est lié à aucun compte.
- Dans « Porteurs » et « Équipe projet », on peut ajouter une personne absente de l'annuaire. Ses droits sur le projet s'activent quand elle se rattache à ce profil.
- Personne ne saisit d'email à la main, sauf un administrateur. Un profil déjà lié à un compte ne peut pas être repris par quelqu'un d'autre.
- Chacun ne voit que son propre email ; les administrateurs voient tous les emails de l'annuaire.

Un projet **restreint** n'est visible que par ses porteurs, son équipe, la personne qui a confié la mission et les administrateurs.

Le widget ne doit jamais contourner ces règles : il agit avec les droits de la personne connectée.
