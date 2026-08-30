export interface RiskTier {
  label: string;
  percentile: string;
  color: string;
  badgeBg: string;
  description: string;
}

export function getRiskColor(score: number | undefined): [number, number, number, number] {
  if (score === undefined || score === null) {
    return [0, 210, 190, 80];
  }
  const s = Math.max(0, Math.min(1, score));

  if (s < 0.20) {
    const t = s / 0.20;
    return [
      Math.round(16 + t * (100 - 16)),
      Math.round(185 + t * (195 - 185)),
      Math.round(129 - t * 80),
      140,
    ];
  } else if (s < 0.40) {
    const t = (s - 0.20) / 0.20;
    return [
      Math.round(132 + t * (234 - 132)),
      Math.round(204 - t * (204 - 179)),
      Math.round(22 - t * 14),
      160,
    ];
  } else if (s < 0.60) {
    const t = (s - 0.40) / 0.20;
    return [
      Math.round(234 + t * (249 - 234)),
      Math.round(179 - t * (179 - 115)),
      Math.round(8 + t * 14),
      180,
    ];
  } else if (s < 0.80) {
    const t = (s - 0.60) / 0.20;
    return [
      Math.round(249 - t * (249 - 225)),
      Math.round(115 - t * (115 - 29)),
      Math.round(22 + t * (72 - 22)),
      200,
    ];
  } else {
    const t = (s - 0.80) / 0.20;
    return [
      Math.round(225 - t * (225 - 168)),
      Math.round(29 + t * (85 - 29)),
      Math.round(72 + t * (247 - 72)),
      220,
    ];
  }
}

export function getRelativeRiskTier(score: number): RiskTier {
  if (score < 0.20) {
    return {
      label: 'BASELINE BACKGROUND',
      percentile: '0th–20th %ile',
      color: '#10b981',
      badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      description: 'Regional Background Floor',
    };
  }
  if (score < 0.40) {
    return {
      label: 'LOW RELATIVE INDEX',
      percentile: '20th–40th %ile',
      color: '#84cc16',
      badgeBg: 'bg-lime-500/20 text-lime-300 border-lime-500/30',
      description: 'Below Regional Median',
    };
  }
  if (score < 0.60) {
    return {
      label: 'MODERATE RELATIVE INDEX',
      percentile: '40th–60th %ile',
      color: '#eab308',
      badgeBg: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      description: 'Regional Median Exposure',
    };
  }
  if (score < 0.80) {
    return {
      label: 'ELEVATED VULNERABILITY',
      percentile: '60th–80th %ile',
      color: '#f97316',
      badgeBg: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
      description: 'Top Quintile Relative Exposure',
    };
  }
  return {
    label: 'SEVERE / PEAK ANOMALY',
    percentile: 'Top Decile (>80th %ile)',
    color: '#a855f7',
    badgeBg: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    description: 'Highest Regional Vulnerability Hotspot',
  };
}
