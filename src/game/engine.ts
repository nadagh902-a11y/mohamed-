import { soundEngine } from './sound';
import {
  BonusProp,
  ComicPopup,
  FloorSplatter,
  FlyingPlate,
  GaffeType,
  GameStats,
  HudSnapshot,
  Particle,
  RedaEntity,
  StickSwing,
  WeaponType,
} from './types';

const ROUND_DURATION = 75;
const MAX_PLATES = 6;
const PLATE_RECHARGE_TIME = 1.05;
const STICK_COOLDOWN = 0.24;
const PARTICLE_POOL_SIZE = 160;
const BEST_SCORE_STORAGE_KEY = 'sacre_reda_best_score_v1';

const REDA_QUIPS_HIT_STICK = [
  'AÏE ! Selekni larabi !',
  'Selekni larabi !',
  'WAAAH ! Selekni larabi !',
  'Selekni larabi, pas sur la tête !',
];

const REDA_QUIPS_HIT_PLATE = [
  'WAAAH ! Selekni larabi !',
  'Selekni larabi !',
  'AÏE ! Selekni larabi, plein la figure !',
  'Selekni larabi, elle était propre !',
];

const REDA_QUIPS_GAFFE = {
  plate_tower: ['Ça penche beaucoup là…', 'Je tiens l’équilibre !', 'Attention la pile !'],
  banana_slip: ['C’est qui qu’a mis une banane ?!', 'Woooaaah ça glisse !', 'Je maîtrise pas !'],
  hot_pot: ['Chaud chaud chaud !', 'La soupe brûle les doigts !', 'Où je pose ça ?!'],
  runaway_trolley: ['Y’a plus de freins !', 'Poussez-vous !', 'Le chariot est fou !'],
};

const REDA_QUIPS_FAIL = [
  'Oups… c’est réparable ?',
  'C’était déjà cassé avant !',
  'Promis je balaie tout !',
];

export interface EngineCallbacks {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onGameEnd: (victory: boolean, snapshot: HudSnapshot) => void;
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private callbacks: EngineCallbacks;

  private rafId: number | null = null;
  private lastTimestamp = 0;
  private running = false;
  private paused = false;

  // Viewport logical dimensions (responsive full bleed, height anchored ~720)
  private width = 1280;
  private height = 720;
  private dpr = 1;

  // Simulation state
  private timeRemaining = ROUND_DURATION;
  private patience = 100;
  private score = 0;
  private bestScore = 0;
  private combo = 0;
  private comboTimer = 0;
  private activeWeapon: WeaponType = 'stick';
  private platesAmmo = MAX_PLATES;
  private plateRechargeTimer = 0;
  private stickCooldownTimer = 0;

  private stats: GameStats = {
    score: 0,
    bestScore: 0,
    stickHits: 0,
    plateHits: 0,
    platesThrown: 0,
    gaffesStopped: 0,
    gaffesMissed: 0,
    maxCombo: 0,
  };

  // Juice & feedback
  private hitstopTimer = 0;
  private shakeTime = 0;
  private shakeIntensity = 0;
  private potSwayAngle = 0;
  private potSwayVel = 0;
  private chefAngryTimer = 0;
  private chefCheerTimer = 0;
  private chefShoutText = '';

  // Entities
  private reda: RedaEntity;
  private flyingPlates: FlyingPlate[] = [];
  private nextPlateId = 1;
  private stickSwing: StickSwing = {
    active: false,
    x: 0,
    y: 0,
    progress: 0,
    duration: 0.18,
    angle: -0.6,
    hitSomething: false,
  };
  private particles: Particle[] = [];
  private popups: ComicPopup[] = [];
  private nextPopupId = 1;
  private splatters: FloorSplatter[] = [];
  private bonusProp: BonusProp = {
    active: false,
    kind: 'cream_tart',
    x: 0,
    y: 0,
    life: 0,
    maxLife: 7,
    bobPhase: 0,
  };
  private bonusSpawnTimer = 9;

  // Input state
  private aimX = 640;
  private aimY = 420;
  private heldKeys = new Set<string>();
  private hudSyncCooldown = 0;

  constructor(canvas: HTMLCanvasElement, callbacks: EngineCallbacks) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Impossible d’initialiser le contexte 2D.');
    }
    this.ctx = context;
    this.callbacks = callbacks;

    try {
      const saved = localStorage.getItem(BEST_SCORE_STORAGE_KEY);
      if (saved) {
        const parsed = Number.parseInt(saved, 10);
        if (!Number.isNaN(parsed)) {
          this.bestScore = parsed;
        }
      }
    } catch {
      // Ignore storage access failures
    }

    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      this.particles.push({
        active: false,
        kind: 'dust',
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        z: 0,
        vz: 0,
        size: 6,
        rotation: 0,
        vRot: 0,
        life: 0,
        maxLife: 1,
        color: '#ffffff',
      });
    }

    this.reda = this.createInitialReda();
    this.resize();
  }

  private createInitialReda(): RedaEntity {
    return {
      x: this.width * 0.5,
      y: this.height * 0.62,
      vx: 0,
      vy: 0,
      facing: 1,
      behavior: 'wandering',
      gaffe: null,
      gaffeTimer: 0,
      gaffeDuration: 2.5,
      gaffeHitsNeeded: 1,
      stateTimer: 1.1,
      walkPhase: 0,
      scaleX: 1,
      scaleY: 1,
      tilt: 0,
      hitFlash: 0,
      dizzyAngle: 0,
      speechText: 'Bonjour Chef ! Tout va bien se passer !',
      speechTimer: 2.4,
      wobbleAngle: 0,
      sauceOnFace: 0,
      bumpOnHead: 0,
      targetX: this.width * 0.68,
      targetY: this.height * 0.6,
    };
  }

  public resize(): void {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    const cssW = Math.max(320, rect ? rect.width : window.innerWidth);
    const cssH = Math.max(320, rect ? rect.height : window.innerHeight);

    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;

    // Logical height fixed at 720, logical width adapts cleanly to viewport aspect
    const scale = cssH / 720;
    this.height = 720;
    this.width = Math.max(640, cssW / scale);

    // Keep Réda & aim inside updated bounds
    const bounds = this.getArenaBounds();
    this.reda.x = Math.max(bounds.minX, Math.min(bounds.maxX, this.reda.x));
    this.reda.y = Math.max(bounds.minY, Math.min(bounds.maxY, this.reda.y));
    this.aimX = Math.max(40, Math.min(this.width - 40, this.aimX));
    this.aimY = Math.max(80, Math.min(this.height - 40, this.aimY));
  }

  private getArenaBounds() {
    const marginX = Math.min(130, this.width * 0.12);
    return {
      minX: marginX,
      maxX: this.width - marginX,
      minY: 315,
      maxY: this.height - 105,
    };
  }

  public startNewGame(): void {
    this.stop();
    this.timeRemaining = ROUND_DURATION;
    this.patience = 100;
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.activeWeapon = 'stick';
    this.platesAmmo = MAX_PLATES;
    this.plateRechargeTimer = 0;
    this.stickCooldownTimer = 0;
    this.hitstopTimer = 0;
    this.shakeTime = 0;
    this.shakeIntensity = 0;
    this.chefAngryTimer = 0;
    this.chefCheerTimer = 0;
    this.chefShoutText = '';
    this.flyingPlates = [];
    this.popups = [];
    this.splatters = [];
    this.stickSwing.active = false;
    this.bonusProp.active = false;
    this.bonusSpawnTimer = 8;

    for (const p of this.particles) {
      p.active = false;
    }

    this.stats = {
      score: 0,
      bestScore: this.bestScore,
      stickHits: 0,
      plateHits: 0,
      platesThrown: 0,
      gaffesStopped: 0,
      gaffesMissed: 0,
      maxCombo: 0,
    };

    this.reda = this.createInitialReda();
    this.aimX = this.width * 0.5;
    this.aimY = this.height * 0.55;
    this.paused = false;
    this.running = true;
    this.lastTimestamp = performance.now();

    this.emitHud();
    this.loop(this.lastTimestamp);
  }

  public setPaused(paused: boolean): void {
    if (!this.running) return;
    this.paused = paused;
    if (!paused) {
      this.lastTimestamp = performance.now();
    } else {
      this.clearHeldKeys();
      soundEngine.stopVoice();
    }
  }

  public stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.clearHeldKeys();
    soundEngine.stopVoice();
  }

  public clearHeldKeys(): void {
    this.heldKeys.clear();
  }

  public setWeapon(weapon: WeaponType): void {
    if (this.activeWeapon !== weapon) {
      this.activeWeapon = weapon;
      this.emitHud();
    }
  }

  public getWeapon(): WeaponType {
    return this.activeWeapon;
  }

  public handleKeyDown(code: string): void {
    this.heldKeys.add(code);
  }

  public handleKeyUp(code: string): void {
    this.heldKeys.delete(code);
  }

  public updatePointerLogical(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const normX = (clientX - rect.left) / rect.width;
    const normY = (clientY - rect.top) / rect.height;
    this.aimX = Math.max(20, Math.min(this.width - 20, normX * this.width));
    this.aimY = Math.max(50, Math.min(this.height - 20, normY * this.height));
  }

  public triggerPrimaryAction(clientX?: number, clientY?: number): void {
    if (!this.running || this.paused) return;
    if (clientX !== undefined && clientY !== undefined) {
      this.updatePointerLogical(clientX, clientY);
    }
    if (this.activeWeapon === 'stick') {
      this.swingStick(this.aimX, this.aimY);
    } else {
      this.throwPlate(this.aimX, this.aimY);
    }
  }

  public triggerSecondaryAction(clientX?: number, clientY?: number): void {
    if (!this.running || this.paused) return;
    if (clientX !== undefined && clientY !== undefined) {
      this.updatePointerLogical(clientX, clientY);
    }
    // Secondary action always fires the alternate weapon (right click -> plate, or stick if plate active)
    if (this.activeWeapon === 'stick') {
      this.throwPlate(this.aimX, this.aimY);
    } else {
      this.swingStick(this.aimX, this.aimY);
    }
  }

  public triggerStickAtReticle(): void {
    if (!this.running || this.paused) return;
    this.swingStick(this.aimX, this.aimY);
  }

  public triggerPlateAtReticle(): void {
    if (!this.running || this.paused) return;
    this.throwPlate(this.aimX, this.aimY);
  }

  private swingStick(targetX: number, targetY: number): void {
    if (this.stickCooldownTimer > 0) return;
    soundEngine.unlock();
    soundEngine.playStickSwing();

    this.stickCooldownTimer = STICK_COOLDOWN;
    this.stickSwing = {
      active: true,
      x: targetX,
      y: targetY,
      progress: 0,
      duration: 0.18,
      angle: targetX < this.width * 0.5 ? -0.9 : 0.9,
      hitSomething: false,
    };

    // Check bonus prop hit
    if (this.bonusProp.active) {
      const distProp = Math.hypot(targetX - this.bonusProp.x, targetY - (this.bonusProp.y - 18));
      if (distProp < 78) {
        this.collectBonusProp();
        this.stickSwing.hitSomething = true;
      }
    }

    // Check Réda hit (generous cartoon broomstick arc)
    const redaCenterY = this.reda.y - 52;
    const dist = Math.hypot(targetX - this.reda.x, targetY - redaCenterY);
    if (dist <= 112) {
      this.stickSwing.hitSomething = true;
      this.applyStickHitToReda(targetX);
    } else {
      // Missed swing dust puff
      this.spawnDustBurst(targetX, Math.max(260, targetY), 5, '#e8d7be');
    }

    this.emitHud();
  }

  private throwPlate(targetX: number, targetY: number): void {
    if (this.platesAmmo <= 0) {
      this.addPopup('PLUS D’ASSIETTES !', 'Frappez au bâton pour recharger', targetX, targetY - 25, '#f59e0b', 0.85);
      return;
    }

    soundEngine.unlock();
    soundEngine.playPlateThrow();

    this.platesAmmo -= 1;
    this.stats.platesThrown += 1;

    const startX = this.width * 0.5 + (targetX - this.width * 0.5) * 0.25;
    const startY = this.height + 24;
    const dist = Math.hypot(targetX - startX, targetY - startY);
    const duration = Math.max(0.22, Math.min(0.42, dist / 1650));

    this.flyingPlates.push({
      id: this.nextPlateId++,
      startX,
      startY,
      targetX,
      targetY,
      x: startX,
      y: startY,
      z: 30,
      progress: 0,
      duration,
      rotation: 0,
      hitChecked: false,
    });

    this.emitHud();
  }

  private applyStickHitToReda(hitOriginX: number): void {
    const r = this.reda;
    const wasGaffe = r.behavior === 'telegraphing' || r.behavior === 'slipping';
    const wasSlipping = r.behavior === 'slipping';

    this.combo += 1;
    this.comboTimer = 4.2;
    this.stats.stickHits += 1;
    this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);

    // Stick hits reload +2 plates immediately (core slapstick synergy!)
    const prevAmmo = this.platesAmmo;
    this.platesAmmo = Math.min(MAX_PLATES, this.platesAmmo + 2);
    const reloaded = this.platesAmmo - prevAmmo;

    soundEngine.playStickBonk(this.combo);
    soundEngine.playRedaCry();

    // Knockback away from stick swing side
    const pushDir = r.x >= hitOriginX ? 1 : -1;
    r.vx = pushDir * 290;
    r.vy = -70;
    r.scaleX = 1.42;
    r.scaleY = 0.62;
    r.hitFlash = 0.16;
    r.bumpOnHead = Math.min(1, r.bumpOnHead + 0.45);
    r.tilt = pushDir * 0.45;

    // Hitstop + camera shake
    this.hitstopTimer = 0.048;
    this.triggerShake(11, 0.22);

    // Handle multi-hit trolley or standard gaffe
    let basePoints = 100;
    let popupText = 'BONK !';
    let subText = reloaded > 0 ? `+${reloaded} assiette${reloaded > 1 ? 's' : ''}` : undefined;

    if (wasGaffe) {
      r.gaffeHitsNeeded -= 1;
      if (r.gaffeHitsNeeded <= 0) {
        this.stats.gaffesStopped += 1;
        this.patience = Math.min(100, this.patience + 4);
        basePoints = wasSlipping ? 300 : 240;
        popupText = 'GAFFE STOPPÉE !';
        subText = reloaded > 0 ? `BONK +${reloaded} assiette${reloaded > 1 ? 's' : ''}` : 'Quel réflexe !';
        soundEngine.playGaffeStop();
        this.chefCheerTimer = 1.6;
        this.chefShoutText = 'Bien joué !';
        r.gaffe = null;
        r.behavior = 'stunned';
        r.stateTimer = 1.25;
      } else {
        popupText = 'CHARIOT FREINÉ !';
        subText = 'Encore un coup !';
        basePoints = 140;
      }
    } else {
      r.behavior = 'stunned';
      r.stateTimer = 0.95;
    }

    const points = Math.round(basePoints * (1 + (this.combo - 1) * 0.25));
    this.addScore(points);

    r.speechText = REDA_QUIPS_HIT_STICK[Math.floor(Math.random() * REDA_QUIPS_HIT_STICK.length)];
    r.speechTimer = 1.6;

    this.addPopup(`${popupText} +${points}`, subText, r.x, r.y - 125, '#fbbf24', 1.15);
    this.spawnRing(r.x, r.y - 60, '#fde047');
    this.spawnStars(r.x, r.y - 95, 7);
    this.spawnDustBurst(r.x, r.y - 10, 8, '#f5deb3');
  }

  private applyPlateHitToReda(plate: FlyingPlate): void {
    const r = this.reda;
    const wasGaffe = r.behavior === 'telegraphing' || r.behavior === 'slipping';
    const wasSlipping = r.behavior === 'slipping';

    this.combo += 1;
    this.comboTimer = 4.2;
    this.stats.plateHits += 1;
    this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);

    soundEngine.playPlateCrash(true, this.combo);
    soundEngine.playRedaCry();

    const pushDir = r.x >= plate.startX ? 1 : -1;
    r.vx = pushDir * 195;
    r.vy = -45;
    r.scaleX = 0.72;
    r.scaleY = 1.34;
    r.hitFlash = 0.16;
    r.sauceOnFace = 1;
    r.tilt = -pushDir * 0.35;

    this.hitstopTimer = 0.042;
    this.triggerShake(9.5, 0.2);

    let basePoints = 130;
    let popupText = 'CRASH !';
    let subText: string | undefined;

    if (wasGaffe) {
      r.gaffeHitsNeeded -= 1;
      if (r.gaffeHitsNeeded <= 0) {
        this.stats.gaffesStopped += 1;
        this.patience = Math.min(100, this.patience + 5);
        if (wasSlipping) {
          basePoints = 400;
          popupText = 'PLEIN DANS LE MILLE !';
          subText = 'En pleine glissade !';
        } else {
          basePoints = 260;
          popupText = 'GAFFE STOPPÉE !';
          subText = 'Service sauvé !';
        }
        soundEngine.playGaffeStop();
        this.chefCheerTimer = 1.6;
        this.chefShoutText = 'Magnifique tir !';
        r.gaffe = null;
        r.behavior = 'splatted';
        r.stateTimer = 1.3;
      } else {
        popupText = 'PAF DANS LE CHARIOT !';
        subText = 'Encore un coup !';
        basePoints = 160;
      }
    } else {
      r.behavior = 'splatted';
      r.stateTimer = 1.0;
    }

    const points = Math.round(basePoints * (1 + (this.combo - 1) * 0.25));
    this.addScore(points);

    r.speechText = REDA_QUIPS_HIT_PLATE[Math.floor(Math.random() * REDA_QUIPS_HIT_PLATE.length)];
    r.speechTimer = 1.6;

    this.addPopup(`${popupText} +${points}`, subText, r.x, r.y - 125, '#38bdf8', 1.15);
    this.spawnPorcelainShards(plate.x, r.y - 55, 14);
    this.spawnSauceBurst(plate.x, r.y - 60, 10, '#fff7ed');
    this.addFloorSplatter(r.x, r.y + 6, '#e2e8f0', 'crumbs');
  }

  private collectBonusProp(): void {
    if (!this.bonusProp.active) return;
    const prop = this.bonusProp;
    prop.active = false;
    soundEngine.playBonusPop();

    if (prop.kind === 'cream_tart') {
      this.patience = Math.min(100, this.patience + 15);
      this.addScore(250);
      this.addPopup('TARTE SAUVÉE ! +250', '+15% Patience du Chef', prop.x, prop.y - 40, '#4ade80', 1.05);
      this.spawnSauceBurst(prop.x, prop.y, 12, '#fef3c7');
    } else {
      this.platesAmmo = MAX_PLATES;
      this.addScore(300);
      this.addPopup('PLUIE D’ASSIETTES ! +300', 'Pile rechargée à fond', prop.x, prop.y - 40, '#fbbf24', 1.05);
      this.spawnStars(prop.x, prop.y, 10);
    }
    this.emitHud();
  }

  private addScore(points: number): void {
    this.score += points;
    this.stats.score = this.score;
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      this.stats.bestScore = this.bestScore;
      try {
        localStorage.setItem(BEST_SCORE_STORAGE_KEY, String(this.bestScore));
      } catch {
        // ignore
      }
    }
  }

  private triggerShake(intensity: number, duration: number): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeTime = Math.max(this.shakeTime, duration);
    this.potSwayVel += (Math.random() > 0.5 ? 1 : -1) * intensity * 0.25;
  }

  private loop = (timestamp: number): void => {
    if (!this.running) return;
    const rawDt = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;
    const dt = Math.min(Math.max(rawDt, 0), 0.05);

    if (!this.paused) {
      this.update(dt);
    }
    this.render();

    this.rafId = requestAnimationFrame(this.loop);
  };

  private update(dt: number): void {
    // Keyboard reticle aiming (supports both QWERTY WASD and French AZERTY ZQSD + Arrows)
    const aimSpeed = 680;
    let moveX = 0;
    let moveY = 0;
    if (this.heldKeys.has('ArrowLeft') || this.heldKeys.has('KeyA') || this.heldKeys.has('KeyQ')) moveX -= 1;
    if (this.heldKeys.has('ArrowRight') || this.heldKeys.has('KeyD')) moveX += 1;
    if (this.heldKeys.has('ArrowUp') || this.heldKeys.has('KeyW') || this.heldKeys.has('KeyZ')) moveY -= 1;
    if (this.heldKeys.has('ArrowDown') || this.heldKeys.has('KeyS')) moveY += 1;
    if (moveX !== 0 || moveY !== 0) {
      const len = Math.hypot(moveX, moveY);
      this.aimX = Math.max(25, Math.min(this.width - 25, this.aimX + (moveX / len) * aimSpeed * dt));
      this.aimY = Math.max(60, Math.min(this.height - 25, this.aimY + (moveY / len) * aimSpeed * dt));
    }

    // Swaying kitchen pots physics (always runs smoothly)
    const springK = 28;
    const damping = 3.6;
    this.potSwayVel += (-springK * this.potSwayAngle - damping * this.potSwayVel) * dt;
    this.potSwayAngle += this.potSwayVel * dt;

    // Camera shake decay
    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      if (this.shakeTime === 0) {
        this.shakeIntensity = 0;
      }
    }

    // Hitstop pause for punchy cartoon impacts
    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      return;
    }

    // Round timer & Phase difficulty
    this.timeRemaining = Math.max(0, this.timeRemaining - dt);
    if (this.timeRemaining <= 0) {
      this.finishGame(true);
      return;
    }

    if (this.patience <= 0) {
      this.patience = 0;
      this.finishGame(false);
      return;
    }

    // Weapon cooldowns & plate recharge
    if (this.stickCooldownTimer > 0) {
      this.stickCooldownTimer = Math.max(0, this.stickCooldownTimer - dt);
    }
    if (this.platesAmmo < MAX_PLATES) {
      this.plateRechargeTimer += dt;
      if (this.plateRechargeTimer >= PLATE_RECHARGE_TIME) {
        this.plateRechargeTimer -= PLATE_RECHARGE_TIME;
        this.platesAmmo += 1;
      }
    } else {
      this.plateRechargeTimer = 0;
    }

    // Combo decay
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
      }
    }

    if (this.chefAngryTimer > 0) this.chefAngryTimer = Math.max(0, this.chefAngryTimer - dt);
    if (this.chefCheerTimer > 0) this.chefCheerTimer = Math.max(0, this.chefCheerTimer - dt);

    // Bonus prop spawner
    if (!this.bonusProp.active) {
      this.bonusSpawnTimer -= dt;
      if (this.bonusSpawnTimer <= 0) {
        const bounds = this.getArenaBounds();
        this.bonusProp = {
          active: true,
          kind: Math.random() > 0.45 ? 'cream_tart' : 'gold_cloche',
          x: bounds.minX + 60 + Math.random() * (bounds.maxX - bounds.minX - 120),
          y: bounds.minY + 25 + Math.random() * (bounds.maxY - bounds.minY - 60),
          life: 6.5,
          maxLife: 6.5,
          bobPhase: 0,
        };
        this.bonusSpawnTimer = 11 + Math.random() * 6;
      }
    } else {
      this.bonusProp.life -= dt;
      this.bonusProp.bobPhase += dt * 4.5;
      if (this.bonusProp.life <= 0) {
        this.bonusProp.active = false;
      }
    }

    // Update Stick Swing animation
    if (this.stickSwing.active) {
      this.stickSwing.progress += dt / this.stickSwing.duration;
      if (this.stickSwing.progress >= 1) {
        this.stickSwing.active = false;
      }
    }

    // Update Flying Plates
    for (let i = this.flyingPlates.length - 1; i >= 0; i--) {
      const p = this.flyingPlates[i];
      p.progress += dt / p.duration;
      const t = Math.min(1, p.progress);
      p.x = p.startX + (p.targetX - p.startX) * t;
      p.y = p.startY + (p.targetY - p.startY) * t;
      p.z = Math.sin(t * Math.PI) * 145 + (1 - t) * 24;
      p.rotation += dt * 18;

      // Mid-flight interception check against Réda!
      if (!p.hitChecked && t > 0.25) {
        const visualY = p.y - p.z * 0.45;
        const redaCenterY = this.reda.y - 54;
        const dist = Math.hypot(p.x - this.reda.x, visualY - redaCenterY);
        if (dist <= 62) {
          p.hitChecked = true;
          this.applyPlateHitToReda(p);
          this.flyingPlates.splice(i, 1);
          continue;
        }
      }

      if (t >= 1) {
        // Check bonus prop hit at landing
        let hitProp = false;
        if (this.bonusProp.active) {
          const distProp = Math.hypot(p.x - this.bonusProp.x, p.y - (this.bonusProp.y - 16));
          if (distProp < 64) {
            this.collectBonusProp();
            hitProp = true;
          }
        }
        // Check landing splash radius on Réda
        const redaCenterY = this.reda.y - 46;
        const distLand = Math.hypot(p.x - this.reda.x, p.y - redaCenterY);
        if (distLand <= 76) {
          this.applyPlateHitToReda(p);
        } else if (!hitProp) {
          // Missed plate shatters harmlessly on floor
          soundEngine.playPlateCrash(false, 0);
          this.spawnPorcelainShards(p.x, p.y, 9);
          this.addFloorSplatter(p.x, p.y, '#e2e8f0', 'crumbs');
        }
        this.flyingPlates.splice(i, 1);
      }
    }

    // Update Réda AI & Physics
    this.updateReda(dt);

    // Update particles
    for (const pt of this.particles) {
      if (!pt.active) continue;
      pt.life -= dt;
      if (pt.life <= 0) {
        pt.active = false;
        continue;
      }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.rotation += pt.vRot * dt;
      if (pt.kind === 'shard' || pt.kind === 'sauce') {
        pt.vz -= 780 * dt;
        pt.z += pt.vz * dt;
        if (pt.z < 0) {
          pt.z = 0;
          pt.vz = -pt.vz * 0.35;
          pt.vx *= 0.65;
          pt.vy *= 0.65;
        }
      } else if (pt.kind === 'ring') {
        pt.size += dt * 260;
      }
    }

    // Update comic popups
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const pop = this.popups[i];
      pop.life -= dt;
      pop.y += pop.vy * dt;
      pop.vy *= 0.94;
      if (pop.life <= 0) {
        this.popups.splice(i, 1);
      }
    }

    // Fade floor splatters gradually
    for (let i = this.splatters.length - 1; i >= 0; i--) {
      this.splatters[i].alpha -= dt * 0.045;
      if (this.splatters[i].alpha <= 0) {
        this.splatters.splice(i, 1);
      }
    }

    // Throttled HUD sync (10Hz max + immediate on actions)
    this.hudSyncCooldown -= dt;
    if (this.hudSyncCooldown <= 0) {
      this.hudSyncCooldown = 0.1;
      this.emitHud();
    }
  }

  private getDifficultyFactor(): number {
    const elapsed = ROUND_DURATION - this.timeRemaining;
    return Math.min(1, elapsed / ROUND_DURATION);
  }

  private updateReda(dt: number): void {
    const r = this.reda;
    const bounds = this.getArenaBounds();
    const diff = this.getDifficultyFactor();

    // Spring squash & stretch back to (1, 1)
    r.scaleX += (1 - r.scaleX) * Math.min(1, dt * 13);
    r.scaleY += (1 - r.scaleY) * Math.min(1, dt * 13);
    r.tilt += (0 - r.tilt) * Math.min(1, dt * 8);
    if (r.hitFlash > 0) r.hitFlash = Math.max(0, r.hitFlash - dt);
    if (r.speechTimer > 0) r.speechTimer = Math.max(0, r.speechTimer - dt);
    if (r.sauceOnFace > 0) r.sauceOnFace = Math.max(0, r.sauceOnFace - dt * 0.14);
    if (r.bumpOnHead > 0) r.bumpOnHead = Math.max(0, r.bumpOnHead - dt * 0.06);
    r.dizzyAngle += dt * 7;

    if (r.behavior === 'stunned' || r.behavior === 'splatted') {
      // Friction slide after impact
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.vx *= Math.pow(0.06, dt);
      r.vy *= Math.pow(0.06, dt);
      r.stateTimer -= dt;
      if (r.stateTimer <= 0) {
        r.behavior = 'wandering';
        r.stateTimer = Math.max(0.35, 1.0 - diff * 0.55);
        this.pickNewWanderTarget();
      }
    } else if (r.behavior === 'wandering') {
      const speed = 155 + diff * 135;
      const dx = r.targetX - r.x;
      const dy = r.targetY - r.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 14) {
        r.vx = (dx / dist) * speed;
        r.vy = (dy / dist) * speed;
        r.facing = r.vx >= 0 ? 1 : -1;
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        r.walkPhase += dt * (9 + diff * 4);
      } else {
        this.pickNewWanderTarget();
      }

      r.stateTimer -= dt;
      if (r.stateTimer <= 0) {
        this.startGaffe();
      }
    } else if (r.behavior === 'telegraphing') {
      r.gaffeTimer += dt;
      r.wobbleAngle = Math.sin(r.gaffeTimer * 18) * 0.14;

      if (r.gaffe === 'plate_tower') {
        // Walks nervously toward center/counter while plates wobble
        const speed = 110 + diff * 70;
        const dx = r.targetX - r.x;
        const dy = r.targetY - r.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 10) {
          r.x += (dx / dist) * speed * dt;
          r.y += (dy / dist) * speed * dt;
          r.facing = dx >= 0 ? 1 : -1;
          r.walkPhase += dt * 11;
        }
      } else if (r.gaffe === 'hot_pot') {
        // Hops frantically in place!
        r.walkPhase += dt * 18;
      } else if (r.gaffe === 'banana_slip') {
        // Pre-slip anticipation wobble -> transitions into fast slide!
        if (r.gaffeTimer >= 0.72) {
          r.behavior = 'slipping';
          r.gaffeTimer = 0;
          r.gaffeDuration = 1.45 - diff * 0.3;
          const slideDir = r.x < this.width * 0.5 ? 1 : -1;
          r.facing = slideDir;
          r.vx = slideDir * (440 + diff * 165);
          r.vy = (Math.random() - 0.5) * 90;
          soundEngine.playSlideWhistle();
          this.addFloorSplatter(r.x, r.y + 8, '#facc15', 'banana');
        }
        return;
      } else if (r.gaffe === 'runaway_trolley') {
        // Windup before trolley charges across!
        if (r.gaffeTimer >= 0.75) {
          r.behavior = 'slipping';
          r.gaffeTimer = 0;
          r.gaffeDuration = 1.55 - diff * 0.25;
          const dir = r.x < this.width * 0.5 ? 1 : -1;
          r.facing = dir;
          r.vx = dir * (400 + diff * 130);
          r.vy = 0;
        }
        return;
      }

      if (r.gaffeTimer >= r.gaffeDuration) {
        this.failGaffe();
      }
    } else if (r.behavior === 'slipping') {
      r.gaffeTimer += dt;
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.walkPhase += dt * 22;

      // Bounce off vertical floor bounds while sliding
      if (r.y < bounds.minY || r.y > bounds.maxY) {
        r.vy = -r.vy;
      }

      // If hitting side walls while sliding, disaster triggers!
      if (r.x <= bounds.minX + 12 || r.x >= bounds.maxX - 12 || r.gaffeTimer >= r.gaffeDuration) {
        this.failGaffe();
      }
    }

    // Clamp Réda cleanly inside arena floor
    r.x = Math.max(bounds.minX, Math.min(bounds.maxX, r.x));
    r.y = Math.max(bounds.minY, Math.min(bounds.maxY, r.y));
  }

  private pickNewWanderTarget(): void {
    const bounds = this.getArenaBounds();
    this.reda.targetX = bounds.minX + 40 + Math.random() * (bounds.maxX - bounds.minX - 80);
    this.reda.targetY = bounds.minY + 20 + Math.random() * (bounds.maxY - bounds.minY - 40);
  }

  private startGaffe(): void {
    const r = this.reda;
    const diff = this.getDifficultyFactor();

    const pool: GaffeType[] = ['plate_tower', 'banana_slip', 'hot_pot'];
    if (diff > 0.28) {
      pool.push('runaway_trolley');
    }
    const chosen = pool[Math.floor(Math.random() * pool.length)];

    r.behavior = 'telegraphing';
    r.gaffe = chosen;
    r.gaffeTimer = 0;
    r.gaffeHitsNeeded = chosen === 'runaway_trolley' ? 2 : 1;
    r.gaffeDuration = Math.max(1.65, 2.75 - diff * 0.95);
    this.pickNewWanderTarget();

    const quips = REDA_QUIPS_GAFFE[chosen];
    r.speechText = quips[Math.floor(Math.random() * quips.length)];
    r.speechTimer = 2.1;

    if (chosen === 'banana_slip') {
      this.addPopup('PEAU DE BANANE !', 'Sortez une assiette !', r.x, r.y - 120, '#facc15', 0.95);
    } else if (chosen === 'runaway_trolley') {
      this.addPopup('CHARIOT FOU !', '2 coups pour l’arrêter !', r.x, r.y - 125, '#fb7185', 1.0);
    }
  }

  private failGaffe(): void {
    const r = this.reda;
    const gaffe = r.gaffe;
    this.stats.gaffesMissed += 1;
    this.combo = 0;

    const damage = gaffe === 'runaway_trolley' ? 22 : 16;
    this.patience = Math.max(0, this.patience - damage);
    soundEngine.playGaffeFail();
    this.triggerShake(14, 0.32);

    this.chefAngryTimer = 2.0;
    this.chefShoutText = 'RÉDA !!! MA VAISSELLE !';

    r.behavior = 'recovering';
    r.behavior = 'stunned';
    r.gaffe = null;
    r.stateTimer = 0.85;
    r.scaleX = 1.45;
    r.scaleY = 0.58;
    r.speechText = REDA_QUIPS_FAIL[Math.floor(Math.random() * REDA_QUIPS_FAIL.length)];
    r.speechTimer = 2.0;

    this.addPopup('CATASTROPHE !', `-${damage}% Patience du Chef`, r.x, r.y - 125, '#ef4444', 1.2);
    this.spawnPorcelainShards(r.x, r.y - 30, 12);
    this.spawnSauceBurst(r.x, r.y - 25, 14, '#ef4444');
    this.addFloorSplatter(r.x, r.y + 8, '#dc2626', 'sauce');

    this.emitHud();
  }

  private finishGame(victory: boolean): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.clearHeldKeys();

    if (victory) {
      soundEngine.playVictory();
    } else {
      soundEngine.playGameOver();
    }

    const snap = this.buildHudSnapshot();
    this.callbacks.onGameEnd(victory, snap);
  }

  private buildHudSnapshot(): HudSnapshot {
    const elapsed = ROUND_DURATION - this.timeRemaining;
    let phaseLabel = 'Mise en place';
    if (elapsed > 50) {
      phaseLabel = 'Panique au Banquet';
    } else if (elapsed > 25) {
      phaseLabel = 'Coup de feu';
    }

    return {
      score: this.score,
      bestScore: this.bestScore,
      combo: this.combo,
      patience: Math.round(this.patience),
      timeRemaining: Math.ceil(this.timeRemaining),
      phaseLabel,
      activeWeapon: this.activeWeapon,
      platesAmmo: this.platesAmmo,
      maxPlates: MAX_PLATES,
      plateRechargeProgress: this.platesAmmo < MAX_PLATES ? this.plateRechargeTimer / PLATE_RECHARGE_TIME : 1,
      stickCooldownProgress: this.stickCooldownTimer > 0 ? 1 - this.stickCooldownTimer / STICK_COOLDOWN : 1,
      stats: { ...this.stats },
    };
  }

  private emitHud(): void {
    this.callbacks.onHudUpdate(this.buildHudSnapshot());
  }

  // Particle Helpers (pooled)
  private spawnParticle(cfg: Omit<Particle, 'active'>): void {
    for (const p of this.particles) {
      if (!p.active) {
        Object.assign(p, cfg, { active: true });
        return;
      }
    }
  }

  private spawnPorcelainShards(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 120 + Math.random() * 230;
      this.spawnParticle({
        kind: 'shard',
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd * 0.45,
        z: 18 + Math.random() * 28,
        vz: 140 + Math.random() * 190,
        size: 6 + Math.random() * 7,
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 18,
        life: 0.65 + Math.random() * 0.3,
        maxLife: 0.95,
        color: i % 3 === 0 ? '#93c5fd' : '#ffffff',
      });
    }
  }

  private spawnSauceBurst(x: number, y: number, count: number, color: string): void {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 90 + Math.random() * 190;
      this.spawnParticle({
        kind: 'sauce',
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd * 0.4,
        z: 12 + Math.random() * 24,
        vz: 100 + Math.random() * 160,
        size: 5 + Math.random() * 8,
        rotation: 0,
        vRot: 0,
        life: 0.45 + Math.random() * 0.25,
        maxLife: 0.7,
        color,
      });
    }
  }

  private spawnDustBurst(x: number, y: number, count: number, color: string): void {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * 90;
      this.spawnParticle({
        kind: 'dust',
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd * 0.5 - 20,
        z: 0,
        vz: 0,
        size: 10 + Math.random() * 12,
        rotation: Math.random() * Math.PI,
        vRot: (Math.random() - 0.5) * 4,
        life: 0.35 + Math.random() * 0.2,
        maxLife: 0.55,
        color,
      });
    }
  }

  private spawnStars(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const spd = 130 + Math.random() * 120;
      this.spawnParticle({
        kind: 'star',
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 45,
        z: 0,
        vz: 0,
        size: 9 + Math.random() * 5,
        rotation: Math.random() * Math.PI,
        vRot: (Math.random() - 0.5) * 10,
        life: 0.55 + Math.random() * 0.2,
        maxLife: 0.75,
        color: i % 2 === 0 ? '#fde047' : '#fb923c',
      });
    }
  }

  private spawnRing(x: number, y: number, color: string): void {
    this.spawnParticle({
      kind: 'ring',
      x,
      y,
      vx: 0,
      vy: 0,
      z: 0,
      vz: 0,
      size: 20,
      rotation: 0,
      vRot: 0,
      life: 0.24,
      maxLife: 0.24,
      color,
    });
  }

  private addFloorSplatter(x: number, y: number, color: string, kind: FloorSplatter['kind']): void {
    if (this.splatters.length > 18) {
      this.splatters.shift();
    }
    this.splatters.push({
      x,
      y,
      radius: kind === 'banana' ? 18 : 22 + Math.random() * 14,
      color,
      alpha: 0.85,
      kind,
    });
  }

  private addPopup(
    text: string,
    subtext: string | undefined,
    x: number,
    y: number,
    color: string,
    scale = 1
  ): void {
    this.popups.push({
      id: this.nextPopupId++,
      text,
      subtext,
      x: Math.max(120, Math.min(this.width - 120, x)),
      y: Math.max(95, y),
      vy: -65,
      life: 1.05,
      maxLife: 1.05,
      color,
      scale,
      tilt: (Math.random() - 0.5) * 0.14,
    });
  }

  // ==================== RENDERING ====================
  private render(): void {
    const ctx = this.ctx;
    const scale = this.canvas.height / this.height;

    ctx.save();
    ctx.scale(scale, scale);

    // Apply decaying camera shake
    if (this.shakeTime > 0 && this.shakeIntensity > 0) {
      const decay = this.shakeTime / 0.25;
      const sx = (Math.random() - 0.5) * 2 * this.shakeIntensity * Math.min(1, decay);
      const sy = (Math.random() - 0.5) * 2 * this.shakeIntensity * Math.min(1, decay);
      ctx.translate(sx, sy);
    }

    this.drawBistroBackground(ctx);
    this.drawFloorSplatters(ctx);
    this.drawBonusProp(ctx);
    this.drawReda(ctx);
    this.drawFlyingPlates(ctx);
    this.drawParticles(ctx);
    this.drawStickSwing(ctx);
    this.drawComicPopups(ctx);
    this.drawReticle(ctx);

    ctx.restore();
  }

  private drawBistroBackground(ctx: CanvasRenderingContext2D): void {
    const w = this.width;
    const h = this.height;
    const floorTop = 275;

    // 1. Warm Bistro Cream Wall
    const wallGrad = ctx.createLinearGradient(0, 0, 0, floorTop);
    wallGrad.addColorStop(0, '#f3dfc1');
    wallGrad.addColorStop(1, '#e6c99f');
    ctx.fillStyle = wallGrad;
    ctx.fillRect(-30, -30, w + 60, floorTop + 30);

    // Subtle striped wallpaper accents
    ctx.fillStyle = 'rgba(180, 130, 75, 0.08)';
    for (let x = 0; x < w; x += 48) {
      ctx.fillRect(x, 0, 22, floorTop);
    }

    // Dark Oak Wainscoting along bottom of wall
    ctx.fillStyle = '#5c3823';
    ctx.fillRect(-30, floorTop - 52, w + 60, 52);
    ctx.fillStyle = '#75492e';
    ctx.fillRect(-30, floorTop - 56, w + 60, 7);

    // Swinging Kitchen Doors (left & right)
    const doorWidth = Math.min(115, w * 0.1);
    const drawDoor = (x: number) => {
      ctx.fillStyle = '#6f4228';
      ctx.strokeStyle = '#2b190f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(x, 108, doorWidth, floorTop - 108, [8, 8, 0, 0]);
      ctx.fill();
      ctx.stroke();

      // Porthole window
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.arc(x + doorWidth * 0.5, 165, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    };
    drawDoor(26);
    drawDoor(w - doorWidth - 26);

    // Center Bistro Passe-Plat / Serving Counter Window
    const counterW = Math.min(540, w * 0.46);
    const counterX = (w - counterW) * 0.5;
    const counterTop = 102;

    // Dark kitchen interior behind pass-through
    ctx.fillStyle = '#332219';
    ctx.strokeStyle = '#2b190f';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.roundRect(counterX, counterTop, counterW, floorTop - counterTop - 10, [10, 10, 0, 0]);
    ctx.fill();
    ctx.stroke();

    // Chef Lulu peeking inside the pass-through window!
    const chefCenterX = w * 0.5;
    const chefY = floorTop - 42 + (this.chefAngryTimer > 0 ? Math.sin(performance.now() * 0.04) * 4 : 0);
    // Chef shoulders
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#221610';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(chefCenterX, chefY + 26, 32, 22, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Chef head
    ctx.fillStyle = '#f5bfa0';
    ctx.beginPath();
    ctx.arc(chefCenterX, chefY, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Chef toque hat
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(chefCenterX - 15, chefY - 38, 30, 24, 6);
    ctx.fill();
    ctx.stroke();
    // Chef eyebrows/expression
    ctx.fillStyle = '#221610';
    if (this.chefAngryTimer > 0) {
      ctx.beginPath();
      ctx.moveTo(chefCenterX - 9, chefY - 5);
      ctx.lineTo(chefCenterX - 2, chefY - 1);
      ctx.moveTo(chefCenterX + 9, chefY - 5);
      ctx.lineTo(chefCenterX + 2, chefY - 1);
      ctx.stroke();
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(chefCenterX, chefY + 7, 5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(chefCenterX - 5, chefY - 2, 2, 0, Math.PI * 2);
      ctx.arc(chefCenterX + 5, chefY - 2, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Chef shout bubble
    if (this.chefAngryTimer > 0 || this.chefCheerTimer > 0) {
      const bubbleColor = this.chefAngryTimer > 0 ? '#fee2e2' : '#dcfce7';
      const borderColor = this.chefAngryTimer > 0 ? '#dc2626' : '#16a34a';
      ctx.save();
      ctx.font = '700 14px "Plus Jakarta Sans", sans-serif';
      const tw = ctx.measureText(this.chefShoutText).width + 22;
      const bx = chefCenterX - tw * 0.5;
      const by = counterTop + 8;
      ctx.fillStyle = bubbleColor;
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(bx, by, tw, 28, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#1f1510';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.chefShoutText, chefCenterX, by + 14);
      ctx.restore();
    }

    // Counter ledge & hanging copper pans
    ctx.fillStyle = '#b47445';
    ctx.strokeStyle = '#2b190f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(counterX - 16, floorTop - 26, counterW + 32, 26, 4);
    ctx.fill();
    ctx.stroke();

    // Bistro Sign above pass-through
    ctx.fillStyle = '#7c2d12';
    ctx.beginPath();
    ctx.roundRect(w * 0.5 - 118, 22, 236, 42, 8);
    ctx.fill();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = '#fef3c7';
    ctx.font = '800 20px "Bricolage Grotesque", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BISTROT CHEZ LULU', w * 0.5, 43);

    // Hanging copper pans (sway on camera shake!)
    const panPositions = [w * 0.24, w * 0.3, w * 0.7, w * 0.76];
    panPositions.forEach((px, idx) => {
      ctx.save();
      ctx.translate(px, 32);
      ctx.rotate(this.potSwayAngle * (idx % 2 === 0 ? 1 : -0.85));
      ctx.strokeStyle = '#3f291d';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 42);
      ctx.stroke();

      ctx.fillStyle = idx % 2 === 0 ? '#d97742' : '#c25e2e';
      ctx.strokeStyle = '#2b190f';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 56, idx % 2 === 0 ? 18 : 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });

    // 2. Checkered Terracotta & Cream Bistro Floor
    ctx.fillStyle = '#f5e7cf';
    ctx.fillRect(-30, floorTop, w + 60, h - floorTop + 40);

    const rows = 8;
    const cols = Math.ceil(w / 72) + 4;
    const rowH = (h - floorTop + 20) / rows;
    for (let r = 0; r < rows; r++) {
      const y1 = floorTop + r * rowH;
      const y2 = y1 + rowH;
      const perspScale = 0.72 + (r / rows) * 0.48;
      const tileW = 68 * perspScale;
      const startX = w * 0.5 - (cols * tileW) * 0.5;
      for (let c = 0; c < cols; c++) {
        if ((r + c) % 2 === 0) {
          ctx.fillStyle = '#d46a43';
          ctx.fillRect(startX + c * tileW, y1, tileW + 0.5, y2 - y1 + 0.5);
        }
      }
    }

    // Soft ambient floor shadow near back wall
    const floorShadow = ctx.createLinearGradient(0, floorTop, 0, floorTop + 42);
    floorShadow.addColorStop(0, 'rgba(35, 18, 10, 0.28)');
    floorShadow.addColorStop(1, 'rgba(35, 18, 10, 0)');
    ctx.fillStyle = floorShadow;
    ctx.fillRect(-30, floorTop, w + 60, 42);
  }

  private drawFloorSplatters(ctx: CanvasRenderingContext2D): void {
    for (const sp of this.splatters) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, sp.alpha);
      if (sp.kind === 'banana') {
        // Cartoon yellow banana peel on floor
        ctx.translate(sp.x, sp.y);
        ctx.fillStyle = '#facc15';
        ctx.strokeStyle = '#422006';
        ctx.lineWidth = 2;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.ellipse(i * 9, 2, 10, 4, i * 0.45, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      } else if (sp.kind === 'sauce') {
        ctx.fillStyle = sp.color;
        ctx.beginPath();
        ctx.ellipse(sp.x, sp.y, sp.radius * 1.4, sp.radius * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(sp.x + sp.radius * 0.9, sp.y + 4, sp.radius * 0.35, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Porcelain crumbs
        ctx.fillStyle = sp.color;
        for (let i = 0; i < 4; i++) {
          ctx.fillRect(sp.x + (i - 1.5) * 9, sp.y + (i % 2) * 5, 6, 4);
        }
      }
      ctx.restore();
    }
  }

  private drawBonusProp(ctx: CanvasRenderingContext2D): void {
    if (!this.bonusProp.active) return;
    const p = this.bonusProp;
    const bob = Math.sin(p.bobPhase) * 6;
    const blink = p.life < 1.8 && Math.floor(p.life * 8) % 2 === 0;
    if (blink) return;

    ctx.save();
    // Floor shadow
    ctx.fillStyle = 'rgba(20, 12, 8, 0.25)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 8, 26, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(p.x, p.y - 12 + bob);
    ctx.strokeStyle = '#221610';
    ctx.lineWidth = 2.5;

    if (p.kind === 'cream_tart') {
      // Golden pie crust + whipped cream mound + cherry
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.ellipse(0, 6, 24, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fffbeb';
      ctx.beginPath();
      ctx.arc(0, -2, 16, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(0, -18, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      // Golden service cloche
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(0, 4, 22, Math.PI, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(0, -19, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.font = '700 12px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fef08a';
    ctx.strokeStyle = '#221610';
    ctx.lineWidth = 3;
    const label = p.kind === 'cream_tart' ? 'BONUS PATIENCE' : 'PACK ASSIETTES';
    ctx.strokeText(label, 0, -32);
    ctx.fillText(label, 0, -32);
    ctx.restore();
  }

  private drawReda(ctx: CanvasRenderingContext2D): void {
    const r = this.reda;

    // Ground shadow
    ctx.save();
    ctx.fillStyle = 'rgba(20, 12, 8, 0.28)';
    ctx.beginPath();
    ctx.ellipse(r.x, r.y + 8, 36 * r.scaleX, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    const hopOffset =
      r.behavior === 'telegraphing' && r.gaffe === 'hot_pot'
        ? Math.abs(Math.sin(r.walkPhase)) * 18
        : r.behavior === 'wandering'
        ? Math.abs(Math.sin(r.walkPhase)) * 5
        : 0;

    ctx.translate(r.x, r.y - hopOffset);
    ctx.rotate(r.tilt + (r.behavior === 'slipping' ? -r.facing * 0.42 : 0));
    ctx.scale(r.scaleX * r.facing, r.scaleY);

    const ink = '#221610';
    ctx.strokeStyle = ink;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const stride = r.behavior === 'wandering' || (r.behavior === 'telegraphing' && r.gaffe === 'plate_tower')
      ? Math.sin(r.walkPhase) * 14
      : r.behavior === 'slipping'
      ? 22
      : 0;

    // Runaway trolley behind/in front if active
    if ((r.behavior === 'telegraphing' || r.behavior === 'slipping') && r.gaffe === 'runaway_trolley') {
      ctx.save();
      ctx.translate(28, -28);
      // Cart frame
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(-26, -10, 54, 8);
      ctx.strokeRect(-26, -10, 54, 8);
      ctx.fillRect(-26, 12, 54, 7);
      ctx.strokeRect(-26, 12, 54, 7);
      // Giant cake on cart
      ctx.fillStyle = '#fbcfe8';
      ctx.beginPath();
      ctx.roundRect(-18, -36, 36, 26, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#be185d';
      ctx.fillRect(-18, -26, 36, 5);
      // Wheels
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(-16, 24, 8, 0, Math.PI * 2);
      ctx.arc(18, 24, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Legs & Floppy Shoes
    ctx.fillStyle = '#1e293b';
    // Back leg
    ctx.beginPath();
    ctx.roundRect(-14 - stride * 0.4, -36, 11, 28, 4);
    ctx.fill();
    ctx.stroke();
    // Front leg
    ctx.beginPath();
    ctx.roundRect(3 + stride * 0.4, -36, 11, 28, 4);
    ctx.fill();
    ctx.stroke();

    // Shoes
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.ellipse(-10 - stride * 0.45, -6, 13, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(11 + stride * 0.45, -6, 13, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Torso (Striped waiter shirt)
    ctx.fillStyle = r.hitFlash > 0 ? '#ffffff' : '#e2e8f0';
    ctx.beginPath();
    ctx.roundRect(-18, -80, 36, 46, 10);
    ctx.fill();
    ctx.stroke();

    // Oversized White Apron
    ctx.fillStyle = r.hitFlash > 0 ? '#fef08a' : '#fffdf9';
    ctx.beginPath();
    ctx.moveTo(-16, -64);
    ctx.lineTo(16, -64);
    ctx.lineTo(21, -24);
    ctx.lineTo(-21, -24);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Red Bow Tie (spins when stunned/splatted!)
    ctx.save();
    ctx.translate(4, -77);
    if (r.behavior === 'stunned' || r.behavior === 'splatted') {
      ctx.rotate(r.dizzyAngle * 1.5);
    }
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.moveTo(-10, -6);
    ctx.lineTo(0, 0);
    ctx.lineTo(-10, 6);
    ctx.closePath();
    ctx.moveTo(10, -6);
    ctx.lineTo(0, 0);
    ctx.lineTo(10, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Arms
    const armWave = r.behavior === 'slipping' || r.behavior === 'telegraphing' ? Math.sin(r.walkPhase * 1.3) * 0.5 : 0;
    ctx.fillStyle = '#f4bfa0';
    ctx.save();
    ctx.translate(15, -70);
    ctx.rotate(-0.4 + armWave);
    ctx.beginPath();
    ctx.roundRect(0, -5, 24, 10, 5);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Head
    ctx.save();
    ctx.translate(0, -102);

    // Head base
    ctx.fillStyle = r.hitFlash > 0 ? '#fde047' : '#f4bfa0';
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Comedic red bump on head if bonked
    if (r.bumpOnHead > 0.1) {
      ctx.fillStyle = '#f87171';
      ctx.beginPath();
      ctx.arc(-4, -22, 7 * r.bumpOnHead + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Messy Curly Dark Hair
    ctx.fillStyle = '#291c16';
    const curls = [
      [-14, -18, 9],
      [-5, -23, 10],
      [6, -22, 9],
      [15, -15, 8],
      [-19, -9, 7],
    ];
    for (const [cx, cy, cr] of curls) {
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Sauce/Cream Splatter on face after plate hit
    if (r.sauceOnFace > 0.05) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.92, r.sauceOnFace);
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath();
      ctx.arc(4, 2, 13, 0, Math.PI * 2);
      ctx.arc(-7, -4, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Expressive Cartoon Eyes
    if (r.behavior === 'stunned') {
      // Spiral dizzy eyes @_@
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      for (const ex of [-4, 10]) {
        ctx.beginPath();
        ctx.arc(ex, -3, 5, r.dizzyAngle, r.dizzyAngle + Math.PI * 1.4);
        ctx.stroke();
      }
      // Ouch mouth
      ctx.fillStyle = '#991b1b';
      ctx.beginPath();
      ctx.ellipse(4, 10, 5, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (r.behavior === 'splatted') {
      // Squeezed shut >_< eyes
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-7, -6);
      ctx.lineTo(-1, -3);
      ctx.lineTo(-7, 0);
      ctx.moveTo(13, -6);
      ctx.lineTo(7, -3);
      ctx.lineTo(13, 0);
      ctx.stroke();
      // Wavy grimace
      ctx.beginPath();
      ctx.moveTo(-2, 10);
      ctx.quadraticCurveTo(4, 6, 10, 10);
      ctx.stroke();
    } else {
      // Wide panicked or goofy eyes
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-3, -4, 5.5, 0, Math.PI * 2);
      ctx.arc(10, -4, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(-1.5, -4, 2.3, 0, Math.PI * 2);
      ctx.arc(11.5, -4, 2.3, 0, Math.PI * 2);
      ctx.fill();

      // Rosy nose
      ctx.fillStyle = '#f87171';
      ctx.beginPath();
      ctx.arc(5, 2, 4, 0, Math.PI * 2);
      ctx.fill();

      // Mouth
      ctx.fillStyle = '#7f1d1d';
      ctx.beginPath();
      if (r.behavior === 'telegraphing' || r.behavior === 'slipping') {
        ctx.ellipse(4, 11, 5, 6.5, 0, 0, Math.PI * 2);
      } else {
        ctx.arc(4, 9, 5, 0, Math.PI);
      }
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    // Gaffe Held Props (Plate Tower / Hot Pot)
    if (r.behavior === 'telegraphing' && r.gaffe === 'plate_tower') {
      ctx.save();
      ctx.translate(28, -82);
      ctx.rotate(r.wobbleAngle * 1.8);
      for (let i = 0; i < 6; i++) {
        const offsetX = Math.sin(r.gaffeTimer * 9 + i) * (i * 1.4);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(offsetX, -i * 9, 20, 5.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = ink;
        ctx.stroke();
      }
      ctx.restore();
    } else if (r.behavior === 'telegraphing' && r.gaffe === 'hot_pot') {
      ctx.save();
      ctx.translate(28, -68);
      // Copper boiling pot
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.roundRect(-18, -12, 36, 26, 6);
      ctx.fill();
      ctx.stroke();
      // Red soup bubbling
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.ellipse(0, -12, 16, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();

    // Orbiting dizzy stars when stunned
    if (r.behavior === 'stunned') {
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const a = r.dizzyAngle + (i * Math.PI * 2) / 3;
        const sx = r.x + Math.cos(a) * 28;
        const sy = r.y - 134 + Math.sin(a) * 8;
        this.drawStarShape(ctx, sx, sy, 7, '#fde047', '#221610');
      }
      ctx.restore();
    }

    // Gaffe Telegraph Danger Bar above Réda
    if (r.behavior === 'telegraphing' || r.behavior === 'slipping') {
      const ratio = Math.min(1, r.gaffeTimer / r.gaffeDuration);
      const barW = 76;
      const barX = r.x - barW * 0.5;
      const barY = r.y - 152;
      ctx.save();
      ctx.fillStyle = 'rgba(20, 12, 8, 0.8)';
      ctx.beginPath();
      ctx.roundRect(barX - 2, barY - 2, barW + 4, 14, 7);
      ctx.fill();

      ctx.fillStyle = ratio > 0.65 ? '#ef4444' : '#facc15';
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW * ratio, 10, 5);
      ctx.fill();

      // Exclamation mark badge
      ctx.fillStyle = ratio > 0.65 ? '#ef4444' : '#f59e0b';
      ctx.strokeStyle = '#1f1510';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(barX - 12, barY + 5, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 13px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', barX - 12, barY + 5.5);
      ctx.restore();
    }

    // Speech Bubble above Réda
    if (r.speechTimer > 0 && r.speechText) {
      ctx.save();
      ctx.font = '700 13px "Plus Jakarta Sans", sans-serif';
      const padX = 12;
      const tw = ctx.measureText(r.speechText).width + padX * 2;
      const bx = Math.max(16, Math.min(this.width - tw - 16, r.x - tw * 0.5));
      const by = r.y - (r.behavior === 'telegraphing' || r.behavior === 'slipping' ? 194 : 168);

      ctx.fillStyle = '#fffdf7';
      ctx.strokeStyle = '#221610';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(bx, by, tw, 30, 12);
      ctx.fill();
      ctx.stroke();

      // Bubble tail
      const tailX = Math.max(bx + 14, Math.min(bx + tw - 14, r.x));
      ctx.fillStyle = '#fffdf7';
      ctx.beginPath();
      ctx.moveTo(tailX - 6, by + 29);
      ctx.lineTo(tailX, by + 37);
      ctx.lineTo(tailX + 6, by + 29);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#221610';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(r.speechText, bx + tw * 0.5, by + 15);
      ctx.restore();
    }
  }

  private drawFlyingPlates(ctx: CanvasRenderingContext2D): void {
    for (const p of this.flyingPlates) {
      ctx.save();
      // Floor shadow
      const shadowScale = Math.max(0.45, 1 - p.z / 260);
      ctx.fillStyle = 'rgba(20, 12, 8, 0.28)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 20 * shadowScale, 8 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();

      // Plate body elevated by z
      ctx.translate(p.x, p.y - p.z * 0.45);
      ctx.rotate(p.rotation);
      const sizeScale = 1.25 - p.progress * 0.35;
      ctx.scale(sizeScale, sizeScale);

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#221610';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, 22, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Classic blue porcelain rim
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 15, 8.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawStickSwing(ctx: CanvasRenderingContext2D): void {
    if (!this.stickSwing.active) return;
    const s = this.stickSwing;
    const t = s.progress;
    const alpha = 1 - Math.pow(t, 2);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(s.x, s.y);

    // Motion sweep arc
    ctx.strokeStyle = s.hitSomething ? '#fde047' : '#fef3c7';
    ctx.lineWidth = 9 * (1 - t * 0.6);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, 56, -Math.PI * 0.85, Math.PI * 0.15);
    ctx.stroke();

    // Cartoon Wooden Stick / Broom Handle
    const swingAngle = -1.6 + t * 2.7;
    ctx.rotate(swingAngle);
    ctx.fillStyle = '#b45309';
    ctx.strokeStyle = '#221610';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-12, -110, 15, 118, 6);
    ctx.fill();
    ctx.stroke();

    // Wood grain highlight
    ctx.fillStyle = '#d97706';
    ctx.fillRect(-8, -100, 4, 96);

    ctx.restore();
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const pt of this.particles) {
      if (!pt.active) continue;
      const alpha = Math.max(0, pt.life / pt.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;

      if (pt.kind === 'ring') {
        ctx.strokeStyle = pt.color;
        ctx.lineWidth = 4 * alpha;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.stroke();
      } else if (pt.kind === 'star') {
        this.drawStarShape(ctx, pt.x, pt.y, pt.size, pt.color, '#221610');
      } else if (pt.kind === 'shard') {
        ctx.translate(pt.x, pt.y - pt.z * 0.4);
        ctx.rotate(pt.rotation);
        ctx.fillStyle = pt.color;
        ctx.strokeStyle = '#221610';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-pt.size, pt.size * 0.6);
        ctx.lineTo(0, -pt.size);
        ctx.lineTo(pt.size * 0.8, pt.size * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (pt.kind === 'sauce') {
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y - pt.z * 0.4, pt.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (pt.kind === 'dust') {
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size * (1.2 - alpha * 0.3), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  private drawComicPopups(ctx: CanvasRenderingContext2D): void {
    for (const pop of this.popups) {
      const alpha = Math.min(1, (pop.life / pop.maxLife) * 1.4);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(pop.x, pop.y);
      ctx.rotate(pop.tilt);
      const popScale = pop.scale * (pop.life > pop.maxLife - 0.12 ? 1.18 : 1);
      ctx.scale(popScale, popScale);

      ctx.font = '800 24px "Bricolage Grotesque", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#1b120d';
      ctx.strokeText(pop.text, 0, 0);
      ctx.fillStyle = pop.color;
      ctx.fillText(pop.text, 0, 0);

      if (pop.subtext) {
        ctx.font = '700 13px "Plus Jakarta Sans", sans-serif';
        ctx.lineWidth = 3.5;
        ctx.strokeText(pop.subtext, 0, 22);
        ctx.fillStyle = '#fffdf7';
        ctx.fillText(pop.subtext, 0, 22);
      }

      ctx.restore();
    }
  }

  private drawReticle(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(this.aimX, this.aimY);

    if (this.activeWeapon === 'stick') {
      // Wooden Stick Crosshair
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.9)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#fbbf24';
      ctx.strokeStyle = '#221610';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      // Porcelain Plate Crosshair
      const hasAmmo = this.platesAmmo > 0;
      ctx.strokeStyle = hasAmmo ? 'rgba(56, 189, 248, 0.95)' : 'rgba(248, 113, 113, 0.85)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.stroke();

      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 14, Math.sin(a) * 14);
        ctx.lineTo(Math.cos(a) * 30, Math.sin(a) * 30);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  private drawStarShape(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
    fill: string,
    stroke: string
  ): void {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? radius : radius * 0.45;
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
