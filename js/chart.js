// ============================================================
// chart.js — Phase 2 chart stubs + Brand distribution donut
// ============================================================
// Chart.js is loaded from CDN in index.html.
// Phase 1: brand distribution donut only.
// Phase 2: heatmap, store bar chart, weekly trend.
// ============================================================

import { CONFIG } from "../config/config.js";
import { groupBy } from "./utils.js";

let donutChart = null;

// ── Brand Distribution Donut (Phase 1) ───────────────────────

export function renderCharts(filteredData) {
  renderBrandDonut(filteredData);
  // renderHeatmap(filteredData);   // Phase 2
  // renderStoreBars(filteredData); // Phase 2
}

function renderBrandDonut(filteredData) {
  const canvas = document.getElementById("chart-brand-donut");
  if (!canvas || typeof Chart === "undefined") return;

  const byBrand = groupBy(filteredData, "brand");
  const labels = Object.keys(byBrand);
  const data = labels.map((b) => byBrand[b].length);
  const colors = labels.map((b) => (CONFIG.BRAND_COLORS[b] || CONFIG.BRAND_COLORS.Default).primary);

  if (donutChart) {
    donutChart.data.labels = labels;
    donutChart.data.datasets[0].data = data;
    donutChart.data.datasets[0].backgroundColor = colors;
    donutChart.update();
    return;
  }

  donutChart = new Chart(canvas.getContext("2d"), {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: "#0d1225",
        hoverOffset: 8,
      }],
    },
    options: {
      cutout: "72%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#94a3b8",
            padding: 12,
            font: { family: "Inter", size: 12 },
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${ctx.raw} ca`,
          },
        },
      },
      animation: { animateRotate: true, duration: 900 },
    },
  });
}

// ── Phase 2 Stubs ─────────────────────────────────────────────

export function renderHeatmap(_filteredData) {
  // TODO Phase 2: hourly heatmap (which hour has the most PG coverage)
  console.info("[chart] Heatmap: Phase 2 stub");
}

export function renderStoreBars(_filteredData) {
  // TODO Phase 2: top N stores by PG count bar chart
  console.info("[chart] Store bar chart: Phase 2 stub");
}

export function renderWeeklyTrend(_allData) {
  // TODO Phase 2: weekly trend line
  console.info("[chart] Weekly trend: Phase 2 stub");
}
