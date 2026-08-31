export type GrowthMode = 'dry_rime' | 'wet_glaze' | 'embryo' | 'melting';

export interface HailLayer {
  id: string;
  type: 'rime' | 'glaze';
  thicknessMm: number;
  outerRadiusMm: number;
  formedAltitudeKm: number;
  formedTempC: number;
  formedTimestampSec: number;
  cycleNumber: number;
  description: string;
  densityGcm3: number; // 층별 밀도
}

export interface HailParameters {
  // 온도 관련 변수
  surfaceTemp: number;          // °C (10 ~ 40)
  cloudTopTemp: number;         // °C (-65 ~ -20)
  freezingLevel: number;        // km (1.0 ~ 5.0, 0℃ 동결 고도)
  cloudTopAltitude: number;     // km (7 ~ 18, 운정 고도)

  // 습도 관련 변수
  relativeHumidity: number;     // % (30 ~ 100, 대기 상대습도)
  supercooledWater: number;     // g/m³ (0.5 ~ 6.5, 과냉각 수적량)

  // 바람 관련 변수
  updraftVelocity: number;      // m/s (10 ~ 65, 상승 기류 속도)
  horizontalWindSpeed: number;  // m/s (0 ~ 45, 수평 풍속 / 윈드시어)
  turbulence: number;           // 1 ~ 5 (난류 강도)

  // 대기압 관련 변수
  surfacePressure: number;      // hPa (950 ~ 1050, 지상 기압)

  // 미세 물리 변수
  iceNucleiDensity: 'low' | 'normal' | 'high'; // 빙결핵 밀도
  initialEmbryoSizeMm: number;  // mm (0.5 ~ 5.0, 초기 배아 크기)
}

export interface HailTrajectoryPoint {
  timeSec: number;
  xNormalized: number; // 0 to 1 across cloud width
  altitudeKm: number;  // 0 to cloudTopAltitude
  tempC: number;
  verticalVelocity: number; // m/s (positive = up, negative = down)
  horizontalVelocity: number; // m/s
  diameterMm: number;
  massG: number;
  currentMode: GrowthMode;
  isInsideCloud: boolean;
  cycleCount: number;
  airDensityKgM3: number;
  pressureHpa: number;
}

export type HailSizeClass = 
  | 'melted'       // 지상 도달 전 비로 융해
  | 'graupel'      // 싸락눈 (< 5mm)
  | 'pea'          // 완두콩 (5 ~ 10mm)
  | 'marble'       // 구슬/동전 (10 ~ 20mm)
  | 'walnut'       // 호두/탁구공 (20 ~ 40mm)
  | 'golfball'     // 골프공 (40 ~ 50mm)
  | 'tennis'       // 테니스공 (50 ~ 70mm)
  | 'baseball'     // 야구공 (70 ~ 90mm)
  | 'grapefruit';  // 자몽/슈퍼우박 (> 90mm)

export interface WatermelonImpactResult {
  watermelonsBroken: number;       // 파괴 가능한 수박 개수 (소수점 1자리)
  exactCount: number;              // 정수 완파 개수
  damagePercentageFirst: number;   // 첫 번째 수박 피해율 (0~100%)
  impactImpulseNs: number;         // 충격량 (N·s)
  impactEnergyJoules: number;      // 운동에너지 (J)
  impactPeakForceKn: number;       // 충격 첨두력 (kN)
  statusTitleKo: string;           // 상태 요약 ("수박 4개 연쇄 완파", "껍질 미세 실금" 등)
  damageDescriptionKo: string;     // 상세 설명
  destructiveTier: 'none' | 'scratch' | 'crack' | 'shatter' | 'annihilate';
}

export interface HailSimulationResult {
  finalDiameterMm: number;
  maxDiameterMm: number;
  finalMassG: number;
  terminalVelocityKmh: number;
  impactEnergyJoules: number;
  impactImpulseNs: number;         // 충격량 (N·s = kg·m/s)
  impactPeakForceKn: number;       // 충격 첨두력 (kN)
  averageDensityGcm3: number;      // 우박 평균 밀도 (g/cm³)
  growthRateMmPerMin: number;      // 생성/성장 속도 (mm/분)
  totalCycles: number;
  totalDurationSec: number;
  layers: HailLayer[];
  sizeClass: HailSizeClass;
  sizeClassNameKo: string;
  comparisonObjectKo: string;
  damageLevel: 'none' | 'minor' | 'moderate' | 'severe' | 'catastrophic';
  damageSummaryKo: string;
  trajectory: HailTrajectoryPoint[];
  meltedLossPercentage: number;
  watermelonImpact: WatermelonImpactResult;
}

export interface PresetScenario {
  id: string;
  nameKo: string;
  badgeKo: string;
  descriptionKo: string;
  iconName: string;
  params: HailParameters;
}
