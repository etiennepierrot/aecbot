# Collecteur AECBot — API WordPress

```bash
python3 -m pip install -r requirements.txt
python3 collecte_wp.py
```

Le script récupère toutes les pages et tous les articles publics de l'API WordPress `melenchon2027.fr`, puis ne conserve que ceux dont l'URL commence par `/programme/` et dont le texte dépasse 100 caractères. Il conserve les métadonnées, les URL sources et les tableaux convertis en Markdown.

Résultats dans `corpus_aecbot/` :
- `inventaire_complet.json` : réponse brute de l'API, y compris contenus exclus ;
- `index.csv` : inventaire des pages incluses/exclues ;
- `markdown/` : un Markdown par document ;
- `GPT_programme_XX.md` : fichiers regroupés pour l'import dans un Custom GPT.

**Limites** : cela ne télécharge pas les PDF, ne garantit pas la couverture de tous les livrets et peut manquer des contenus rendus par JavaScript ou exposés par d'autres endpoints. Vérifier `index.csv` avant utilisation. Ne pas confondre les dates de mise à jour des pages avec une édition officiellement datée du programme.
