(function () {
  "use strict";

  if (!window.L) return;

  L.CurrentCanvasLayer = L.Layer.extend({
    initialize(options = {}) {
      L.setOptions(this, options);
      this.provider = options.provider;
      this.getDepth = options.getDepth || (() => 0);
      this.getMonth = options.getMonth || (() => 7);
      this.showParticles = true;
      this.showArrows = true;
      this.particles = [];
      this.animationFrame = null;
      this.lastTimestamp = 0;
    },

    onAdd(map) {
      this._map = map;
      this._canvas = L.DomUtil.create("canvas", "leaflet-layer current-canvas");
      this._canvas.style.position = "absolute";
      this._canvas.style.left = "0";
      this._canvas.style.top = "0";
      this._canvas.style.zIndex = 240;
      map.getPanes().overlayPane.appendChild(this._canvas);
      map.on("move zoom resize", this._reset, this);
      this._reset();
      this._seedParticles();
      this._animate(performance.now());
      return this;
    },

    onRemove(map) {
      cancelAnimationFrame(this.animationFrame);
      map.off("move zoom resize", this._reset, this);
      L.DomUtil.remove(this._canvas);
    },

    setVisibility({ particles, arrows }) {
      if (typeof particles === "boolean") this.showParticles = particles;
      if (typeof arrows === "boolean") this.showArrows = arrows;
      this._draw(performance.now(), 0);
    },

    refresh() {
      this._seedParticles();
      this._draw(performance.now(), 0);
    },

    _reset() {
      if (!this._map || !this._canvas) return;
      const size = this._map.getSize();
      const ratio = window.devicePixelRatio || 1;
      this._canvas.width = Math.round(size.x * ratio);
      this._canvas.height = Math.round(size.y * ratio);
      this._canvas.style.width = `${size.x}px`;
      this._canvas.style.height = `${size.y}px`;
      this._ctx = this._canvas.getContext("2d");
      this._ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      this._seedParticles();
    },

    _seedParticles() {
      if (!this._map) return;
      const bounds = this._map.getBounds();
      const count = Math.min(220, Math.max(70, Math.round(this._map.getSize().x * this._map.getSize().y / 5200)));
      this.particles = Array.from({ length: count }, () => ({
        lat: bounds.getSouth() + Math.random() * (bounds.getNorth() - bounds.getSouth()),
        lon: bounds.getWest() + Math.random() * (bounds.getEast() - bounds.getWest()),
        age: Math.random() * 80,
        maxAge: 55 + Math.random() * 75,
        trail: []
      }));
    },

    _animate(timestamp) {
      const delta = Math.min(50, timestamp - this.lastTimestamp || 16);
      this.lastTimestamp = timestamp;
      this._draw(timestamp, delta);
      this.animationFrame = requestAnimationFrame((time) => this._animate(time));
    },

    _draw(timestamp, delta) {
      if (!this._ctx || !this._map || !this.provider) return;
      const ctx = this._ctx;
      const size = this._map.getSize();
      ctx.clearRect(0, 0, size.x, size.y);

      if (this.showParticles) this._drawParticles(ctx, delta);
      if (this.showArrows) this._drawArrows(ctx, timestamp);
    },

    _drawParticles(ctx, delta) {
      const bounds = this._map.getBounds();
      const depth = this.getDepth();
      const month = this.getMonth();
      const speedScale = 0.000055 * (delta || 16);

      ctx.lineCap = "round";
      for (const particle of this.particles) {
        particle.age += (delta || 16) / 16;
        if (
          particle.age > particle.maxAge ||
          particle.lat < bounds.getSouth() || particle.lat > bounds.getNorth() ||
          particle.lon < bounds.getWest() || particle.lon > bounds.getEast()
        ) {
          particle.lat = bounds.getSouth() + Math.random() * (bounds.getNorth() - bounds.getSouth());
          particle.lon = bounds.getWest() + Math.random() * (bounds.getEast() - bounds.getWest());
          particle.age = 0;
          particle.maxAge = 55 + Math.random() * 75;
          particle.trail = [];
        }

        const vector = this.provider.getVector(particle.lat, particle.lon, depth, month);
        particle.lon += vector.u * speedScale;
        particle.lat += vector.v * speedScale;
        particle.trail.push([particle.lat, particle.lon]);
        if (particle.trail.length > 6) particle.trail.shift();

        if (particle.trail.length > 1) {
          ctx.beginPath();
          particle.trail.forEach((point, index) => {
            const pixel = this._map.latLngToContainerPoint([point[0], point[1]]);
            if (index === 0) ctx.moveTo(pixel.x, pixel.y);
            else ctx.lineTo(pixel.x, pixel.y);
          });
          const magnitude = Math.hypot(vector.u, vector.v);
          ctx.strokeStyle = magnitude > 0.8 ? "rgba(255,224,112,.75)" : "rgba(53,208,211,.62)";
          ctx.lineWidth = magnitude > 0.8 ? 2.1 : 1.4;
          ctx.stroke();
        }
      }
    },

    _drawArrows(ctx, timestamp) {
      const size = this._map.getSize();
      const depth = this.getDepth();
      const month = this.getMonth();
      const spacing = size.x < 650 ? 90 : 105;
      const phase = (timestamp / 45) % spacing;

      ctx.save();
      ctx.globalAlpha = 0.8;
      for (let y = 45; y < size.y; y += spacing) {
        for (let x = 45 + ((Math.round(y / spacing) % 2) * 35); x < size.x; x += spacing) {
          const latLng = this._map.containerPointToLatLng([x, y]);
          const vector = this.provider.getVector(latLng.lat, latLng.lng, depth, month);
          const magnitude = Math.hypot(vector.u, vector.v);
          if (!Number.isFinite(magnitude) || magnitude < 0.025) continue;

          const angle = Math.atan2(vector.v, vector.u);
          const length = Math.min(34, 12 + magnitude * 19);
          const pulse = 0.82 + 0.18 * Math.sin((phase + x + y) / 22);
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(-angle);
          ctx.strokeStyle = magnitude > 0.75 ? `rgba(255, 213, 94, ${pulse})` : `rgba(18, 157, 188, ${pulse})`;
          ctx.fillStyle = ctx.strokeStyle;
          ctx.lineWidth = 2.3;
          ctx.beginPath();
          ctx.moveTo(-length / 2, 0);
          ctx.lineTo(length / 2, 0);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(length / 2, 0);
          ctx.lineTo(length / 2 - 7, -4.5);
          ctx.lineTo(length / 2 - 7, 4.5);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.restore();
    }
  });

  L.currentCanvasLayer = function (options) {
    return new L.CurrentCanvasLayer(options);
  };
})();
