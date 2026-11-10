"""Tests de bout en bout du widget suivi-projets (mode démo + mode Grist simulé)."""
import json
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8765"
OUT = sys.argv[1]
resultats = []
erreurs = []


def ok(nom, cond, detail=""):
    resultats.append(("OK " if cond else "ÉCHEC ") + nom + (" — " + str(detail) if detail else ""))


def suivre(pg, nom):
    pg.on("pageerror", lambda e: erreurs.append("%s pageerror: %s" % (nom, e)))
    pg.on("console", lambda m: erreurs.append("%s console: %s" % (nom, m.text))
          if m.type == "error" and "ERR_TUNNEL" not in m.text and "favicon" not in m.text and "404" not in m.text else None)


STUB_GRIST = """
window.grist = (function () {
  var tables = window.parent.__TABLES__;
  var refus = window.parent.__REFUS__ || [];
  function cols(rows) {
    var c = { id: [] };
    var keys = {};
    rows.forEach(function (r) { Object.keys(r).forEach(function (k) { keys[k] = 1; }); });
    Object.keys(keys).forEach(function (k) { if (k !== 'id') c[k] = []; });
    rows.forEach(function (r) {
      c.id.push(r.id);
      Object.keys(c).forEach(function (k) {
        if (k === 'id') return;
        var v = r[k];
        if (Array.isArray(v)) v = ['L'].concat(v);
        c[k].push(v === undefined ? null : v);
      });
    });
    return c;
  }
  var abonnes = [];
  return {
    ready: function (o) { window.parent.__READY__ = o; },
    onRecords: function (f) { abonnes.push(f); setTimeout(function () { f([]); }, 50); },
    docApi: {
      fetchTable: function (t) { return Promise.resolve(cols(tables[t] || [])); },
      applyUserActions: function (actions) {
        window.parent.__ACTIONS__ = (window.parent.__ACTIONS__ || []).concat(actions);
        for (var i = 0; i < actions.length; i++) {
          var a = actions[i];
          if (refus.indexOf(a[1] + ':' + a[2]) !== -1 || refus.indexOf(a[1]) !== -1) {
            return Promise.reject(new Error('Blocked by table update access rules'));
          }
        }
        var ret = actions.map(function (a) {
          var t = tables[a[1]];
          var champs = {};
          Object.keys(a[3] || {}).forEach(function (k) {
            var v = a[3][k]; champs[k] = Array.isArray(v) && v[0] === 'L' ? v.slice(1) : v;
          });
          if (a[0] === 'AddRecord') {
            var id = t.reduce(function (m, l) { return Math.max(m, l.id); }, 0) + 1;
            if (a[1] === 'Comptes' && !champs.Email) champs.Email = window.parent.__MOI__ || 'moi@exemple.fr';
            champs.id = id; t.push(champs); return id;
          }
          if (a[0] === 'UpdateRecord') { Object.assign(t.find(function (l) { return l.id === a[2]; }), champs); }
          if (a[0] === 'RemoveRecord') { tables[a[1]] = t.filter(function (l) { return l.id !== a[2]; }); }
          return null;
        });
        setTimeout(function () { abonnes.forEach(function (f) { f([]); }); }, 20);
        return Promise.resolve({ retValues: ret });
      }
    }
  };
})();
"""


def dates_en_secondes(json_data):
    import datetime
    def conv(v):
        d = datetime.date.fromisoformat(v)
        return int(datetime.datetime(d.year, d.month, d.day, tzinfo=datetime.timezone.utc).timestamp())
    for t, rows in json_data.items():
        if not isinstance(rows, list):
            continue
        for r in rows:
            for k in ("Echeance", "Debut", "Fin", "Date_debut"):
                if isinstance(r.get(k), str):
                    r[k] = conv(r[k])
    return json_data


with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])

    # ------------------------------------------------------------------ mode démo
    pg = b.new_page(viewport={"width": 1280, "height": 900})
    suivre(pg, "démo")
    pg.goto(BASE + "/suivi-projets/", wait_until="networkidle")
    pg.wait_for_timeout(800)
    ok("banque : navigation avec « Mon profil »", pg.locator(".sp-nav a").count() == 3
       and "Camille Exemple" in pg.locator(".sp-nav__profil").inner_text())
    ok("banque : cartes", pg.locator(".fr-card").count() >= 3, pg.locator(".fr-card").count())

    # Fiche du projet 1, plan d'action
    pg.goto(BASE + "/suivi-projets/#/projet/1")
    pg.wait_for_timeout(300)
    pg.locator("label[for='o-plan']").click()
    pg.wait_for_timeout(200)
    ok("plan : sélecteur liste/kanban/calendrier", pg.locator("input[data-mode='plan']").count() == 3)
    ok("plan : liste en tableau", pg.locator(".sp-table tbody tr").count() == 3, pg.locator(".sp-table tbody tr").count())

    pg.locator("label[for='m-plan-kanban']").click()
    pg.wait_for_timeout(200)
    ok("kanban : 4 colonnes", pg.locator(".sp-colonne").count() == 4)
    col_a_faire = pg.locator(".sp-colonne[data-drop-valeur='À faire'] .sp-ticket")
    ok("kanban : 1 action à faire", col_a_faire.count() == 1, col_a_faire.count())
    pg.screenshot(path=OUT + "-kanban.png", full_page=True)
    # bouton « vers En cours »
    col_a_faire.first.locator("button[data-valeur='En cours']").click()
    pg.wait_for_timeout(300)
    ok("kanban : bouton déplace la carte",
       pg.locator(".sp-colonne[data-drop-valeur='En cours'] .sp-ticket").count() == 2)
    ok("kanban : alerte de succès", pg.locator(".fr-alert--success").count() == 1)
    # glisser-déposer vers « Fait »
    src = pg.locator(".sp-colonne[data-drop-valeur='En cours'] .sp-ticket").first
    dst = pg.locator(".sp-colonne[data-drop-valeur='Fait']")
    avant = dst.locator(".sp-ticket").count()
    src.drag_to(dst)
    pg.wait_for_timeout(300)
    ok("kanban : glisser-déposer", pg.locator(".sp-colonne[data-drop-valeur='Fait'] .sp-ticket").count() == avant + 1)

    pg.locator("label[for='m-plan-calendrier']").click()
    pg.wait_for_timeout(200)
    ok("calendrier : 3 barres", pg.locator(".sp-gantt__barre").count() == 3, pg.locator(".sp-gantt__barre").count())
    ok("calendrier : repère aujourd'hui", pg.locator(".sp-gantt__jour").count() >= 1)
    ok("calendrier : graduation des mois", pg.locator(".sp-gantt__mois").count() >= 4)
    pg.screenshot(path=OUT + "-gantt.png", full_page=True)

    # Projet 3 : action avec seulement une date de fin -> jalon
    pg.goto(BASE + "/suivi-projets/#/projet/3")
    pg.wait_for_timeout(300)
    pg.locator("label[for='o-plan']").click()
    pg.wait_for_timeout(200)
    if pg.locator("label[for='m-plan-calendrier']").count():
        pg.locator("label[for='m-plan-calendrier']").click()
        pg.wait_for_timeout(200)
        ok("calendrier : jalon pour une action sans début", pg.locator(".sp-gantt__jalon").count() == 1)

    # Journal
    pg.goto(BASE + "/suivi-projets/#/projet/1")
    pg.wait_for_timeout(300)
    pg.locator("label[for='o-journal']").click()
    nb = pg.locator(".sp-journal li").count()
    pg.fill("#j-message", "Test automatique du journal")
    pg.click("form[data-form='journal'] button[type='submit']")
    pg.wait_for_timeout(300)
    ok("journal : publication", pg.locator(".sp-journal li").count() == nb + 1)

    # Documents
    pg.locator("label[for='o-documents']").click()
    pg.fill("#d-titre", "Doc test")
    pg.fill("#d-lien", "javascript:alert(1)")
    pg.click("form[data-form='document'] button[type='submit']")
    pg.wait_for_timeout(200)
    ok("documents : lien non https refusé", pg.locator(".fr-alert--error").count() == 1)
    pg.fill("#d-lien", "https://exemple.fr/doc")
    pg.click("form[data-form='document'] button[type='submit']")
    pg.wait_for_timeout(300)
    ok("documents : ajout", pg.locator("a[href='https://exemple.fr/doc']").count() == 1)
    pg.locator("button[data-action='demander-suppression'][data-table='Documents']").last.click()
    pg.locator("button[data-action='supprimer']").click()
    pg.wait_for_timeout(300)
    ok("documents : suppression avec confirmation", pg.locator("a[href='https://exemple.fr/doc']").count() == 0)

    # Déclaration : porteur pré-rempli, ajout d'une personne absente
    pg.goto(BASE + "/suivi-projets/#/nouveau")
    pg.wait_for_timeout(300)
    ok("déclaration : je suis porteur par défaut", pg.locator("#p-porteurs").locator("xpath=..").locator(".fr-tag").count() == 1)
    pg.click("button[data-action='ouvrir-ajout'][data-champ='Porteurs']")
    pg.fill("#aj-nom-Porteurs", "EXEMPLE Camille")
    pg.click("button[data-action='creer-personne'][data-champ='Porteurs']")
    pg.wait_for_timeout(200)
    ok("ajout personne : doublon signalé", pg.locator(".sp-nouvelle-personne .fr-alert--warning").count() == 1)
    pg.fill("#aj-nom-Porteurs", "NOUVELLE Personne")
    pg.click("button[data-action='creer-personne'][data-champ='Porteurs']")
    pg.wait_for_timeout(300)
    ok("ajout personne : créée et ajoutée aux porteurs",
       "NOUVELLE Personne" in pg.locator("#p-porteurs").locator("xpath=..").inner_text())
    pg.click("button[data-action='retirer'][data-champ='Porteurs']:has-text('NOUVELLE Personne')")
    pg.wait_for_timeout(100)
    pg.click("form[data-form='projet'] button[type='submit']")
    pg.wait_for_timeout(200)
    ok("déclaration : champs obligatoires signalés", "Il manque" in pg.locator(".fr-alert--error").inner_text())
    pg.fill("#p-titre", "Projet de test")
    pg.select_option("#p-structure", index=1)
    pg.select_option("#p-porteurs", index=1)
    pg.wait_for_timeout(100)
    pg.fill("#p-echeance", "2027-03-31")
    pg.click("form[data-form='projet'] button[type='submit']")
    pg.wait_for_timeout(400)
    ok("déclaration : redirige vers la fiche", "#/projet/" in pg.url, pg.url)
    ok("déclaration : titre affiché", pg.locator("h1").inner_text() == "Projet de test")

    # Vue d'ensemble
    pg.goto(BASE + "/suivi-projets/#/pilotage")
    pg.wait_for_timeout(400)
    ok("pilotage : 4 chiffres clés", pg.locator(".sp-chiffre").count() == 4)
    ok("pilotage : kanban des phases (6 colonnes)", pg.locator(".sp-colonne").count() == 6, pg.locator(".sp-colonne").count())
    ok("pilotage : projets à relancer", pg.locator("h2:has-text('Projets à relancer')").count() == 1)
    ok("pilotage : calendrier", pg.locator(".sp-gantt").count() == 1)
    ok("pilotage : répartition", pg.locator("h2:has-text('Répartition par structure')").count() == 1)
    pg.screenshot(path=OUT + "-pilotage.png", full_page=True)
    nb_cartes = pg.locator(".sp-ticket").count()
    pg.locator("button[data-action='filtrer-structure']").first.click()
    pg.wait_for_timeout(300)
    ok("pilotage : filtre par structure depuis la répartition",
       pg.locator("#pf-structure").input_value() != "" and pg.locator(".sp-ticket").count() <= nb_cartes)
    pg.click("label[for='pf-archives']")
    pg.wait_for_timeout(200)
    ok("pilotage : colonne Clos avec les archives", pg.locator(".sp-colonne[data-drop-valeur='Clos']").count() == 1)

    # Thème sombre
    pg.select_option("#sp-theme", "dark")
    pg.wait_for_timeout(200)
    ok("thème sombre appliqué", pg.evaluate("document.documentElement.getAttribute('data-fr-theme')") == "dark")
    pg.screenshot(path=OUT + "-pilotage-sombre.png", full_page=True)
    pg.select_option("#sp-theme", "auto")

    # Base vide
    pg2 = b.new_page(viewport={"width": 1280, "height": 800})
    suivre(pg2, "vide")
    pg2.route("**/donnees-fictives/exemple.json", lambda r: r.fulfill(
        status=200, content_type="application/json",
        body=json.dumps({t: [] for t in ["Structures", "Personnes", "Projets", "Actions", "Journal", "Documents"]})))
    pg2.goto(BASE + "/suivi-projets/", wait_until="networkidle")
    pg2.wait_for_timeout(300)
    ok("base vide : message adapté", pg2.locator("text=Aucun projet déclaré pour l'instant").count() == 1)
    pg2.goto(BASE + "/suivi-projets/#/pilotage")
    pg2.wait_for_timeout(300)
    ok("base vide : vue d'ensemble sans erreur", pg2.locator("text=Aucun projet déclaré pour l'instant").count() == 1)
    pg2.close()

    # ------------------------------------------------- mode Grist simulé (iframe)
    donnees = dates_en_secondes(json.load(open(__import__("os").path.join(__import__("os").path.dirname(__file__), "..", "donnees-fictives", "exemple.json"), encoding="utf-8")))
    donnees.pop("_avertissement", None)
    pg3 = b.new_page(viewport={"width": 1280, "height": 900})
    suivre(pg3, "grist")
    pg3.route("https://docs.getgrist.com/grist-plugin-api.js",
              lambda r: r.fulfill(status=200, content_type="application/javascript", body=STUB_GRIST))
    hote = ("<!DOCTYPE html><html><body style='margin:0'><script>window.__TABLES__=%s;window.__REFUS__=['Projets:2'];</script>"
            "<iframe id='w' src='/suivi-projets/' style='width:1260px;height:880px;border:0'></iframe></body></html>") % json.dumps(donnees)
    pg3.route(BASE + "/hote.html", lambda r: r.fulfill(status=200, content_type="text/html", body=hote))
    pg3.goto(BASE + "/hote.html")
    pg3.wait_for_timeout(1500)
    fr = pg3.frame_locator("#w")
    ok("grist : accès complet demandé", pg3.evaluate("window.__READY__ && window.__READY__.requiredAccess") == "full")
    ok("grist : pas de bandeau démo", fr.locator("#sp-demo").is_hidden())
    ok("grist : cartes chargées depuis fetchTable", fr.locator(".fr-card").count() >= 3, fr.locator(".fr-card").count())
    # écriture autorisée : déplacement d'une action
    frame = pg3.frame(url=lambda u: u.endswith("/suivi-projets/") or "/suivi-projets/#" in u)
    frame.evaluate("location.hash = '#/projet/1'")
    pg3.wait_for_timeout(300)
    fr.locator("label[for='o-plan']").click()
    fr.locator("label[for='m-plan-kanban']").click()
    pg3.wait_for_timeout(200)
    fr.locator(".sp-colonne[data-drop-valeur='À faire'] .sp-ticket button[data-valeur='En cours']").click()
    pg3.wait_for_timeout(500)
    actions = pg3.evaluate("window.__ACTIONS__ || []")
    ok("grist : UpdateRecord envoyé", any(a[0] == "UpdateRecord" and a[1] == "Actions" and a[3].get("Etat") == "En cours" for a in actions), actions)
    ok("grist : mode kanban conservé après rechargement", fr.locator(".sp-colonne").count() == 4)
    # écriture refusée par les droits
    frame.evaluate("location.hash = '#/pilotage'")
    pg3.wait_for_timeout(300)
    fr.locator(".sp-ticket[data-drag='Projets:2'] button[data-action='deplacer']").last.click()
    pg3.wait_for_timeout(400)
    alerte = fr.locator(".fr-alert--error")
    ok("grist : refus de droits expliqué", alerte.count() == 1 and "droits" in alerte.inner_text(), alerte.count())
    # format des RefList à l'écriture
    frame.evaluate("location.hash = '#/nouveau'")
    pg3.wait_for_timeout(300)
    fr.locator("#p-titre").fill("Projet Grist")
    fr.locator("#p-structure").select_option(index=1)
    fr.locator("#p-porteurs").select_option(index=1)
    pg3.wait_for_timeout(100)
    fr.locator("form[data-form='projet'] button[type='submit']").click()
    pg3.wait_for_timeout(500)
    actions = pg3.evaluate("window.__ACTIONS__ || []")
    ajout = [a for a in actions if a[0] == "AddRecord" and a[1] == "Projets"]
    ok("grist : RefList encodée ['L', …]", bool(ajout) and ajout[-1][3]["Porteurs"][0] == "L", ajout[-1][3]["Porteurs"] if ajout else None)
    pg3.screenshot(path=OUT + "-grist.png")

    def ouvrir_grist(nom, tables, refus, moi):
        page = b.new_page(viewport={"width": 1280, "height": 900})
        suivre(page, nom)
        page.route("https://docs.getgrist.com/grist-plugin-api.js",
                   lambda r: r.fulfill(status=200, content_type="application/javascript", body=STUB_GRIST))
        h = ("<!DOCTYPE html><html><body style='margin:0'><script>window.__TABLES__=%s;window.__REFUS__=%s;window.__MOI__=%s;</script>"
             "<iframe id='w' src='/suivi-projets/' style='width:1260px;height:880px;border:0'></iframe></body></html>") % (
            json.dumps(tables), json.dumps(refus), json.dumps(moi))
        page.route(BASE + "/hote-" + nom + ".html", lambda r: r.fulfill(status=200, content_type="text/html", body=h))
        page.goto(BASE + "/hote-" + nom + ".html")
        page.wait_for_timeout(1500)
        return page, page.frame_locator("#w")

    import copy
    # Nouvel agent : compte créé, redirection vers « Qui êtes-vous ? », rattachement
    t4 = copy.deepcopy(donnees); t4["Comptes"] = []
    pg4, fr4 = ouvrir_grist("nouveau", t4, [], "nouveau@exemple.fr")
    act4 = pg4.evaluate("window.__ACTIONS__ || []")
    ok("nouvel agent : ligne Comptes créée", any(a[0] == "AddRecord" and a[1] == "Comptes" for a in act4), act4)
    ok("nouvel agent : redirigé vers « Qui êtes-vous ? »", fr4.locator("h1:has-text('Qui êtes-vous')").count() == 1)
    pg4.screenshot(path=OUT + "-profil.png", full_page=True)
    fr4.locator("#pr-choix").select_option("2")
    fr4.locator("button[data-action='rattacher']").click()
    pg4.wait_for_timeout(500)
    act4 = pg4.evaluate("window.__ACTIONS__ || []")
    ok("nouvel agent : rattachement au profil", any(a[0] == "UpdateRecord" and a[1] == "Comptes" and a[3].get("Profil") == 2 for a in act4))
    ok("nouvel agent : profil affiché", "Dominique Exemple" in fr4.locator(".sp-nav__profil").inner_text())
    pg4.close()

    # Nouvel agent qui crée son profil (alerte doublon puis création)
    t5 = copy.deepcopy(donnees); t5["Comptes"] = []
    pg5, fr5 = ouvrir_grist("creation", t5, [], "claire@exemple.fr")
    fr5.locator("#pr-nom").fill("Exemple Camille")
    fr5.locator("#pr-structure").select_option(index=1)
    fr5.locator("form[data-form='mon-profil'] button[type='submit']").click()
    pg5.wait_for_timeout(300)
    ok("création profil : doublon signalé", fr5.locator(".fr-alert--warning").count() == 1)
    fr5.locator("#pr-nom").fill("MARTIN Claire")
    fr5.locator("form[data-form='mon-profil'] button[type='submit']").click()
    pg5.wait_for_timeout(600)
    act5 = pg5.evaluate("window.__ACTIONS__ || []")
    ok("création profil : Personnes puis Comptes",
       any(a[0] == "AddRecord" and a[1] == "Personnes" and a[3].get("Nom") == "MARTIN Claire" for a in act5)
       and any(a[0] == "UpdateRecord" and a[1] == "Comptes" and a[3].get("Profil") for a in act5), act5)
    ok("création profil : confirmation", fr5.locator(".fr-alert--success").count() == 1)
    pg5.close()

    # Lecteur : Grist refuse la ligne Comptes
    t6 = copy.deepcopy(donnees); t6["Comptes"] = []
    pg6, fr6 = ouvrir_grist("lecteur", t6, ["Comptes"], "lecteur@exemple.fr")
    ok("lecteur : pas de redirection", fr6.locator("h1:has-text('Banque des projets')").count() == 1)
    ok("lecteur : pas de lien « Mon profil »", fr6.locator(".sp-nav__profil").count() == 0)
    pg6.frame(url=lambda u: "/suivi-projets/" in u).evaluate("location.hash = '#/nouveau'")
    pg6.wait_for_timeout(300)
    ok("lecteur : pas d'ajout de personne", fr6.locator("button[data-action='ouvrir-ajout']").count() == 0)
    pg6.close()
    b.close()

print("\n".join(resultats))
print("\n%d/%d tests réussis" % (sum(r.startswith("OK") for r in resultats), len(resultats)))
print("\n".join(erreurs) or "aucune erreur JavaScript")
