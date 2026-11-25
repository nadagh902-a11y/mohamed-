import { GameState, HudSnapshot } from '../game/types';

interface EndModalProps {
  gameState: Extract<GameState, 'PAUSED' | 'VICTORY' | 'GAME_OVER'>;
  hud: HudSnapshot;
  onResume: () => void;
  onRestart: () => void;
  onMainMenu: () => void;
}

function getComedicRank(score: number): string {
  if (score >= 4500) return 'Légende du Bistrot Chez Lulu';
  if (score >= 3000) return 'Virtuose de la Porcelaine';
  if (score >= 1600) return 'Maître du Balais';
  return 'Apprenti Tape-Dur';
}

export function EndModal({
  gameState,
  hud,
  onResume,
  onRestart,
  onMainMenu,
}: EndModalProps) {
  const isPaused = gameState === 'PAUSED';
  const isVictory = gameState === 'VICTORY';

  const heading = isPaused
    ? 'Service en pause'
    : isVictory
    ? 'Banquet sauvé !'
    : 'Vaisselle en miettes !';

  const subtitle = isPaused
    ? 'Réda reprend son souffle (et cherche une autre peau de banane).'
    : isVictory
    ? 'Chef Lulu est aux anges : vous avez dompté la maladresse légendaire de Réda !'
    : 'Chef Lulu a perdu patience face aux catastrophes de Réda. Prenez votre revanche !';

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#120b08]/80 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[#f5deb3]/25 bg-[#231711] p-6 text-[#fff8ee] shadow-2xl">
        <h2 className="font-display text-3xl font-extrabold text-[#fbbf24] text-balance">
          {heading}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[#e6c99f]">{subtitle}</p>

        {!isPaused && (
          <div className="mt-4 rounded-xl bg-[#19100b] px-4 py-3">
            <div className="text-xs font-medium text-[#d6c2a5]">Titre décerné</div>
            <div className="font-display text-lg font-bold text-[#7dd3fc]">
              {getComedicRank(hud.score)}
            </div>
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl border border-[#f5deb3]/15 bg-[#19100b] p-4 text-sm">
          <div>
            <div className="text-xs text-[#d6c2a5]">Score</div>
            <div className="font-mono-num text-xl font-bold text-[#fbbf24]">{hud.score}</div>
          </div>
          <div>
            <div className="text-xs text-[#d6c2a5]">Record</div>
            <div className="font-mono-num text-xl font-bold text-[#fff8ee]">{hud.bestScore}</div>
          </div>
          <div>
            <div className="text-xs text-[#d6c2a5]">Coups de bâton</div>
            <div className="font-mono-num text-lg font-bold text-[#fff8ee]">
              {hud.stats.stickHits}
            </div>
          </div>
          <div>
            <div className="text-xs text-[#d6c2a5]">Assiettes au but</div>
            <div className="font-mono-num text-lg font-bold text-[#fff8ee]">
              {hud.stats.plateHits}
            </div>
          </div>
          <div>
            <div className="text-xs text-[#d6c2a5]">Gaffes stoppées</div>
            <div className="font-mono-num text-lg font-bold text-[#4ade80]">
              {hud.stats.gaffesStopped}
            </div>
          </div>
          <div>
            <div className="text-xs text-[#d6c2a5]">Meilleur combo</div>
            <div className="font-mono-num text-lg font-bold text-[#38bdf8]">
              x{Math.max(1, hud.stats.maxCombo)}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={onMainMenu}
            className="h-11 rounded-xl border border-[#f5deb3]/25 bg-transparent px-4 text-sm font-semibold text-[#f5e7cf] transition-colors duration-150 hover:bg-[#3a2519] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fbbf24] whitespace-nowrap shrink-0 cursor-pointer"
          >
            Menu principal
          </button>

          {isPaused ? (
            <>
              <button
                type="button"
                onClick={onRestart}
                className="h-11 rounded-xl border border-[#f5deb3]/25 bg-[#3a2519] px-4 text-sm font-semibold text-[#fff8ee] transition-colors duration-150 hover:bg-[#4b3121] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fbbf24] whitespace-nowrap shrink-0 cursor-pointer"
              >
                Recommencer
              </button>
              <button
                type="button"
                onClick={onResume}
                className="h-11 rounded-xl border-2 border-[#1b120d] bg-[#fbbf24] px-5 text-sm font-extrabold text-[#1b120d] transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fff8ee] whitespace-nowrap shrink-0 cursor-pointer"
              >
                Reprendre
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onRestart}
              className="h-11 rounded-xl border-2 border-[#1b120d] bg-[#fbbf24] px-6 text-sm font-extrabold text-[#1b120d] shadow-[0_4px_0_#92400e] transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fff8ee] whitespace-nowrap shrink-0 cursor-pointer"
            >
              Rejouer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
