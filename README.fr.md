# MyMovie Studio

La version **0.1.1** corrige un plantage macOS lorsque Finder ouvre un film enregistré avant la fin du démarrage. Le document attend dans une file partagée jusqu’à l’initialisation. L’ouverture d’un paquet enregistré a été vérifiée dans l’application native en mode release ; aucune migration du projet n’est nécessaire.

Compilation release : `npm run tauri:build -- --bundles app` ; résultat : `target/release/bundle/macos/MyMovie Studio.app`. L’installation locale utilise une signature ad hoc ; la notarisation Apple reste à réaliser.

Un studio de cinéma local pour macOS, construit avec Rust, Tauri et React. Les films sont des paquets Finder `.mymovie` contenant épisodes, storyboard ordonné, personnages, workflows importés, tâches de génération et médias. L’interface reprend la palette Fenki avec un symbole SVG original.

[English](README.md) · [Русский](README.ru.md) · [État du projet](docs/PROJECT_CONTEXT.md)

![Médias regroupés dans le film](docs/screenshots/library-collected.png)

## Utiliser un film

Créez un film et choisissez son emplacement, ou ouvrez un `.mymovie` existant. Modifiez les noms du film et des épisodes, ajoutez scènes et plans, puis organisez les images clés. Vous pouvez modifier prompts, commentaires, proportions et personnages. Chaque image hérite des personnages de sa scène.

Importez les références des personnages depuis leur éditeur. Le traitement des dépôts de fichiers est implémenté pour les personnages, la bibliothèque, les images clés, les plans et les nouvelles scènes. La validation d’un véritable glisser-déposer depuis Finder reste ouverte ; utilisez les boutons d’importation si le dépôt ne fonctionne pas.

## Copier ou conserver les fichiers d’origine

Le contrôle **Media imports** propose deux modes :

- **Copy into movie** : mode par défaut ; copie des originaux dans le paquet, avec déduplication par contenu.
- **Keep original location** : référence au fichier existant sans copie. L’original doit rester accessible.

Cela concerne images, vidéos, audio et fichiers LoRA pris en charge, y compris les références des personnages. Les définitions de workflows sont importées séparément dans le film.

La bibliothèque affiche les chemins externes. **Check files** détecte les originaux manquants ou modifiés. **Relink** retrouve un original déplacé uniquement si son contenu correspond exactement ; les associations restent intactes.

Avant de transférer le film, utilisez **Collect for export**. Cette commande vérifie et copie tous les médias liés dans le `.mymovie` actuel, en conservant leurs associations. Un original manquant ou modifié interrompt le regroupement. Fermez le film, puis copiez le paquet complet dans Finder. Un assistant distinct de création d’archive ou de copie d’export n’est pas encore disponible.

L’importation par dialogue natif et le regroupement d’une référence de personnage liée ont été vérifiés dans l’application macOS.

## Workflows et connexions

Importez un workflow au format API et associez explicitement ses entrées : prompts, images et autres paramètres. Les entrées `characterReference1` à `characterReference4` peuvent utiliser les images de référence des personnages de la scène/image. L’application ne devine pas les identifiants des nœuds.

Plusieurs connexions ComfyUI, RunningHub et relay privé sont possibles. L’aide aux prompts via Google, DeepSeek et OpenRouter est facultative. Saisissez les secrets dans les contrôles sécurisés de l’application ; ils restent dans le Trousseau macOS. Les endpoints fal/personnalisés disposent actuellement d’une interface de configuration uniquement.

Les reçus des tâches et leurs résultats persistent. Une soumission ambiguë devient unknown sans relance aveugle. Le relay propose SSE avec reprise des événements ; l’application utilise actuellement le polling. Progression dans le Dock, notifications système et historiques de notifications/journaux sont disponibles.

## Développement

Prérequis : Apple Silicon, macOS 13+, Xcode Command Line Tools, Rust et Node.js/npm.

```sh
npm ci
npm run tauri:dev
npm run tauri:build -- --debug --bundles app
```

Application de développement non signée : `target/debug/bundle/macos/MyMovie Studio.app`. L’aperçu navigateur (`npm run dev`) utilise un état temporaire en mémoire ; testez les fichiers et paquets dans l’application native.

```sh
npm run typecheck
npm test -- --maxWorkers=1
cargo test --workspace
```

## Vérification locale sur CPU

```sh
docker compose -f deploy/cpu/compose.yaml up -d --build
python3 scripts/cpu-smoke.py
```

Le moteur OrbStack/Docker doit rester actif ; la fenêtre OrbStack peut être fermée. Le test CPU sans poids de modèles a validé disponibilité ComfyUI, soumission, historique et téléchargement du résultat. Il ne valide pas les workflows vidéo sur GPU.

## Limites actuelles

Il s’agit d’une base de développement. Génération RunningHub réelle, parcours complet relay/S3/RunPod privé, workflows GPU, signature/notarisation, paquet DMG et validation du glisser-déposer Finder restent à terminer. Les profils de navigateur, l’entraînement LoRA distant et le pipeline FFmpeg complet sont prévus ultérieurement. Aucun traitement payant ni location cloud n’a été effectué pendant la validation.

[Architecture](docs/ARCHITECTURE_INDEX.md) · [Contrats](docs/API_CONTRACTS.md) · [Preuves de validation](docs/TASK_LOG.md). Les agents doivent lire les six documents compacts de contexte avant une inspection ciblée. Excluez de Git `drafts/`, secrets et films personnels.

Licence : Apache-2.0 OR MIT ; [Apache](LICENSE-APACHE), [MIT](LICENSE-MIT).

Bundled font licenses: [Manrope](docs/licenses/Manrope-OFL.txt), [IBM Plex Mono](docs/licenses/IBM-Plex-Mono-OFL.txt).
