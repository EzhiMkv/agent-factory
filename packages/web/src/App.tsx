import "./App.css";

export default function App() {
  return (
    <main className="scene">
      <h1 className="scene-title">Пухляндия</h1>
      <p className="scene-subtitle">Встреча с пухликом</p>

      <svg className="critter" viewBox="0 0 240 240" role="img" aria-label="Пухлик">
        <defs>
          <radialGradient id="jelly" cx="35%" cy="25%" r="80%">
            <stop offset="0%" stopColor="#d8fbff" />
            <stop offset="55%" stopColor="#b3ecff" />
            <stop offset="100%" stopColor="#9adcf7" />
          </radialGradient>
        </defs>

        <ellipse className="critter-shadow" cx="120" cy="205" rx="62" ry="12" fill="#e3d5f0" opacity="0.6" />

        <g className="critter-body">
          <path
            d="M120 40
               C 168 40 196 74 196 120
               C 196 176 160 196 120 196
               C 80 196 44 176 44 120
               C 44 74 72 40 120 40 Z"
            fill="url(#jelly)"
          />
          <ellipse cx="86" cy="70" rx="22" ry="12" fill="#ffffff" opacity="0.55" transform="rotate(-18 86 70)" />

          <g className="critter-eyes">
            <circle cx="92" cy="112" r="20" fill="#ffffff" stroke="#7f95c8" strokeWidth="2.5" />
            <circle cx="148" cy="112" r="20" fill="#ffffff" stroke="#7f95c8" strokeWidth="2.5" />
            <circle cx="94" cy="114" r="9" fill="#31355e" />
            <circle cx="150" cy="114" r="9" fill="#31355e" />
            <circle cx="97" cy="110" r="3" fill="#ffffff" />
            <circle cx="153" cy="110" r="3" fill="#ffffff" />
            <circle cx="90" cy="119" r="1.6" fill="#ffffff" opacity="0.8" />
            <circle cx="146" cy="119" r="1.6" fill="#ffffff" opacity="0.8" />
          </g>

          <ellipse cx="70" cy="136" rx="9" ry="5" fill="#ffc9de" opacity="0.9" />
          <ellipse cx="170" cy="136" rx="9" ry="5" fill="#ffc9de" opacity="0.9" />
          <path d="M109 148 Q 120 156 131 148" fill="none" stroke="#31355e" strokeWidth="3" strokeLinecap="round" />
        </g>
      </svg>

      <p className="critter-speech">Привет! Я твой пухлик :3</p>
      <p className="scene-hint">Скоро здесь вырастет вся Пухляндия</p>
    </main>
  );
}
