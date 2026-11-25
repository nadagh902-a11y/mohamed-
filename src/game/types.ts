export type GameState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'VICTORY' | 'GAME_OVER';

export type WeaponType = 'stick' | 'plate';

export type GaffeType = 'plate_tower' | 'banana_slip' | 'hot_pot' | 'runaway_trolley';

export type RedaBehavior =
  | 'wandering'
  | 'telegraphing'
  | 'slipping'
  | 'stunned'
  | 'splatted'
  | 'recovering';

export interface GameStats {
  score: number;
  bestScore: number;
  stickHits: number;
  plateHits: number;
  platesThrown: number;
  gaffesStopped: number;
  gaffesMissed: number;
  maxCombo: number;
}

export interface HudSnapshot {
  score: number;
  bestScore: number;
  combo: number;
  patience: number; // 0 to 100
  timeRemaining: number; // seconds
  phaseLabel: string;
  activeWeapon: WeaponType;
  platesAmmo: number;
  maxPlates: number;
  plateRechargeProgress: number; // 0 to 1
  stickCooldownProgress: number; // 0 to 1
  stats: GameStats;
}

export interface FlyingPlate {
  id: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  x: number;
  y: number;
  z: number; // height off the ground
  progress: number;
  duration: number;
  rotation: number;
  hitChecked: boolean;
}

export interface StickSwing {
  active: boolean;
  x: number;
  y: number;
  progress: number;
  duration: number;
  angle: number;
  hitSomething: boolean;
}

export interface Particle {
  active: boolean;
  kind: 'shard' | 'dust' | 'star' | 'sauce' | 'ring' | 'sweat';
  x: number;
  y: number;
  vx: number;
  vy: number;
  z: number;
  vz: number;
  size: number;
  rotation: number;
  vRot: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface ComicPopup {
  id: number;
  text: string;
  subtext?: string;
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  scale: number;
  tilt: number;
}

export interface BonusProp {
  active: boolean;
  kind: 'cream_tart' | 'gold_cloche';
  x: number;
  y: number;
  life: number;
  maxLife: number;
  bobPhase: number;
}

export interface FloorSplatter {
  x: number;
  y: number;
  radius: number;
  color: string;
  alpha: number;
  kind: 'sauce' | 'banana' | 'crumbs';
}

export interface RedaEntity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  behavior: RedaBehavior;
  gaffe: GaffeType | null;
  gaffeTimer: number;
  gaffeDuration: number;
  gaffeHitsNeeded: number;
  stateTimer: number;
  walkPhase: number;
  scaleX: number;
  scaleY: number;
  tilt: number;
  hitFlash: number;
  dizzyAngle: number;
  speechText: string;
  speechTimer: number;
  wobbleAngle: number;
  sauceOnFace: number; // 0 to 1
  bumpOnHead: number; // 0 to 1
  targetX: number;
  targetY: number;
}
