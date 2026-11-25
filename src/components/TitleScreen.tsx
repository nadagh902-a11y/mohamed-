import { useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

interface TitleScreenProps {
  bestScore: number;
  muted: boolean;
  onToggleMute: () => void;
  onStart: () => void;
}

export function TitleScreen({ bestScore, muted, onToggleMute, onStart }: TitleScreenProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#1b120d] text-[#fff8ee]">
      {/* Key-art illustrated backdrop */}
      {!imgError ? (
        <img
          src="/src/assets/images/reda_bistro_title_keyart_1795639315438.jpg"
          alt="Réda glissant sur une peau de banane au Bistrot Chez Lulu"
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 72% 45%, #7c3a1d 0%, #3d1d10 48%, #19100b 100%)',
          }}
        />
      )}

      {/* Measured contrast scrim over the left 45% negative space */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(90deg, rgba(22,14,10,0.94) 0%, rgba(22,14,10,0.82) 38%, rgba(22,14,10,0.28) 68%, rgba(22,14,10,0.12) 100%)',
        }}
      />

      {/* Top-right Sound Toggle */}
      <div className="absolute top-5 right-5 z-20">
        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? 'Activer le son' : 'Couper le son'}
          className="flex h-11 items-center gap-2 rounded-lg border border-[#f5deb3]/25 bg-[#1b120d]/85 px-4 text-sm font-semibold text-[#fff8ee] transition-transform duration-150 hover:scale-[1.03] hover:border-[#fbbf24]/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fbbf24] whitespace-nowrap shrink-0 cursor-pointer"
        >
          {muted ? <VolumeX className="h-4 w-4 text-[#f87171]" /> : <Volume2 className="h-4 w-4 text-[#fbbf24]" />}
          <span>{muted ? 'Muet' : 'Son activé'}</span>
        </button>
      </div>

      {/* Left Title Lockup & CTA */}
      <div className="relative z-10 flex h-full max-w-2xl flex-col justify-center px-8 sm:px-14">
        {/* Bespoke inline SVG Title Lockup */}
        <svg
          viewBox="0 0 460 155"
          className="mb-5 w-full max-w-[440px] drop-shadow-[0_6px_16px_rgba(0,0,0,0.7)]"
          role="img"
          aria-label="Sacré Réda ! Catastrophe en Cuisine"
        >
          {/* Decorative wooden stick behind title */}
          <g transform="translate(26, 20) rotate(-6)">
            <rect
              x="0"
              y="18"
              width="380"
              height="16"
              rx="8"
              fill="#b45309"
              stroke="#1b120d"
              strokeWidth="4"
            />
            <rect x="18" y="22" width="340" height="4" rx="2" fill="#f59e0b" opacity="0.65" />
          </g>
          {/* Porcelain plate crest */}
          <g transform="translate(388, 36) rotate(12)">
            <ellipse cx="0" cy="0" rx="44" ry="28" fill="#ffffff" stroke="#1b120d" strokeWidth="4" />
            <ellipse cx="0" cy="0" rx="30" ry="17" fill="none" stroke="#3b82f6" strokeWidth="3" />
          </g>
          {/* Main Cartoon Wordmark */}
          <text
            x="16"
            y="84"
            fontFamily="'Bricolage Grotesque', sans-serif"
            fontWeight="800"
            fontSize="60"
            fill="#fbbf24"
            stroke="#1b120d"
            strokeWidth="10"
            paintOrder="stroke"
            letterSpacing="-1"
          >
            SACRÉ RÉDA !
          </text>
          <text
            x="20"
            y="128"
            fontFamily="'Bricolage Grotesque', sans-serif"
            fontWeight="700"
            fontSize="26"
            fill="#fff8ee"
            stroke="#1b120d"
            strokeWidth="6"
            paintOrder="stroke"
          >
            Catastrophe au Bistrot Chez Lulu
          </text>
        </svg>

        <p className="mb-6 max-w-md text-base leading-relaxed text-[#f5e7cf]">
          Réda est le serveur le plus maladroit de Paris. Stoppez ses gaffes avant la fin du
          banquet à grands coups de{' '}
          <span className="font-bold text-[#fbbf24]">bâton</span> (qui recharge vos munitions) et
          d’<span className="font-bold text-[#7dd3fc]">assiettes en porcelaine</span> !
        </p>

        {bestScore > 0 && (
          <div className="mb-5 flex items-center gap-2 text-sm text-[#e6c99f]">
            <span>Record du Bistrot</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-num font-bold text-[#fbbf24]">{bestScore} pts</span>
          </div>
        )}

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onStart}
            className="rounded-xl border-2 border-[#1b120d] bg-[#fbbf24] px-7 py-3.5 text-lg font-extrabold text-[#1b120d] shadow-[0_5px_0_#92400e] transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fff8ee] whitespace-nowrap shrink-0 cursor-pointer"
          >
            Commencer le service
          </button>
        </div>

        <p className="mt-6 text-xs font-medium text-[#d6c2a5]">
          Clic / 1 : Bâton · Clic droit / 2 : Assiette · ZQSD / Flèches : Viser · Échap : Pause
        </p>
      </div>
    </div>
  );
}
