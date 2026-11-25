import { useCallback, useEffect, useRef, useState } from 'react';
import { EndModal } from './components/EndModal';
import { GameHud } from './components/GameHud';
import { TitleScreen } from './components/TitleScreen';
import { GameEngine } from './game/engine';
import { soundEngine } from './game/sound';
import { GameState, HudSnapshot, WeaponType } from './game/types';

const INITIAL_HUD: HudSnapshot = {
  score: 0,
  bestScore: 0,
  combo: 0,
  patience: 100,
  timeRemaining: 75,
  phaseLabel: 'Mise en place',
  activeWeapon: 'stick',
  platesAmmo: 6,
  maxPlates: 6,
  plateRechargeProgress: 1,
  stickCooldownProgress: 1,
  stats: {
    score: 0,
    bestScore: 0,
    stickHits: 0,
    plateHits: 0,
    platesThrown: 0,
    gaffesStopped: 0,
    gaffesMissed: 0,
    maxCombo: 0,
  },
};

function readInitialBestScore(): number {
  try {
    const saved = localStorage.getItem('sacre_reda_best_score_v1');
    const parsed = saved ? Number.parseInt(saved, 10) : 0;
    return Number.isNaN(parsed) ? 0 : parsed;
  } catch {
    return 0;
  }
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [muted, setMuted] = useState(false);
  const [hud, setHud] = useState<HudSnapshot>(() => {
    const best = readInitialBestScore();
    return {
      ...INITIAL_HUD,
      bestScore: best,
      stats: { ...INITIAL_HUD.stats, bestScore: best },
    };
  });

  const gameStateRef = useRef<GameState>(gameState);
  gameStateRef.current = gameState;

  // Mount isolated 60fps Canvas Engine once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new GameEngine(canvas, {
      onHudUpdate: (snapshot) => {
        setHud(snapshot);
      },
      onGameEnd: (victory, snapshot) => {
        setHud(snapshot);
        setGameState(victory ? 'VICTORY' : 'GAME_OVER');
      },
    });
    engineRef.current = engine;

    const handleResize = () => engine.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      engine.stop();
      engineRef.current = null;
    };
  }, []);

  const handleStartGame = useCallback(() => {
    soundEngine.unlock();
    setGameState('PLAYING');
    engineRef.current?.resize();
    engineRef.current?.startNewGame();
  }, []);

  const handlePause = useCallback(() => {
    if (gameStateRef.current === 'PLAYING') {
      engineRef.current?.setPaused(true);
      setGameState('PAUSED');
    }
  }, []);

  const handleResume = useCallback(() => {
    if (gameStateRef.current === 'PAUSED') {
      engineRef.current?.setPaused(false);
      setGameState('PLAYING');
    }
  }, []);

  const handleMainMenu = useCallback(() => {
    engineRef.current?.stop();
    setGameState('TITLE_MENU');
  }, []);

  const handleSelectWeapon = useCallback((weapon: WeaponType) => {
    engineRef.current?.setWeapon(weapon);
  }, []);

  const handleToggleMute = useCallback(() => {
    const nextMuted = soundEngine.toggleMute();
    setMuted(nextMuted);
  }, []);

  // Global keyboard shortcuts & held-key tracking with blur safety
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) {
        engineRef.current?.handleKeyDown(e.code);
        return;
      }

      if (e.code === 'KeyM') {
        handleToggleMute();
        return;
      }

      const current = gameStateRef.current;

      if (current === 'TITLE_MENU') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          handleStartGame();
        }
        return;
      }

      if (current === 'VICTORY' || current === 'GAME_OVER') {
        if (e.code === 'Enter') {
          e.preventDefault();
          handleStartGame();
        }
        return;
      }

      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        if (current === 'PLAYING') {
          handlePause();
        } else if (current === 'PAUSED') {
          handleResume();
        }
        return;
      }

      if (current !== 'PLAYING') return;

      engineRef.current?.handleKeyDown(e.code);

      if (e.code === 'Digit1' || e.code === 'Numpad1') {
        engineRef.current?.setWeapon('stick');
      } else if (e.code === 'Digit2' || e.code === 'Numpad2') {
        engineRef.current?.setWeapon('plate');
      } else if (e.code === 'Tab') {
        e.preventDefault();
        const currWeapon = engineRef.current?.getWeapon() ?? 'stick';
        engineRef.current?.setWeapon(currWeapon === 'stick' ? 'plate' : 'stick');
      } else if (e.code === 'Space' || e.code === 'KeyJ') {
        e.preventDefault();
        engineRef.current?.triggerStickAtReticle();
      } else if (e.code === 'KeyE' || e.code === 'KeyF' || e.code === 'KeyK') {
        e.preventDefault();
        engineRef.current?.triggerPlateAtReticle();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      engineRef.current?.handleKeyUp(e.code);
    };

    const onBlur = () => {
      engineRef.current?.clearHeldKeys();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [handlePause, handleResume, handleStartGame, handleToggleMute]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#1b120d]">
      {/* Isolated Canvas Container (never re-rendered on 60fps frames) */}
      <div
        className={`absolute inset-0 ${gameState === 'TITLE_MENU' ? 'invisible pointer-events-none' : 'visible'}`}
      >
        <canvas
          ref={canvasRef}
          onPointerMove={(e) => {
            engineRef.current?.updatePointerLogical(e.clientX, e.clientY);
          }}
          onPointerDown={(e) => {
            if (gameState !== 'PLAYING') return;
            if (e.button === 2) {
              engineRef.current?.triggerSecondaryAction(e.clientX, e.clientY);
            } else {
              engineRef.current?.triggerPrimaryAction(e.clientX, e.clientY);
            }
          }}
          onContextMenu={(e) => e.preventDefault()}
          className="block h-full w-full cursor-crosshair touch-none"
        />
      </div>

      {/* Title Screen */}
      {gameState === 'TITLE_MENU' && (
        <TitleScreen
          bestScore={hud.bestScore}
          muted={muted}
          onToggleMute={handleToggleMute}
          onStart={handleStartGame}
        />
      )}

      {/* Playing HUD */}
      {(gameState === 'PLAYING' || gameState === 'PAUSED') && (
        <GameHud
          hud={hud}
          muted={muted}
          onSelectWeapon={handleSelectWeapon}
          onPause={handlePause}
          onToggleMute={handleToggleMute}
        />
      )}

      {/* Pause / Victory / Game Over Modal */}
      {(gameState === 'PAUSED' || gameState === 'VICTORY' || gameState === 'GAME_OVER') && (
        <EndModal
          gameState={gameState}
          hud={hud}
          onResume={handleResume}
          onRestart={handleStartGame}
          onMainMenu={handleMainMenu}
        />
      )}
    </main>
  );
}
