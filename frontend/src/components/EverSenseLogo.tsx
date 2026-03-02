export function EverSenseLogo({ width = 560, height = 110 }: { width?: number; height?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 110" width={width} height={height}>
      <defs>
        <linearGradient id="wgrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style={{ stopColor: '#007acc' }} />
          <stop offset="100%" style={{ stopColor: '#29b6f6' }} />
        </linearGradient>
        <linearGradient id="aigl" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style={{ stopColor: '#29b6f6' }} />
          <stop offset="100%" style={{ stopColor: '#00e5ff' }} />
        </linearGradient>
        <linearGradient id="circlegrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: '#0d1f2d' }} />
          <stop offset="100%" style={{ stopColor: '#0a3a5c' }} />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glow2">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outer glow ring */}
      <circle cx="52" cy="52" r="50" fill="none" stroke="#007acc" strokeWidth="1" opacity="0.15" filter="url(#glow2)" />
      {/* Main circle */}
      <circle cx="52" cy="52" r="46" fill="url(#circlegrad)" stroke="url(#wgrad)" strokeWidth="2" />
      {/* Inner subtle ring */}
      <circle cx="52" cy="52" r="36" fill="none" stroke="#007acc" strokeWidth="0.8" opacity="0.2" />
      {/* Bold checkmark */}
      <path d="M28 52 L44 68 L76 34" stroke="url(#wgrad)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" filter="url(#glow)" />
      {/* Spark dots */}
      <circle cx="52" cy="4" r="3.5" fill="#29b6f6" filter="url(#glow)" />
      <circle cx="96" cy="24" r="2.5" fill="#007acc" opacity="0.8" filter="url(#glow)" />
      <circle cx="98" cy="72" r="2" fill="#007acc" opacity="0.5" />
      <circle cx="6" cy="38" r="2" fill="#007acc" opacity="0.5" />

      {/* Wordmark */}
      <text x="116" y="56" fontFamily="'Segoe UI', sans-serif" fontSize="46" fontWeight="800" letterSpacing="-2">
        <tspan fontWeight="300" fill="#707070">Ever</tspan>
        <tspan fill="url(#wgrad)" filter="url(#glow)"> Sense</tspan>
        <tspan fill="url(#aigl)" filter="url(#glow)" fontSize="32"> Ai</tspan>
      </text>

      {/* Tagline */}
      <line x1="118" y1="70" x2="118" y2="94" stroke="#007acc" strokeWidth="1.5" opacity="0.4" />
      <text x="128" y="88" fontFamily="'Segoe UI', sans-serif" fontSize="12" fontWeight="400" fill="#505050" letterSpacing="2.5">
        INTELLIGENT PLATFORM
      </text>
    </svg>
  );
}
