import { AlertTriangle, Pause, Volume2, VolumeX } from 'lucide-react';
import { HudSnapshot, WeaponType } from '../game/types';

interface GameHudProps {
  hud: HudSnapshot;
  muted: boolean;
  onSelectWeapon: (weapon: WeaponType) => void;
  onPause: () => void;
  onToggleMute: () => void;
}

function formatTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function GameHud({
  hud,
  muted,
  onSelectWeapon,
  onPause,
  onToggleMute,
}: GameHudProps) {
  const patienceLow = hud.patience <= 30;
  const patienceMedium = hud.patience > 30 && hud.patience <= 60;
  const patienceLabel = patienceLow ? 'Critique !' : patienceMedium ? 'Tendue' : 'Calme';
  const patienceColor = patienceLow
    ? 'bg-[#ef4444]'
    : patienceMedium
    ? 'bg-[#f59e0b]'
    : 'bg-[#22c55e]';

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4 sm:p-5">
      {/* Top Perimeter Status Clusters */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* Top-Left: Chef Lulu's Patience */}
        <div className="rounded-xl border border-[#f5deb3]/20 bg-[#1b120d]/85 px-4 py-2.5 text-[#fff8ee] shadow-md">
          <div className="mb-1.5 flex items-center justify-between gap-4 text-xs font-semibold">
            <span className="flex items-center gap-1.5 text-[#f5e7cf]">
              {patienceLow && <AlertTriangle className="h-3.5 w-3.5 text-[#f87171]" />}
              Patience du Chef
            </span>
            <span className="font-mono-num text-[#fff8ee]">
              {hud.patience}% · {patienceLabel}
            </span>
          </div>
          <div className="h-2.5 w-44 overflow-hidden rounded-full bg-[#3a2519]">
            <div
              className={`h-full transition-transform duration-150 origin-left ${patienceColor}`}
              style={{ transform: `scaleX(${Math.max(0, Math.min(100, hud.patience)) / 100})` }}
            />
          </div>
          <div className="mt-1.5 text-[11px] font-medium text-[#d6c2a5]">
            Service · {hud.phaseLabel}
          </div>
        </div>

        {/* Top-Center: Timer & Score */}
        <div className="flex items-center gap-5 rounded-xl border border-[#f5deb3]/20 bg-[#1b120d]/85 px-5 py-2.5 text-[#fff8ee] shadow-md">
          <div className="text-center">
            <div className="text-[11px] font-medium text-[#d6c2a5]">Chrono</div>
            <div
              className={`font-mono-num text-xl font-bold ${
                hud.timeRemaining <= 12 ? 'text-[#f87171]' : 'text-[#fff8ee]'
              }`}
            >
              {formatTimer(hud.timeRemaining)}
            </div>
          </div>
          <div className="h-8 w-px bg-[#f5deb3]/20" aria-hidden="true" />
          <div className="text-center">
            <div className="text-[11px] font-medium text-[#d6c2a5]">Score</div>
            <div className="font-mono-num text-xl font-bold text-[#fbbf24]">{hud.score}</div>
          </div>
          {hud.combo > 1 && (
            <>
              <div className="h-8 w-px bg-[#f5deb3]/20" aria-hidden="true" />
              <div className="text-center">
                <div className="text-[11px] font-medium text-[#d6c2a5]">Combo</div>
                <div className="font-mono-num text-xl font-extrabold text-[#38bdf8]">
                  x{hud.combo}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Top-Right: Mute & Pause */}
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Activer le son' : 'Couper le son'}
            title="Activer / Couper le son (M)"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#f5deb3]/20 bg-[#1b120d]/85 text-[#fff8ee] transition-transform duration-150 hover:scale-105 hover:border-[#fbbf24]/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fbbf24] cursor-pointer"
          >
            {muted ? <VolumeX className="h-5 w-5 text-[#f87171]" /> : <Volume2 className="h-5 w-5 text-[#fbbf24]" />}
          </button>
          <button
            type="button"
            onClick={onPause}
            aria-label="Mettre en pause"
            title="Pause (Échap)"
            className="flex h-11 items-center gap-2 rounded-xl border border-[#f5deb3]/20 bg-[#1b120d]/85 px-3.5 text-sm font-semibold text-[#fff8ee] transition-transform duration-150 hover:scale-105 hover:border-[#fbbf24]/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fbbf24] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Pause className="h-4 w-4" />
            <span className="hidden sm:inline">Pause</span>
          </button>
        </div>
      </div>

      {/* Bottom-Center: Weapon Selector (Stick & Porcelain Plates) */}
      <div className="flex justify-center">
        <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-[#f5deb3]/25 bg-[#1b120d]/90 p-1.5 shadow-lg">
          {/* Weapon 1: Bâton */}
          <button
            type="button"
            onClick={() => onSelectWeapon('stick')}
            className={`flex h-12 items-center gap-2.5 rounded-xl px-4 text-sm font-bold transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fbbf24] whitespace-nowrap shrink-0 cursor-pointer ${
              hud.activeWeapon === 'stick'
                ? 'bg-[#fbbf24] text-[#1b120d] shadow-sm'
                : 'text-[#f5e7cf] hover:bg-[#3a2519]'
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true">
              <rect
                x="10"
                y="2"
                width="4.5"
                height="20"
                rx="2.2"
                transform="rotate(35 12 12)"
                fill={hud.activeWeapon === 'stick' ? '#78350f' : '#d97706'}
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
            <span>[1] Bâton</span>
            <span
              className={`text-xs font-semibold ${
                hud.activeWeapon === 'stick' ? 'text-[#451a03]' : 'text-[#d6c2a5]'
              }`}
            >
              Illimité
            </span>
          </button>

          {/* Weapon 2: Assiette */}
          <button
            type="button"
            onClick={() => onSelectWeapon('plate')}
            className={`flex h-12 items-center gap-2.5 rounded-xl px-4 text-sm font-bold transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#38bdf8] whitespace-nowrap shrink-0 cursor-pointer ${
              hud.activeWeapon === 'plate'
                ? 'bg-[#38bdf8] text-[#082f49] shadow-sm'
                : 'text-[#f5e7cf] hover:bg-[#3a2519]'
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true">
              <ellipse
                cx="12"
                cy="12"
                rx="9.5"
                ry="6.5"
                fill="#ffffff"
                stroke="#1b120d"
                strokeWidth="1.8"
              />
              <ellipse
                cx="12"
                cy="12"
                rx="6"
                ry="3.6"
                fill="none"
                stroke="#2563eb"
                strokeWidth="1.4"
              />
            </svg>
            <span>[2] Assiette</span>
            <span
              className={`font-mono-num text-xs font-bold ${
                hud.platesAmmo === 0
                  ? 'text-[#ef4444]'
                  : hud.activeWeapon === 'plate'
                  ? 'text-[#082f49]'
                  : 'text-[#7dd3fc]'
              }`}
            >
              {hud.platesAmmo}/{hud.maxPlates}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
