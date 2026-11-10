# Modèle de données attendu

Le widget s'appuie sur un document Grist qui contient les tables suivantes.

| Table | Rôle |
|---|---|
| `Structures` | Arborescence des sites, directions, divisions, bureaux et services. |
| `Personnes` | Annuaire : nom, structure de rattachement. L'email est calculé : saisi par un administrateur (`Email_saisi`) ou repris du compte rattaché. |
| `Parametres` | Réglages modifiables par l'administrateur : `Contact_admin`. |
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

## Annuaire ouvert : l'email fait foi

- À la première ouverture, le widget crée la ligne `Comptes` de la personne connectée : Grist y inscrit l'email du compte, en minuscules.
- Une personne déjà présente dans l'annuaire avec cet email est reconnue automatiquement. Sinon, elle crée son profil (« Qui êtes-vous ? »).
- Pour ajouter un collègue, on saisit son nom et son email professionnel (proposé à partir du nom). Une adresse ne peut servir qu'à un seul profil.
- Le créateur peut corriger le profil tant que la personne ne s'est pas connectée ; ensuite, seul son titulaire (et un administrateur) le modifie.
- Les emails sont visibles par toutes les personnes qui ont accès au suivi.
- « Ce n'est pas moi » sur une fiche : un porteur se retire (s'il reste un autre porteur) ; un membre de l'équipe laisse un signalement au journal.
- La table `Parametres` contient l'adresse de contact de l'administrateur (`Contact_admin`), affichée en bas du widget.
- La page Grist « Profils à vérifier » liste les profils sans email, hors académie, en double ou jamais connectés depuis 30 jours.
- Les règles d'accès comparent les emails en minuscules des deux côtés (`user.Email.lower()`).

Un projet **restreint** n'est visible que par ses porteurs, son équipe, la personne qui a confié la mission et les administrateurs.

Le widget ne doit jamais contourner ces règles : il agit avec les droits de la personne connectée.
