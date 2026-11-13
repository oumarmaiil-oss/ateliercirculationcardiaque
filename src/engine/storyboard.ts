import type { ClinicalCaseDef, TimelineProjection } from './clinicalCases';
import { clamp } from './geometry2d';
import { activeTrt } from './physiology';
import type {
  DynamicState,
  FocusZoneId,
  SimParams,
  TabId,
  TimelineBranch,
  TimelineHorizon,
  VisualStoryOverlay,
} from './types';

export interface StoryboardMoment {
  step: TimelineHorizon;
  label: string;
  title: string;
  whatHappens: string;
  focusTab: TabId;
  focusZone: FocusZoneId;
  focusLabel: string;
  embolDetached: boolean;
  clotProgress: number;
  treatmentHeal: number;
}

function detectFreePathologyTheme(p: SimParams): 'dyslipidemie' | 'fa' | 'hta' | 'ic' | 'ra' | 'vd' | 'general' {
  if (p.mal.dyslipidemie || p.mal.idm || p.plaque > 0) return 'dyslipidemie';
  if (p.mal.fa) return 'fa';
  if (p.mal.ra || p.act.aortique === 'stenose') return 'ra';
  if (p.mal.ic || p.act.vg === 'faible') return 'ic';
  if (p.act.vd === 'faible') return 'vd';
  if (p.mal.hta) return 'hta';
  return 'general';
}

export function getStoryboardMoment(
  appMode: 'cas' | 'libre',
  activeCase: ClinicalCaseDef | null,
  params: SimParams,
  branch: TimelineBranch,
  step: TimelineHorizon
): StoryboardMoment {
  const { t, asso } = activeTrt(params);
  const hasAnyTrt = Boolean(asso) || Object.values(t).some(Boolean);
  const effectiveUntreated = branch === 'untreated' || (!hasAnyTrt && activeCase?.id !== 'ra-serre');

  const theme =
    appMode === 'cas' && activeCase
      ? activeCase.id === 'idm-plaque'
        ? 'dyslipidemie'
        : activeCase.id === 'fa-rapide'
          ? 'fa'
          : activeCase.id === 'ic-vg-faible'
            ? 'ic'
            : activeCase.id === 'ra-serre'
              ? 'ra'
              : activeCase.id === 'vd-htap'
                ? 'vd'
                : 'hta'
      : detectFreePathologyTheme(params);

  const siteTargetLabel =
    params.site === 'carotide'
      ? 'l’artère cérébrale (AVC)'
      : params.site === 'jambe'
        ? 'l’artère de la jambe'
        : 'la coronaire (infarctus)';

  const siteFocusZone: FocusZoneId = params.site === 'carotide' ? 'cerveau' : 'embole';

  if (theme === 'dyslipidemie') {
    if (effectiveUntreated) {
      const seq: StoryboardMoment[] = [
        {
          step: 0,
          label: '1 · Excès de LDL',
          title: 'Infiltration lipidique dans la paroi',
          whatHappens:
            'Le LDL-cholestérol en excès pénètre sous l’endothélium et lance une plaque athéromateuse naissante.',
          focusTab: 'vaisseau',
          focusZone: 'plaque',
          focusLabel: 'Dépôt initial de LDL',
          embolDetached: false,
          clotProgress: 0.1,
          treatmentHeal: 0,
        },
        {
          step: 1,
          label: '2 · Plaque fragile',
          title: 'Inflammation & amincissement de la chape',
          whatHappens:
            'Les macrophages s’accumulent, la lumière rétrécit et la chape fibreuse devient fine et vulnérable.',
          focusTab: 'vaisseau',
          focusZone: 'plaque',
          focusLabel: 'Chape fibreuse fragile',
          embolDetached: false,
          clotProgress: 0.35,
          treatmentHeal: 0,
        },
        {
          step: 2,
          label: '3 · Rupture & caillot',
          title: 'Blocage artériel par un thrombus',
          whatHappens:
            'La plaque se fissure : les plaquettes s’agrègent brutalement et forment un caillot qui obstrue le flux sanguin.',
          focusTab: 'vaisseau',
          focusZone: 'plaque',
          focusLabel: 'Thrombus obstructif',
          embolDetached: false,
          clotProgress: 0.92,
          treatmentHeal: 0,
        },
        {
          step: 3,
          label: '4 · Détachement & embolie',
          title: `Migration du caillot vers ${siteTargetLabel}`,
          whatHappens:
            `Un fragment du caillot se détache, est emporté par le courant sanguin et va boucher ${siteTargetLabel}.`,
          focusTab: 'corps',
          focusZone: siteFocusZone,
          focusLabel: 'Embole migrant vers l’organe cible',
          embolDetached: true,
          clotProgress: 1,
          treatmentHeal: 0,
        },
      ];
      return seq[step];
    }

    const hasStatin = t.statine;
    const hasAap = t.antiagregant;
    const seqTreated: StoryboardMoment[] = [
      {
        step: 0,
        label: '1 · Mise sous traitement',
        title: hasStatin ? 'Statine démarrée : frein du LDL' : 'Traitement protecteur instauré',
        whatHappens: hasStatin
          ? 'La statine bloque la synthèse hépatique du cholestérol ; les particules LDL circulantes commencent à chuter.'
          : 'Le flux artériel est pris en charge ; ajoutez une statine pour stabiliser directement la plaque.',
        focusTab: 'vaisseau',
        focusZone: 'plaque',
        focusLabel: 'Début d’action sur le LDL',
        embolDetached: false,
        clotProgress: hasAap ? 0.45 : 0.7,
        treatmentHeal: hasStatin ? 0.28 : 0.12,
      },
      {
        step: 1,
        label: '2 · Lyse du caillot',
        title: hasAap ? 'Réduction nette du caillot & inflammation' : 'Apaisement de l’endothélium',
        whatHappens:
          'Les plaquettes n’adhèrent plus sur la lésion, le thrombus régresse et la production de NO protecteur remonte.',
        focusTab: 'vaisseau',
        focusZone: 'plaque',
        focusLabel: 'Caillot en régression',
        embolDetached: false,
        clotProgress: hasAap ? 0.15 : 0.35,
        treatmentHeal: hasStatin ? 0.62 : 0.3,
      },
      {
        step: 2,
        label: '3 · Chape consolidée',
        title: 'Épaississement fibreux protecteur',
        whatHappens:
          'La chape fibreuse s’épaissit (anneau vert) : la plaque ne peut plus se rompre ni libérer de caillot.',
        focusTab: 'vaisseau',
        focusZone: 'plaque',
        focusLabel: 'Chape fibreuse consolidée',
        embolDetached: false,
        clotProgress: 0.04,
        treatmentHeal: hasStatin ? 0.88 : 0.45,
      },
      {
        step: 3,
        label: '4 · Artère sécurisée',
        title: 'Flux rétabli, aucun détachement embolique',
        whatHappens:
          'Le traitement suivi a assaini le cœur lipidique : le sang circule librement et le cœur/cerveau restent épargnés.',
        focusTab: 'corps',
        focusZone: 'coronaire',
        focusLabel: 'Organes cibles protégés',
        embolDetached: false,
        clotProgress: 0,
        treatmentHeal: hasStatin ? 1 : 0.55,
      },
    ];
    return seqTreated[step];
  }

  if (theme === 'fa') {
    if (effectiveUntreated) {
      const seq: StoryboardMoment[] = [
        {
          step: 0,
          label: '1 · Chaos auriculaire',
          title: 'Oreillette gauche désynchronisée',
          whatHappens: 'Les oreillettes fibrillent : le sang stagne dans l’auricule gauche au lieu d’être chassé franchement.',
          focusTab: 'coeur',
          focusZone: 'og',
          focusLabel: 'Stase dans l’oreillette gauche',
          embolDetached: false,
          clotProgress: 0.2,
          treatmentHeal: 0,
        },
        {
          step: 1,
          label: '2 · Naissance du caillot',
          title: 'Formation d’un thrombus auriculaire',
          whatHappens: 'La stase active la coagulation : un caillot se constitue contre la paroi de l’oreillette gauche.',
          focusTab: 'coeur',
          focusZone: 'og',
          focusLabel: 'Thrombus en formation (OG)',
          embolDetached: false,
          clotProgress: 0.75,
          treatmentHeal: 0,
        },
        {
          step: 2,
          label: '3 · Départ vers l’aorte',
          title: 'Détachement du caillot vers la carotide',
          whatHappens: 'Le thrombus se détache de l’oreillette, passe dans le ventricule gauche et monte vers les carotides.',
          focusTab: 'corps',
          focusZone: 'embole',
          focusLabel: 'Embole quittant le cœur',
          embolDetached: true,
          clotProgress: 1,
          treatmentHeal: 0,
        },
        {
          step: 3,
          label: '4 · Embolie cérébrale',
          title: 'Occlusion d’une artère cérébrale (AVC)',
          whatHappens: 'Le caillot bloque une branche artérielle du cerveau : le territoire en aval souffre d’ischémie.',
          focusTab: 'corps',
          focusZone: 'cerveau',
          focusLabel: 'Zone cérébrale ischémique',
          embolDetached: true,
          clotProgress: 1,
          treatmentHeal: 0,
        },
      ];
      return seq[step];
    }

    const seqTreated: StoryboardMoment[] = [
      {
        step: 0,
        label: '1 · Frein & fluidification',
        title: 'Anticoagulant actif + nœud AV apaisé',
        whatHappens: 'Le bêtabloquant calme la cadence ventriculaire et l’AOD bloque les facteurs de coagulation.',
        focusTab: 'coeur',
        focusZone: 'og',
        focusLabel: 'Oreillette gauche protégée',
        embolDetached: false,
        clotProgress: 0.35,
        treatmentHeal: 0.3,
      },
      {
        step: 1,
        label: '2 · Dissolution du caillot',
        title: 'Le thrombus auriculaire se résorbe',
        whatHappens: 'Sans nouvelle fibrine, la fibrinolyse naturelle dissout le caillot naissant dans l’oreillette.',
        focusTab: 'coeur',
        focusZone: 'og',
        focusLabel: 'Résorption du thrombus',
        embolDetached: false,
        clotProgress: 0.1,
        treatmentHeal: 0.65,
      },
      {
        step: 2,
        label: '3 · Prévention embolique',
        title: 'Aucun départ de caillot vers la carotide',
        whatHappens: 'Le flux sortant vers l’aorte et les carotides reste propre, le risque d’AVC chute de ~64 %.',
        focusTab: 'corps',
        focusZone: 'cerveau',
        focusLabel: 'Carotide & cerveau libres',
        embolDetached: false,
        clotProgress: 0,
        treatmentHeal: 0.9,
      },
      {
        step: 3,
        label: '4 · Cerveau sauvegardé',
        title: 'Fonction cardiaque et cérébrale stables',
        whatHappens: 'La fréquence maîtrisée préserve la pompe cardiaque et le traitement suivi empêche l’AVC.',
        focusTab: 'corps',
        focusZone: 'cerveau',
        focusLabel: 'Protection cérébrale à 5 ans',
        embolDetached: false,
        clotProgress: 0,
        treatmentHeal: 1,
      },
    ];
    return seqTreated[step];
  }

  if (theme === 'ic') {
    if (effectiveUntreated) {
      const seq: StoryboardMoment[] = [
        {
          step: 0,
          label: '1 · VG affaibli',
          title: 'Stase ventriculaire & bas débit',
          whatHappens: 'Le muscle gauche se contracte faiblement : du sang stagne dans la cavité et la pression monte.',
          focusTab: 'coeur',
          focusZone: 'vg',
          focusLabel: 'Ventricule gauche dilaté',
          embolDetached: false,
          clotProgress: 0,
          treatmentHeal: 0,
        },
        {
          step: 1,
          label: '2 · Reflux pulmonaire',
          title: 'Surcharge des veines pulmonaires',
          whatHappens: 'La pression remonte dans l’oreillette gauche puis engorge les capillaires pulmonaires.',
          focusTab: 'coeur',
          focusZone: 'og',
          focusLabel: 'Congestion veineuse pulmonaire',
          embolDetached: false,
          clotProgress: 0,
          treatmentHeal: 0,
        },
        {
          step: 2,
          label: '3 · Dilatation chronique',
          title: 'Épuisement adrénergique du VG',
          whatHappens: 'Le cœur bat trop vite pour compenser : les parois s’étirent et la FE continue de baisser.',
          focusTab: 'coeur',
          focusZone: 'vg',
          focusLabel: 'Remodelage dilatatif',
          embolDetached: false,
          clotProgress: 0,
          treatmentHeal: 0,
        },
        {
          step: 3,
          label: '4 · OAP & bas débit',
          title: 'Œdème pulmonaire & souffrance rénale',
          whatHappens: 'Le liquide transsude dans les alvéoles pulmonaires (POG ≥ 22) et les reins manquent de perfusion.',
          focusTab: 'corps',
          focusZone: 'poumons',
          focusLabel: 'Poumons inondés (OAP)',
          embolDetached: false,
          clotProgress: 0,
          treatmentHeal: 0,
        },
      ];
      return seq[step];
    }
    const seqTreated: StoryboardMoment[] = [
      {
        step: 0,
        label: '1 · Décharge rapide',
        title: 'Soulagement de la pression pulmonaire',
        whatHappens: 'Diurétique et iSGLT2 réduisent la surcharge volémique ; l’ARNI/IEC ouvre la sortie artérielle.',
        focusTab: 'coeur',
        focusZone: 'vg',
        focusLabel: 'Postcharge abaissée',
        embolDetached: false,
        clotProgress: 0,
        treatmentHeal: 0.25,
      },
      {
        step: 1,
        label: '2 · Poumons dégagés',
        title: 'POG sous 15 mmHg',
        whatHappens: 'Les capillaires pulmonaires se vident : l’essoufflement recule et l’effort redevient tolérable.',
        focusTab: 'corps',
        focusZone: 'poumons',
        focusLabel: 'Poumons décongestionnés',
        embolDetached: false,
        clotProgress: 0,
        treatmentHeal: 0.6,
      },
      {
        step: 2,
        label: '3 · Remodelage inverse',
        title: 'Le ventricule retrouve de la force',
        whatHappens: 'Le bêtabloquant protège le myocarde de l’adrénaline : le volume VG diminue et la FE remonte.',
        focusTab: 'coeur',
        focusZone: 'vg',
        focusLabel: 'Reprise contractile du VG',
        embolDetached: false,
        clotProgress: 0,
        treatmentHeal: 0.85,
      },
      {
        step: 3,
        label: '4 · Équilibre durable',
        title: 'Pompe cardiaque et rein préservés',
        whatHappens: 'La quadrithérapie maintient un débit stable sans congestion ni réhospitalisation.',
        focusTab: 'corps',
        focusZone: 'poumons',
        focusLabel: 'Circulation équilibrée',
        embolDetached: false,
        clotProgress: 0,
        treatmentHeal: 1,
      },
    ];
    return seqTreated[step];
  }

  if (theme === 'ra') {
    if (effectiveUntreated) {
      const seq: StoryboardMoment[] = [
        {
          step: 0,
          label: '1 · Valve calcifiée',
          title: 'Obstacle serré à l’éjection',
          whatHappens: 'La valve aortique ne s’ouvre qu’à 0,75 cm² : le sang accélère en jet turbulent avec un gradient ΔP élevé.',
          focusTab: 'coeur',
          focusZone: 'aortique',
          focusLabel: 'Valve aortique obstruée',
          embolDetached: false,
          clotProgress: 0,
          treatmentHeal: 0,
        },
        {
          step: 1,
          label: '2 · Risque syncopal',
          title: 'Chute de perfusion si vasodilatation',
          whatHappens: 'Devant un obstacle fixe, baisser les résistances périphériques effondre la pression cérébrale.',
          focusTab: 'coeur',
          focusZone: 'aortique',
          focusLabel: 'Gradient critique à l’effort',
          embolDetached: false,
          clotProgress: 0,
          treatmentHeal: 0,
        },
        {
          step: 2,
          label: '3 · HVG concentrique',
          title: 'Épaississement serré de la paroi VG',
          whatHappens: 'À force de pousser > 180 mmHg, le muscle s’épaissit et devient rigide.',
          focusTab: 'coeur',
          focusZone: 'vg',
          focusLabel: 'Hypertrophie VG serrée',
          embolDetached: false,
          clotProgress: 0,
          treatmentHeal: 0,
        },
        {
          step: 3,
          label: '4 · Épuisement du VG',
          title: 'Défaillance cardiaque sur obstacle négligé',
          whatHappens: 'Le muscle finit par s’épuiser : la FE chute et la congestion pulmonaire s’installe.',
          focusTab: 'coeur',
          focusZone: 'vg',
          focusLabel: 'Décompensation tardive',
          embolDetached: false,
          clotProgress: 0,
          treatmentHeal: 0,
        },
      ];
      return seq[step];
    }
    const seqTreated: StoryboardMoment[] = [
      {
        step: 0,
        label: '1 · Respect hémodynamique',
        title: 'Pression de perfusion préservée',
        whatHappens: 'Sans vasodilatateur agressif, la pression aortique reste suffisante pour perfuser coronaires et cerveau.',
        focusTab: 'coeur',
        focusZone: 'aortique',
        focusLabel: 'Valve identifiée & surveillée',
        embolDetached: false,
        clotProgress: 0,
        treatmentHeal: 0.3,
      },
      {
        step: 1,
        label: '2 · Bilan pré-intervention',
        title: 'Pas de malaise iatrogène',
        whatHappens: 'Le patient est orienté en sécurité vers une correction mécanique (TAVI ou chirurgie).',
        focusTab: 'coeur',
        focusZone: 'aortique',
        focusLabel: 'Stabilité avant geste valvulaire',
        embolDetached: false,
        clotProgress: 0,
        treatmentHeal: 0.55,
      },
      {
        step: 2,
        label: '3 · Remplacement préparé',
        title: 'Muscle encore tonique',
        whatHappens: 'La fonction contractile du VG est préservée au moment d’intervenir sur la valve.',
        focusTab: 'coeur',
        focusZone: 'aortique',
        focusLabel: 'Fonction VG conservée',
        embolDetached: false,
        clotProgress: 0,
        treatmentHeal: 0.8,
      },
      {
        step: 3,
        label: '4 · Obstacle levé',
        title: 'Ouverture valvulaire restaurée',
        whatHappens: 'Après remplacement valvulaire, le gradient ΔP disparaît et l’hypertrophie du VG régresse.',
        focusTab: 'coeur',
        focusZone: 'aortique',
        focusLabel: 'Valve fonctionnelle',
        embolDetached: false,
        clotProgress: 0,
        treatmentHeal: 1,
      },
    ];
    return seqTreated[step];
  }

  if (theme === 'vd') {
    const seq: StoryboardMoment[] = effectiveUntreated
      ? [
          {
            step: 0,
            label: '1 · Stase droite',
            title: 'Pression veineuse centrale élevée',
            whatHappens: 'Le VD pousse difficilement : le sang stagne dans les veines caves.',
            focusTab: 'coeur',
            focusZone: 'vd',
            focusLabel: 'Ventricule droit surchargé',
            embolDetached: false,
            clotProgress: 0,
            treatmentHeal: 0,
          },
          {
            step: 1,
            label: '2 · Congestion périphérique',
            title: 'Œdèmes & engorgement veineux',
            whatHappens: 'Le retour veineux freiné fait gonfler les membres inférieurs et le foie.',
            focusTab: 'corps',
            focusZone: 'cheville',
            focusLabel: 'Congestion veineuse systémique',
            embolDetached: false,
            clotProgress: 0,
            treatmentHeal: 0,
          },
          {
            step: 2,
            label: '3 · Sous-remplissage gauche',
            title: 'Baisse du débit & souffrance rénale',
            whatHappens: 'Moins de sang traverse les poumons vers le VG, réduisant la perfusion des reins.',
            focusTab: 'coeur',
            focusZone: 'vd',
            focusLabel: 'Bas débit vers le VG',
            embolDetached: false,
            clotProgress: 0,
            treatmentHeal: 0,
          },
          {
            step: 3,
            label: '4 · Décompensation droite',
            title: 'Cœur pulmonaire décompensé',
            whatHappens: 'Congestion veineuse majeure et hypotension systémique.',
            focusTab: 'corps',
            focusZone: 'cheville',
            focusLabel: 'Surcharge veineuse sévère',
            embolDetached: false,
            clotProgress: 0,
            treatmentHeal: 0,
          },
        ]
      : [
          {
            step: 0,
            label: '1 · Décharge mesurée',
            title: 'Réduction douce de la surcharge cave',
            whatHappens: 'Le diurétique ou l’iSGLT2 allège la PVC sans priver le VG de précharge.',
            focusTab: 'coeur',
            focusZone: 'vd',
            focusLabel: 'Décongestion du VD',
            embolDetached: false,
            clotProgress: 0,
            treatmentHeal: 0.35,
          },
          {
            step: 1,
            label: '2 · Retour fluide',
            title: 'Veines caves désengorgées',
            whatHappens: 'La PVC repasse sous 10 mmHg et les œdèmes diminuent.',
            focusTab: 'corps',
            focusZone: 'cheville',
            focusLabel: 'Dégonflement veineux',
            embolDetached: false,
            clotProgress: 0,
            treatmentHeal: 0.65,
          },
          {
            step: 2,
            label: '3 · Équilibre gauche-droit',
            title: 'Débit & fonction rénale stables',
            whatHappens: 'Les reins ne subissent plus la contre-pression veineuse.',
            focusTab: 'coeur',
            focusZone: 'vd',
            focusLabel: 'Débit équilibré',
            embolDetached: false,
            clotProgress: 0,
            treatmentHeal: 0.88,
          },
          {
            step: 3,
            label: '4 · Stabilité durable',
            title: 'Tolérance fonctionnelle préservée',
            whatHappens: 'La volémie maîtrisée évite les poussées œdémateuses.',
            focusTab: 'corps',
            focusZone: 'cheville',
            focusLabel: 'Équilibre veineux durable',
            embolDetached: false,
            clotProgress: 0,
            treatmentHeal: 1,
          },
        ];
    return seq[step];
  }

  // Default HTA / general cardiovascular storyboard
  if (effectiveUntreated) {
    const seq: StoryboardMoment[] = [
      {
        step: 0,
        label: '1 · Surpression artérielle',
        title: 'Résistances élevées & stress pariétal',
        whatHappens: 'Les artérioles serrées élèvent la pression ; l’amlodipine seule peut aussi provoquer un œdème des chevilles.',
        focusTab: 'corps',
        focusZone: 'cheville',
        focusLabel: 'Hypertension & capillaires sous pression',
        embolDetached: false,
        clotProgress: 0,
        treatmentHeal: 0,
      },
      {
        step: 1,
        label: '2 · Paroi épaissie',
        title: 'Épaississement de la média artérielle',
        whatHappens: 'Sous l’effet de la pression chronique, le muscle de la paroi artérielle s’épaissit et perd sa souplesse.',
        focusTab: 'vaisseau',
        focusZone: 'plaque',
        focusLabel: 'Média épaissie & rigidité',
        embolDetached: false,
        clotProgress: 0.1,
        treatmentHeal: 0,
      },
      {
        step: 2,
        label: '3 · Hypertrophie du VG',
        title: 'Le ventricule gauche s’épaissit (HVG)',
        whatHappens: 'Le cœur doit lutter contre une postcharge élevée : la paroi ventriculaire s’hypertrophie et se rigidifie.',
        focusTab: 'coeur',
        focusZone: 'vg',
        focusLabel: 'Hypertrophie ventriculaire gauche',
        embolDetached: false,
        clotProgress: 0.15,
        treatmentHeal: 0,
      },
      {
        step: 3,
        label: '4 · Atteinte d’organes',
        title: 'Risque d’AVC, d’IC et d’atteinte rénale',
        whatHappens: 'L’HTA non contrôlée favorise plaque vasculaire, néphroangiosclérose et accident vasculaire.',
        focusTab: 'corps',
        focusZone: 'cerveau',
        focusLabel: 'Organes cibles exposés',
        embolDetached: false,
        clotProgress: 0.3,
        treatmentHeal: 0,
      },
    ];
    return seq[step];
  }

  const seqTreated: StoryboardMoment[] = [
    {
      step: 0,
      label: '1 · Vasodilatation équilibrée',
      title: 'Ouverture des résistances artériolaires',
      whatHappens: 'Le bloqueur RAA (IEC/ARA II) équilibre artériole et veinule : la PA baisse et la pression capillaire diminue.',
      focusTab: 'corps',
      focusZone: 'cheville',
      focusLabel: 'Rééquilibrage microcirculatoire',
      embolDetached: false,
      clotProgress: 0,
      treatmentHeal: 0.3,
    },
    {
      step: 1,
      label: '2 · Chevilles soulagées',
      title: 'Régression des œdèmes & PA maîtrisée',
      whatHappens: 'L’œdème malléolaire recule (~−55 %) et la pression artérielle revient sous le seuil cible.',
      focusTab: 'corps',
      focusZone: 'cheville',
      focusLabel: 'Résorption de l’œdème',
      embolDetached: false,
      clotProgress: 0,
      treatmentHeal: 0.65,
    },
    {
      step: 2,
      label: '3 · Protection du VG',
      title: 'Régression de l’hypertrophie cardiaque',
      whatHappens: 'La postcharge abaissée permet au muscle ventriculaire de se détendre et d’assouplir son remplissage.',
      focusTab: 'coeur',
      focusZone: 'vg',
      focusLabel: 'Cœur protégé',
      embolDetached: false,
      clotProgress: 0,
      treatmentHeal: 0.88,
    },
    {
      step: 3,
      label: '4 · Organes préservés',
      title: 'Cerveau, cœur et reins sauvegardés à 5 ans',
      whatHappens: 'Un traitement bien suivi réduit fortement les risques d’AVC et d’insuffisance cardiaque.',
      focusTab: 'corps',
      focusZone: 'cerveau',
      focusLabel: 'Protection multi-organes',
      embolDetached: false,
      clotProgress: 0,
      treatmentHeal: 1,
    },
  ];
  return seqTreated[step];
}

export function interpolateTimelineProjection(
  from: TimelineProjection,
  to: TimelineProjection,
  alphaRaw: number
): { params: SimParams; d: DynamicState } {
  const a = clamp(alphaRaw, 0, 1);
  if (a >= 0.999) return { params: to.params, d: to.d };
  if (a <= 0.001) return { params: from.params, d: from.d };

  const lerpNum = (x: number, y: number) => +(x + (y - x) * a).toFixed(2);
  const plaqueFloat = from.params.plaque + (to.params.plaque - from.params.plaque) * a;

  return {
    params: {
      ...to.params,
      fc: lerpNum(from.params.fc, to.params.fc),
      contract: lerpNum(from.params.contract, to.params.contract),
      volume: lerpNum(from.params.volume, to.params.volume),
      resist: lerpNum(from.params.resist, to.params.resist),
      rigidite: lerpNum(from.params.rigidite, to.params.rigidite),
      plaque: Math.round(plaqueFloat),
    },
    d: {
      hvg: clamp(from.d.hvg + (to.d.hvg - from.d.hvg) * a, 0, 1),
    },
  };
}

export function buildVisualStoryOverlay(
  moment: StoryboardMoment,
  inspectionPaused: boolean
): VisualStoryOverlay {
  return {
    focusZone: moment.focusZone,
    focusLabel: moment.focusLabel,
    embolDetached: moment.embolDetached,
    clotProgress: moment.clotProgress,
    treatmentHeal: moment.treatmentHeal,
    inspectionPaused,
  };
}
