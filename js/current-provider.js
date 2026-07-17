(function () {
  "use strict";

  const DEPTHS = [0, 10, 30, 50];
  const DATA_URL = "data/ocean/current-latest.json";

  class CurrentProvider {
    constructor() {
      this.meta = {
        source: "內建教學洋流場",
        generatedAt: null,
        isReal: false,
        note: "以臺灣周邊主要流況與季節差異建立的簡化教學模型"
      };
      this.records = [];
      this.lookup = new Map();
      this.lats = [];
      this.lons = [];
      this.months = [];
      this.depths = DEPTHS;
    }

    async load() {
      try {
        const response = await fetch(DATA_URL, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        if (!payload.grid || !Array.isArray(payload.grid.records)) throw new Error("資料格式不符");
        this.meta = payload.meta || this.meta;
        this.records = payload.grid.records;
        this.lats = payload.grid.latitudes || [];
        this.lons = payload.grid.longitudes || [];
        this.months = payload.grid.months || [];
        this.depths = payload.grid.depths || DEPTHS;
        this.#buildLookup();
        return this.meta;
      } catch (error) {
        console.warn("無法載入 current-latest.json，改用瀏覽器內建教學模型。", error);
        this.meta.note += "（JSON 載入失敗，使用即時計算備援）";
        return this.meta;
      }
    }

    #buildLookup() {
      this.lookup.clear();
      for (const item of this.records) {
        const key = this.#key(item.month, item.depth, item.lat, item.lon);
        this.lookup.set(key, item);
      }
    }

    #key(month, depth, lat, lon) {
      return `${month}|${depth}|${Number(lat).toFixed(3)}|${Number(lon).toFixed(3)}`;
    }

    getVector(lat, lon, depth, month) {
      if (this.records.length && this.lats.length && this.lons.length) {
        return this.#interpolateGrid(lat, lon, depth, month);
      }
      return this.#fallbackVector(lat, lon, depth, month);
    }

    #interpolateGrid(lat, lon, depth, month) {
      const d = this.#nearest(this.depths, depth);
      const m = this.#nearestMonth(this.months, month);
      const [lat0, lat1] = this.#bounds(this.lats, lat);
      const [lon0, lon1] = this.#bounds(this.lons, lon);

      const q11 = this.lookup.get(this.#key(m, d, lat0, lon0));
      const q12 = this.lookup.get(this.#key(m, d, lat0, lon1));
      const q21 = this.lookup.get(this.#key(m, d, lat1, lon0));
      const q22 = this.lookup.get(this.#key(m, d, lat1, lon1));

      if (!q11 || !q12 || !q21 || !q22) return this.#fallbackVector(lat, lon, depth, month);

      const tx = lon1 === lon0 ? 0 : (lon - lon0) / (lon1 - lon0);
      const ty = lat1 === lat0 ? 0 : (lat - lat0) / (lat1 - lat0);
      const bilinear = (a, b, c, dValue) => {
        const top = a + (b - a) * tx;
        const bottom = c + (dValue - c) * tx;
        return top + (bottom - top) * ty;
      };

      return {
        u: bilinear(q11.u, q12.u, q21.u, q22.u),
        v: bilinear(q11.v, q12.v, q21.v, q22.v),
        source: this.meta.source,
        depth: d,
        month: m
      };
    }

    #bounds(values, number) {
      if (number <= values[0]) return [values[0], values[0]];
      if (number >= values[values.length - 1]) return [values[values.length - 1], values[values.length - 1]];
      for (let i = 0; i < values.length - 1; i += 1) {
        if (values[i] <= number && number <= values[i + 1]) return [values[i], values[i + 1]];
      }
      return [values[0], values[0]];
    }

    #nearest(values, number) {
      return values.reduce((best, candidate) => Math.abs(candidate - number) < Math.abs(best - number) ? candidate : best, values[0]);
    }

    #nearestMonth(values, month) {
      if (!values.length) return month;
      return values.reduce((best, candidate) => {
        const direct = Math.abs(candidate - month);
        const wrapped = Math.min(direct, 12 - direct);
        const bestDirect = Math.abs(best - month);
        const bestWrapped = Math.min(bestDirect, 12 - bestDirect);
        return wrapped < bestWrapped ? candidate : best;
      }, values[0]);
    }

    #fallbackVector(lat, lon, depth, month) {
      const season = Math.sin(((month - 4) / 12) * Math.PI * 2);
      const winter = Math.cos(((month - 1) / 12) * Math.PI * 2);
      const depthFactor = Math.max(0.3, 1 - depth / 95);

      // 黑潮主軸：菲律賓東側至臺灣東側，再往琉球與日本南方。
      const axisLon = 121.5 + Math.max(0, lat - 19) * 0.72;
      const distanceFromAxis = lon - axisLon;
      const kurosioStrength = 1.05 * Math.exp(-(distanceFromAxis * distanceFromAxis) / 3.8) * depthFactor;
      let u = kurosioStrength * (0.25 + Math.max(0, lat - 22) * 0.028);
      let v = kurosioStrength * (0.88 - Math.max(0, lat - 29) * 0.045);

      // 臺灣海峽季節性：夏季偏北、冬季偏南。
      const inStrait = Math.exp(-((lon - 119.4) ** 2) / 2.4) * Math.exp(-((lat - 23.8) ** 2) / 13);
      v += inStrait * (0.48 * season - 0.34 * winter) * depthFactor;
      u += inStrait * (0.08 * season);

      // 東海與琉球附近的彎曲與渦流。
      const eddyX = lon - 127.5;
      const eddyY = lat - 25.5;
      const eddyR = Math.max(1.2, eddyX * eddyX + eddyY * eddyY);
      const eddy = 0.28 * Math.exp(-eddyR / 16) * (1 - depth / 120);
      u += -eddyY / Math.sqrt(eddyR) * eddy;
      v += eddyX / Math.sqrt(eddyR) * eddy;

      // 北太平洋副熱帶區背景流。
      u += 0.07 * Math.sin((lat - 18) / 4) + 0.03 * season;
      v += 0.035 * Math.cos((lon - 120) / 4);

      // 深層方向略有旋轉，作為深度探索的教學差異。
      const rotation = (depth / 50) * 0.22;
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const rotatedU = u * cos - v * sin;
      const rotatedV = u * sin + v * cos;

      return { u: rotatedU, v: rotatedV, source: this.meta.source, depth, month };
    }
  }

  window.CurrentProvider = CurrentProvider;
})();
