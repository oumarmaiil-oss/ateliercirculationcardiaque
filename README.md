# L’Atelier du Cœur et de la Circulation

> **Nouvelle version : [Hémodyssée](https://oumarmaiil-oss.github.io/hemodyssee/)** ([dépôt](https://github.com/oumarmaiil-oss/hemodyssee)) — le voyage du sang, plus simple et plus complet. Cet atelier reste en ligne comme version « labo » de référence.

Simulateur pédagogique et interactif de physiologie, physiopathologie et pharmacologie cardiovasculaire, conçu à trois échelles complémentaires : **Corps entier**, **Cœur (2D & 3D)** et **Vaisseau en coupe (2D & 3D)**.

---

## Liens d’accès direct

- **Ouvrir l’application en ligne** : https://oumarmaiil-oss.github.io/ateliercirculationcardiaque/
- **Mode Cas cliniques (« Pathologies à soigner »)** : https://oumarmaiil-oss.github.io/ateliercirculationcardiaque/?mode=cas
- **Environnement de développement local** : `http://localhost:3000`
- **Signaler une erreur ou suggérer une amélioration** : bouton « Signaler » dans l’atelier, ou WhatsApp [@drSOWOUMAR](https://wa.me/drSOWOUMAR)

---

## Fonctionnalités principales

### 1. Trois échelles synchronisées en temps réel
- **1 · Corps entier** : circulation systémique et pulmonaire, retour veineux, cibles d’organes (cerveau, cœur, reins, membres inférieurs), œdèmes périphériques et migration embolique.
- **2 · Cœur (2D & 3D WebGL)** : contraction auriculaire et ventriculaire synchrone, ouverture/fermeture des 4 valves, tissu nodal électrique (cyan, niveaux *Comprendre* et *Expert*), territoires coronaires (IVA, Cx, CD), diagramme de Wiggers et boucle Pression–Volume.
- **3 · Vaisseau en coupe (2D & 3D)** : endothélium, libération de NO, média élastique, progression de la plaque d’athérome (stades 0 à 6) et rupture avec thrombus occlusif.

### Nouveautés pour le lancement
- **Quiz d’auscultation** (bouton « Quiz ») : 6 sons tirés au hasard parmi 8 (normal, RA, IM, IA, RM, B3, B4, FA), choix du foyer, indice, explication sémiologique et score.
- **Visite guidée** en 5 étapes au premier lancement (relançable depuis le pied de page).
- **Installable et utilisable hors connexion** : sur téléphone, « Ajouter à l’écran d’accueil » ; tout l’atelier, 3D comprise, reste disponible sans réseau après une première visite.
- **Qualité d’affichage adaptative** (Complet / Équilibré / Léger) selon l’appareil, avec réglage manuel.
- **Signalement d’erreur** (bouton « Signaler ») : message WhatsApp pré-rempli avec la scène et les constantes, vers @drSOWOUMAR, sans afficher de numéro.

### Visualisation et moteur (version 3)
- **Circulation en boucles complètes** (artère → capillaires → veine) : le sang passe progressivement du rouge au bleu dans les organes et du bleu au rouge dans les poumons ; veines pulmonaires, retours veineux des bras et du rein ajoutés ; le rouge artériel s’assombrit si la saturation baisse.
- **Côte à côte** (vue Corps) : le même patient avec et sans traitement, en simultané.
- **Diagramme de Wiggers** : bandes de systole et repères B1/B2 traversant pressions et ECG.
- **Cœur 3D** : relief de fibres myocardiques et teinte tissulaire.
- **Baroréflexe simplifié** : une chute de pression accélère le cœur et resserre les artérioles (compensation partielle).
- **Cas infarctus** : IEC et bêtabloquant démarrés à petite dose ; critère de tolérance PAS ≥ 90 mmHg.

### 3D et son (version 4)
- **Lésions visibles en 3D** : feuillets épaissis et jaunes (rétrécissement) ou roses (fuite), calcifications, jets de globules jaunes à travers une valve rétrécie et roses en sens inverse à travers une valve qui fuit, dilatation de l’aorte après un rétrécissement serré, aorte rigide pâle, HVG et dilatations d’oreillettes visibles, étiquettes de lésion. Une lésion de valve fait passer en coupe et oriente la caméra ; toucher une structure la cadre.
- **Débit pulsatile** (2D et 3D) : le sang ne franchit une valve que lorsqu’elle est ouverte, freiné si elle est rétrécie.
- **Valves vues d’en haut** : les 4 orifices en temps réel (fente en cas de rétrécissement, orifice résiduel en cas de fuite).
- **Circulation du corps** : les deux reins perfusés ; débit propre à chaque organe (cerveau autorégulé, reins moins perfusés en bas débit, membres selon les résistances).
- **Son** : synthèse modale des bruits avec harmoniques audibles sur haut-parleurs de téléphone et d’ordinateur, filtre stéthoscope et résonance thoracique, RA râpeux, roulement mitral vibrant ; toucher une valve avec le son activé place le stéthoscope sur son foyer.

### 2. Deux modes complémentaires
- **Exploration libre** : démarre dans un état physiologique normal (`120/80 mmHg`, `FC 70/min`, `0` pathologie active) puis permet d’explorer des exemples rapides ou de combiner maladies, valves et traitements à la demande.
- **Pathologies à soigner (7 cas cliniques évalués)** : HTA avec œdème sous Amlodipine, HTA résistante, insuffisance cardiaque à FE réduite, rétrécissement aortique serré avec défi d’auscultation à l’aveugle, fibrillation auriculaire à risque embolique, infarctus du myocarde (IVA) & plaque vulnérable, dysfonction ventriculaire droite.

### 3. Double trajectoire temporelle (« Sans traitement » ↔ « Avec traitement »)
- **Timeline chronologique en 5 étapes** : du départ sain ou aigu (`T0`) jusqu’aux complications ou au maintien à `5 ans`.
- **Alternance automatique des 2 issues** (`Alterner 2 issues : ON/OFF`) et pauses automatiques aux moments clés (`Pause auto`) pour observer comment la pathologie évolue sans traitement, puis comment le traitement agit jusqu’à la stabilisation.
- **Conduite & traitement ciblé** affiché directement sous l’explication clinique, avec application en un clic des protocoles de référence (dont la quadrithérapie post-IDM).

### 4. Lésions cliquables directement sur la scène & captures exportables
- **Lésions interactives** (2D et 3D) : cliquer sur un caillot (FA, coronaire, pulmonaire, veine cave, cérébral, fémoral), une plaque d’athérome ou une calcification valvulaire ouvre un menu d’actions directes (anticoagulation, désobstruction, protocole, coupe artérielle, remplacement valvulaire).
- **Auscultation** : B1, B2 (A2 + P2 avec dédoublement physiologique variant avec la respiration), B3 (insuffisance cardiaque, IM importante), B4 (HVG, RA, ischémie ; absent en FA), souffles dont l’intensité suit la sévérité. Un sélecteur de **foyer d’auscultation** (aortique, pulmonaire, Erb, tricuspide, mitral) module chaque bruit. Le ralenti (×0,5, ×0,25) rend le dédoublement de B2 audible.
- **Audio Web Audio & export** : synthèse temps réel des bruits cardiaques (`B1`, `B2`, souffles systoliques et diastoliques) intégrée à la capture vidéo **WebM (vp9/vp8 + opus)** et export **PNG annoté** incluant les constantes hémodynamiques.

---

## Démarrage local

Prérequis : **Node.js 20+** et **npm**.

```bash
# 1. Installer les dépendances
npm install

# 2. Lancer le serveur de développement (port 3000)
npm run dev

# 3. Vérifier le typage TypeScript
npm run lint

# 4. Exécuter les tests unitaires (moteur, scénarios, sémiologie auscultatoire)
npm test

# 5. Générer le build de production
npm run build
```

---

## Publication

Chaque modification poussée sur la branche `main` est automatiquement vérifiée (typage, tests), compilée puis publiée sur GitHub Pages par le workflow `.github/workflows/deploy.yml`. Les vues 3D (three.js) sont chargées à la demande pour accélérer l’ouverture sur mobile.

---

## Architecture technique

- `src/engine/physiology.ts` — Moteur hémodynamique, calculs valvulaires, athérosclérose et pharmacodynamie.
- `src/engine/clinicalCases.ts` — 7 cas cliniques, évaluation multi-critères et projections temporelles (`T0` à `5 ans`).
- `src/engine/storyboard.ts` — Séquences visuelles en 5 moments clés pour chaque pathologie (avec et sans traitement).
- `src/engine/protocols.ts` — Protocoles thérapeutiques ciblés et fiches d’action sur lésions cliquables.
- `src/renderers/` — Rendus Canvas 2D haute densité (`corps2d.ts`, `coeur2d.ts`, `vaisseau2d.ts`, `charts.ts`) et scènes Three.js (`heart3d.ts`, `vessel3d.ts`).
- `src/audio/heartSounds.ts` — Synthèse Web Audio (`B1`, `B2`, `B3`, `B4`, souffles, foyers d’auscultation) et flux `MediaStreamAudioDestinationNode` pour l’enregistrement vidéo.

---

## Sources scientifiques & limites pédagogiques

Ce simulateur s’appuie sur les principes classiques de physiologie cardiovasculaire (diagramme de Wiggers, loi de Starling, couplage ventriculo-artériel, équation de Gorlin/Bernoulli) et sur les recommandations cliniques ESC/HAS pour l’HTA, l’insuffisance cardiaque, les valvulopathies, la fibrillation auriculaire et la maladie coronaire.

> **Avertissement** : outil strictement pédagogique destiné à la compréhension des mécanismes physiologiques et thérapeutiques. Il ne constitue ni un dispositif médical, ni une aide à la prescription réelle, et ne remplace pas un avis médical.

---

## Auteur & Licence

Conçu et développé par **Dr O. Sow**.  
Publié en open source sous **Licence MIT**.
