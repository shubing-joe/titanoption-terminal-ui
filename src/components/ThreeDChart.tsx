/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useMemo } from 'react';
import { OptionLeg, RustPositionAnalysisResponse, RustStrategySurfaceResponse } from '../types';
import { formatAxisDate, formatShortAxisDate, resolveScenarioDaysDomain } from '../lib/chartScales.ts';
import { analyzeStrategy } from '../lib/optionsMath';
import { summarizeThreeDBoundaries, threeDComputeEngineMeta } from '../lib/optionAnalytics';
import { readJsonResponse } from '../lib/readJsonResponse';
import { RotateCw, RefreshCw, Activity, Eye, EyeOff } from 'lucide-react';

interface ThreeDChartProps {
  legs: OptionLeg[];
  currentStockPrice: number;
  daysToExpiry: number;
  asOfDate?: string;
  r: number;
  rustAnalysis?: RustPositionAnalysisResponse;
}

type PlotTarget = 'pnl' | 'delta' | 'gamma' | 'vega' | 'theta';

export default function ThreeDChart({ legs, currentStockPrice, daysToExpiry, asOfDate, r, rustAnalysis }: ThreeDChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Rotation parameters
  const [yaw, setYaw] = useState<number>(-0.6); // Angle around Z-axis (rotation)
  const [pitch, setPitch] = useState<number>(0.75); // Angle around X-axis (elevation tilt)
  const [zoom, setZoom] = useState<number>(180);
  const [plotTarget, setPlotTarget] = useState<PlotTarget>('pnl');
  const [useIVDimension, setUseIVDimension] = useState<boolean>(false); // IV on Y axis instead of Days to Expiry
  const [showAnnotations, setShowAnnotations] = useState<boolean>(true);
  const [rustSurface, setRustSurface] = useState<RustStrategySurfaceResponse | undefined>(undefined);
  const [isSurfaceLoading, setIsSurfaceLoading] = useState<boolean>(false);

  // Mouse interaction state
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  // Grid dimensions
  const xSteps = 24; // Stock Price intervals
  const ySteps = 20; // Time/IV intervals
  const legExpiryDays = legs.map(l => l.expiryDays);
  const hasMultiExpiryLegs = new Set(legExpiryDays).size > 1;
  const scenarioDaysDomain = resolveScenarioDaysDomain({
    portfolioDaysToExpiry: daysToExpiry,
    legExpiryDays,
    includeLegExpiries: hasMultiExpiryLegs,
  });
  const strategyAnalysis = useMemo(
    () => analyzeStrategy(legs, currentStockPrice, daysToExpiry, r),
    [legs, currentStockPrice, daysToExpiry, r]
  );
  const boundaryAnnotations = useMemo(
    () => summarizeThreeDBoundaries({
      breakevens: strategyAnalysis.breakevens,
      currentStockPrice,
      maxProfit: strategyAnalysis.maxProfit,
      maxLoss: strategyAnalysis.maxLoss,
      rustAnalysis,
    }),
    [currentStockPrice, rustAnalysis, strategyAnalysis.breakevens, strategyAnalysis.maxLoss, strategyAnalysis.maxProfit]
  );
  const breakevenAnnotations = useMemo(
    () => boundaryAnnotations.filter((annotation) => annotation.kind === 'breakeven' && annotation.price != null),
    [boundaryAnnotations]
  );
  const computeEngineMeta = useMemo(
    () => threeDComputeEngineMeta(rustAnalysis, rustSurface),
    [rustAnalysis, rustSurface]
  );

  const strikes = legs.map(l => l.strike);
  const minStrike = strikes.length > 0 ? Math.min(...strikes) : currentStockPrice;
  const maxStrike = strikes.length > 0 ? Math.max(...strikes) : currentStockPrice;
  const surfacePriceMin = Math.max(10, Math.min(minStrike * 0.8, currentStockPrice * 0.75));
  const surfacePriceMax = Math.max(maxStrike * 1.2, currentStockPrice * 1.25);
  const surfaceYMin = useIVDimension ? 10 : 0.01;
  const surfaceYMax = useIVDimension ? 120 : scenarioDaysDomain.max;

  useEffect(() => {
    if (legs.length === 0) {
      setRustSurface(undefined);
      setIsSurfaceLoading(false);
      return;
    }
    let cancelled = false;
    const loadSurface = async () => {
      setIsSurfaceLoading(true);
      try {
        const response = await fetch('/api/option-core/surface', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            current_spot: currentStockPrice,
            rate_pct: r,
            price_min: surfacePriceMin,
            price_max: surfacePriceMax,
            y_min: surfaceYMin,
            y_max: surfaceYMax,
            x_steps: xSteps,
            y_steps: ySteps,
            y_dimension: useIVDimension ? 'iv' : 'days',
            plot_target: plotTarget,
            legs,
          }),
        });
        const payload = await readJsonResponse(response, 'option-core surface');
        if (!response.ok || payload.ok === false) {
          throw new Error(payload.error || 'rust option-core surface failed');
        }
        if (!cancelled) setRustSurface(payload as RustStrategySurfaceResponse);
      } catch (error) {
        if (!cancelled) setRustSurface({ ok: false, error: (error as Error).message });
      } finally {
        if (!cancelled) setIsSurfaceLoading(false);
      }
    };
    loadSurface();
    return () => {
      cancelled = true;
    };
  }, [legs, currentStockPrice, r, surfacePriceMin, surfacePriceMax, surfaceYMin, surfaceYMax, useIVDimension, plotTarget]);

  // Handle canvas sizing dynamically
  const [canvasSize, setCanvasSize] = useState({ width: 600, height: 400 });

  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        setCanvasSize({
          width: Math.max(width, 300),
          height: Math.max(height || 360, 360)
        });
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setHoverPos(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isDragging) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;

      setYaw(prev => prev + dx * 0.007);
      // Limit pitch to avoid flipping upside down easily
      setPitch(prev => Math.max(0.1, Math.min(Math.PI / 2 - 0.05, prev + dy * 0.007)));
      setDragStart({ x: e.clientX, y: e.clientY });
      setHoverPos(null);
    } else {
      setHoverPos({ x, y });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setHoverPos(null);
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  // Compute 3D surface grid data and project them to 2D
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set pixel ratio for sharp rendering on high-DPI screens
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.width * dpr;
    canvas.height = canvasSize.height * dpr;
    ctx.scale(dpr, dpr);

    // Clear background - Bloomberg solid black
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

    if (legs.length === 0) {
      // Draw message when no legs are present
      ctx.fillStyle = '#ff9f1c'; // Bloomberg Amber
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('请先添加期权持仓腿以渲染 3D 风险敞口地形', canvasSize.width / 2, canvasSize.height / 2);
      return;
    }

    const surface = rustSurface?.ok ? rustSurface.result?.surface : undefined;
    if (!surface || surface.engine !== 'rust-option-core-surface') {
      ctx.fillStyle = rustSurface?.ok === false ? '#ff3366' : '#ff9f1c';
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        rustSurface?.ok === false
          ? `Rust 3D surface unavailable: ${rustSurface.error || 'unknown error'}`
          : '等待 Rust option-core 生成 3D 风险地形...',
        canvasSize.width / 2,
        canvasSize.height / 2
      );
      return;
    }

    // Determine domain boundaries
    const xMin = surface.price_min;
    const xMax = surface.price_max;
    const yMin = surface.y_min;
    const yMax = surface.y_max;
    const effectiveXSteps = surface.x_steps;
    const effectiveYSteps = surface.y_steps;

    // 1. Calculate grid of 3D points
    // We want to normalize values in [-1, 1] range around center.
    const centerPrice = (xMin + xMax) / 2;
    const priceRange = xMax - xMin;

    const centerCol = (yMin + yMax) / 2;
    const colRange = yMax - yMin;

    // Solid 3D Projection Engine
    const project3D = (n_x: number, n_y: number, n_z: number) => {
      const xRot1 = n_x * Math.cos(yaw) - n_y * Math.sin(yaw);
      const yRot1 = n_x * Math.sin(yaw) + n_y * Math.cos(yaw);
      const zRot1 = n_z;

      const xRot2 = xRot1;
      const yRot2 = yRot1 * Math.cos(pitch) + zRot1 * Math.sin(pitch);

      const px = canvasSize.width / 2 + xRot2 * zoom;
      const py = canvasSize.height / 2 - yRot2 * zoom + 30;
      return { x: px, y: py };
    };

    // Draw Axis Label helper
    const draw3DAxisLabel = (text: string, point3D: {x: number; y: number; z: number}, sideOffset: {dx: number; dy: number}, color: string = '#ff9f1c') => {
      const proj = project3D(point3D.x, point3D.y, point3D.z);
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = color;
      ctx.textAlign = sideOffset.dx > 0 ? 'left' : sideOffset.dx < 0 ? 'right' : 'center';
      ctx.fillText(text, proj.x + sideOffset.dx, proj.y + sideOffset.dy);
    };

    const gridPoints: { x: number; y: number; z: number; val: number; S: number; yVal: number; projX: number; projY: number; projDepth: number }[][] = [];
    let zMin = surface.z_min;
    let zMax = surface.z_max;
    const rawValGrid: number[][] = [];
    for (let j = 0; j <= effectiveYSteps; j++) {
      rawValGrid[j] = [];
      for (let i = 0; i <= effectiveXSteps; i++) {
        const point = surface.points[j * (effectiveXSteps + 1) + i];
        rawValGrid[j][i] = Number(point?.value ?? 0);
      }
    }

    // Protect against division by zero in pricing calculations
    let zRange = zMax - zMin;
    if (Math.abs(zRange) < 0.01) zRange = 1.0;
    const zCenter = (zMin + zMax) / 2;

    // 3D coordinates system: X in [-1, 1] (Price), Y in [-1, 1] (Days/IV), Z in [-1, 1] (P&L/Greek)
    for (let j = 0; j <= effectiveYSteps; j++) {
      gridPoints[j] = [];
      const yVal = yMin + (j / effectiveYSteps) * colRange;
      for (let i = 0; i <= effectiveXSteps; i++) {
        const surfacePoint = surface.points[j * (effectiveXSteps + 1) + i];
        const S = Number(surfacePoint?.spot ?? (xMin + (i / effectiveXSteps) * priceRange));
        const actualYVal = Number(surfacePoint?.y ?? yVal);
        const val = rawValGrid[j][i];

        // Map to [-1, 1] bounds
        const nx = ((S - centerPrice) / priceRange) * 2;
        const ny = ((actualYVal - centerCol) / colRange) * 2;
        const nz = ((val - zCenter) / zRange) * 1.4; // 1.4 height factor for visual aesthetics

        // 3D Rotation with projected Z
        const projLoc = project3D(nx, ny, nz);
        const yRot1 = nx * Math.sin(yaw) + ny * Math.cos(yaw);
        const zRot2 = -yRot1 * Math.sin(pitch) + nz * Math.cos(pitch);

        gridPoints[j][i] = {
          x: nx,
          y: ny,
          z: nz,
          val,
          S,
          yVal: actualYVal,
          projX: projLoc.x,
          projY: projLoc.y,
          projDepth: zRot2 // depth sorting reference
        };
      }
    }

    // Represent polygons (quads) of the surface grid for depth sorting
    interface GridQuad {
      p00: typeof gridPoints[0][0];
      p01: typeof gridPoints[0][0];
      p11: typeof gridPoints[0][0];
      p10: typeof gridPoints[0][0];
      avgDepth: number;
      i: number;
      j: number;
    }

    const quads: GridQuad[] = [];
    for (let j = 0; j < effectiveYSteps; j++) {
      for (let i = 0; i < effectiveXSteps; i++) {
        const p00 = gridPoints[j][i];
        const p10 = gridPoints[j+1][i];
        const p11 = gridPoints[j+1][i+1];
        const p01 = gridPoints[j][i+1];

        const avgDepth = (p00.projDepth + p10.projDepth + p11.projDepth + p01.projDepth) / 4;

        quads.push({
          p00, p01, p11, p10,
          avgDepth,
          i, j
        });
      }
    }

    // Painter's Algorithm: Sort polygons by average depth.
    quads.sort((a, b) => a.avgDepth - b.avgDepth);

    // 1. Draw 3D background grids (drawn before quads so they sit in the background)
    ctx.lineWidth = 0.8;

    // A. Floor grid lines (at Z = -1)
    ctx.strokeStyle = 'rgba(255, 159, 28, 0.05)';
    const tickSteps = [-1, -0.5, 0, 0.5, 1];

    tickSteps.forEach(tickVal => {
      // Line of constant X (running along Y)
      const xStart = project3D(tickVal, -1, -1);
      const xEnd = project3D(tickVal, 1, -1);
      ctx.beginPath();
      ctx.moveTo(xStart.x, xStart.y);
      ctx.lineTo(xEnd.x, xEnd.y);
      ctx.stroke();

      // Line of constant Y (running along X)
      const yStart = project3D(-1, tickVal, -1);
      const yEnd = project3D(1, tickVal, -1);
      ctx.beginPath();
      ctx.moveTo(yStart.x, yStart.y);
      ctx.lineTo(yEnd.x, yEnd.y);
      ctx.stroke();
    });

    // B. Back wall grids (at Y = 1)
    ctx.strokeStyle = 'rgba(255, 159, 28, 0.04)';
    tickSteps.forEach(tickVal => {
      // Vertical lines on back wall (constant X)
      const startW1 = project3D(tickVal, 1, -1);
      const endW1 = project3D(tickVal, 1, 1);
      ctx.beginPath();
      ctx.moveTo(startW1.x, startW1.y);
      ctx.lineTo(endW1.x, endW1.y);
      ctx.stroke();

      // Horizontal lines on back wall (constant Z)
      const startW2 = project3D(-1, 1, tickVal);
      const endW2 = project3D(1, 1, tickVal);
      ctx.beginPath();
      ctx.moveTo(startW2.x, startW2.y);
      ctx.lineTo(endW2.x, endW2.y);
      ctx.stroke();
    });

    // C. Left wall grids (at X = -1)
    tickSteps.forEach(tickVal => {
      // Vertical lines on left wall (constant Y)
      const startL1 = project3D(-1, tickVal, -1);
      const endL1 = project3D(-1, tickVal, 1);
      ctx.beginPath();
      ctx.moveTo(startL1.x, startL1.y);
      ctx.lineTo(endL1.x, endL1.y);
      ctx.stroke();

      // Horizontal lines on left wall (constant Z)
      const startL2 = project3D(-1, -1, tickVal);
      const endL2 = project3D(-1, 1, tickVal);
      ctx.beginPath();
      ctx.moveTo(startL2.x, startL2.y);
      ctx.lineTo(endL2.x, endL2.y);
      ctx.stroke();
    });

    // Center Zero PnL Reference plane
    const centerPnLZNorm = ((0 - zCenter) / zRange) * 1.4;
    if (centerPnLZNorm >= -1 && centerPnLZNorm <= 1) {
      const pnlZeroCorners = [
        project3D(-1, -1, centerPnLZNorm),
        project3D(1, -1, centerPnLZNorm),
        project3D(1, 1, centerPnLZNorm),
        project3D(-1, 1, centerPnLZNorm)
      ];
      ctx.beginPath();
      ctx.moveTo(pnlZeroCorners[0].x, pnlZeroCorners[0].y);
      for (let k = 1; k < 4; k++) ctx.lineTo(pnlZeroCorners[k].x, pnlZeroCorners[k].y);
      ctx.closePath();
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.12)';
      ctx.fillStyle = 'rgba(239, 68, 68, 0.015)';
      ctx.fill();
      ctx.stroke();
    }

    // Render Quads!
    quads.forEach((q) => {
      ctx.beginPath();
      ctx.moveTo(q.p00.projX, q.p00.projY);
      ctx.lineTo(q.p01.projX, q.p01.projY);
      ctx.lineTo(q.p11.projX, q.p11.projY);
      ctx.lineTo(q.p10.projX, q.p10.projY);
      ctx.closePath();

      // Compute shading color based on value and height (positive values green/emerald, negative reddish/coral)
      const avgVal = (q.p00.val + q.p01.val + q.p11.val + q.p10.val) / 4;
      const heightPercent = Math.max(0, Math.min(1, (avgVal - zMin) / zRange));

      // Calculate shading intensity using Depth Projection
      const depthIntensity = Math.min(1.2, Math.max(0.6, (q.avgDepth + 1.5) / 2.5));

      let rComp = 0;
      let gComp = 0;
      let bComp = 0;

      if (plotTarget === 'pnl') {
        if (avgVal >= 0) {
          const greenRatio = Math.min(1.0, avgVal / (Math.max(1, zMax)));
          rComp = Math.floor((16 + (34 - 16) * greenRatio) * depthIntensity);
          gComp = Math.floor((128 + (197 - 128) * greenRatio) * depthIntensity);
          bComp = Math.floor((76 + (14 - 76) * greenRatio) * depthIntensity);
        } else {
          const lossRatio = Math.min(1.0, Math.abs(avgVal) / (Math.max(1, Math.abs(zMin))));
          rComp = Math.floor((180 + (239 - 180) * lossRatio) * depthIntensity);
          gComp = Math.floor((50 + (35 - 50) * lossRatio) * depthIntensity);
          bComp = Math.floor((50 + (35 - 50) * lossRatio) * depthIntensity);
        }
      } else {
        rComp = Math.floor((40 + 60 * heightPercent) * depthIntensity);
        gComp = Math.floor((60 + 100 * heightPercent) * depthIntensity);
        bComp = Math.floor((180 + 75 * heightPercent) * depthIntensity);
      }

      ctx.fillStyle = `rgba(${rComp}, ${gComp}, ${bComp}, 0.52)`;
      ctx.fill();

      ctx.strokeStyle = `rgba(${rComp}, ${gComp}, ${bComp}, 0.88)`;
      ctx.lineWidth = 0.85;
      ctx.stroke();
    });

    // 2. Draw 3D coordinate bounding box frame (drawn on top of the surface)
    ctx.strokeStyle = 'rgba(255, 159, 28, 0.28)'; // crisp orange bounding pillars
    ctx.lineWidth = 1.2;

    const corners = [
      // Floor corners at Z = -1
      project3D(-1, -1, -1), // 0
      project3D(1, -1, -1),  // 1
      project3D(1, 1, -1),   // 2
      project3D(-1, 1, -1),  // 3
      // Ceiling corners at Z = +1
      project3D(-1, -1, 1),  // 4
      project3D(1, -1, 1),   // 5
      project3D(1, 1, 1),    // 6
      project3D(-1, 1, 1)    // 7
    ];

    // Floor square
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    ctx.lineTo(corners[1].x, corners[1].y);
    ctx.lineTo(corners[2].x, corners[2].y);
    ctx.lineTo(corners[3].x, corners[3].y);
    ctx.closePath();
    ctx.stroke();

    // Ceiling square
    ctx.beginPath();
    ctx.moveTo(corners[4].x, corners[4].y);
    ctx.lineTo(corners[5].x, corners[5].y);
    ctx.lineTo(corners[6].x, corners[6].y);
    ctx.lineTo(corners[7].x, corners[7].y);
    ctx.closePath();
    ctx.stroke();

    // Vertical pillars
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.moveTo(corners[k].x, corners[k].y);
      ctx.lineTo(corners[k + 4].x, corners[k + 4].y);
      ctx.stroke();
    }

    // 3. Draw Axis graduation scale labels on bounding box lines
    ctx.fillStyle = '#ff9f1c'; // Solid Bloomberg Amber for scales
    ctx.lineWidth = 1;

    // A. X-AXIS (STOCK PRICE) TICKS AND LABELS: Draw along the bottom front edge: (nx, -1, -1) to (1, -1, -1)
    tickSteps.forEach(tickVal => {
      // Calculate real stock price corresponding to tickVal
      const S = centerPrice + (tickVal / 2) * priceRange;
      const proj = project3D(tickVal, -1, -1);
      const projTickEnd = project3D(tickVal, -1.06, -1); // Tick line points outward

      ctx.beginPath();
      ctx.moveTo(proj.x, proj.y);
      ctx.lineTo(projTickEnd.x, projTickEnd.y);
      ctx.strokeStyle = '#ff9f1c';
      ctx.stroke();

      draw3DAxisLabel(`$${S.toFixed(0)}`, {x: tickVal, y: -1.08, z: -1}, {dx: 0, dy: 10}, '#ff9f1c');
    });
    // X-Axis Header Label
    draw3DAxisLabel(`股价标的物 (AXIS-X)`, {x: 0, y: -1.25, z: -1}, {dx: 0, dy: 12}, '#ff9f1c');

    // B. Y-AXIS (SCENARIO DAYS / IV) TICKS AND LABELS: Draw along the left-front floor edge: (-1, ny, -1)
    tickSteps.forEach(tickVal => {
      const yVal = centerCol + (tickVal / 2) * colRange;
      const proj = project3D(-1, tickVal, -1);
      const projTickEnd = project3D(-1.06, tickVal, -1);

      ctx.beginPath();
      ctx.moveTo(proj.x, proj.y);
      ctx.lineTo(projTickEnd.x, projTickEnd.y);
      ctx.strokeStyle = '#ff9f1c';
      ctx.stroke();

      const labelText = useIVDimension
        ? `${yVal.toFixed(0)}%`
        : `${formatShortAxisDate(yVal, asOfDate)} (${yVal.toFixed(0)}天)`;
      draw3DAxisLabel(labelText, {x: -1.1, y: tickVal, z: -1}, {dx: -5, dy: 2}, '#ffaf1a');
    });
    // Y-Axis Header Label
    draw3DAxisLabel(useIVDimension ? '隐含波动率 (AXIS-Y)' : '场景剩余天数 (AXIS-Y)', {x: -1.3, y: 0, z: -1}, {dx: -12, dy: 0}, '#ff9f1c');

    // C. Z-AXIS (敞口/PNL) SECURED TICKS AND LABELS: Draw along the vertical edge: (-1, -1, nz)
    tickSteps.forEach(tickVal => {
      // Calculate correct back-scaled value matching the 1.4 visual scale factor
      const zVal = zCenter + (tickVal / 1.4) * zRange;
      const proj = project3D(-1, -1, tickVal);
      const projTickEnd = project3D(-1.08, -1.08, tickVal);

      ctx.beginPath();
      ctx.moveTo(proj.x, proj.y);
      ctx.lineTo(projTickEnd.x, projTickEnd.y);
      ctx.strokeStyle = '#ff9f1c';
      ctx.stroke();

      const prefix = zVal > 0 ? '+' : '';
      draw3DAxisLabel(`${prefix}$${Math.round(zVal)}`, {x: -1.14, y: -1.14, z: tickVal}, {dx: -2, dy: 3}, '#ffbf1c');
    });
    // Z-Axis Header Label
    draw3DAxisLabel(`${plotTarget.toUpperCase()} 敞口 (AXIS-Z)`, {x: -1, y: -1, z: 1.15}, {dx: 0, dy: -12}, '#ff9f1c');

    // Draw Current Underlyer stock price anchor on the grid for clear referencing
    const currentPricePct = ((currentStockPrice - centerPrice) / priceRange) * 2;
    if (currentPricePct >= -1 && currentPricePct <= 1) {
      const SPriceCorners = [
        project3D(currentPricePct, -1, -1),
        project3D(currentPricePct, 1, -1)
      ];
      ctx.beginPath();
      ctx.moveTo(SPriceCorners[0].x, SPriceCorners[0].y);
      ctx.lineTo(SPriceCorners[1].x, SPriceCorners[1].y);
      ctx.strokeStyle = '#00e5ff'; // Radiant Bloomberg Cyan line
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.lineWidth = 1;
      draw3DAxisLabel(`标的正处: $${currentStockPrice.toFixed(2)}`, {x: currentPricePct, y: -1, z: -1}, {dx: -5, dy: 24}, '#00e5ff');
    }

    if (plotTarget === 'pnl') {
      breakevenAnnotations.forEach((annotation, index) => {
        const price = Number(annotation.price);
        const boundaryPct = ((price - centerPrice) / priceRange) * 2;
        if (boundaryPct < -1 || boundaryPct > 1) return;
        const lineStart = project3D(boundaryPct, -1, -1);
        const lineEnd = project3D(boundaryPct, 1, -1);
        ctx.beginPath();
        ctx.moveTo(lineStart.x, lineStart.y);
        ctx.lineTo(lineEnd.x, lineEnd.y);
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.92)';
        ctx.lineWidth = 1.6;
        ctx.setLineDash([5, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        draw3DAxisLabel(
          `${annotation.label} ${annotation.offsetPct != null && annotation.offsetPct >= 0 ? '+' : ''}${annotation.offsetPct ?? 0}%`,
          {x: boundaryPct, y: index % 2 === 0 ? 1.04 : -1.04, z: -0.88},
          {dx: 0, dy: index % 2 === 0 ? -8 : 26},
          '#facc15'
        );
      });
    }

    // 4. Interactive 3D Hover Coordinate Tracker
    if (hoverPos) {
      let hoverMatch = null;
      let minDistance = Infinity;
      for (let j = 0; j <= effectiveYSteps; j++) {
        for (let i = 0; i <= effectiveXSteps; i++) {
          const pt = gridPoints[j][i];
          const dist = Math.hypot(pt.projX - hoverPos.x, pt.projY - hoverPos.y);
          if (dist < minDistance) {
            minDistance = dist;
            hoverMatch = pt;
          }
        }
      }
      if (hoverMatch && minDistance < 30) {
        // Draw guidelines in 3/2D space
        const projFloor = project3D(hoverMatch.x, hoverMatch.y, -1);
        const projXLine = project3D(hoverMatch.x, -1, -1);
        const projYLine = project3D(-1, hoverMatch.y, -1);

        ctx.beginPath();
        ctx.moveTo(hoverMatch.projX, hoverMatch.projY);
        ctx.lineTo(projFloor.x, projFloor.y);
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.45)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(projFloor.x, projFloor.y);
        ctx.lineTo(projXLine.x, projXLine.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(projFloor.x, projFloor.y);
        ctx.lineTo(projYLine.x, projYLine.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Glowing selected surface point indicator
        ctx.beginPath();
        ctx.arc(hoverMatch.projX, hoverMatch.projY, 5.5, 0, 2 * Math.PI);
        ctx.fillStyle = '#00e5ff';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(hoverMatch.projX, hoverMatch.projY, 9, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Render Floating HUD Tooltip Card on Canvas surface
        ctx.fillStyle = 'rgba(7, 7, 9, 0.9)';
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 1.3;

        const cardW = 210;
        const cardH = 82;
        let cX = hoverPos.x + 15;
        if (cX + cardW > canvasSize.width) {
          cX = hoverPos.x - cardW - 15;
        }
        let cY = hoverPos.y - cardH / 2;
        cY = Math.max(10, Math.min(canvasSize.height - cardH - 10, cY));

        ctx.beginPath();
        ctx.rect(cX, cY, cardW, cardH);
        ctx.fill();
        ctx.stroke();

        // Text details inside the HUD card
        ctx.textAlign = 'left';
        ctx.font = 'bold 11px "JetBrains Mono", monospace';
        ctx.fillStyle = '#ff9f1c';
        ctx.fillText('🔍 3D MULTI-SCENARIO HOVER', cX + 10, cY + 18);

        ctx.fillStyle = '#ffffff';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillText(`标的股价: $${hoverMatch.S.toFixed(2)}`, cX + 10, cY + 36);

        const yStr = useIVDimension
          ? `隐含波动率: ${hoverMatch.yVal.toFixed(1)}%`
          : `场景剩余天数: ${formatAxisDate(hoverMatch.yVal, asOfDate)} (${Math.round(hoverMatch.yVal)}天)`;
        ctx.fillText(yStr, cX + 10, cY + 52);

        const prefixVal = hoverMatch.val > 0 ? '+' : '';
        let tgtLabel = plotTarget.toUpperCase();
        if (tgtLabel === 'PNL') tgtLabel = '期望盈亏 (P&L)';
        ctx.fillStyle = hoverMatch.val >= 0 ? '#00ff33' : '#ff3366';
        ctx.font = 'bold 11px "JetBrains Mono", monospace';
        ctx.fillText(`${tgtLabel}: ${prefixVal}$${hoverMatch.val.toFixed(2)}`, cX + 10, cY + 68);
      }
    }

  }, [legs.length, currentStockPrice, yaw, pitch, zoom, plotTarget, useIVDimension, canvasSize, hoverPos, scenarioDaysDomain.max, breakevenAnnotations, rustSurface, asOfDate]);

  // Adjust parameters helpers
  const resetAngles = () => {
    setYaw(-0.6);
    setPitch(0.75);
    setZoom(180);
  };

  return (
    <div id="three-d-panel" className="bg-black border-2 border-[#ff9f1c]/30 rounded-none overflow-hidden p-4 h-full flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 border-b border-gray-900 pb-2.5">
        <div>
          <h3 className="text-[#ff9f1c] font-black font-mono tracking-wider flex items-center gap-2 text-sm uppercase">
            <Activity className="text-[#ff9f1c] w-4.5 h-4.5" />
            &lt;G 3D MULTI-SCENARIO VOLATILITY RISKS&gt;
          </h3>
          <p className="text-[10.5px] text-gray-400 font-mono mt-0.5">
            DRAG CANVASES TO PIVOT PERSPECTIVE 360°. SIMULATED NON-LINEAR DECAY CURVES.
          </p>
        </div>

        {/* Dimension and Targets Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Target Selector */}
          <div className="flex items-center bg-[#0d0d0f] p-0.5 rounded-none border border-[#ff9f1c]/30 text-xs text-gray-300 font-mono">
            {[
              { id: 'pnl', label: 'P&L', activeColor: 'text-[#00ff33] bg-[#ff9f1c]/10 font-bold' },
              { id: 'delta', label: 'DELTA', activeColor: 'text-[#00e5ff] bg-[#ff9f1c]/10 font-bold' },
              { id: 'gamma', label: 'GAMMA', activeColor: 'text-[#ff00ff] bg-[#ff9f1c]/10 font-bold' },
              { id: 'vega', label: 'VEGA', activeColor: 'text-[#ffd700] bg-[#ff9f1c]/10 font-bold' },
              { id: 'theta', label: 'THETA', activeColor: 'text-[#ff3366] bg-[#ff9f1c]/10 font-bold' }
            ].map(tgt => (
              <button
                key={tgt.id}
                onClick={() => setPlotTarget(tgt.id as any)}
                className={`px-3 py-1 rounded-none transition ${plotTarget === tgt.id ? tgt.activeColor : 'text-gray-400 hover:text-white'}`}
              >
                {tgt.label}
              </button>
            ))}
          </div>

          {/* Dimension Y Selector */}
          <button
            onClick={() => setUseIVDimension(prev => !prev)}
            className="flex items-center gap-1.5 bg-[#0d0d0f] px-3 py-1.5 rounded-none border border-[#ff9f1c]/30 text-xs font-mono text-gray-300 hover:text-white transition"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#ff9f1c]" />
            DIM-Y: <span className="font-bold text-[#00e5ff]">{useIVDimension ? 'IMPLIED VOLATILITY (IV)' : 'EXPIRY DAYS (DAYS)'}</span>
          </button>

          {/* Reset angles */}
          <button
            onClick={resetAngles}
            title="RESET perspective VIEW"
            className="p-1.5 bg-[#0d0d0f] rounded-none border border-[#ff9f1c]/30 text-gray-400 hover:text-[#ff9f1c] transition"
          >
            <RotateCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowAnnotations(prev => !prev)}
            title={showAnnotations ? '隐藏 3D 底部标注，避免遮蔽查看效果' : '显示 3D 底部标注'}
            className={`p-1.5 bg-[#0d0d0f] rounded-none border transition ${
              showAnnotations
                ? 'border-[#00e5ff]/40 text-[#00e5ff] hover:text-white'
                : 'border-gray-800 text-gray-500 hover:text-[#00e5ff]'
            }`}
          >
            {showAnnotations ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            <span className="sr-only">{showAnnotations ? '隐藏标注' : '显示标注'}</span>
          </button>
        </div>
      </div>

      {/* Sliders panel */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3 bg-[#08080a] p-3 rounded-none border border-gray-900 font-mono">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#ff9f1c] w-24">YAW (3D旋转):</span>
          <input
            type="range"
            min="-3.14"
            max="3.14"
            step="0.05"
            value={yaw}
            onChange={(e) => setYaw(parseFloat(e.target.value))}
            className="w-full accent-[#ff9f1c] h-1 bg-gray-900 rounded-lg appearance-none cursor-pointer"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#ff9f1c] w-24">PITCH (仰角):</span>
          <input
            type="range"
            min="0.1"
            max="1.5"
            step="0.05"
            value={pitch}
            onChange={(e) => setPitch(parseFloat(e.target.value))}
            className="w-full accent-[#ff9f1c] h-1 bg-gray-900 rounded-lg appearance-none cursor-pointer"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#ff9f1c] w-24">ZOOM (缩放):</span>
          <input
            type="range"
            min="80"
            max="400"
            step="5"
            value={zoom}
            onChange={(e) => setZoom(parseInt(e.target.value))}
            className="w-full accent-[#ff9f1c] h-1 bg-gray-900 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>

      {/* Surface Render Screen */}
      <div
        ref={containerRef}
        className="flex-1 w-full bg-black border border-gray-900 relative overflow-hidden cursor-move select-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />

        {/* Legend moved outside to bottom bar */}
        <div className="hidden">
          <div className="text-[#ff9f1c] font-black mb-1 text-xs uppercase tracking-wider border-b border-gray-900 pb-1">
            SURFACE INDICES (Z)
          </div>
          {plotTarget === 'pnl' ? (
            <>
              <div className="flex items-center gap-1.5 text-[#00ff33] font-bold">
                <span className="w-2.5 h-2.5 bg-[#00ff33]/50 border border-[#00ff33] rounded-none" />
                NET PROFIT (GAIN ZONE)
              </div>
              <div className="flex items-center gap-1.5 text-[#ff3333] font-bold">
                <span className="w-2.5 h-2.5 bg-[#ff3333]/50 border border-[#ff3333] rounded-none" />
                NET EXPOSURE RISK (LOSS)
              </div>
            </>
          ) : (
            <div className="flex items-center gap-1.5 text-[#00e5ff] font-bold">
              <span className="w-2.5 h-2.5 bg-[#00e5ff]/50 border border-[#00e5ff] rounded-none" />
              SENSITIVITY VALUE
            </div>
          )}
          <div className="text-[9.5px] text-gray-500 mt-1 uppercase">
            AXIS X: SPOT ${(currentStockPrice * 0.75).toFixed(0)} - ${(currentStockPrice * 1.25).toFixed(0)}
          </div>
          <div className="text-[9.5px] text-gray-500 uppercase">
            AXIS Y: {useIVDimension ? '10% - 120% IMPLIED VOL' : `0 - ${scenarioDaysDomain.max} SCENARIO DAYS REMAINING`}
          </div>
        </div>
      </div>

      {showAnnotations && (
        <>
          {/* Non-blocking Legend Footer */}
          <div className="mt-3 p-2.5 bg-[#08080a] border border-gray-950 flex flex-wrap items-center justify-between text-[10px] font-mono gap-3.5 select-none text-gray-300">
            <div className="flex items-center gap-4.5">
              <span className="text-[#ff9f1c] font-black uppercase tracking-wider">3D 坐标指标 (Z):</span>
              {plotTarget === 'pnl' ? (
                <>
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                    <span className="w-2.5 h-2.5 bg-emerald-500/25 border border-emerald-500 inline-block" />
                    净收益区 (NET PROFIT)
                  </div>
                  <div className="flex items-center gap-1.5 text-rose-500 font-bold">
                    <span className="w-2.5 h-2.5 bg-rose-500/25 border border-rose-500 inline-block" />
                    敞口风险 (NET EXPOSURE RISK)
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-1.5 text-cyan-400 font-bold">
                  <span className="w-2.5 h-2.5 bg-cyan-500/25 border border-cyan-500 inline-block" />
                  敏感情景度量 (SENSITIVITY VALUE)
                </div>
              )}
            </div>
            <div className="flex items-center gap-4 text-gray-500 font-semibold text-[9.5px]">
              <span>X轴(标的股价)区间: ${(currentStockPrice * 0.75).toFixed(0)} - ${(currentStockPrice * 1.25).toFixed(0)}</span>
              <span>Y轴变量区间: {useIVDimension ? '10% - 120% 隐波' : `0 - ${scenarioDaysDomain.max} 场景剩余天`}</span>
            </div>
          </div>

          <div className="mt-2 p-2.5 bg-[#060608] border border-yellow-500/20 flex flex-wrap items-center gap-2 text-[10px] font-mono">
            <span className="text-yellow-300 font-black uppercase tracking-wider">3D 边界标注</span>
            <span className={`px-2 py-1 border font-black ${
              computeEngineMeta.boundaryEngine === 'rust-option-core'
                ? 'border-emerald-500/40 text-emerald-200 bg-emerald-950/20'
                : 'border-gray-800 text-gray-500 bg-black'
            }`}>
              {computeEngineMeta.label}
            </span>
            {boundaryAnnotations.map((annotation, index) => (
              <span
                key={`${annotation.kind}-${annotation.label}-${index}`}
                className={`px-2 py-1 border ${
                  annotation.kind === 'breakeven'
                    ? 'border-yellow-500/40 text-yellow-200 bg-yellow-950/20'
                    : annotation.kind === 'spot'
                      ? 'border-cyan-500/40 text-cyan-200 bg-cyan-950/20'
                      : 'border-gray-800 text-gray-400 bg-black'
                }`}
                title={annotation.offsetPct != null ? `相对现价 ${annotation.offsetPct}%` : annotation.label}
              >
                {annotation.label}
                {annotation.kind === 'breakeven' && annotation.offsetPct != null && (
                  <span className="ml-1 text-gray-500">
                    ({annotation.offsetPct >= 0 ? '+' : ''}{annotation.offsetPct}%)
                  </span>
                )}
              </span>
            ))}
            <span className="text-gray-600 ml-auto">
              {plotTarget === 'pnl' ? 'B/E 投影线已绘制在 3D 地形底面' : '切回 P&L 查看 B/E 投影线'}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
