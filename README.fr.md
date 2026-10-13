# MyMovie Studio

La version **0.1.2** ajoute la création de tâches depuis Workflows, les correspondances de déploiement RunningHub par compte, la récupération des soumissions incertaines et les pipelines GitLab/GitHub avec versions étiquetées. La correction du plantage Finder de 0.1.1 est conservée ; aucune migration du projet n’est nécessaire.

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

## RunningHub : créer une tâche

1. Ajoutez un compte RunningHub dans **Connections** et enregistrez sa clé avec le contrôle sécurisé des identifiants.
2. Importez le workflow API dans **Workflows**. Dans **RunningHub deployments**, sélectionnez le compte, la famille API (**Workflow** ou **AI App**) et l’ID de ce déploiement précis. Un graphe JSON ne prouve pas l’existence d’un déploiement hébergé ; ne remplacez pas son ID par celui d’une autre AI App. L’ID par défaut du compte est facultatif.
3. Configurez **Job input bindings** avec les nœuds, champs et types du schéma API de ce déploiement. Les références de personnages proviennent de la scène/image sélectionnée.
4. Sélectionnez **Target keyframe**, cliquez sur **Create generation job**, choisissez le compte, vérifiez les valeurs puis **Validate & submit job**. Le dialogue explique les paramètres manquants.

Un refus du fournisseur produit une tâche failed. Pour une soumission incertaine, consultez l’historique RunningHub puis **Resolve submission** : rattachez l’ID de la tâche existante ou confirmez qu’aucune tâche n’a été créée avant de relancer. Le compte et le déploiement restent figés dans le reçu.

L’interface et les contrats ont été vérifiés avec des fixtures ; aucune génération RunningHub payante n’a été validée. La [page Workflow fournie](https://www.runninghub.ai/workflow/2110044532631932930) indique la famille **Workflow** et l’ID `2110044532631932930`. L’utilisateur a confirmé que cet ID correspond au LTX API JSON fourni ; les détails publics du graphe n’ont pas été vérifiés indépendamment. Les entrées de type chaîne sont `positivePrompt → 121.text`, `negativePrompt → 110.text` et `image → 167.image`. Assignez une image à l’image clé cible avant l’envoi ; la commande native refuse une tâche sans image.

![Création de tâche dans la version installée 0.1.2, projet temporaire](docs/screenshots/workflow-job-0.1.2.png)

## Artefacts CI et notebooks

Le [guide des builds et releases](docs/CI_RELEASES.md) décrit `.gitlab-ci.yml`, GitHub Actions, les DMG macOS ARM/Intel, les paquets Linux et le client ComfyUI Linux x86_64. Les tags doivent correspondre à la version de l’application ; les fichiers sont accompagnés de sommes de contrôle. Les releases GitHub commencent comme brouillons. Le remote actuel est GitHub ; GitLab nécessite un projet et un runner macOS adapté.

Les notebooks [Colab](deploy/colab) et [Kaggle](deploy/kaggle) déploient l’artefact vérifié du client près d’une installation ComfyUI existante. Kaggle peut utiliser deux processus GPU indépendants, avec ports et node ID distincts. Le déploiement réel nécessite un relay authentifié et un runtime actif autorisant ce fonctionnement.

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

Il s’agit d’une base de développement. Génération RunningHub réelle, échange de workflows ComfyUI avec poids, parcours complet relay/S3/RunPod privé, déploiement réel des notebooks, signature/notarisation et validation du glisser-déposer Finder restent à terminer. CI et empaquetage DMG sont configurés ; les builds Intel/Linux sur runners distants ne sont pas encore validés. Les profils de navigateur, l’entraînement LoRA distant et le pipeline FFmpeg complet sont prévus ultérieurement. Aucun traitement payant ni location cloud n’a été effectué pendant la validation.

[Architecture](docs/ARCHITECTURE_INDEX.md) · [Contrats](docs/API_CONTRACTS.md) · [Preuves de validation](docs/TASK_LOG.md). Les agents doivent lire les six documents compacts de contexte avant une inspection ciblée. Excluez de Git `drafts/`, secrets et films personnels.

Licence : Apache-2.0 OR MIT ; [Apache](LICENSE-APACHE), [MIT](LICENSE-MIT).

Bundled font licenses: [Manrope](docs/licenses/Manrope-OFL.txt), [IBM Plex Mono](docs/licenses/IBM-Plex-Mono-OFL.txt).
