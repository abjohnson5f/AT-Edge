import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type CandlestickData,
  type Time,
  type ISeriesApi,
} from 'lightweight-charts';
import {
  MousePointer2,
  Crosshair,
  PenLine,
  Type,
  Ruler,
  Settings2,
} from 'lucide-react';
import type { Restaurant } from './DashboardShell';

interface PriceChartProps {
  restaurant: Restaurant;
  activeIndicators: Set<string>;
  showVolume: boolean;
}

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

const TIMEFRAMES = ['1D', '1W', '1M', '3M', '6M', '1Y', 'ALL'] as const;

const TIMEFRAME_DAYS: Record<string, number> = {
  '1D': 1,
  '1W': 7,
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
  'ALL': 999,
};

// ── API Chart Data Types ──

interface ChartDataResponse {
  status: string;
  totalTrades: number;
  candles: Array<{ time: string; open: number; high: number; low: number; close: number }>;
  volume: Array<{ time: string; value: number; color: string }>;
  sma: Array<{ time: string; value: number }>;
  conversion: Array<{ time: string; value: number }>;
  demand: Array<{ time: string; value: number }>;
}

// ── Mock Data Generators (deterministic, seeded) ──

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function generateMockCandlestickData(basePrice: number, days: number, alias: string): CandlestickData<Time>[] {
  const data: CandlestickData<Time>[] = [];
  let price = basePrice / 100;
  const date = new Date(2025, 0, 1);
  const totalDays = Math.min(days, 365);
  let seed = 0;
  for (let i = 0; i < alias.length; i++) seed = ((seed << 5) - seed + alias.charCodeAt(i)) | 0;
  const rand = seededRandom(Math.abs(seed));

  for (let i = 0; i < totalDays; i++) {
    if (date.getDay() === 0) date.setDate(date.getDate() + 1);
    if (date.getDay() === 6) date.setDate(date.getDate() + 2);

    const volatility = price * 0.02 + rand() * price * 0.03;
    const trend = price * 0.001;
    const open = price + (rand() - 0.45) * volatility;
    const close = open + (rand() - 0.45) * volatility + trend;
    const high = Math.max(open, close) + rand() * volatility * 0.5;
    const low = Math.min(open, close) - rand() * volatility * 0.5;

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    data.push({
      time: `${year}-${month}-${day}` as Time,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
    });

    price = close;
    date.setDate(date.getDate() + 1);
  }

  return data;
}

function calculateSMA(data: Array<{ time: string; value: number }>, period: number) {
  const sma: { time: string; value: number }[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].value;
    }
    sma.push({
      time: data[i].time,
      value: parseFloat((sum / period).toFixed(2)),
    });
  }
  return sma;
}

function generateMockOverlays(candles: CandlestickData<Time>[], alias: string) {
  let seed = 42;
  for (let i = 0; i < alias.length; i++) seed = ((seed << 5) - seed + alias.charCodeAt(i)) | 0;
  const rand = seededRandom(Math.abs(seed) + 1000);

  const volume = candles.map(d => ({
    time: d.time as string,
    value: Math.floor(rand() * 50) + 5,
    color: d.close >= d.open ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
  }));

  const conversion = candles.map((d, i) => ({
    time: d.time as string,
    value: parseFloat((0.15 + Math.sin(i * 0.05) * 0.08 + rand() * 0.02).toFixed(3)),
  }));

  let demand = 50;
  const demandData = candles.map(d => {
    demand += (rand() - 0.48) * 5;
    demand = Math.max(10, Math.min(100, demand));
    return { time: d.time as string, value: parseFloat(demand.toFixed(1)) };
  });

  const sma = calculateSMA(
    candles.map(c => ({ time: c.time as string, value: c.close })),
    20,
  );

  return { volume, conversion, demand: demandData, sma };
}

// ── Data Source Tracking ──

type SeriesName = 'candles' | 'volume' | 'sma' | 'conversion' | 'demand';

interface DataSources {
  candles: 'live' | 'simulated';
  volume: 'live' | 'simulated';
  sma: 'live' | 'simulated' | 'insufficient';
  conversion: 'live' | 'simulated' | 'insufficient';
  demand: 'live' | 'simulated' | 'insufficient';
}

// ── Chart Data Hook ──

function useChartData(alias: string, avgPriceCents: number, timeframe: string) {
  const [apiData, setApiData] = useState<ChartDataResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch from API
  useEffect(() => {
    if (USE_MOCK) return;

    let cancelled = false;
    setLoading(true);

    fetch(`${API_BASE}/chart-data/${alias}?tf=${timeframe}`)
      .then(res => res.json())
      .then(data => {
        if (!cancelled && data.status === 'ok') {
          setApiData(data);
        } else if (!cancelled) {
          setApiData(null);
        }
      })
      .catch(() => {
        if (!cancelled) setApiData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [alias, timeframe]);

  // Mock data (memoized, deterministic)
  const mockCandles = useMemo(
    () => generateMockCandlestickData(avgPriceCents, 365, alias),
    [alias, avgPriceCents],
  );

  const slicedMockCandles = useMemo(() => {
    const days = TIMEFRAME_DAYS[timeframe] ?? 180;
    if (days >= mockCandles.length) return mockCandles;
    return mockCandles.slice(-days);
  }, [mockCandles, timeframe]);

  const mockOverlays = useMemo(
    () => generateMockOverlays(slicedMockCandles, alias),
    [slicedMockCandles, alias],
  );

  // Per-series: use API data if available for that series, else fall back to mock
  const hasLiveCandles = apiData != null && apiData.candles.length > 0;
  const hasLiveVolume = apiData != null && apiData.volume.length > 0;
  const hasLiveSMA = apiData != null && apiData.sma.length > 0;
  const hasLiveConversion = apiData != null && apiData.conversion.length > 0;
  const hasLiveDemand = apiData != null && apiData.demand.length > 0;

  const sources: DataSources = {
    candles: hasLiveCandles ? 'live' : 'simulated',
    volume: hasLiveVolume ? 'live' : 'simulated',
    sma: hasLiveSMA ? 'live' : (hasLiveCandles ? 'insufficient' : 'simulated'),
    conversion: hasLiveConversion ? 'live' : (apiData != null ? 'insufficient' : 'simulated'),
    demand: hasLiveDemand ? 'live' : (apiData != null ? 'insufficient' : 'simulated'),
  };

  const allLive = Object.values(sources).every(s => s === 'live');
  const allSimulated = Object.values(sources).every(s => s === 'simulated');

  return {
    sources,
    allLive,
    allSimulated,
    hasAnyLive: Object.values(sources).some(s => s === 'live'),
    loading,
    candles: hasLiveCandles
      ? apiData!.candles.map(c => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close }))
      : slicedMockCandles,
    volume: hasLiveVolume
      ? apiData!.volume.map(v => ({ time: v.time as Time, value: v.value, color: v.color }))
      : mockOverlays.volume.map(v => ({ time: v.time as Time, value: v.value, color: v.color })),
    sma: hasLiveSMA
      ? apiData!.sma.map(s => ({ time: s.time as Time, value: s.value }))
      : mockOverlays.sma.map(s => ({ time: s.time as Time, value: s.value })),
    conversion: hasLiveConversion
      ? apiData!.conversion.map(c => ({ time: c.time as Time, value: c.value }))
      : mockOverlays.conversion.map(c => ({ time: c.time as Time, value: c.value })),
    demand: hasLiveDemand
      ? apiData!.demand.map(d => ({ time: d.time as Time, value: d.value }))
      : mockOverlays.demand.map(d => ({ time: d.time as Time, value: d.value })),
    totalTrades: apiData?.totalTrades ?? 0,
  };
}

// ── PriceChart Component ──

export function PriceChart({ restaurant, activeIndicators, showVolume }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<{
    volume?: ISeriesApi<'Histogram'>;
    sma?: ISeriesApi<'Line'>;
    conversion?: ISeriesApi<'Line'>;
    demand?: ISeriesApi<'Line'>;
  }>({});
  const [activeTimeframe, setActiveTimeframe] = useState('6M');
  const [activeTool, setActiveTool] = useState('cursor');

  const chartData = useChartData(restaurant.alias, restaurant.avgPriceCents, activeTimeframe);

  useEffect(() => {
    if (!containerRef.current) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      seriesRef.current = {};
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#13161B' },
        textColor: '#5E646C',
        fontFamily: "'Inter', sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#1E2128', style: 1 },
        horzLines: { color: '#1E2128', style: 1 },
      },
      rightPriceScale: {
        borderColor: '#2A2D35',
        textColor: '#5E646C',
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: '#2A2D35',
        timeVisible: false,
        secondsVisible: false,
      },
      crosshair: {
        mode: activeTool === 'crosshair' ? 0 : 1,
        vertLine: {
          color: '#547C81',
          width: 1,
          style: 2,
          labelBackgroundColor: '#547C81',
        },
        horzLine: {
          color: '#547C81',
          width: 1,
          style: 2,
          labelBackgroundColor: '#547C81',
        },
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true },
    });

    chartRef.current = chart;

    // Candlestick series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22C55E',
      downColor: '#EF4444',
      borderUpColor: '#22C55E',
      borderDownColor: '#EF4444',
      wickUpColor: '#22C55E',
      wickDownColor: '#EF4444',
    });
    candleSeries.setData(chartData.candles);

    // Volume histogram
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      visible: showVolume,
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });
    volumeSeries.setData(chartData.volume);
    seriesRef.current.volume = volumeSeries;

    // SMA overlay
    if (chartData.sma.length > 0) {
      const smaSeries = chart.addSeries(LineSeries, {
        color: '#547C81',
        lineWidth: 2,
        lineStyle: 2,
        crosshairMarkerVisible: false,
        visible: activeIndicators.has('sma'),
      });
      smaSeries.setData(chartData.sma);
      seriesRef.current.sma = smaSeries;
    }

    // Conversion overlay
    if (chartData.conversion.length > 0) {
      const convSeries = chart.addSeries(LineSeries, {
        color: '#F59E0B',
        lineWidth: 1,
        lineStyle: 0,
        crosshairMarkerVisible: false,
        priceScaleId: 'conversion',
        visible: activeIndicators.has('conversion'),
      });
      chart.priceScale('conversion').applyOptions({
        scaleMargins: { top: 0.05, bottom: 0.3 },
      });
      convSeries.setData(chartData.conversion);
      seriesRef.current.conversion = convSeries;
    }

    // Demand overlay
    if (chartData.demand.length > 0) {
      const demSeries = chart.addSeries(LineSeries, {
        color: '#8B5CF6',
        lineWidth: 1,
        lineStyle: 0,
        crosshairMarkerVisible: false,
        priceScaleId: 'demand',
        visible: activeIndicators.has('demand'),
      });
      chart.priceScale('demand').applyOptions({
        scaleMargins: { top: 0.05, bottom: 0.3 },
      });
      demSeries.setData(chartData.demand);
      seriesRef.current.demand = demSeries;
    }

    chart.timeScale().fitContent();

    // Responsive resize
    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = {};
    };
  }, [chartData, activeTool]);

  // Toggle overlay visibility without full chart rebuild
  useEffect(() => {
    seriesRef.current.sma?.applyOptions({ visible: activeIndicators.has('sma') });
    seriesRef.current.conversion?.applyOptions({ visible: activeIndicators.has('conversion') });
    seriesRef.current.demand?.applyOptions({ visible: activeIndicators.has('demand') });
  }, [activeIndicators]);

  useEffect(() => {
    seriesRef.current.volume?.applyOptions({ visible: showVolume });
  }, [showVolume]);

  const tools = [
    { id: 'cursor', icon: MousePointer2, label: 'Cursor' },
    { id: 'crosshair', icon: Crosshair, label: 'Crosshair' },
    { id: 'draw', icon: PenLine, label: 'Draw' },
    { id: 'text', icon: Type, label: 'Text' },
    { id: 'measure', icon: Ruler, label: 'Measure' },
    { id: 'settings', icon: Settings2, label: 'Settings' },
  ];

  return (
    <div className="chart-area">
      <div className="chart-header">
        <div className="chart-timeframes">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf}
              type="button"
              className={`chart-timeframe${activeTimeframe === tf ? ' active' : ''}`}
              onClick={() => setActiveTimeframe(tf)}
            >
              {tf}
            </button>
          ))}
        </div>
        <div className="chart-header-right">
          {chartData.loading && (
            <span className="chart-loading-badge">Loading...</span>
          )}
          {!chartData.loading && chartData.allLive && (
            <span className="chart-live-badge">LIVE DATA</span>
          )}
          {!chartData.loading && chartData.allSimulated && (
            <span className="chart-simulated-badge" title="No live data available — all chart series use simulated data for preview purposes only">
              SIMULATED
            </span>
          )}
          {!chartData.loading && chartData.hasAnyLive && !chartData.allLive && (
            <span className="chart-partial-badge" title="Some chart series use simulated data while live data accumulates">
              PARTIAL DATA
            </span>
          )}
          <div className="chart-tools">
            {tools.map(tool => (
              <button
                key={tool.id}
                type="button"
                className={`chart-tool${activeTool === tool.id ? ' active' : ''}`}
                aria-label={tool.label}
                onClick={() => setActiveTool(tool.id)}
              >
                <tool.icon size={16} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Per-series data source banner when mixed live/simulated */}
      {!chartData.loading && !chartData.allLive && (
        <div className="chart-data-banner">
          <span className="chart-data-banner-icon">&#9432;</span>
          {chartData.allSimulated ? (
            <span>All data is <strong>simulated</strong> for preview. Connect to a live server to see real market data.</span>
          ) : (
            <span>
              {Object.entries(chartData.sources)
                .filter(([, src]) => src !== 'live')
                .map(([name, src]) => (
                  <span key={name} className="chart-data-banner-item">
                    <span className="chart-data-banner-series">{name}</span>
                    {src === 'insufficient' ? ' (needs more history)' : ' (simulated)'}
                  </span>
                ))
              }
            </span>
          )}
        </div>
      )}

      <div className="chart-container" ref={containerRef} />
    </div>
  );
}
