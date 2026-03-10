/* global LightweightCharts */
/* MoonBucks Financial Dashboard — App Logic */

document.addEventListener('DOMContentLoaded', function () {
  // Initialize Lucide icons
  if (window.lucide) {
    lucide.createIcons();
  }

  initCandlestickChart();
  initSparklines();
  initInteractions();
});

/* ===================== CANDLESTICK CHART ===================== */
function initCandlestickChart() {
  const container = document.getElementById('chart-container');
  if (!container || !window.LightweightCharts) return;

  const chart = LightweightCharts.createChart(container, {
    layout: {
      background: { type: 'solid', color: '#FFFFFF' },
      textColor: '#AEAEB1',
      fontFamily: "'Inter', sans-serif",
      fontSize: 11,
    },
    grid: {
      vertLines: { color: '#F0F0F1', style: 1 },
      horzLines: { color: '#F0F0F1', style: 1 },
    },
    rightPriceScale: {
      borderColor: '#E2E2E4',
      textColor: '#AEAEB1',
      scaleMargins: { top: 0.1, bottom: 0.2 },
    },
    timeScale: {
      borderColor: '#E2E2E4',
      timeVisible: false,
      secondsVisible: false,
    },
    crosshair: {
      mode: 0,
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

  // Candlestick series
  const candleSeries = chart.addSeries(
    LightweightCharts.CandlestickSeries,
    {
      upColor: '#217242',
      downColor: '#C3232A',
      borderUpColor: '#217242',
      borderDownColor: '#C3232A',
      wickUpColor: '#217242',
      wickDownColor: '#C3232A',
    }
  );

  // Generate realistic MSFT data
  const candleData = generateCandlestickData();
  candleSeries.setData(candleData);

  // Volume series
  const volumeSeries = chart.addSeries(
    LightweightCharts.HistogramSeries,
    {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    }
  );

  chart.priceScale('volume').applyOptions({
    scaleMargins: { top: 0.85, bottom: 0 },
  });

  const volumeData = candleData.map(function (d) {
    return {
      time: d.time,
      value: Math.floor(Math.random() * 30000000) + 10000000,
      color: d.close >= d.open ? 'rgba(33,114,66,0.15)' : 'rgba(195,35,42,0.15)',
    };
  });
  volumeSeries.setData(volumeData);

  // SMA line overlay
  const smaData = calculateSMA(candleData, 20);
  const smaSeries = chart.addSeries(
    LightweightCharts.LineSeries,
    {
      color: '#547C81',
      lineWidth: 2,
      lineStyle: 2,
      crosshairMarkerVisible: false,
    }
  );
  smaSeries.setData(smaData);

  // Fit content
  chart.timeScale().fitContent();

  // Responsive resize
  const ro = new ResizeObserver(function () {
    chart.applyOptions({
      width: container.clientWidth,
      height: container.clientHeight,
    });
  });
  ro.observe(container);
}

function generateCandlestickData() {
  var data = [];
  var price = 370;
  var date = new Date(2024, 6, 1);

  for (var i = 0; i < 180; i++) {
    // Skip weekends
    if (date.getDay() === 0) date.setDate(date.getDate() + 1);
    if (date.getDay() === 6) date.setDate(date.getDate() + 2);

    var volatility = 2 + Math.random() * 4;
    var trend = 0.15;
    var open = price + (Math.random() - 0.45) * volatility;
    var close = open + (Math.random() - 0.45) * volatility + trend;
    var high = Math.max(open, close) + Math.random() * volatility * 0.5;
    var low = Math.min(open, close) - Math.random() * volatility * 0.5;

    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');

    data.push({
      time: year + '-' + month + '-' + day,
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

function calculateSMA(data, period) {
  var sma = [];
  for (var i = period - 1; i < data.length; i++) {
    var sum = 0;
    for (var j = 0; j < period; j++) {
      sum += data[i - j].close;
    }
    sma.push({
      time: data[i].time,
      value: parseFloat((sum / period).toFixed(2)),
    });
  }
  return sma;
}

/* ===================== SPARKLINES ===================== */
function initSparklines() {
  var canvases = document.querySelectorAll('.watchlist-sparkline');

  canvases.forEach(function (canvas) {
    var trend = canvas.getAttribute('data-trend');
    var valuesStr = canvas.getAttribute('data-values');
    if (!valuesStr) return;

    var values = valuesStr.split(',').map(Number);
    var ctx = canvas.getContext('2d');

    // Set canvas size
    canvas.width = 120;
    canvas.height = 48;
    canvas.style.width = '60px';
    canvas.style.height = '24px';

    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var range = max - min || 1;
    var padding = 4;
    var w = canvas.width;
    var h = canvas.height;

    var color = trend === 'up' ? '#217242' : '#C3232A';
    var fillColor = trend === 'up' ? 'rgba(33,114,66,0.08)' : 'rgba(195,35,42,0.08)';

    ctx.beginPath();
    values.forEach(function (v, idx) {
      var x = padding + (idx / (values.length - 1)) * (w - padding * 2);
      var y = h - padding - ((v - min) / range) * (h - padding * 2);
      if (idx === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // Fill
    var lastX = padding + ((values.length - 1) / (values.length - 1)) * (w - padding * 2);
    ctx.lineTo(lastX, h);
    ctx.lineTo(padding, h);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
  });
}

/* ===================== INTERACTIONS ===================== */
function initInteractions() {
  // Timeframe toggle
  var timeframes = document.querySelectorAll('.chart-timeframe');
  timeframes.forEach(function (tf) {
    tf.addEventListener('click', function () {
      timeframes.forEach(function (t) { t.classList.remove('active'); });
      tf.classList.add('active');
    });
  });

  // Alert tabs
  var alertTabs = document.querySelectorAll('.alert-tab');
  alertTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      alertTabs.forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
    });
  });

  // Sidebar nav
  var navItems = document.querySelectorAll('.sidebar-nav-item');
  navItems.forEach(function (item) {
    item.addEventListener('click', function () {
      navItems.forEach(function (n) { n.classList.remove('active'); });
      item.classList.add('active');
    });
  });

  // Indicator chips
  var chips = document.querySelectorAll('.indicator-chip');
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      chip.classList.toggle('active');
    });
  });

  // Company chips
  var companyChips = document.querySelectorAll('.company-chip');
  companyChips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      companyChips.forEach(function (c) { c.classList.remove('active'); });
      chip.classList.add('active');
    });
  });

  // Expandable sections
  var expandables = document.querySelectorAll('.expandable-section');
  expandables.forEach(function (section) {
    section.addEventListener('click', function () {
      var icon = section.querySelector('i');
      if (icon) {
        var isOpen = section.classList.toggle('open');
        icon.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
        icon.style.transition = 'transform 200ms ease';
      }
    });
  });
}
