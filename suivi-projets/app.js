/*
 * Suivi des projets – widget Grist au DSFR (Lab 17 bis).
 *
 * Le widget lit et écrit dans le document Grist avec les droits de la personne
 * connectée. Il ne contourne aucune règle d'accès : si Grist refuse une écriture,
 * le widget affiche le refus.
 *
 * Hors de Grist (page ouverte directement), il charge des données fictives
 * et simule les écritures en mémoire.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Référentiels (identiques aux listes de choix du document Grist)
  // ---------------------------------------------------------------------------

  var PHASES = ['Idée', 'Cadrage', 'Construction', 'Expérimentation', 'Déploiement', 'Bilan', 'Clos'];
  var ETATS = ['En cours', 'En pause', 'Bloqué', 'Terminé', 'Abandonné'];
  var ORIGINES = ['Initiative de la structure', 'Commande de la hiérarchie', 'Feuille de route académique',
    'Plan ou réforme nationale', 'Appel à projets', "Demande d'un partenaire", 'Autre'];
  var THEMATIQUES = ['Pédagogie', "Parcours et vie de l'élève", 'Orientation', 'Inclusion', 'Examens et concours',
    'Ressources humaines', 'Formation', 'Qualité de vie au travail', 'Numérique', 'Communication', 'Pilotage',
    'Moyens et finances', 'Bâti et immobilier', "Relation à l'usager", 'Modernisation et transformation',
    'Partenariats', 'Sécurité', 'Transition écologique', 'Autre'];
  var ETATS_ACTION = ['À faire', 'En cours', 'Fait', 'Abandonné'];
  var TYPES_JOURNAL = ['Avancement', 'Décision', 'Difficulté', 'Information'];
  var TYPES_DOCUMENT = ['Note de cadrage', 'Lettre de mission', 'Compte rendu', 'Livrable', 'Présentation', 'Autre'];

  var COULEUR_PHASE = {
    'Idée': 'purple-glycine', 'Cadrage': 'blue-cumulus', 'Construction': 'blue-ecume',
    'Expérimentation': 'green-emeraude', 'Déploiement': 'green-bourgeon', 'Bilan': 'yellow-tournesol', 'Clos': ''
  };
  var COULEUR_ETAT = {
    'En cours': 'success', 'En pause': 'warning', 'Bloqué': 'error', 'Terminé': 'info', 'Abandonné': ''
  };
  var COULEUR_JOURNAL = {
    'Avancement': 'success', 'Décision': 'info', 'Difficulté': 'warning', 'Information': ''
  };

  var JOURS_ALERTE = 60;
  var TABLES = ['Structures', 'Personnes', 'Projets', 'Actions', 'Journal', 'Documents'];

  // ---------------------------------------------------------------------------
  // État de l'application
  // ---------------------------------------------------------------------------

  var DEMO = window.self === window.top;
  var data = {};      // table -> tableau de lignes
  var idx = {};       // table -> { id: ligne }
  var enfants = {};   // id de structure -> [ids enfants]
  var etat = {
    filtres: { q: '', structure: '', phase: '', etat: '', archives: false, tri: 'activite' },
    onglet: 'presentation',
    modePlan: 'liste',   // affichage du plan d'action : liste | kanban | calendrier
    pilotage: { structure: '', archives: false },
    form: null,          // valeurs du formulaire projet en cours d'édition
    formCle: null,       // route qui a initialisé le formulaire
    brouillons: {},      // saisies des petits formulaires (action, journal, document)
    alerte: null,        // { type: 'error'|'success', texte }
    suppression: null    // 'Table:id' en attente de confirmation
  };

  var app = document.getElementById('sp-app');

  // ---------------------------------------------------------------------------
  // Utilitaires
  // ---------------------------------------------------------------------------

  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function liste(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v[0] === 'L' ? v.slice(1) : v;
    if (typeof v === 'string' && v.charAt(0) === '[') {
      try { return liste(JSON.parse(v)); } catch (e) { return []; }
    }
    return [];
  }

  function versListe(arr) { return ['L'].concat(arr || []); }

  function num(v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }

  // Les colonnes Date de Grist sont des secondes depuis 1970, à minuit UTC.
  function dateTexte(sec) {
    if (!sec) return '';
    return new Date(sec * 1000).toLocaleDateString('fr-FR', { timeZone: 'UTC' });
  }
  function dateHeureTexte(sec) {
    if (!sec) return '';
    var d = new Date(sec * 1000);
    return d.toLocaleDateString('fr-FR') + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  function dateVersSaisie(sec) {
    if (!sec) return '';
    return new Date(sec * 1000).toISOString().slice(0, 10);
  }
  function saisieVersDate(txt) {
    if (!txt) return null;
    var p = txt.split('-');
    if (p.length !== 3) return null;
    return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 1000;
  }

  function lienSur(url) {
    return /^https?:\/\//i.test(String(url || '').trim());
  }

  function badge(texte, couleur, petit) {
    if (!texte) return '';
    var cls = 'fr-badge fr-badge--no-icon' + (petit === false ? '' : ' fr-badge--sm') + (couleur ? ' fr-badge--' + couleur : '');
    return '<p class="' + cls + '">' + esc(texte) + '</p>';
  }

  function resumeCourt(t) {
    t = String(t || '').replace(/\s+/g, ' ').trim();
    return t.length > 140 ? t.slice(0, 137).replace(/\s+\S*$/, '') + '…' : t;
  }

  function sansAccent(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  // ---------------------------------------------------------------------------
  // Données
  // ---------------------------------------------------------------------------

  function lignesDepuisColonnes(cols) {
    var ids = cols.id || [];
    var cles = Object.keys(cols);
    var lignes = [];
    for (var i = 0; i < ids.length; i++) {
      var l = {};
      for (var k = 0; k < cles.length; k++) l[cles[k]] = cols[cles[k]][i];
      lignes.push(l);
    }
    return lignes;
  }

  function chargerDemo() {
    return fetch('../donnees-fictives/exemple.json')
      .then(function (r) { return r.json(); })
      .then(function (json) {
        var champsDate = ['Echeance', 'Debut', 'Fin', 'Date_debut'];
        TABLES.forEach(function (t) {
          data[t] = (json[t] || []).map(function (l) {
            var copie = Object.assign({}, l);
            champsDate.forEach(function (c) {
              if (typeof copie[c] === 'string') copie[c] = saisieVersDate(copie[c]);
            });
            return copie;
          });
        });
        var maintenant = Date.now() / 1000;
        data.Journal.forEach(function (j) { if (!j.Cree_le) j.Cree_le = maintenant - 86400 * 3; if (!j.Auteur) j.Auteur = 'Camille Exemple'; });
      });
  }

  function chargerGrist() {
    return Promise.all(TABLES.map(function (t) {
      return grist.docApi.fetchTable(t)
        .then(function (cols) { data[t] = lignesDepuisColonnes(cols); })
        .catch(function () { data[t] = []; });
    }));
  }

  function charger() {
    return (DEMO ? chargerDemo() : chargerGrist()).then(indexer);
  }

  function indexer() {
    idx = {};
    TABLES.forEach(function (t) {
      idx[t] = {};
      (data[t] || []).forEach(function (l) { idx[t][l.id] = l; });
    });
    enfants = {};
    data.Structures.forEach(function (s) {
      var p = num(s.Parent);
      (enfants[p] = enfants[p] || []).push(s.id);
    });
    data.Structures.forEach(function (s) {
      if (!s.Chemin) s.Chemin = cheminStructure(s);
      if (s.Active === undefined || s.Active === null) s.Active = true;
    });
    data.Projets.forEach(completerProjet);
  }

  function cheminStructure(s) {
    var parts = [];
    var n = s;
    var garde = 0;
    while (n && garde++ < 8) {
      parts.unshift(n.Sigle || n.Nom);
      n = idx.Structures[num(n.Parent)];
    }
    return parts.join(' › ');
  }

  // Calculs faits par Grist ; refaits ici seulement s'ils manquent (mode démo).
  function completerProjet(p) {
    var acts = actionsDu(p.id).filter(function (a) { return a.Etat !== 'Abandonné'; });
    if (p.Avancement === undefined) {
      p.Avancement = acts.length ? Math.round(100 * acts.filter(function (a) { return a.Etat === 'Fait'; }).length / acts.length) : null;
    }
    if (p.Archive === undefined) {
      p.Archive = p.Phase === 'Clos' || p.Etat === 'Terminé' || p.Etat === 'Abandonné';
    }
    if (p.Derniere_activite === undefined) {
      var dates = [p.Maj_le].concat(journalDu(p.id).map(function (j) { return j.Cree_le; }))
        .concat(actionsDu(p.id).map(function (a) { return a.Maj_le; })).filter(Boolean);
      p.Derniere_activite = dates.length ? Math.max.apply(null, dates) : null;
    }
    if (p.Jours_sans_activite === undefined) {
      p.Jours_sans_activite = p.Derniere_activite ? Math.floor((Date.now() / 1000 - p.Derniere_activite) / 86400) : null;
    }
  }

  function actionsDu(id) { return (data.Actions || []).filter(function (a) { return num(a.Projet) === id; }); }
  function journalDu(id) { return (data.Journal || []).filter(function (j) { return num(j.Projet) === id; }); }
  function documentsDu(id) { return (data.Documents || []).filter(function (d) { return num(d.Projet) === id; }); }

  function nomPersonne(id) { var p = idx.Personnes[num(id)]; return p ? p.Nom : ''; }
  function nomsPersonnes(ids) { return liste(ids).map(nomPersonne).filter(Boolean).join(', '); }
  function libelleStructure(id) { var s = idx.Structures[num(id)]; return s ? (s.Sigle || s.Nom) : ''; }
  function cheminDe(id) { var s = idx.Structures[num(id)]; return s ? s.Chemin : ''; }

  function descendants(id) {
    var res = [id];
    var file = [id];
    while (file.length) {
      var e = enfants[file.shift()] || [];
      e.forEach(function (c) { res.push(c); file.push(c); });
    }
    return res;
  }

  function structuresTriees() {
    return data.Structures.filter(function (s) { return s.Active !== false; })
      .sort(function (a, b) { return String(a.Chemin).localeCompare(String(b.Chemin), 'fr'); });
  }

  function personnesTriees() {
    return data.Personnes.slice().sort(function (a, b) { return String(a.Nom).localeCompare(String(b.Nom), 'fr'); });
  }

  // ---------------------------------------------------------------------------
  // Écritures
  // ---------------------------------------------------------------------------

  function ecrire(actions) {
    if (DEMO) return Promise.resolve(ecrireDemo(actions));
    return grist.docApi.applyUserActions(actions);
  }

  function ecrireDemo(actions) {
    var retValues = [];
    actions.forEach(function (a) {
      var t = a[1];
      if (a[0] === 'AddRecord') {
        var id = (data[t].reduce(function (m, l) { return Math.max(m, l.id); }, 0)) + 1;
        var l = Object.assign({ id: id }, a[3]);
        var maintenant = Date.now() / 1000;
        if (t === 'Journal') { l.Cree_le = maintenant; l.Auteur = 'Vous (démonstration)'; }
        if (t === 'Actions') { l.Maj_le = maintenant; }
        if (t === 'Projets') { l.Maj_le = maintenant; }
        data[t].push(l);
        retValues.push(id);
      } else if (a[0] === 'UpdateRecord') {
        Object.assign(idx[t][a[2]], a[3], t === 'Projets' || t === 'Actions' ? { Maj_le: Date.now() / 1000 } : {});
        retValues.push(null);
      } else if (a[0] === 'RemoveRecord') {
        data[t] = data[t].filter(function (l) { return l.id !== a[2]; });
        retValues.push(null);
      }
    });
    data.Projets.forEach(function (p) {
      delete p.Avancement; delete p.Archive; delete p.Derniere_activite; delete p.Jours_sans_activite;
    });
    indexer();
    return { retValues: retValues };
  }

  function messageErreur(err) {
    var m = String((err && err.message) || err || '');
    if (/access|denied|blocked|permission|refus/i.test(m)) {
      return "Grist a refusé l'enregistrement : vous n'avez pas les droits pour modifier cet élément. Seuls les porteurs du projet, son équipe (pour le plan d'action, le journal et les documents) et les administrateurs peuvent écrire.";
    }
    return "L'enregistrement a échoué. Détail technique : " + m;
  }

  function executer(actions, succes, apres) {
    etat.alerte = null;
    return ecrire(actions)
      .then(function (res) {
        return (DEMO ? Promise.resolve() : charger()).then(function () {
          if (succes) etat.alerte = { type: 'success', texte: succes };
          if (apres) apres(res);
          rendre();
        });
      })
      .catch(function (err) {
        etat.alerte = { type: 'error', texte: messageErreur(err) };
        rendre();
      });
  }

  // ---------------------------------------------------------------------------
  // Routage (ancre de l'adresse)
  // ---------------------------------------------------------------------------

  function route() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    var m;
    if (h === 'nouveau') return { vue: 'form', id: null };
    if (h === 'pilotage') return { vue: 'pilotage' };
    if ((m = h.match(/^projet\/(\d+)\/modifier$/))) return { vue: 'form', id: +m[1] };
    if ((m = h.match(/^projet\/(\d+)$/))) return { vue: 'fiche', id: +m[1] };
    return { vue: 'banque' };
  }

  function aller(h) {
    if (location.hash === h) rendre(); else location.hash = h;
  }

  // ---------------------------------------------------------------------------
  // Rendu
  // ---------------------------------------------------------------------------

  function rendre() {
    var r = route();
    var html;
    if (r.vue === 'fiche') html = vueFiche(r.id);
    else if (r.vue === 'form') html = vueFormulaire(r.id);
    else if (r.vue === 'pilotage') html = vuePilotage();
    else html = vueBanque();
    app.innerHTML = html;
  }

  function blocAlerte() {
    if (!etat.alerte) return '';
    return '<div class="fr-alert fr-alert--sm fr-alert--' + etat.alerte.type + ' sp-alerte">' +
      '<p>' + esc(etat.alerte.texte) + '</p></div>';
  }

  function champSelect(id, libelle, valeur, options, attrs, vide) {
    var html = '<div class="fr-select-group"><label class="fr-label" for="' + id + '">' + esc(libelle) + '</label>' +
      '<select class="fr-select" id="' + id + '" ' + (attrs || '') + '>';
    if (vide !== false) html += '<option value="">' + esc(vide || 'Tous') + '</option>';
    options.forEach(function (o) {
      var v = typeof o === 'object' ? o.v : o;
      var t = typeof o === 'object' ? o.t : o;
      html += '<option value="' + esc(v) + '"' + (String(v) === String(valeur) ? ' selected' : '') + '>' + esc(t) + '</option>';
    });
    return html + '</select></div>';
  }

  // --- Banque des projets ----------------------------------------------------

  function projetsFiltres() {
    var f = etat.filtres;
    var q = sansAccent(f.q.trim());
    var structs = f.structure ? descendants(num(f.structure)) : null;
    var liste_ = data.Projets.filter(function (p) {
      if (!f.archives && p.Archive) return false;
      if (f.phase && p.Phase !== f.phase) return false;
      if (f.etat && p.Etat !== f.etat) return false;
      if (structs && structs.indexOf(num(p.Structure_porteuse)) === -1) return false;
      if (q) {
        var texte = sansAccent([p.Titre, p.Resume, p.Mission, cheminDe(p.Structure_porteuse),
          nomsPersonnes(p.Porteurs), liste(p.Thematiques).join(' ')].join(' '));
        if (texte.indexOf(q) === -1) return false;
      }
      return true;
    });
    liste_.sort(function (a, b) {
      if (f.tri === 'echeance') return (a.Echeance || 9e12) - (b.Echeance || 9e12);
      if (f.tri === 'titre') return String(a.Titre).localeCompare(String(b.Titre), 'fr');
      return (b.Derniere_activite || 0) - (a.Derniere_activite || 0);
    });
    return liste_;
  }

  function vueBanque() {
    var f = etat.filtres;
    var projets = projetsFiltres();
    var html = navigation('banque') + blocAlerte();
    html += '<div class="sp-titre-ligne"><div><h1 class="fr-h3">Banque des projets</h1>' +
      '<p class="fr-mb-0">' + projets.length + ' projet' + (projets.length > 1 ? 's' : '') + ' affiché' + (projets.length > 1 ? 's' : '') + '</p></div>' +
      '<button class="fr-btn fr-icon-add-line fr-btn--icon-left" data-action="nouveau">Déclarer un projet</button></div>';

    html += '<div class="sp-filtres">' +
      '<div class="fr-input-group"><label class="fr-label" for="f-q">Rechercher</label>' +
      '<input class="fr-input" id="f-q" type="search" data-filtre="q" value="' + esc(f.q) + '" placeholder="Titre, structure, porteur…"></div>' +
      champSelect('f-structure', 'Structure (et ses services)', f.structure,
        structuresTriees().map(function (s) { return { v: s.id, t: s.Chemin }; }), 'data-filtre="structure"', 'Toutes') +
      champSelect('f-phase', 'Phase', f.phase, PHASES, 'data-filtre="phase"', 'Toutes') +
      champSelect('f-etat', 'État', f.etat, ETATS, 'data-filtre="etat"') +
      champSelect('f-tri', 'Trier par', f.tri, [
        { v: 'activite', t: 'Activité la plus récente' }, { v: 'echeance', t: 'Échéance la plus proche' }, { v: 'titre', t: 'Titre' }
      ], 'data-filtre="tri"', false) +
      '<div class="fr-checkbox-group"><input type="checkbox" id="f-archives" data-filtre="archives"' + (f.archives ? ' checked' : '') + '>' +
      '<label class="fr-label" for="f-archives">Inclure les projets terminés et archivés</label></div>' +
      '</div>';

    if (!projets.length) {
      html += data.Projets.length
        ? '<p class="sp-vide">Aucun projet ne correspond à ces critères.</p>'
        : '<div class="fr-callout"><h2 class="fr-callout__title fr-h5">Aucun projet déclaré pour l\'instant</h2>' +
          '<p class="fr-callout__text">La banque se remplit au fil des déclarations. Commencez par « Déclarer un projet ».</p></div>';
      return html;
    }

    html += '<div class="sp-cartes">' + projets.map(carteProjet).join('') + '</div>';
    return html;
  }

  function carteProjet(p) {
    var badges = '<li>' + badge(p.Phase, COULEUR_PHASE[p.Phase]) + '</li><li>' + badge(p.Etat, COULEUR_ETAT[p.Etat]) + '</li>';
    if (p.Visibilite === 'Restreint') badges += '<li>' + badge('Restreint', 'orange-terre-battue') + '</li>';
    if (!p.Archive && p.Jours_sans_activite !== null && p.Jours_sans_activite >= JOURS_ALERTE) {
      badges += '<li>' + badge('Sans activité depuis ' + p.Jours_sans_activite + ' j', 'error') + '</li>';
    }
    var details = [];
    if (p.Echeance) details.push('Échéance : ' + dateTexte(p.Echeance));
    if (p.Avancement !== null && p.Avancement !== undefined) details.push(p.Avancement + ' % des actions faites');

    return '<div class="fr-card fr-enlarge-link">' +
      '<div class="fr-card__body"><div class="fr-card__content">' +
      '<h2 class="fr-card__title"><a href="#/projet/' + p.id + '">' + esc(p.Titre || 'Projet sans titre') + '</a></h2>' +
      (p.Resume ? '<p class="fr-card__desc">' + esc(resumeCourt(p.Resume)) + '</p>' : '') +
      '<div class="fr-card__start"><ul class="sp-badges">' + badges + '</ul>' +
      '<p class="fr-card__detail fr-icon-building-line">' + esc(libelleStructure(p.Structure_porteuse) || 'Structure non renseignée') + '</p></div>' +
      '<div class="fr-card__end">' +
      (nomsPersonnes(p.Porteurs) ? '<p class="fr-card__detail fr-icon-user-line">' + esc(nomsPersonnes(p.Porteurs)) + '</p>' : '') +
      (details.length ? '<p class="fr-card__detail">' + esc(details.join(' · ')) + '</p>' : '') +
      '</div></div></div></div>';
  }

  // --- Fiche projet ----------------------------------------------------------

  function vueFiche(id) {
    var p = idx.Projets[id];
    if (!p) {
      return '<p><a class="fr-link fr-icon-arrow-left-line fr-link--icon-left" href="#/">Banque des projets</a></p>' +
        '<p>Ce projet n\'existe pas, ou vous n\'avez pas le droit de le consulter.</p>';
    }
    var acts = actionsDu(id), jour = journalDu(id), docs = documentsDu(id);
    var html = '<p><a class="fr-link fr-icon-arrow-left-line fr-link--icon-left" href="#/">Banque des projets</a></p>' + blocAlerte();

    html += '<div class="sp-titre-ligne"><div>' +
      '<ul class="sp-badges"><li>' + badge(p.Phase, COULEUR_PHASE[p.Phase], false) + '</li><li>' + badge(p.Etat, COULEUR_ETAT[p.Etat], false) + '</li>' +
      (p.Visibilite === 'Restreint' ? '<li>' + badge('Restreint', 'orange-terre-battue', false) + '</li>' : '') + '</ul>' +
      '<h1 class="fr-h2">' + esc(p.Titre || 'Projet sans titre') + '</h1>' +
      '<p class="sp-fiche-meta fr-mb-0">' + esc(cheminDe(p.Structure_porteuse) || 'Structure non renseignée') + '</p></div>' +
      '<a class="fr-btn fr-btn--secondary fr-icon-edit-line fr-btn--icon-left" href="#/projet/' + id + '/modifier">Modifier la fiche</a></div>';

    var onglets = [
      ['presentation', 'Présentation'],
      ['plan', "Plan d'action (" + acts.length + ')'],
      ['journal', 'Journal (' + jour.length + ')'],
      ['documents', 'Documents (' + docs.length + ')']
    ];
    html += '<fieldset class="fr-segmented fr-segmented--no-legend sp-onglets"><legend class="fr-segmented__legend">Sections de la fiche</legend>' +
      '<div class="fr-segmented__elements">' + onglets.map(function (o) {
        return '<div class="fr-segmented__element"><input type="radio" name="sp-onglet" id="o-' + o[0] + '" value="' + o[0] + '" data-onglet' +
          (etat.onglet === o[0] ? ' checked' : '') + '><label class="fr-label" for="o-' + o[0] + '">' + esc(o[1]) + '</label></div>';
      }).join('') + '</div></fieldset>';

    if (etat.onglet === 'plan') html += ongletPlan(p, acts);
    else if (etat.onglet === 'journal') html += ongletJournal(p, jour);
    else if (etat.onglet === 'documents') html += ongletDocuments(p, docs);
    else html += ongletPresentation(p);
    return html;
  }

  function info(titre, valeur) {
    return '<div><dt>' + esc(titre) + '</dt><dd>' + (valeur ? valeur : '<span class="sp-vide">Non renseigné</span>') + '</dd></div>';
  }

  function ongletPresentation(p) {
    var html = '';
    if (p.Resume) html += '<div class="sp-section"><h3>En bref</h3><p class="sp-texte">' + esc(p.Resume) + '</p></div>';

    if (p.Mission || p.Commanditaire) {
      html += '<div class="fr-callout sp-section"><h3 class="fr-callout__title">Mission confiée' +
        (nomPersonne(p.Commanditaire) ? ' par ' + esc(nomPersonne(p.Commanditaire)) : '') + '</h3>' +
        '<p class="fr-callout__text sp-texte">' + esc(p.Mission || 'Consigne non renseignée.') + '</p></div>';
    }
    if (p.Objectifs) html += '<div class="sp-section"><h3>Objectifs attendus</h3><p class="sp-texte">' + esc(p.Objectifs) + '</p></div>';

    var themes = liste(p.Thematiques).map(function (t) { return '<li><p class="fr-tag fr-tag--sm">' + esc(t) + '</p></li>'; }).join('');
    var associees = liste(p.Structures_associees).map(libelleStructure).filter(Boolean).join(', ');

    html += '<dl class="sp-infos">' +
      info('Porteurs', esc(nomsPersonnes(p.Porteurs))) +
      info('Équipe projet', esc(nomsPersonnes(p.Equipe))) +
      info('Structures associées', esc(associees)) +
      info('Origine', esc(p.Origine)) +
      info('Début', esc(dateTexte(p.Date_debut))) +
      info('Échéance prévisionnelle', esc(dateTexte(p.Echeance))) +
      info('Avancement', p.Avancement !== null && p.Avancement !== undefined ? esc(p.Avancement + ' % des actions faites') : '') +
      info('Dernière activité', esc(dateHeureTexte(p.Derniere_activite))) +
      info('Thématiques', themes ? '<ul class="fr-tags-group">' + themes + '</ul>' : '') +
      '</dl>';
    return html;
  }

  function optionsPersonnes(valeur, projet) {
    // Les membres du projet d'abord, puis le reste de l'annuaire.
    var membres = liste(projet.Porteurs).concat(liste(projet.Equipe)).map(num);
    var tri = personnesTriees();
    var dedans = tri.filter(function (x) { return membres.indexOf(x.id) !== -1; });
    var dehors = tri.filter(function (x) { return membres.indexOf(x.id) === -1; });
    return dedans.concat(dehors).map(function (x) { return { v: x.id, t: x.Nom }; });
  }

  function brouillon(cle) { return (etat.brouillons[cle] = etat.brouillons[cle] || {}); }

  function boutonSuppression(table, id) {
    var cle = table + ':' + id;
    if (etat.suppression === cle) {
      return '<span class="sp-actions-ligne">' +
        '<button class="fr-btn fr-btn--sm fr-btn--secondary" data-action="supprimer" data-table="' + table + '" data-id="' + id + '">Confirmer la suppression</button>' +
        '<button class="fr-btn fr-btn--sm fr-btn--tertiary-no-outline" data-action="annuler-suppression">Annuler</button></span>';
    }
    return '<button class="fr-btn fr-btn--sm fr-btn--tertiary-no-outline fr-icon-delete-line" title="Supprimer" ' +
      'data-action="demander-suppression" data-table="' + table + '" data-id="' + id + '">Supprimer</button>';
  }

  function ongletPlan(p, acts) {
    var b = brouillon('action-' + p.id);
    var html = '<form class="sp-ajout" data-form="action" data-projet="' + p.id + '">' +
      '<div class="fr-input-group"><label class="fr-label" for="a-intitule">Nouvelle action</label>' +
      '<input class="fr-input" id="a-intitule" data-brouillon="action-' + p.id + '" data-champ="Intitule" value="' + esc(b.Intitule || '') + '" required></div>' +
      champSelect('a-resp', 'Responsable', b.Responsable || '', optionsPersonnes(b.Responsable, p),
        'data-brouillon="action-' + p.id + '" data-champ="Responsable"', 'Non attribuée') +
      '<div class="fr-input-group"><label class="fr-label" for="a-debut">Début</label>' +
      '<input class="fr-input" type="date" id="a-debut" data-brouillon="action-' + p.id + '" data-champ="Debut" value="' + esc(b.Debut || '') + '"></div>' +
      '<div class="fr-input-group"><label class="fr-label" for="a-fin">Fin</label>' +
      '<input class="fr-input" type="date" id="a-fin" data-brouillon="action-' + p.id + '" data-champ="Fin" value="' + esc(b.Fin || '') + '"></div>' +
      '<button class="fr-btn fr-icon-add-line fr-btn--icon-left" type="submit">Ajouter</button></form>';

    if (!acts.length) return html + '<p class="sp-vide">Aucune action pour l\'instant.</p>';

    html += selecteurMode('plan', etat.modePlan, [
      ['liste', 'Liste'], ['kanban', 'Kanban'], ['calendrier', 'Calendrier']
    ], "Affichage du plan d'action");

    if (etat.modePlan === 'kanban') return html + kanbanActions(acts);
    if (etat.modePlan === 'calendrier') {
      return html + gantt(acts.map(function (a) {
        return {
          libelle: a.Intitule, meta: nomPersonne(a.Responsable), debut: a.Debut, fin: a.Fin,
          classe: 'sp-barre--' + classeEtat(a.Etat || 'À faire')
        };
      }), "Calendrier du plan d'action");
    }

    var ordre = { 'En cours': 0, 'À faire': 1, 'Fait': 2, 'Abandonné': 3 };
    acts = acts.slice().sort(function (a, c) {
      return (ordre[a.Etat || 'À faire'] - ordre[c.Etat || 'À faire']) || ((a.Fin || 9e12) - (c.Fin || 9e12));
    });

    html += '<div class="sp-defile"><table class="sp-table"><thead><tr><th>Action</th><th>Responsable</th><th>Période</th><th>État</th><th><span class="fr-sr-only">Supprimer</span></th></tr></thead><tbody>';
    acts.forEach(function (a) {
      var periode = [dateTexte(a.Debut), dateTexte(a.Fin)].filter(Boolean).join(' → ');
      html += '<tr class="' + (a.Etat === 'Fait' ? 'sp-table--fait' : '') + '">' +
        '<td>' + esc(a.Intitule) + '</td>' +
        '<td>' + esc(nomPersonne(a.Responsable)) + '</td>' +
        '<td>' + esc(periode) + '</td>' +
        '<td><label class="fr-sr-only" for="e-' + a.id + '">État de l\'action</label><select class="fr-select" id="e-' + a.id + '" data-etat-action="' + a.id + '">' +
        ETATS_ACTION.map(function (e) { return '<option' + ((a.Etat || 'À faire') === e ? ' selected' : '') + '>' + esc(e) + '</option>'; }).join('') +
        '</select></td>' +
        '<td>' + boutonSuppression('Actions', a.id) + '</td></tr>';
    });
    return html + '</tbody></table></div>';
  }

  function ongletJournal(p, jour) {
    var b = brouillon('journal-' + p.id);
    var html = '<form class="sp-ajout sp-ajout--large" data-form="journal" data-projet="' + p.id + '">' +
      champSelect('j-type', 'Type', b.Type || 'Avancement', TYPES_JOURNAL, 'data-brouillon="journal-' + p.id + '" data-champ="Type"', false) +
      '<div class="fr-input-group"><label class="fr-label" for="j-message">Où en est le projet ?' +
      '<span class="fr-hint-text">Quelques lignes suffisent : ce qui avance, ce qui bloque, ce qui a été décidé.</span></label>' +
      '<textarea class="fr-input" id="j-message" rows="3" data-brouillon="journal-' + p.id + '" data-champ="Message" required>' + esc(b.Message || '') + '</textarea></div>' +
      '<div><button class="fr-btn fr-icon-send-plane-line fr-btn--icon-left" type="submit">Publier dans le journal</button></div></form>';

    if (!jour.length) return html + '<p class="sp-vide">Le journal est vide.</p>';

    jour = jour.slice().sort(function (a, c) { return (c.Cree_le || 0) - (a.Cree_le || 0); });
    html += '<ol class="sp-journal">' + jour.map(function (j) {
      return '<li><p class="sp-journal__meta">' + badge(j.Type, COULEUR_JOURNAL[j.Type]) + ' ' +
        esc(dateHeureTexte(j.Cree_le)) + (j.Auteur ? ' · ' + esc(j.Auteur) : '') + '</p>' +
        '<p class="sp-texte fr-mb-1v">' + esc(j.Message) + '</p>' + boutonSuppression('Journal', j.id) + '</li>';
    }).join('') + '</ol>';
    return html;
  }

  function ongletDocuments(p, docs) {
    var b = brouillon('document-' + p.id);
    var html = '<form class="sp-ajout" data-form="document" data-projet="' + p.id + '">' +
      '<div class="fr-input-group"><label class="fr-label" for="d-titre">Titre du document</label>' +
      '<input class="fr-input" id="d-titre" data-brouillon="document-' + p.id + '" data-champ="Titre" value="' + esc(b.Titre || '') + '" required></div>' +
      champSelect('d-type', 'Type', b.Type || '', TYPES_DOCUMENT, 'data-brouillon="document-' + p.id + '" data-champ="Type"', 'Choisir') +
      '<div class="fr-input-group"><label class="fr-label" for="d-lien">Lien<span class="fr-hint-text">Adresse Nextcloud, Docs… commençant par https://</span></label>' +
      '<input class="fr-input" type="url" id="d-lien" data-brouillon="document-' + p.id + '" data-champ="Lien" value="' + esc(b.Lien || '') + '" required></div>' +
      '<button class="fr-btn fr-icon-add-line fr-btn--icon-left" type="submit">Ajouter</button></form>';

    if (!docs.length) return html + '<p class="sp-vide">Aucun document lié.</p>';

    html += '<div class="sp-defile"><table class="sp-table"><thead><tr><th>Document</th><th>Type</th><th><span class="fr-sr-only">Supprimer</span></th></tr></thead><tbody>';
    docs.forEach(function (d) {
      var titre = esc(d.Titre || d.Lien);
      var lien = lienSur(d.Lien)
        ? '<a class="fr-link" href="' + esc(d.Lien) + '" target="_blank" rel="noopener noreferrer">' + titre + '</a>'
        : titre;
      html += '<tr><td>' + lien + '</td><td>' + esc(d.Type) + '</td><td>' + boutonSuppression('Documents', d.id) + '</td></tr>';
    });
    return html + '</tbody></table></div>';
  }

  // --- Composants partagés : navigation, sélecteur de mode, kanban, calendrier --

  function navigation(active) {
    var liens = [['banque', '#/', 'Banque des projets'], ['pilotage', '#/pilotage', "Vue d'ensemble"]];
    return '<nav class="sp-nav" aria-label="Vues du suivi"><ul>' + liens.map(function (l) {
      return '<li><a href="' + l[1] + '"' + (l[0] === active ? ' aria-current="page"' : '') + '>' + esc(l[2]) + '</a></li>';
    }).join('') + '</ul></nav>';
  }

  function selecteurMode(nom, valeur, modes, legende) {
    return '<fieldset class="fr-segmented fr-segmented--sm sp-mode"><legend class="fr-segmented__legend fr-segmented__legend--inline">' +
      esc(legende) + '</legend><div class="fr-segmented__elements">' + modes.map(function (m) {
        return '<div class="fr-segmented__element"><input type="radio" name="sp-mode-' + nom + '" id="m-' + nom + '-' + m[0] +
          '" value="' + m[0] + '" data-mode="' + nom + '"' + (valeur === m[0] ? ' checked' : '') + '>' +
          '<label class="fr-label" for="m-' + nom + '-' + m[0] + '">' + esc(m[1]) + '</label></div>';
      }).join('') + '</div></fieldset>';
  }

  function classeEtat(e) {
    return ({ 'À faire': 'afaire', 'En cours': 'encours', 'Fait': 'fait', 'Abandonné': 'abandon',
      'En pause': 'pause', 'Bloqué': 'bloque', 'Terminé': 'fait' })[e] || 'afaire';
  }

  function periodeTexte(debut, fin) {
    if (debut && fin) return dateTexte(debut) + ' → ' + dateTexte(fin);
    if (fin) return "Jusqu'au " + dateTexte(fin);
    if (debut) return 'À partir du ' + dateTexte(debut);
    return '';
  }

  // Colonnes génériques : chaque carte se déplace par glisser-déposer
  // ou avec les boutons (accessibles au clavier).
  function kanban(colonnes, cartes, table, champ, rendreCarte) {
    return '<div class="sp-kanban" style="--sp-colonnes:' + colonnes.length + '">' + colonnes.map(function (col, i) {
      var items = cartes.filter(function (c) { return c._colonne === col; });
      return '<section class="sp-colonne" data-drop-table="' + table + '" data-drop-champ="' + champ + '" data-drop-valeur="' + esc(col) + '">' +
        '<h3 class="sp-colonne__titre">' + esc(col) + ' <span class="sp-colonne__nombre">' + items.length + '</span></h3>' +
        items.map(function (c) {
          var prec = i > 0 ? colonnes[i - 1] : null;
          var suiv = i < colonnes.length - 1 ? colonnes[i + 1] : null;
          return '<div class="sp-ticket" draggable="true" data-drag="' + table + ':' + c.id + '">' + rendreCarte(c) +
            '<div class="sp-ticket__boutons">' +
            (prec ? '<button type="button" class="fr-btn fr-btn--sm fr-btn--tertiary-no-outline fr-icon-arrow-left-s-line" ' +
              'title="Passer en « ' + esc(prec) + ' »" data-action="deplacer" data-table="' + table + '" data-champ="' + champ +
              '" data-id="' + c.id + '" data-valeur="' + esc(prec) + '">Vers « ' + esc(prec) + ' »</button>' : '<span></span>') +
            (suiv ? '<button type="button" class="fr-btn fr-btn--sm fr-btn--tertiary-no-outline fr-icon-arrow-right-s-line" ' +
              'title="Passer en « ' + esc(suiv) + ' »" data-action="deplacer" data-table="' + table + '" data-champ="' + champ +
              '" data-id="' + c.id + '" data-valeur="' + esc(suiv) + '">Vers « ' + esc(suiv) + ' »</button>' : '') +
            '</div></div>';
        }).join('') +
        (items.length ? '' : '<p class="sp-colonne__vide">Déposez une carte ici</p>') +
        '</section>';
    }).join('') + '</div>';
  }

  function kanbanActions(acts) {
    var cartes = acts.map(function (a) { return Object.assign({ _colonne: a.Etat || 'À faire' }, a); });
    return kanban(ETATS_ACTION, cartes, 'Actions', 'Etat', function (a) {
      var meta = [nomPersonne(a.Responsable), periodeTexte(a.Debut, a.Fin)].filter(Boolean).join(' · ');
      return '<p class="sp-ticket__titre">' + esc(a.Intitule) + '</p>' +
        (meta ? '<p class="sp-ticket__meta">' + esc(meta) + '</p>' : '');
    });
  }

  var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

  // Calendrier (diagramme de Gantt) : items = { libelle, lien?, meta?, debut, fin, classe }
  function gantt(items, titre) {
    var dates = [];
    items.forEach(function (it) { if (it.debut) dates.push(it.debut); if (it.fin) dates.push(it.fin); });
    var sansDate = items.filter(function (it) { return !it.debut && !it.fin; });
    if (!dates.length) {
      return '<p class="sp-vide">Aucune date renseignée : ajoutez un début ou une fin pour afficher le calendrier.</p>';
    }
    var aujourdHui = Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()) / 1000;
    var min = Math.min.apply(null, dates.concat([aujourdHui]));
    var max = Math.max.apply(null, dates.concat([aujourdHui]));
    var d0 = new Date(min * 1000);
    var d1 = new Date(max * 1000);
    var debut = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1) / 1000;
    var fin = Date.UTC(d1.getUTCFullYear(), d1.getUTCMonth() + 1, 1) / 1000;
    var duree = fin - debut;
    var pct = function (s) { return (100 * (s - debut) / duree).toFixed(3); };

    var mois = [];
    var y = d0.getUTCFullYear(), m = d0.getUTCMonth();
    while (Date.UTC(y, m, 1) / 1000 < fin) {
      mois.push({ s: Date.UTC(y, m, 1) / 1000, t: MOIS[m] + (m === 0 || !mois.length ? ' ' + y : '') });
      m++; if (m > 11) { m = 0; y++; }
    }
    var pas = mois.length > 18 ? 3 : (mois.length > 9 ? 2 : 1);
    var graduation = mois.map(function (mo, i) {
      return '<span class="sp-gantt__mois" style="left:' + pct(mo.s) + '%">' + (i % pas === 0 ? esc(mo.t) : '') + '</span>';
    }).join('');
    var repere = '<span class="sp-gantt__jour" style="left:' + pct(aujourdHui) + '%" title="Aujourd\'hui"></span>';

    var lignes = items.filter(function (it) { return it.debut || it.fin; }).sort(function (a, b) {
      return (a.debut || a.fin) - (b.debut || b.fin);
    }).map(function (it) {
      var a = it.debut || it.fin, b = it.fin || it.debut;
      if (b < a) { var t = a; a = b; b = t; }
      var jalon = !it.debut || !it.fin;
      var periode = periodeTexte(it.debut, it.fin);
      var forme = jalon
        ? '<span class="sp-gantt__jalon ' + (it.classe || '') + '" style="left:' + pct(a) + '%"></span>'
        : '<span class="sp-gantt__barre ' + (it.classe || '') + '" style="left:' + pct(a) + '%;width:' +
          Math.max(0.8, 100 * (b - a + 86400) / duree).toFixed(3) + '%"></span>';
      var lib = it.lien ? '<a href="' + esc(it.lien) + '">' + esc(it.libelle) + '</a>' : esc(it.libelle);
      return '<div class="sp-gantt__ligne" role="row">' +
        '<div class="sp-gantt__libelle" role="rowheader">' + lib +
        '<span class="sp-gantt__meta">' + esc([it.meta, periode].filter(Boolean).join(' · ')) + '</span></div>' +
        '<div class="sp-gantt__piste" role="cell" title="' + esc(periode) + '">' + repere + forme +
        '<span class="fr-sr-only">' + esc(periode) + '</span></div></div>';
    }).join('');

    return '<div class="sp-defile"><div class="sp-gantt" role="table" aria-label="' + esc(titre) + '">' +
      '<div class="sp-gantt__ligne sp-gantt__entete" role="row"><div role="columnheader"><span class="fr-sr-only">Élément</span></div>' +
      '<div class="sp-gantt__piste" role="columnheader">' + graduation + repere + '</div></div>' +
      lignes + '</div></div>' +
      '<p class="sp-gantt__legende"><span class="sp-gantt__jour-legende"></span> Aujourd\'hui' +
      (sansDate.length ? ' · ' + sansDate.length + ' élément' + (sansDate.length > 1 ? 's' : '') + ' sans date non affiché' + (sansDate.length > 1 ? 's' : '') : '') +
      '</p>';
  }

  // --- Vue d'ensemble (pilotage) ---------------------------------------------

  function aujourdhuiSec() {
    var n = new Date();
    return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / 1000;
  }

  function enRetard(p) { return !p.Archive && p.Echeance && p.Echeance < aujourdhuiSec(); }
  function endormi(p) { return !p.Archive && p.Jours_sans_activite !== null && p.Jours_sans_activite !== undefined && p.Jours_sans_activite >= JOURS_ALERTE; }

  // Rattache une structure à son niveau « direction » (2e niveau de l'arborescence).
  function niveauDirection(id) {
    var chaine = [];
    var s = idx.Structures[num(id)];
    var garde = 0;
    while (s && garde++ < 8) { chaine.unshift(s); s = idx.Structures[num(s.Parent)]; }
    var cible = chaine[1] || chaine[0];
    return cible ? cible.id : 0;
  }

  function signaux(p) {
    var s = '';
    if (p.Etat === 'Bloqué') s += '<li>' + badge('Bloqué', 'error') + '</li>';
    if (endormi(p)) s += '<li>' + badge('Sans activité depuis ' + p.Jours_sans_activite + ' j', 'warning') + '</li>';
    if (enRetard(p)) s += '<li>' + badge('Échéance dépassée', 'orange-terre-battue') + '</li>';
    return s ? '<ul class="sp-badges">' + s + '</ul>' : '';
  }

  function vuePilotage() {
    var f = etat.pilotage;
    var structs = f.structure ? descendants(num(f.structure)) : null;
    var projets = data.Projets.filter(function (p) {
      if (!f.archives && p.Archive) return false;
      if (structs && structs.indexOf(num(p.Structure_porteuse)) === -1) return false;
      return true;
    });
    var actifs = projets.filter(function (p) { return !p.Archive; });

    var html = navigation('pilotage') + blocAlerte() +
      '<div class="sp-titre-ligne"><div><h1 class="fr-h3">Vue d\'ensemble</h1>' +
      '<p class="fr-mb-0">Où en sont les projets, et lesquels demandent une relance.</p></div></div>' +
      '<div class="sp-filtres">' +
      champSelect('pf-structure', 'Structure (et ses services)', f.structure,
        structuresTriees().map(function (s) { return { v: s.id, t: s.Chemin }; }), 'data-pilotage="structure"', 'Toutes') +
      '<div class="fr-checkbox-group"><input type="checkbox" id="pf-archives" data-pilotage="archives"' + (f.archives ? ' checked' : '') + '>' +
      '<label class="fr-label" for="pf-archives">Inclure les projets terminés et archivés</label></div></div>';

    if (!data.Projets.length) {
      return html + '<div class="fr-callout"><h2 class="fr-callout__title fr-h5">Aucun projet déclaré pour l\'instant</h2>' +
        '<p class="fr-callout__text">La vue d\'ensemble s\'alimente à partir des projets déclarés dans la banque.</p></div>';
    }

    var chiffres = [
      [actifs.length, 'projets en cours de vie', ''],
      [actifs.filter(function (p) { return p.Etat === 'Bloqué'; }).length, 'projets bloqués', 'error'],
      [actifs.filter(endormi).length, 'sans activité depuis ' + JOURS_ALERTE + ' jours ou plus', 'warning'],
      [actifs.filter(enRetard).length, 'à échéance dépassée', 'warning']
    ];
    html += '<ul class="sp-chiffres">' + chiffres.map(function (c) {
      return '<li class="sp-chiffre' + (c[2] && c[0] ? ' sp-chiffre--' + c[2] : '') + '"><span class="sp-chiffre__valeur">' + c[0] +
        '</span><span class="sp-chiffre__libelle">' + esc(c[1]) + '</span></li>';
    }).join('') + '</ul>';

    // Projets à relancer
    var aRelancer = actifs.filter(function (p) { return p.Etat === 'Bloqué' || endormi(p) || enRetard(p); })
      .sort(function (a, b) { return (b.Jours_sans_activite || 0) - (a.Jours_sans_activite || 0); });
    html += '<h2 class="fr-h5 fr-mt-4w">Projets à relancer (' + aRelancer.length + ')</h2>';
    if (!aRelancer.length) {
      html += '<p class="sp-vide">Aucun projet bloqué, endormi ou en retard.</p>';
    } else {
      html += '<div class="sp-defile"><table class="sp-table"><thead><tr><th>Projet</th><th>Structure</th><th>Porteurs</th>' +
        '<th>Signaux</th><th>Dernière activité</th></tr></thead><tbody>' + aRelancer.map(function (p) {
          return '<tr><td><a class="fr-link" href="#/projet/' + p.id + '">' + esc(p.Titre || 'Projet sans titre') + '</a></td>' +
            '<td>' + esc(libelleStructure(p.Structure_porteuse)) + '</td>' +
            '<td>' + esc(nomsPersonnes(p.Porteurs)) + '</td>' +
            '<td>' + signaux(p) + '</td>' +
            '<td>' + esc(dateTexte(p.Derniere_activite)) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }

    // Projets par phase
    var colonnes = f.archives ? PHASES : PHASES.filter(function (ph) { return ph !== 'Clos'; });
    html += '<h2 class="fr-h5 fr-mt-4w">Projets par phase</h2>' +
      '<p class="fr-hint-text">Déplacer une carte change la phase du projet. Seuls ses porteurs et les administrateurs peuvent le faire.</p>' +
      kanban(colonnes, projets.map(function (p) { return Object.assign({ _colonne: p.Phase || 'Idée' }, p); }), 'Projets', 'Phase', function (p) {
        return '<p class="sp-ticket__titre"><a href="#/projet/' + p.id + '">' + esc(p.Titre || 'Projet sans titre') + '</a></p>' +
          '<p class="sp-ticket__meta">' + esc(libelleStructure(p.Structure_porteuse)) + '</p>' +
          '<ul class="sp-badges">' + '<li>' + badge(p.Etat, COULEUR_ETAT[p.Etat]) + '</li>' +
          (p.Visibilite === 'Restreint' ? '<li>' + badge('Restreint', 'orange-terre-battue') + '</li>' : '') + '</ul>';
      });

    // Calendrier des projets
    html += '<h2 class="fr-h5 fr-mt-4w">Calendrier des projets</h2>' +
      gantt(projets.map(function (p) {
        return {
          libelle: p.Titre || 'Projet sans titre', lien: '#/projet/' + p.id, meta: libelleStructure(p.Structure_porteuse),
          debut: p.Date_debut, fin: p.Echeance, classe: 'sp-barre--' + classeEtat(p.Etat)
        };
      }), 'Calendrier des projets');

    // Répartition par structure
    var groupes = {};
    projets.forEach(function (p) {
      var k = niveauDirection(p.Structure_porteuse);
      var g = groupes[k] = groupes[k] || { total: 0, actifs: 0, bloques: 0, relance: 0 };
      g.total++;
      if (!p.Archive) g.actifs++;
      if (!p.Archive && p.Etat === 'Bloqué') g.bloques++;
      if (endormi(p) || enRetard(p)) g.relance++;
    });
    var cles = Object.keys(groupes).sort(function (a, b) { return groupes[b].total - groupes[a].total; });
    html += '<h2 class="fr-h5 fr-mt-4w">Répartition par structure</h2>' +
      '<div class="sp-defile"><table class="sp-table"><thead><tr><th>Structure</th><th>Projets</th><th>En cours de vie</th>' +
      '<th>Bloqués</th><th>À relancer</th></tr></thead><tbody>' + cles.map(function (k) {
        var g = groupes[k];
        var nom = num(k) ? cheminDe(k) : 'Structure non renseignée';
        var lien = num(k) ? '<button type="button" class="fr-link" data-action="filtrer-structure" data-id="' + k + '">' + esc(nom) + '</button>' : esc(nom);
        return '<tr><td>' + lien + '</td><td>' + g.total + '</td><td>' + g.actifs + '</td><td>' + g.bloques + '</td><td>' + g.relance + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    return html;
  }

  // --- Formulaire de déclaration / modification -------------------------------

  function initialiserFormulaire(id) {
    var cle = id ? 'm' + id : 'nouveau';
    if (etat.formCle === cle && etat.form) return;
    var p = id ? idx.Projets[id] : null;
    etat.formCle = cle;
    etat.form = p ? {
      Titre: p.Titre || '', Resume: p.Resume || '', Structure_porteuse: num(p.Structure_porteuse) || '',
      Porteurs: liste(p.Porteurs).map(num), Equipe: liste(p.Equipe).map(num),
      Structures_associees: liste(p.Structures_associees).map(num),
      Phase: p.Phase || 'Idée', Etat: p.Etat || 'En cours', Origine: p.Origine || '',
      Commanditaire: num(p.Commanditaire) || '', Mission: p.Mission || '', Objectifs: p.Objectifs || '',
      Thematiques: liste(p.Thematiques), Date_debut: dateVersSaisie(p.Date_debut), Echeance: dateVersSaisie(p.Echeance),
      Visibilite: p.Visibilite || 'Académique'
    } : {
      Titre: '', Resume: '', Structure_porteuse: '', Porteurs: [], Equipe: [], Structures_associees: [],
      Phase: 'Idée', Etat: 'En cours', Origine: '', Commanditaire: '', Mission: '', Objectifs: '',
      Thematiques: [], Date_debut: '', Echeance: '', Visibilite: 'Académique'
    };
  }

  function champTexte(id, champ, libelle, aide, requis, multi) {
    var v = etat.form[champ];
    var lab = '<label class="fr-label" for="' + id + '">' + esc(libelle) + (requis ? ' <span aria-hidden="true">*</span>' : '') +
      (aide ? '<span class="fr-hint-text">' + esc(aide) + '</span>' : '') + '</label>';
    var input = multi
      ? '<textarea class="fr-input" id="' + id + '" rows="4" data-champ-form="' + champ + '">' + esc(v) + '</textarea>'
      : '<input class="fr-input" id="' + id + '" data-champ-form="' + champ + '" value="' + esc(v) + '"' + (requis ? ' required' : '') + '>';
    return '<div class="fr-input-group">' + lab + input + '</div>';
  }

  function selecteurMultiple(id, champ, libelle, aide, options, nomDe) {
    var choisis = etat.form[champ];
    var puces = choisis.map(function (v) {
      return '<li><button type="button" class="fr-tag fr-tag--dismiss" aria-label="Retirer ' + esc(nomDe(v)) + '" ' +
        'data-action="retirer" data-champ="' + champ + '" data-id="' + v + '">' + esc(nomDe(v)) + '</button></li>';
    }).join('');
    var restants = options.filter(function (o) { return choisis.indexOf(o.v) === -1; });
    return '<div class="fr-select-group"><label class="fr-label" for="' + id + '">' + esc(libelle) +
      (aide ? '<span class="fr-hint-text">' + esc(aide) + '</span>' : '') + '</label>' +
      (puces ? '<ul class="sp-puces">' + puces + '</ul>' : '') +
      '<select class="fr-select" id="' + id + '" data-ajout-multiple="' + champ + '"><option value="">Ajouter…</option>' +
      restants.map(function (o) { return '<option value="' + o.v + '">' + esc(o.t) + '</option>'; }).join('') +
      '</select></div>';
  }

  function vueFormulaire(id) {
    if (id && !idx.Projets[id]) {
      return '<p><a class="fr-link fr-icon-arrow-left-line fr-link--icon-left" href="#/">Banque des projets</a></p>' +
        '<p>Ce projet n\'existe pas, ou vous n\'avez pas le droit de le consulter.</p>';
    }
    initialiserFormulaire(id);
    var f = etat.form;
    var personnes = personnesTriees().map(function (x) { return { v: x.id, t: x.Nom }; });
    var structures = structuresTriees().map(function (s) { return { v: s.id, t: s.Chemin }; });
    var retour = id ? '#/projet/' + id : '#/';

    var html = '<p><a class="fr-link fr-icon-arrow-left-line fr-link--icon-left" href="' + retour + '">' +
      (id ? 'Retour à la fiche' : 'Banque des projets') + '</a></p>' + blocAlerte() +
      '<h1 class="fr-h3">' + (id ? 'Modifier la fiche projet' : 'Déclarer un projet') + '</h1>' +
      '<p class="fr-hint-text fr-mb-3w">Les champs marqués d\'un astérisque (*) sont obligatoires. ' +
      'Les porteurs pourront ensuite mettre à jour la fiche ; l\'équipe pourra compléter le plan d\'action, le journal et les documents.</p>' +
      '<form novalidate data-form="projet" data-projet="' + (id || '') + '">' +

      '<fieldset class="fr-fieldset"><legend class="fr-fieldset__legend fr-h5">Le projet</legend>' +
      '<div class="fr-fieldset__element">' + champTexte('p-titre', 'Titre', 'Titre du projet', '', true) + '</div>' +
      '<div class="fr-fieldset__element">' + champTexte('p-resume', 'Resume', 'En bref', 'Deux ou trois phrases pour comprendre le projet.', false, true) + '</div>' +
      '<div class="fr-fieldset__element">' + champSelect('p-structure', 'Structure porteuse *', f.Structure_porteuse, structures, 'data-champ-form="Structure_porteuse" required', 'Choisir une structure') + '</div>' +
      '<div class="fr-fieldset__element">' + champSelect('p-origine', 'Origine du projet', f.Origine, ORIGINES, 'data-champ-form="Origine"', 'Choisir') + '</div>' +
      '</fieldset>' +

      '<fieldset class="fr-fieldset"><legend class="fr-fieldset__legend fr-h5">Les personnes</legend>' +
      '<div class="fr-fieldset__element">' + selecteurMultiple('p-porteurs', 'Porteurs', 'Porteurs du projet *',
        'Les porteurs peuvent modifier toute la fiche.', personnes, nomPersonne) + '</div>' +
      '<div class="fr-fieldset__element">' + selecteurMultiple('p-equipe', 'Equipe', 'Équipe projet',
        "L'équipe peut compléter le plan d'action, le journal et les documents.", personnes, nomPersonne) + '</div>' +
      '<div class="fr-fieldset__element">' + selecteurMultiple('p-associees', 'Structures_associees', 'Structures associées', '', structures,
        function (v) { return cheminDe(v); }) + '</div>' +
      '<div class="fr-fieldset__element"><p class="fr-hint-text">Une personne manque dans la liste ? Demandez à un administrateur de l\'ajouter à l\'annuaire.</p></div>' +
      '</fieldset>' +

      '<fieldset class="fr-fieldset"><legend class="fr-fieldset__legend fr-h5">La mission</legend>' +
      '<div class="fr-fieldset__element">' + champSelect('p-commanditaire', 'Mission confiée par', f.Commanditaire, personnes, 'data-champ-form="Commanditaire"', 'Personne (initiative propre)') + '</div>' +
      '<div class="fr-fieldset__element">' + champTexte('p-mission', 'Mission', 'Mission confiée', 'La consigne ou la lettre de mission, telle qu\'elle a été donnée.', false, true) + '</div>' +
      '<div class="fr-fieldset__element">' + champTexte('p-objectifs', 'Objectifs', 'Objectifs attendus', '', false, true) + '</div>' +
      '</fieldset>' +

      '<fieldset class="fr-fieldset"><legend class="fr-fieldset__legend fr-h5">Avancement et calendrier</legend>' +
      '<div class="fr-fieldset__element fr-fieldset__element--inline">' + champSelect('p-phase', 'Phase', f.Phase, PHASES, 'data-champ-form="Phase"', false) + '</div>' +
      '<div class="fr-fieldset__element fr-fieldset__element--inline">' + champSelect('p-etat', 'État', f.Etat, ETATS, 'data-champ-form="Etat"', false) + '</div>' +
      '<div class="fr-fieldset__element fr-fieldset__element--inline"><div class="fr-input-group"><label class="fr-label" for="p-debut">Début</label>' +
      '<input class="fr-input" type="date" id="p-debut" data-champ-form="Date_debut" value="' + esc(f.Date_debut) + '"></div></div>' +
      '<div class="fr-fieldset__element fr-fieldset__element--inline"><div class="fr-input-group"><label class="fr-label" for="p-echeance">Échéance prévisionnelle</label>' +
      '<input class="fr-input" type="date" id="p-echeance" data-champ-form="Echeance" value="' + esc(f.Echeance) + '"></div></div>' +
      '</fieldset>' +

      '<fieldset class="fr-fieldset" id="p-themes"><legend class="fr-fieldset__legend fr-h5">Thématiques</legend>' +
      THEMATIQUES.map(function (t, i) {
        return '<div class="fr-fieldset__element fr-fieldset__element--inline"><div class="fr-checkbox-group fr-checkbox-group--sm">' +
          '<input type="checkbox" id="t-' + i + '" data-theme="' + esc(t) + '"' + (f.Thematiques.indexOf(t) !== -1 ? ' checked' : '') + '>' +
          '<label class="fr-label" for="t-' + i + '">' + esc(t) + '</label></div></div>';
      }).join('') + '</fieldset>' +

      '<fieldset class="fr-fieldset"><legend class="fr-fieldset__legend fr-h5">Visibilité</legend>' +
      ['Académique', 'Restreint'].map(function (v) {
        var aide = v === 'Académique' ? 'Visible par tous les agents qui ont accès au suivi.' : "Visible seulement par les porteurs, l'équipe, la personne qui a confié la mission et les administrateurs.";
        return '<div class="fr-fieldset__element"><div class="fr-radio-group"><input type="radio" id="v-' + v + '" name="p-visibilite" value="' + v + '" data-champ-form="Visibilite"' +
          (f.Visibilite === v ? ' checked' : '') + '><label class="fr-label" for="v-' + v + '">' + v + '<span class="fr-hint-text">' + aide + '</span></label></div></div>';
      }).join('') + '</fieldset>' +

      '<ul class="fr-btns-group fr-btns-group--inline-md">' +
      '<li><button class="fr-btn" type="submit">' + (id ? 'Enregistrer les modifications' : 'Déclarer le projet') + '</button></li>' +
      '<li><a class="fr-btn fr-btn--secondary" href="' + retour + '" data-action="annuler-form">Annuler</a></li></ul>' +
      '</form>';
    return html;
  }

  function enregistrerProjet(id) {
    var f = etat.form;
    var manques = [];
    if (!String(f.Titre).trim()) manques.push('le titre');
    if (!num(f.Structure_porteuse)) manques.push('la structure porteuse');
    if (!f.Porteurs.length) manques.push('au moins un porteur');
    if (manques.length) {
      etat.alerte = { type: 'error', texte: 'Il manque ' + manques.join(', ') + '.' };
      rendre();
      window.scrollTo(0, 0);
      return;
    }
    var champs = {
      Titre: String(f.Titre).trim(), Resume: f.Resume, Structure_porteuse: num(f.Structure_porteuse),
      Porteurs: versListe(f.Porteurs), Equipe: versListe(f.Equipe), Structures_associees: versListe(f.Structures_associees),
      Phase: f.Phase, Etat: f.Etat, Origine: f.Origine, Commanditaire: num(f.Commanditaire),
      Mission: f.Mission, Objectifs: f.Objectifs, Thematiques: versListe(f.Thematiques),
      Date_debut: saisieVersDate(f.Date_debut), Echeance: saisieVersDate(f.Echeance), Visibilite: f.Visibilite
    };
    var action = id ? ['UpdateRecord', 'Projets', id, champs] : ['AddRecord', 'Projets', null, champs];
    executer([action], id ? 'Fiche enregistrée.' : 'Projet déclaré.', function (res) {
      var nouvelId = id || (res && res.retValues && res.retValues[0]);
      etat.form = null; etat.formCle = null; etat.onglet = 'presentation';
      location.hash = nouvelId ? '#/projet/' + nouvelId : '#/';
    });
  }

  // ---------------------------------------------------------------------------
  // Événements
  // ---------------------------------------------------------------------------

  app.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var a = el.getAttribute('data-action');
    if (a === 'nouveau') { etat.form = null; etat.formCle = null; etat.alerte = null; aller('#/nouveau'); }
    else if (a === 'annuler-form') { etat.form = null; etat.formCle = null; etat.alerte = null; }
    else if (a === 'retirer') {
      var champ = el.getAttribute('data-champ');
      var vid = num(el.getAttribute('data-id'));
      etat.form[champ] = etat.form[champ].filter(function (x) { return x !== vid; });
      rendre();
    }
    else if (a === 'demander-suppression') {
      etat.suppression = el.getAttribute('data-table') + ':' + el.getAttribute('data-id'); rendre();
    }
    else if (a === 'annuler-suppression') { etat.suppression = null; rendre(); }
    else if (a === 'supprimer') {
      etat.suppression = null;
      executer([['RemoveRecord', el.getAttribute('data-table'), num(el.getAttribute('data-id'))]], 'Élément supprimé.');
    }
    else if (a === 'deplacer') {
      deplacer(el.getAttribute('data-table'), num(el.getAttribute('data-id')), el.getAttribute('data-champ'), el.getAttribute('data-valeur'));
    }
    else if (a === 'filtrer-structure') {
      etat.pilotage.structure = el.getAttribute('data-id'); rendre(); window.scrollTo(0, 0);
    }
  });

  // Tables et champs qu'un déplacement de carte a le droit de modifier.
  var DEPLACEMENTS = { 'Actions': 'Etat', 'Projets': 'Phase' };

  function deplacer(table, id, champ, valeur) {
    if (DEPLACEMENTS[table] !== champ || !id) return;
    var ligne = idx[table] && idx[table][id];
    if (!ligne || ligne[champ] === valeur) return;
    var champs = {};
    champs[champ] = valeur;
    executer([['UpdateRecord', table, id, champs]], (table === 'Projets' ? 'Phase' : 'État') + ' mis à jour : ' + valeur + '.');
  }

  // Glisser-déposer des cartes de kanban
  app.addEventListener('dragstart', function (e) {
    var el = e.target.closest && e.target.closest('[data-drag]');
    if (!el) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', el.getAttribute('data-drag'));
    el.classList.add('sp-ticket--glisse');
  });
  app.addEventListener('dragend', function (e) {
    var el = e.target.closest && e.target.closest('[data-drag]');
    if (el) el.classList.remove('sp-ticket--glisse');
    Array.prototype.forEach.call(app.querySelectorAll('.sp-colonne--survol'), function (c) { c.classList.remove('sp-colonne--survol'); });
  });
  app.addEventListener('dragover', function (e) {
    var col = e.target.closest && e.target.closest('[data-drop-table]');
    if (!col) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    col.classList.add('sp-colonne--survol');
  });
  app.addEventListener('dragleave', function (e) {
    var col = e.target.closest && e.target.closest('[data-drop-table]');
    if (col && !col.contains(e.relatedTarget)) col.classList.remove('sp-colonne--survol');
  });
  app.addEventListener('drop', function (e) {
    var col = e.target.closest && e.target.closest('[data-drop-table]');
    if (!col) return;
    e.preventDefault();
    col.classList.remove('sp-colonne--survol');
    var source = String(e.dataTransfer.getData('text/plain') || '').split(':');
    if (source[0] !== col.getAttribute('data-drop-table')) return;
    deplacer(source[0], num(source[1]), col.getAttribute('data-drop-champ'), col.getAttribute('data-drop-valeur'));
  });

  app.addEventListener('input', function (e) {
    var el = e.target;
    if (el.hasAttribute('data-filtre') && el.type === 'search') {
      etat.filtres.q = el.value;
      var pos = el.selectionStart;
      rendre();
      var nouveau = document.getElementById('f-q');
      if (nouveau) { nouveau.focus(); try { nouveau.setSelectionRange(pos, pos); } catch (err) { /* ignore */ } }
      return;
    }
    if (el.hasAttribute('data-champ-form') && etat.form && el.type !== 'radio') {
      etat.form[el.getAttribute('data-champ-form')] = el.value;
    }
    if (el.hasAttribute('data-brouillon')) {
      brouillon(el.getAttribute('data-brouillon'))[el.getAttribute('data-champ')] = el.value;
    }
  });

  app.addEventListener('change', function (e) {
    var el = e.target;
    if (el.hasAttribute('data-filtre') && el.type !== 'search') {
      var cle = el.getAttribute('data-filtre');
      etat.filtres[cle] = el.type === 'checkbox' ? el.checked : el.value;
      rendre();
    } else if (el.hasAttribute('data-pilotage')) {
      var cleP = el.getAttribute('data-pilotage');
      etat.pilotage[cleP] = el.type === 'checkbox' ? el.checked : el.value;
      rendre();
    } else if (el.hasAttribute('data-mode')) {
      etat.modePlan = el.value; etat.suppression = null; rendre();
    } else if (el.hasAttribute('data-onglet')) {
      etat.onglet = el.value; etat.alerte = null; etat.suppression = null; rendre();
    } else if (el.hasAttribute('data-ajout-multiple') && el.value) {
      etat.form[el.getAttribute('data-ajout-multiple')].push(num(el.value));
      rendre();
    } else if (el.hasAttribute('data-theme') && etat.form) {
      var t = el.getAttribute('data-theme');
      etat.form.Thematiques = etat.form.Thematiques.filter(function (x) { return x !== t; });
      if (el.checked) etat.form.Thematiques.push(t);
    } else if (el.hasAttribute('data-champ-form') && etat.form) {
      etat.form[el.getAttribute('data-champ-form')] = el.value;
    } else if (el.hasAttribute('data-brouillon')) {
      brouillon(el.getAttribute('data-brouillon'))[el.getAttribute('data-champ')] = el.value;
    } else if (el.hasAttribute('data-etat-action')) {
      executer([['UpdateRecord', 'Actions', num(el.getAttribute('data-etat-action')), { Etat: el.value }]]);
    }
  });

  app.addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target;
    var type = form.getAttribute('data-form');
    var pid = num(form.getAttribute('data-projet'));
    if (type === 'projet') { enregistrerProjet(pid || null); return; }

    var cle = type + '-' + pid;
    var b = brouillon(cle);
    var champs;
    if (type === 'action') {
      if (!String(b.Intitule || '').trim()) return;
      champs = { Projet: pid, Intitule: String(b.Intitule).trim(), Responsable: num(b.Responsable),
        Debut: saisieVersDate(b.Debut), Fin: saisieVersDate(b.Fin), Etat: 'À faire' };
      executer([['AddRecord', 'Actions', null, champs]], 'Action ajoutée.', function () { delete etat.brouillons[cle]; });
    } else if (type === 'journal') {
      if (!String(b.Message || '').trim()) return;
      champs = { Projet: pid, Type: b.Type || 'Avancement', Message: String(b.Message).trim() };
      executer([['AddRecord', 'Journal', null, champs]], 'Message publié.', function () { delete etat.brouillons[cle]; });
    } else if (type === 'document') {
      if (!String(b.Titre || '').trim() || !lienSur(b.Lien)) {
        etat.alerte = { type: 'error', texte: 'Indiquez un titre et un lien commençant par https://.' };
        rendre();
        return;
      }
      champs = { Projet: pid, Titre: String(b.Titre).trim(), Type: b.Type || '', Lien: String(b.Lien).trim() };
      executer([['AddRecord', 'Documents', null, champs]], 'Document ajouté.', function () { delete etat.brouillons[cle]; });
    }
  });

  var ficheCourante = null;
  window.addEventListener('hashchange', function () {
    etat.alerte = null; etat.suppression = null;
    var r = route();
    if (r.vue === 'fiche' && r.id !== ficheCourante) { etat.onglet = 'presentation'; ficheCourante = r.id; }
    rendre();
    window.scrollTo(0, 0);
  });

  // ---------------------------------------------------------------------------
  // Thème clair / sombre
  // ---------------------------------------------------------------------------

  var choixTheme = 'auto';
  try { choixTheme = localStorage.getItem('sp-theme') || 'auto'; } catch (e) { /* stockage indisponible */ }

  function themeGrist() {
    // Grist transmet ses couleurs au widget sous forme de variables CSS.
    var st = getComputedStyle(document.documentElement);
    var fond = (st.getPropertyValue('--grist-theme-page-bg') || st.getPropertyValue('--grist-theme-bg') || '').trim();
    var m = fond.match(/^#([0-9a-f]{6})$/i);
    if (!m) return null;
    var n = parseInt(m[1], 16);
    var lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum < 0.5 ? 'dark' : 'light';
  }

  function appliquerTheme() {
    var t = choixTheme;
    if (t === 'auto') {
      t = themeGrist() || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    }
    document.documentElement.setAttribute('data-fr-theme', t);
  }

  var selectTheme = document.getElementById('sp-theme');
  selectTheme.value = choixTheme;
  selectTheme.addEventListener('change', function () {
    choixTheme = selectTheme.value;
    try { localStorage.setItem('sp-theme', choixTheme); } catch (e) { /* stockage indisponible */ }
    appliquerTheme();
  });
  new MutationObserver(appliquerTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', appliquerTheme);
  }

  // ---------------------------------------------------------------------------
  // Démarrage
  // ---------------------------------------------------------------------------

  appliquerTheme();

  function erreurChargement(err) {
    app.innerHTML = '<div class="fr-alert fr-alert--error"><h2 class="fr-alert__title">Chargement impossible</h2>' +
      '<p>Vérifiez que le widget a l\'accès « Accès complet au document ». Détail : ' + esc((err && err.message) || err) + '</p></div>';
  }

  if (DEMO) {
    document.getElementById('sp-demo').hidden = false;
    charger().then(rendre).catch(erreurChargement);
  } else {
    grist.ready({ requiredAccess: 'full', allowSelectBy: false });
    var attente = null;
    // Grist prévient quand la table liée change : on recharge tout, sans perdre la saisie en cours.
    grist.onRecords(function () {
      clearTimeout(attente);
      attente = setTimeout(function () { charger().then(function () { appliquerTheme(); rendre(); }).catch(erreurChargement); }, 150);
    });
  }
})();
