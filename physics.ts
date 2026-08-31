import { 
  HailParameters, 
  HailSimulationResult, 
  HailTrajectoryPoint, 
  HailLayer, 
  HailSizeClass, 
  GrowthMode,
  WatermelonImpactResult 
} from '../types';

/**
 * 고도 zKm에서의 기온 계산 (°C)
 */
export function getTemperatureAtAltitude(zKm: number, params: HailParameters): number {
  const lapse = (params.surfaceTemp - params.cloudTopTemp) / Math.max(1, params.cloudTopAltitude);
  return params.surfaceTemp - lapse * zKm;
}

/**
 * 고도 zKm에서의 대기압 계산 (hPa)
 * 기압 고도 방정식 (Barometric formula)
 */
export function getPressureAtAltitude(zKm: number, surfacePressureHpa: number): number {
  // 스케일 하이트 ~ 8.2 km
  return surfacePressureHpa * Math.exp(-zKm / 8.2);
}

/**
 * 고도 zKm에서의 공기 밀도 계산 (kg/m³)
 * 이상기체 상태방정식: rho = P / (R_d * T_kelvin)
 */
export function getAirDensityAtAltitude(zKm: number, params: HailParameters): number {
  const tempC = getTemperatureAtAltitude(zKm, params);
  const tempK = tempC + 273.15;
  const pressureHpa = getPressureAtAltitude(zKm, params.surfacePressure);
  const pressurePa = pressureHpa * 100;
  const Rd = 287.05; // 건조공기 기체상수 J/(kg·K)
  return pressurePa / (Rd * tempK);
}

/**
 * 적란운 내 위치 (xNorm, zKm)에서의 연직 상승/하강 기류 속도 (m/s)
 * 수평 풍속(윈드시어)에 의한 상승기류 축 기울어짐(Tilt) 반영
 */
export function getUpdraftAt(xNorm: number, zKm: number, params: HailParameters): number {
  if (zKm <= 0 || zKm >= params.cloudTopAltitude) return 0;
  
  // 윈드시어에 의해 고도가 높아질수록 상승기류 코어 축이 수평 방향으로 기울어짐
  const tiltDisplacement = (zKm / params.cloudTopAltitude) * (params.horizontalWindSpeed / 120);
  const coreCenterX = 0.5 + tiltDisplacement;

  const distFromCenter = Math.abs(xNorm - coreCenterX);
  const coreWidth = 0.28;
  const horizFactor = Math.exp(-Math.pow(distFromCenter / coreWidth, 2));

  // 연직 고도별 기류 세기 (고도 45%~70% 지점에서 최대 속도 달성)
  const zNorm = zKm / params.cloudTopAltitude;
  const vertFactor = Math.sin(Math.PI * Math.pow(zNorm, 0.8));

  // 중심 상승기류 기본값
  let updraft = params.updraftVelocity * horizFactor * vertFactor;

  // 구름 가장자리 하강기류 (Downdraft)
  if (distFromCenter > 0.3) {
    const downdraftFactor = (distFromCenter - 0.3) / 0.22;
    updraft -= (params.updraftVelocity * 0.42) * Math.min(downdraftFactor, 1.3);
  }

  return updraft;
}

/**
 * 고도 zKm에서의 수평 바람 속도 (m/s)
 */
export function getHorizontalWindAt(zKm: number, params: HailParameters): number {
  const zNorm = Math.min(1, Math.max(0, zKm / params.cloudTopAltitude));
  // 상층으로 갈수록 강해지는 제트/시어 기류
  return params.horizontalWindSpeed * (0.3 + 0.7 * zNorm);
}

/**
 * 우박의 종단 낙하 속도 (Terminal Velocity, m/s)
 * v_t = sqrt( (8 * rho_ice * g * r) / (3 * rho_air * Cd) )
 */
export function getTerminalVelocity(
  diameterMm: number, 
  altitudeKm: number, 
  params: HailParameters,
  densityGcm3: number = 0.90
): number {
  const radiusM = (diameterMm / 2) / 1000;
  if (radiusM <= 0) return 0;

  const rhoIce = densityGcm3 * 1000; // kg/m³
  const rhoAir = getAirDensityAtAltitude(altitudeKm, params);
  const cd = 0.55; // 불규칙한 우박 항력 계수
  const g = 9.80665;

  const vt = Math.sqrt((8 * rhoIce * g * radiusM) / (3 * rhoAir * cd));
  return vt; // m/s
}

/**
 * 수박 파괴 충격량 및 에너지 계산 함수
 */
export function calculateWatermelonSmash(
  impactEnergyJoules: number,
  impactImpulseNs: number,
  finalDiameterMm: number
): WatermelonImpactResult {
  // 잘 익은 통수박(무게 ~7kg) 1개를 완전 두동강/박살내는 기준 에너지 ~14 Joules
  const ENERGY_PER_WATERMELON = 14.0;
  
  if (finalDiameterMm <= 0 || impactEnergyJoules <= 0) {
    return {
      watermelonsBroken: 0,
      exactCount: 0,
      damagePercentageFirst: 0,
      impactImpulseNs: 0,
      impactEnergyJoules: 0,
      impactPeakForceKn: 0,
      statusTitleKo: '파괴 불가 (비로 융해 / 우박 소멸)',
      damageDescriptionKo: '우박이 낙하 중 모두 녹아 빗방울로 지상에 도달하여 수박에 물리적 충격이 없습니다.',
      destructiveTier: 'none',
    };
  }

  // 충돌 지속 시간: 단단한 수박 표면 충돌 시 약 2.0 ms (0.002초)
  const dtImpactSec = 0.002;
  const peakForceKn = Math.round((impactImpulseNs / dtImpactSec / 1000) * 100) / 100;

  const rawWatermelons = impactEnergyJoules / ENERGY_PER_WATERMELON;
  const watermelonsBroken = Math.round(rawWatermelons * 10) / 10;
  const exactCount = Math.floor(rawWatermelons);

  let damagePercentageFirst = Math.min(100, Math.round(rawWatermelons * 100));
  let statusTitleKo = '';
  let damageDescriptionKo = '';
  let destructiveTier: 'none' | 'scratch' | 'crack' | 'shatter' | 'annihilate' = 'none';

  if (impactEnergyJoules < 0.8) {
    destructiveTier = 'scratch';
    statusTitleKo = '수박 무피해 (미세 흠집 수준)';
    damageDescriptionKo = `우박 충격량(${impactImpulseNs.toFixed(2)} N·s)과 에너지(${impactEnergyJoules.toFixed(1)} J)가 매우 미약하여 수박 껍질에 살짝 닿는 정도입니다.`;
  } else if (impactEnergyJoules < 5.0) {
    destructiveTier = 'scratch';
    statusTitleKo = '수박 껍질 타박상 및 미세 실금';
    damageDescriptionKo = `우박이 수박 껍질에 충돌하여 표면 딤플 및 미세 실금이 발생합니다. (파괴율 약 ${damagePercentageFirst}%)`;
  } else if (impactEnergyJoules < ENERGY_PER_WATERMELON) {
    destructiveTier = 'crack';
    statusTitleKo = '수박 껍질 파열 및 과즙 누출';
    damageDescriptionKo = `우박의 충격력(${peakForceKn} kN)으로 수박 겉껍질이 쪼개지며 과육이 드러납니다. (수박 파괴 진행도: ${damagePercentageFirst}%)`;
  } else if (rawWatermelons < 2.0) {
    destructiveTier = 'shatter';
    statusTitleKo = `수박 1개 완전 박살 (${watermelonsBroken}개 파괴)`;
    damageDescriptionKo = `우박이 수박 중심부를 강타하여 수박 1개를 완전히 산산조각 내며 파쇄합니다!`;
  } else if (rawWatermelons < 6.0) {
    destructiveTier = 'shatter';
    statusTitleKo = `수박 ${exactCount}개 연쇄 폭파 완파! (총 ${watermelonsBroken}개 파쇄)`;
    damageDescriptionKo = `초고속 낙하 우박의 충격 운동 에너지(${impactEnergyJoules} J)로 인해 나열된 수박 ${exactCount}개가 차례대로 박살납니다!`;
  } else {
    destructiveTier = 'annihilate';
    statusTitleKo = `💥 수박 ${exactCount}개 대량 초토화! (총 ${watermelonsBroken}개 파괴 파쇄)`;
    damageDescriptionKo = `재난급 거대 우박의 막대한 충격량(${impactImpulseNs.toFixed(2)} N·s)과 첨두력(${peakForceKn} kN)으로 수박 ${exactCount}개 이상이 폭탄을 맞은 듯 일격에 산산조각 폭발합니다!`;
  }

  return {
    watermelonsBroken,
    exactCount,
    damagePercentageFirst,
    impactImpulseNs: Math.round(impactImpulseNs * 100) / 100,
    impactEnergyJoules: Math.round(impactEnergyJoules * 10) / 10,
    impactPeakForceKn: peakForceKn,
    statusTitleKo,
    damageDescriptionKo,
    destructiveTier,
  };
}

/**
 * 핵심 우박 생성 물리 시뮬레이션 계산
 */
export function calculateHailSimulation(params: HailParameters): HailSimulationResult {
  const dt = 0.5; // 시간 적분 간격 (0.5초)
  const maxSteps = 4000; // 최대 2000초

  // 초기 배아 위치: 빙결고도 부근 상승기류 영역
  let currentAltitude = Math.min(params.freezingLevel + 0.4, params.cloudTopAltitude * 0.45);
  let currentX = 0.46; // 중심 약간 좌측
  let radiusMm = params.initialEmbryoSizeMm / 2;
  let cycleCount = 0;
  let isRising = true;
  
  const trajectory: HailTrajectoryPoint[] = [];
  const rawLayers: { 
    type: 'rime' | 'glaze'; 
    thickness: number; 
    alt: number; 
    temp: number; 
    cycle: number; 
    time: number;
    density: number;
  }[] = [];

  // 빙결핵 밀도 인자 (핵이 많으면 과냉각 수적이 분산되어 우박 크기가 작아짐)
  const nucleiFactor = params.iceNucleiDensity === 'low' ? 1.35 : params.iceNucleiDensity === 'high' ? 0.65 : 1.0;

  // 상대습도 인자: 습도가 높을수록 과냉각 수적 보존율 증가 및 성장 가속
  const humidityGrowthFactor = 0.5 + (params.relativeHumidity / 100) * 0.7; // 0.71 ~ 1.20

  let previousMode: GrowthMode = 'embryo';
  let modeAccumThickness = 0;
  let modeStartAlt = currentAltitude;
  let modeStartTemp = getTemperatureAtAltitude(currentAltitude, params);
  let modeStartTime = 0;
  let modeDensityAccum = 0;
  let modeStepsCount = 0;

  let maxRadiusMm = radiusMm;
  let totalGrowthDurationSec = 0;
  let totalTime = 0;

  for (let step = 0; step < maxSteps; step++) {
    totalTime = step * dt;
    const tempC = getTemperatureAtAltitude(currentAltitude, params);
    const pressureHpa = getPressureAtAltitude(currentAltitude, params.surfacePressure);
    const airDensity = getAirDensityAtAltitude(currentAltitude, params);
    
    const updraft = getUpdraftAt(currentX, currentAltitude, params);
    const horizontalWind = getHorizontalWindAt(currentAltitude, params);

    // 현재 우박의 평균 추정 밀도
    const currentDensityGcm3 = previousMode === 'dry_rime' ? 0.78 : 0.91;
    const vt = getTerminalVelocity(radiusMm * 2, currentAltitude, params, currentDensityGcm3);
    
    // 연직 알짜 속도: vz = Updraft - Terminal Velocity
    const vz = updraft - vt;
    const diameterMm = radiusMm * 2;
    const massG = (4 / 3) * Math.PI * Math.pow(radiusMm / 10, 3) * currentDensityGcm3;

    if (radiusMm > maxRadiusMm) {
      maxRadiusMm = radiusMm;
    }

    // 성장 모드 판별
    let mode: GrowthMode = 'embryo';
    let currentStepDensity = 0.90;

    if (currentAltitude < params.freezingLevel && tempC > 0) {
      mode = 'melting';
    } else if (tempC <= 0) {
      // 건성 성장(Dry Rime): 극저온(<-15°C) 또는 낮은 수액량 -> 급속 동결, 공기방울 포집(불투명), 저밀도(0.72~0.82 g/cm³)
      // 습성 성장(Wet Glaze): 온화한 영하(-15°C~0°C) 및 고습도/고수액량 -> 완만 동결, 투명 얼음, 고밀도(0.90~0.92 g/cm³)
      const effectiveSLW = params.supercooledWater * nucleiFactor * (params.relativeHumidity / 85);
      
      if (tempC < -15 || effectiveSLW < 1.9) {
        mode = 'dry_rime';
        // 온도가 낮을수록 기포가 많아져 밀도 감소
        currentStepDensity = Math.max(0.70, Math.min(0.84, 0.84 + (tempC + 15) * 0.005));
      } else {
        mode = 'wet_glaze';
        currentStepDensity = 0.915;
      }
    }

    // 궤적 기록 (1초 간격 = 매 2스텝 또는 주요 변곡점)
    if (step % 2 === 0 || step === 0) {
      trajectory.push({
        timeSec: Math.round(totalTime * 10) / 10,
        xNormalized: Math.min(Math.max(currentX, 0.05), 0.95),
        altitudeKm: Math.max(0, currentAltitude),
        tempC: Math.round(tempC * 10) / 10,
        verticalVelocity: Math.round(vz * 10) / 10,
        horizontalVelocity: Math.round(horizontalWind * 10) / 10,
        diameterMm: Math.round(diameterMm * 10) / 10,
        massG: Math.round(massG * 100) / 100,
        currentMode: mode,
        isInsideCloud: currentAltitude <= params.cloudTopAltitude && currentAltitude > 0,
        cycleCount,
        airDensityKgM3: Math.round(airDensity * 1000) / 1000,
        pressureHpa: Math.round(pressureHpa),
      });
    }

    // 지상 충돌 체크
    if (currentAltitude <= 0) {
      currentAltitude = 0;
      break;
    }

    // 우박 성장 및 융해 계산
    if (mode === 'melting') {
      // 융해 속도: 습구온도 효과(습도가 높으면 융해 가속, 건조하면 증발냉각으로 융해 지연)
      const humidityMeltFactor = 0.7 + (params.relativeHumidity / 100) * 0.6;
      const meltRate = 0.0032 * Math.pow(tempC, 1.08) * Math.sqrt(Math.max(vt, 5)) * humidityMeltFactor;
      const dr = meltRate * dt;
      radiusMm -= dr;

      if (radiusMm <= 0.2) {
        // 완전 융해되어 소나기로 변함
        radiusMm = 0;
        trajectory.push({
          timeSec: Math.round(totalTime * 10) / 10,
          xNormalized: currentX,
          altitudeKm: 0,
          tempC: params.surfaceTemp,
          verticalVelocity: -vt,
          horizontalVelocity: horizontalWind,
          diameterMm: 0,
          massG: 0,
          currentMode: 'melting',
          isInsideCloud: false,
          cycleCount,
          airDensityKgM3: Math.round(airDensity * 1000) / 1000,
          pressureHpa: Math.round(pressureHpa),
        });
        break;
      }
    } else if (mode === 'dry_rime' || mode === 'wet_glaze') {
      totalGrowthDurationSec += dt;
      const relativeV = Math.abs(vz);
      const collectionEfficiency = mode === 'dry_rime' ? 0.76 : 0.94;
      const effectiveSLW = params.supercooledWater * nucleiFactor * humidityGrowthFactor;
      
      // 성장률 계산 (mm/s)
      const growthRateMmPerSec = (collectionEfficiency * effectiveSLW * (relativeV + 4) * 0.00033);
      const dr = growthRateMmPerSec * dt;
      radiusMm += dr;

      // 층상 구조 누적
      if (previousMode === mode) {
        modeAccumThickness += dr;
        modeDensityAccum += currentStepDensity;
        modeStepsCount++;
      } else {
        if (modeAccumThickness >= 0.2) {
          const avgLayerDensity = modeStepsCount > 0 ? modeDensityAccum / modeStepsCount : 0.90;
          rawLayers.push({
            type: previousMode === 'dry_rime' ? 'rime' : 'glaze',
            thickness: modeAccumThickness,
            alt: modeStartAlt,
            temp: modeStartTemp,
            cycle: cycleCount,
            time: modeStartTime,
            density: Math.round(avgLayerDensity * 100) / 100,
          });
        }
        previousMode = mode;
        modeAccumThickness = dr;
        modeStartAlt = currentAltitude;
        modeStartTemp = tempC;
        modeStartTime = totalTime;
        modeDensityAccum = currentStepDensity;
        modeStepsCount = 1;
      }
    }

    // 위치 갱신
    currentAltitude += (vz * dt) / 1000; // km

    // 순환 주기 (상승/하강 전환)
    if (vz > 1.0 && !isRising) {
      isRising = true;
      cycleCount++;
    } else if (vz < -1.0 && isRising) {
      isRising = false;
    }

    // 수평 이동:
    // 상승 시 윈드시어에 의해 상층으로 밀려나며 외곽으로 확산
    // 하강 시 하층 유입류(inflow)에 의해 다시 코어로 끌려들어감
    const turbFactor = params.turbulence * 0.0016;
    const windDrift = (horizontalWind / 50) * 0.0018 * dt;

    if (isRising) {
      const outwardSign = currentX >= 0.5 ? 1 : -1;
      currentX += outwardSign * (0.0007 + turbFactor * Math.random()) * dt + windDrift;
    } else {
      if (currentAltitude > params.freezingLevel) {
        const outwardSign = currentX >= 0.5 ? 1 : -1;
        currentX += outwardSign * 0.0011 * dt + windDrift * 0.5;
      } else {
        // 하층 수렴 유입류가 우박을 다시 상승기류 중심(0.5)으로 끌어당김
        const toCenter = (0.5 - currentX) * 0.009 * dt;
        currentX += toCenter;
      }
    }

    currentX = Math.min(Math.max(currentX, 0.10), 0.90);

    // 운정(Cloud Top) 도달 시 반사/방출
    if (currentAltitude >= params.cloudTopAltitude) {
      currentAltitude = params.cloudTopAltitude;
      isRising = false;
      currentX += (currentX >= 0.5 ? 0.06 : -0.06);
    }
  }

  // 마지막 층 추가
  if (modeAccumThickness >= 0.2) {
    const avgLayerDensity = modeStepsCount > 0 ? modeDensityAccum / modeStepsCount : 0.90;
    rawLayers.push({
      type: previousMode === 'dry_rime' ? 'rime' : 'glaze',
      thickness: modeAccumThickness,
      alt: modeStartAlt,
      temp: modeStartTemp,
      cycle: cycleCount,
      time: modeStartTime,
      density: Math.round(avgLayerDensity * 100) / 100,
    });
  }

  // 동심원 층 데이터 정제
  const layers: HailLayer[] = [];
  let currentOuterR = params.initialEmbryoSizeMm / 2;
  let totalWeightedDensity = (params.initialEmbryoSizeMm / 2) * 0.85;
  let totalThickness = params.initialEmbryoSizeMm / 2;

  // 배아 핵
  layers.push({
    id: 'embryo-core',
    type: 'rime',
    thicknessMm: Math.round((params.initialEmbryoSizeMm / 2) * 10) / 10,
    outerRadiusMm: Math.round((params.initialEmbryoSizeMm / 2) * 10) / 10,
    formedAltitudeKm: Math.round(params.freezingLevel * 10) / 10,
    formedTempC: -2,
    formedTimestampSec: 0,
    cycleNumber: 0,
    description: '우박 중심핵 (빙정/배아 입자, 밀도 ~0.85 g/cm³)',
    densityGcm3: 0.85,
  });

  rawLayers.forEach((l, idx) => {
    currentOuterR += l.thickness;
    totalWeightedDensity += l.thickness * l.density;
    totalThickness += l.thickness;

    layers.push({
      id: `layer-${idx + 1}`,
      type: l.type,
      thicknessMm: Math.round(l.thickness * 10) / 10,
      outerRadiusMm: Math.round(currentOuterR * 10) / 10,
      formedAltitudeKm: Math.round(l.alt * 10) / 10,
      formedTempC: Math.round(l.temp * 10) / 10,
      formedTimestampSec: Math.round(l.time),
      cycleNumber: l.cycle,
      densityGcm3: l.density,
      description: l.type === 'rime' 
        ? `불투명 백색층 (Rime) - 고도 ${l.alt.toFixed(1)}km, ${l.temp.toFixed(0)}°C 급속 동결 (밀도 ${l.density.toFixed(2)} g/cm³)`
        : `투명 얼음층 (Glaze) - 고도 ${l.alt.toFixed(1)}km, ${l.temp.toFixed(0)}°C 완만 동결 (밀도 ${l.density.toFixed(2)} g/cm³)`,
    });
  });

  const averageDensityGcm3 = totalThickness > 0 
    ? Math.round((totalWeightedDensity / totalThickness) * 100) / 100 
    : 0.90;

  const finalDiameterMm = radiusMm > 0 ? Math.round(radiusMm * 2 * 10) / 10 : 0;
  const maxDiameterMm = Math.round(maxRadiusMm * 2 * 10) / 10;
  const finalMassG = radiusMm > 0 
    ? Math.round((4 / 3) * Math.PI * Math.pow(radiusMm / 10, 3) * averageDensityGcm3 * 10) / 10 
    : 0;
  
  // 지상 종단 속도 (km/h & m/s)
  const vtMps = getTerminalVelocity(finalDiameterMm, 0, params, averageDensityGcm3);
  const terminalVelocityKmh = Math.round(vtMps * 3.6);

  // 물리 충격 역학 계산:
  // 1. 질량 (kg)
  const massKg = finalMassG / 1000;
  // 2. 운동에너지 E = 0.5 * m * v^2 (J)
  const impactEnergyJoules = Math.round(0.5 * massKg * Math.pow(vtMps, 2) * 10) / 10;
  // 3. 충격량 (운동량 변화) J = m * v (N·s = kg·m/s)
  const impactImpulseNs = Math.round(massKg * vtMps * 100) / 100;
  // 4. 첨두력 F_peak ≈ J / dt (kN, 충돌시간 2ms 가정)
  const impactPeakForceKn = Math.round((impactImpulseNs / 0.002 / 1000) * 100) / 100;

  // 평균 성장 속도 (mm/분)
  const growthDurationMin = totalGrowthDurationSec / 60;
  const growthRateMmPerMin = growthDurationMin > 0 
    ? Math.round(((maxDiameterMm - params.initialEmbryoSizeMm) / growthDurationMin) * 10) / 10 
    : 0;

  // 수박 파괴 시뮬레이션 결과 계산
  const watermelonImpact = calculateWatermelonSmash(impactEnergyJoules, impactImpulseNs, finalDiameterMm);

  // 크기 분류 체계
  let sizeClass: HailSizeClass = 'melted';
  let sizeClassNameKo = '비로 융해 (우박 소멸)';
  let comparisonObjectKo = '빗방울';
  let damageLevel: 'none' | 'minor' | 'moderate' | 'severe' | 'catastrophic' = 'none';
  let damageSummaryKo = '우박이 지상에 도달하기 전 융해되어 비로 변했습니다. 피해가 없습니다.';

  if (finalDiameterMm > 0) {
    if (finalDiameterMm < 5) {
      sizeClass = 'graupel';
      sizeClassNameKo = '싸락눈 / 작은 빙립';
      comparisonObjectKo = '좁쌀 ~ 쌀알 (3~5mm)';
      damageLevel = 'none';
      damageSummaryKo = '피해 없음. 작고 가벼워 잎에 살짝 닿는 정도입니다.';
    } else if (finalDiameterMm < 10) {
      sizeClass = 'pea';
      sizeClassNameKo = '완두콩 크기 우박';
      comparisonObjectKo = '완두콩 (6~9mm)';
      damageLevel = 'minor';
      damageSummaryKo = '연약한 채소 잎과 꽃잎이 찢어질 수 있습니다.';
    } else if (finalDiameterMm < 20) {
      sizeClass = 'marble';
      sizeClassNameKo = '구슬 / 동전 크기 우박';
      comparisonObjectKo = '100원~500원 동전 (15~20mm)';
      damageLevel = 'minor';
      damageSummaryKo = '과수원 과일 흠집 및 잎사귀 파손, 비닐하우스 비닐 훼손 가능성이 있습니다.';
    } else if (finalDiameterMm < 40) {
      sizeClass = 'walnut';
      sizeClassNameKo = '호두 / 탁구공 크기 우박';
      comparisonObjectKo = '호두 ~ 탁구공 (30~40mm)';
      damageLevel = 'moderate';
      damageSummaryKo = '자동차 본넷 미세 찌그러짐, 낡은 기와 파손, 노지 작물 대량 파손이 발생합니다.';
    } else if (finalDiameterMm < 55) {
      sizeClass = 'golfball';
      sizeClassNameKo = '골프공 크기 우박 (경보급)';
      comparisonObjectKo = '골프공 (43~50mm)';
      damageLevel = 'severe';
      damageSummaryKo = '차량 유리창 및 차체 심각한 함몰, 건물 창문 파손, 인체 부상 위험!';
    } else if (finalDiameterMm < 75) {
      sizeClass = 'tennis';
      sizeClassNameKo = '테니스공 크기 우박';
      comparisonObjectKo = '테니스공 (65~75mm)';
      damageLevel = 'severe';
      damageSummaryKo = '지붕 기와 완파, 목재 외벽 손상, 자동차 유리 관통, 보행자 직격 시 중상 위험!';
    } else if (finalDiameterMm < 95) {
      sizeClass = 'baseball';
      sizeClassNameKo = '야구공 크기 거대 우박';
      comparisonObjectKo = '야구공 (75~90mm)';
      damageLevel = 'catastrophic';
      damageSummaryKo = '건물 지붕 관통, 차량 전손, 가축 및 야외 인명 피해가 우려되는 재난급 우박입니다.';
    } else {
      sizeClass = 'grapefruit';
      sizeClassNameKo = '자몽 / 볼링공급 슈퍼 우박';
      comparisonObjectKo = '자몽 ~ 볼링공 (100mm 이상)';
      damageLevel = 'catastrophic';
      damageSummaryKo = '구조물 지붕 붕괴, 콘크리트 및 차량 박살, 극도로 치명적인 재난 상태입니다.';
    }
  }

  const meltedLossPercentage = maxDiameterMm > 0 
    ? Math.max(0, Math.round(((maxDiameterMm - finalDiameterMm) / maxDiameterMm) * 100))
    : 100;

  return {
    finalDiameterMm,
    maxDiameterMm,
    finalMassG,
    terminalVelocityKmh,
    impactEnergyJoules,
    impactImpulseNs,
    impactPeakForceKn,
    averageDensityGcm3,
    growthRateMmPerMin,
    totalCycles: cycleCount,
    totalDurationSec: Math.round(totalTime),
    layers,
    sizeClass,
    sizeClassNameKo,
    comparisonObjectKo,
    damageLevel,
    damageSummaryKo,
    trajectory,
    meltedLossPercentage,
    watermelonImpact,
  };
}
