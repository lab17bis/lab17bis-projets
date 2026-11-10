# Tests de l'interface

Tests de bout en bout, sans données réelles : mode démonstration et mode Grist simulé (l'API Grist est remplacée par un faux document en mémoire).

```sh
pip install playwright && playwright install chromium
python3 -m http.server 8765        # à lancer depuis la racine du dépôt
python3 tests/test_suivi.py /tmp/captures
```

Le script affiche le résultat de chaque test et enregistre des captures d'écran avec le préfixe donné.
