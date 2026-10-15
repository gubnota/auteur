# MyMovie Studio

Version 0.1.19 : terminal sombre occupant toute la fenêtre, **Enter full screen** et dimensionnement automatique **Fit window**. Glisser, déplacer ou supprimer les plans avec confirmation. Renommer images clés/personnages préserve les graphes importés exacts. Restaurer immédiatement les copies des exemples ; choisir une instance dans Setup pour préparer/importer vers ComfyUI avec dépendances déjà installées. Connections/Setup exporte un notebook CPU/GPU avec version : importer une copie neuve et exécuter Run all. L’agent installe les dépendances manquantes. La validation cloud réelle reste à effectuer.

**Démarrage Colab :** ouvrir le [notebook actuel](https://colab.research.google.com/github/gubnota/auteur/blob/main/deploy/colab/MyMovie_ComfyUI.ipynb), connecter un CPU ou GPU et choisir **Run all**, sans modification. Clés de test préremplies, agent/relay vérifiés, version figée de ComfyUI, navigateur d’import et cloudflared sont installés automatiquement. Copier l’adresse relay et l’ID du nœud dans Connections avec le polling du tunnel temporaire. Installer ensuite les modèles/plugins du workflow depuis Studio. Run all laisse le nœud actif ; l’arrêt est manuel. Les anciennes copies Drive ne se mettent pas à jour : rouvrir ce lien.

**Mode CPU :** Colab et Kaggle utilisent `DEVICE = "auto"` : GPU CUDA disponibles ou un seul worker CPU. `"cpu"` force le CPU ; `"cuda"` exige le nombre de GPU configuré. Tester la connexion et l’initialisation avec le mask canary sans poids ; la génération sur CPU peut être très lente. Rouvrir le notebook actuel : les copies enregistrées ne se mettent pas à jour.

[Tester la connexion depuis votre ordinateur](docs/WORKFLOW_SETUP.md#test-the-notebook-connection-from-your-desktop) : script Python à copier, token desktop et diagnostic HTTP. Le relay n’a pas de page d’accueil : `/` et `/v1` renvoient 404.

Un studio de cinéma portable pour macOS : documents Finder `.mymovie`, épisodes et storyboard, personnages et médias partagés, workflows ComfyUI réutilisables et tâches traçables.

Version des sources/de l’application : **0.1.18**. Les [téléchargements v0.1.15](https://github.com/gubnota/auteur/releases/tag/v0.1.15) incluent l’agent Linux et son relay correspondant. Commitez les versions avant de créer le tag correspondant ; git add prépare seulement les changements. La compilation locale macOS utilise une signature ad-hoc ; notarisation et validation sur les autres plateformes restent à faire.

## Parcours unique

1. **Workflows :** importer une fois un workflow ComfyUI normal ou un graphe API. Choisir un nœud enregistré puis **Prepare inputs**. Le frontend réel du nœud compile le workflow ; la source reste immuable.
2. **Inputs :** nommer les entrées image/vidéo/audio/texte, définir leurs rôles, Optional, Advanced et Hidden. Une entrée optionnelle non assignée conserve sa valeur initiale ; son fichier doit exister sur le nœud.
3. **Outputs :** nommer les sorties et sélectionner les fichiers à conserver dans Library. Cela ne désactive pas les nœuds de sortie du graphe.
4. **Setup :** déclarer compatibilité, système, architecture et précision. Importer des graphes distincts Apple Silicon/CUDA/CPU comme variantes d’une même famille ; un badge ne convertit pas le graphe.
5. **Guide :** README Markdown, illustration et collection. Exporter/importer `.mymovie-workflow.json` entre films avec graphes, formulaires et dépendances ; les profils locaux et références de secrets ne voyagent pas.
6. **Generate :** choisir workflow/nœud, déposer les médias ou utiliser la galerie avec recherche, vérifier les valeurs. Les médias existants sont réutilisés par ID. **Add to queue** reste en attente ; **Run now** démarre.
7. **Jobs :** cases de sélection, **Run selected**, **Remove selected from queue**. Modifier les tâches non envoyées et leur destination dans Generate, puis **Save queue changes** ; les anciens reçus annulés restent conservés. FIFO sur un nœud, parallélisme entre nœuds.

![Guide du workflow — interface de test](docs/screenshots/workflow-wrapper-guide.png)

## Films et médias

Créer/ouvrir `.mymovie`, renommer épisodes/scènes et ordonner les images clés. Les références des personnages sont partagées et les personnages d’une scène sont hérités par ses images. Import et routage du glisser-déposer sont implémentés ; la validation automatisée depuis Finder reste ouverte.

**Copy into movie** copie les fichiers ; **Keep original location** conserve un lien. Les hachages évitent les doublons. **Check files**, **Relink** et **Collect for export** conservent les affectations. Rassembler les médias externes et fermer le film avant de transférer le paquet. Library/Renders partagent IDs, tags render et provenance ; Trash/Restore conserve l’historique. Miniatures vidéo et navigation vers les utilisations sont disponibles.

Schéma **v5** : mise à niveau explicite avec sauvegarde pour les anciens documents. Garder une copie complète pour une ancienne application.

## Initialisation du nœud

**Workflows → Setup → Complete setup script** propose Mac/Linux/SSH, Colab et Kaggle. Choisir l’archive d’agent et son checksum vérifié, les chemins du ComfyUI et les dépendances modèles/LoRA/plugins/wheels épinglées. Un runtime géré installe les dépendances vérifiées, demande un redémarrage puis prépare le graphe API. La disponibilité exige une vérification et un canary dans la session courante ; un ancien fichier marqueur ne suffit pas.

Le nœud privé se connecte vers un relay HTTPS authentifié. Renseigner son adresse accessible et l’ID du worker dans Connections. [Instructions](docs/WORKFLOW_SETUP.md), [Colab/RunPod/Kaggle](deploy/runpod/README.md), [preuves de validation](docs/GENERATION_ACCEPTANCE.md). Le test cloud GPU/relay/S3 réel reste à faire. Les connexions ComfyUI directes n’installent pas les dépendances à distance.

Commencer par le **mask canary 64 × 64**, sans poids/plugins/GPU. Le test u2netp optionnel demande modèle, plugin et wheels compatibles vérifiés ; il produit une image et un masque.

**Settings → Node access** affiche `MYMOVIE_AGENT_TOKEN` et `MYMOVIE_DESKTOP_TOKEN`, préremplis avec vos valeurs publiques de test. Enregistrer les valeurs privées dans le coffre système ou copier les affectations vers Configure du notebook ; les variantes env/Secrets sont commentées. Les nouvelles connexions **Colab / Kaggle** héritent du token desktop. Remplacer les deux valeurs publiques pour un déploiement privé. Le notebook démarre son relay sur un `RELAY_PORT` configurable et le tunnel via `cloudflared` installé ; activer **Temporary Cloudflare tunnel · polling only**, puis coller l’adresse relay publique et les ID affichés. ComfyUI reste privé. Aucun token privé dans les fichiers du film. Google/DeepSeek/OpenRouter proposent une aide textuelle optionnelle ; custom/fal generation reste une configuration. Les anciennes destinations retirées restent archivées mais inexécutables. Les envois incertains nécessitent une réconciliation. Progression native, notifications et journaux effaçables sont inclus.

[Compilation](README.md#build-and-checks), [CI/releases](docs/CI_RELEASES.md), [contexte](docs/PROJECT_CONTEXT.md). GitHub/GitLab compilent macOS Apple Silicon, Windows x64, Linux x86_64 et les agents Linux x86_64/macOS Apple Silicon avec relay. Le desktop Linux ARM64 reste actif uniquement sur GitHub. Les entrées macOS Intel desktop/agent et Linux ARM64 agent sont commentées. Les notebooks choisissent automatiquement une release publiée, préversions comprises, et vérifient le SHA256 ; une archive personnalisée exige toujours son checksum. L’archive v0.1.15 inclut le relay pour Cloudflare. Aucun agent Windows. Licence Apache-2.0 OR MIT. [English](README.md) / [Русский](README.ru.md).

## Exemples de workflows

**Workflows → Examples · start here** propose des exemples illustrés : connexion,
SD 1.5 T4 et détourage léger. Ouvrez une copie, choisissez **Run and install on**
dans la fenêtre du workflow, puis **Setup → Initialize on [instance]**. Vérifiez les
téléchargements et cliquez sur **Install & prepare on [instance]** : l’agent installe
les dépendances, redémarre ComfyUI géré et libre si nécessaire, prépare/publie le
workflow et vérifie la disponibilité. Aucune commande supplémentaire dans le notebook.
[Guide](docs/WORKFLOW_EXAMPLES.md). Agent avec guided setup requis (0.1.16 ou ultérieur) ;
une mise à jour du desktop ne met pas à jour le notebook. CI uniquement sur les tags de version.
**Clear finished** masque les tâches terminées, échouées et annulées de la file inférieure ;
l’historique Jobs et les résultats Library restent disponibles.

## Initialisation en arrière-plan et suppression des workflows

**Activity** affiche étapes, journaux, téléchargements et commandes Cancel / Reconnect
dans tous les onglets, y compris Welcome. Les nœuds indépendants travaillent en parallèle ;
les workers Kaggle partagent les fichiers et sérialisent les modifications du runtime.
**Move to Trash / Restore** retire et restaure un workflow avec ses réglages. **Trash → Clear trash** vide la liste en conservant les graphes sources et l’historique des jobs. Le terminal occupe toute la fenêtre.
Setup propose un **Initialization recipe** ordonné et modifiable. Le terminal agent
et les scripts libres exigent des tokens privés et une activation explicite.
[Guide](docs/NODE_ACTIVITY.md). Agent et relay **0.1.18** requis ; le dernier agent
publié reste v0.1.15. Mettre à jour le desktop ne met pas à jour le notebook.
