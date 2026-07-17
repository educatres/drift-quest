(function () {
  "use strict";

  const DEPTH_LEVELS = [0, 10, 30, 50];
  const STEP_HOURS = 6;
  const GAME_DISTANCE_SCALE = 1.7;
  const TICK_MS = 430;
  const DEFAULT_CENTER = [24.1, 125.0];

  const state = {
    provider: null,
    map: null,
    currentLayer: null,
    missionIndex: 0,
    mission: null,
    running: false,
    paused: false,
    bottle: null,
    elapsedHours: 0,
    battery: 100,
    anchor: false,
    animalUsed: false,
    animalActiveUntil: 0,
    depthChanges: 0,
    lastDepth: 0,
    minDistanceKm: Infinity,
    path: [],
    observations: [],
    timer: null,
    startMarker: null,
    targetCircle: null,
    bottleMarker: null,
    pathLine: null,
    typhoonLine: null,
    typhoonMarker: null,
    animalMarker: null,
    freeClickMode: "target"
  };

  const $ = (id) => document.getElementById(id);

  const elements = {
    dataBadge: $("dataBadge"),
    missionSelect: $("missionSelect"),
    missionDifficulty: $("missionDifficulty"),
    missionTitle: $("missionTitle"),
    missionStory: $("missionStory"),
    startLabel: $("startLabel"),
    targetLabel: $("targetLabel"),
    missionRules: $("missionRules"),
    monthSelect: $("monthSelect"),
    depthRange: $("depthRange"),
    depthOutput: $("depthOutput"),
    sailRange: $("sailRange"),
    sailOutput: $("sailOutput"),
    anchorBtn: $("anchorBtn"),
    animalBtn: $("animalBtn"),
    animalIcon: $("animalIcon"),
    animalLabel: $("animalLabel"),
    animalHint: $("animalHint"),
    startBtn: $("startBtn"),
    pauseBtn: $("pauseBtn"),
    resetBtn: $("resetBtn"),
    batteryBar: $("batteryBar"),
    batteryText: $("batteryText"),
    speedRange: $("speedRange"),
    speedOutput: $("speedOutput"),
    missionDay: $("missionDay"),
    distanceToGoal: $("distanceToGoal"),
    bottleSpeed: $("bottleSpeed"),
    observationList: $("observationList"),
    observationCount: $("observationCount"),
    showParticles: $("showParticles"),
    showArrows: $("showArrows"),
    showTyphoon: $("showTyphoon"),
    scienceTip: $("scienceTip"),
    scienceTipTitle: $("scienceTipTitle"),
    scienceTipText: $("scienceTipText"),
    closeScienceTip: $("closeScienceTip"),
    resultDialog: $("resultDialog"),
    resultIcon: $("resultIcon"),
    resultTitle: $("resultTitle"),
    resultSummary: $("resultSummary"),
    resultScore: $("resultScore"),
    resultDays: $("resultDays"),
    resultDistance: $("resultDistance"),
    resultExplanation: $("resultExplanation"),
    retryBtn: $("retryBtn"),
    nextMissionBtn: $("nextMissionBtn"),
    guideDialog: $("guideDialog"),
    openGuideBtn: $("openGuideBtn")
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    if (!window.L || !window.CurrentProvider || !Array.isArray(window.OCEAN_MISSIONS)) {
      alert("遊戲元件載入失敗，請確認網路連線後重新整理。");
      return;
    }

    initMap();
    populateMissions();
    bindEvents();

    state.provider = new window.CurrentProvider();
    const meta = await state.provider.load();
    updateDataBadge(meta);

    state.currentLayer = L.currentCanvasLayer({
      provider: state.provider,
      getDepth: getDepth,
      getMonth: getMonth
    }).addTo(state.map);

    loadMission(0);
    window.setTimeout(() => {
      if (!localStorage.getItem("ocean-drift-guide-seen")) {
        openDialog(elements.guideDialog);
        localStorage.setItem("ocean-drift-guide-seen", "1");
      }
    }, 450);
  }

  function initMap() {
    state.map = L.map("map", {
      center: DEFAULT_CENTER,
      zoom: 5,
      minZoom: 4,
      maxZoom: 9,
      zoomControl: true,
      worldCopyJump: false
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(state.map);

    state.map.createPane("missionPane");
    state.map.getPane("missionPane").style.zIndex = 420;

    state.map.on("click", (event) => {
      if (!state.mission?.freeMode || state.running) return;
      if (event.originalEvent.shiftKey) {
        state.mission.start.lat = event.latlng.lat;
        state.mission.start.lon = event.latlng.lng;
        state.mission.start.label = "自訂實驗起點";
        showScienceTip("自由模式", "已移動 A 起點。一般點擊可移動 B 目標；Shift＋點擊可再次移動 A。", 4200);
      } else {
        state.mission.target.lat = event.latlng.lat;
        state.mission.target.lon = event.latlng.lng;
        state.mission.target.label = "自訂觀察目標";
        showScienceTip("自由模式", "已移動 B 目標。按住 Shift 再點擊地圖，可移動 A 起點。", 4200);
      }
      resetMission({ keepView: true });
      updateMissionLabels();
    });
  }

  function populateMissions() {
    const fragment = document.createDocumentFragment();
    let currentGroup = null;
    let optgroup = null;

    window.OCEAN_MISSIONS.forEach((mission, index) => {
      if (mission.chapter !== currentGroup) {
        currentGroup = mission.chapter;
        optgroup = document.createElement("optgroup");
        optgroup.label = currentGroup;
        fragment.appendChild(optgroup);
      }
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `${String(index + 1).padStart(2, "0")}｜${mission.title}`;
      optgroup.appendChild(option);
    });

    elements.missionSelect.appendChild(fragment);
  }

  function bindEvents() {
    elements.missionSelect.addEventListener("change", () => loadMission(Number(elements.missionSelect.value)));
    elements.monthSelect.addEventListener("change", () => {
      state.currentLayer?.refresh();
      if (!state.running) updateCurrentPreview();
    });

    elements.depthRange.addEventListener("input", handleDepthChange);
    elements.sailRange.addEventListener("input", () => {
      elements.sailOutput.value = `${elements.sailRange.value}%`;
    });

    elements.anchorBtn.addEventListener("click", () => {
      state.anchor = !state.anchor;
      elements.anchorBtn.setAttribute("aria-pressed", String(state.anchor));
      addObservationOnce("anchor", state.anchor ? "放下海錨後，整體漂流速度降低。" : "收起海錨後，漂流速度恢復。", true);
    });

    elements.animalBtn.addEventListener("click", activateAnimal);
    elements.startBtn.addEventListener("click", startSimulation);
    elements.pauseBtn.addEventListener("click", togglePause);
    elements.resetBtn.addEventListener("click", () => resetMission());
    elements.speedRange.addEventListener("input", () => {
      elements.speedOutput.value = `${elements.speedRange.value}×`;
      if (state.running && !state.paused) restartTimer();
    });

    elements.showParticles.addEventListener("change", updateLayerVisibility);
    elements.showArrows.addEventListener("change", updateLayerVisibility);
    elements.showTyphoon.addEventListener("change", updateTyphoonVisibility);
    elements.closeScienceTip.addEventListener("click", () => { elements.scienceTip.hidden = true; });
    elements.openGuideBtn.addEventListener("click", () => openDialog(elements.guideDialog));
    elements.retryBtn.addEventListener("click", () => window.setTimeout(() => resetMission(), 0));
    elements.nextMissionBtn.addEventListener("click", () => {
      window.setTimeout(() => {
        const next = (state.missionIndex + 1) % window.OCEAN_MISSIONS.length;
        loadMission(next);
      }, 0);
    });
  }

  function updateDataBadge(meta) {
    const generated = meta.generatedAt ? new Date(meta.generatedAt).toLocaleDateString("zh-TW") : "內建";
    elements.dataBadge.textContent = meta.isReal ? `真實洋流｜${generated}` : `教學資料｜${generated}`;
    elements.dataBadge.classList.toggle("real", Boolean(meta.isReal));
    elements.dataBadge.title = `${meta.source || "洋流資料"}\n${meta.note || ""}`;
  }

  function loadMission(index) {
    stopTimer();
    state.missionIndex = index;
    state.mission = JSON.parse(JSON.stringify(window.OCEAN_MISSIONS[index]));
    elements.missionSelect.value = String(index);
    elements.missionTitle.textContent = state.mission.title;
    elements.missionStory.textContent = state.mission.story;
    elements.missionDifficulty.textContent = `${"★".repeat(state.mission.difficulty)}${"☆".repeat(3 - state.mission.difficulty)}`;
    elements.missionRules.innerHTML = state.mission.rules.map((rule) => `<span class="rule-chip">${escapeHtml(rule)}</span>`).join("");

    configureMonths();
    configureDepth();
    configureAnimal();
    updateMissionLabels();
    resetMission();

    if (state.mission.freeMode) {
      showScienceTip("自由模式操作", "一般點擊地圖可移動 B 目標；按住 Shift 點擊可移動 A 起點。", 6500);
    } else {
      showScienceTip("任務提示", state.mission.tip, 6500);
    }
  }

  function configureMonths() {
    const allowed = new Set(state.mission.allowedMonths || []);
    Array.from(elements.monthSelect.options).forEach((option) => {
      option.disabled = allowed.size > 0 && !allowed.has(Number(option.value));
    });
    elements.monthSelect.value = String(state.mission.month);
  }

  function configureDepth() {
    let maxIndex = 0;
    DEPTH_LEVELS.forEach((depth, index) => { if (depth <= state.mission.maxDepth) maxIndex = index; });
    elements.depthRange.max = String(Math.max(0, maxIndex));
    const recommendedIndex = Math.max(0, DEPTH_LEVELS.indexOf(state.mission.recommendedDepth || 0));
    elements.depthRange.value = String(Math.min(recommendedIndex, Number(elements.depthRange.max)));
    state.lastDepth = getDepth();
    elements.depthOutput.value = `${getDepth()} m`;
  }

  function configureAnimal() {
    const animal = state.mission.animal;
    elements.animalBtn.disabled = !animal;
    elements.animalBtn.setAttribute("aria-pressed", "false");
    elements.animalIcon.textContent = animal?.icon || "🐢";
    elements.animalLabel.textContent = animal?.label || "動物夥伴";
    elements.animalHint.textContent = animal ? "漂流中可使用一次" : "此關未開放";
  }

  function updateMissionLabels() {
    elements.startLabel.textContent = state.mission.start.label;
    elements.targetLabel.textContent = state.mission.target.label;
  }

  function resetMission(options = {}) {
    stopTimer();
    state.running = false;
    state.paused = false;
    state.elapsedHours = 0;
    state.battery = 100;
    state.anchor = false;
    state.animalUsed = false;
    state.animalActiveUntil = 0;
    state.depthChanges = 0;
    state.minDistanceKm = Infinity;
    state.observations = [];
    state.bottle = { lat: state.mission.start.lat, lon: state.mission.start.lon };
    state.path = [[state.bottle.lat, state.bottle.lon]];
    state.lastDepth = getDepth();

    elements.startBtn.disabled = false;
    elements.startBtn.textContent = "投放漂流瓶";
    elements.pauseBtn.disabled = true;
    elements.pauseBtn.textContent = "暫停";
    elements.missionSelect.disabled = false;
    elements.monthSelect.disabled = false;
    elements.anchorBtn.setAttribute("aria-pressed", "false");
    elements.animalBtn.setAttribute("aria-pressed", "false");
    if (state.mission.animal) elements.animalHint.textContent = "漂流中可使用一次";

    updateBattery();
    renderMissionMap(options.keepView);
    updateStats({ speed: 0 });
    renderObservations();
    state.currentLayer?.refresh();
  }

  function renderMissionMap(keepView = false) {
    removeMapLayer("startMarker");
    removeMapLayer("targetCircle");
    removeMapLayer("bottleMarker");
    removeMapLayer("pathLine");
    removeMapLayer("typhoonLine");
    removeMapLayer("typhoonMarker");
    removeMapLayer("animalMarker");

    state.startMarker = L.marker([state.mission.start.lat, state.mission.start.lon], {
      pane: "missionPane",
      icon: L.divIcon({ className: "start-marker", html: '<div class="start-pin">A</div>', iconSize: [24,24], iconAnchor: [12,12] })
    }).addTo(state.map).bindTooltip(state.mission.start.label);

    state.targetCircle = L.circle([state.mission.target.lat, state.mission.target.lon], {
      pane: "missionPane",
      radius: state.mission.target.radiusKm * 1000,
      color: "#ec5f67",
      fillColor: "#ec5f67",
      fillOpacity: 0.14,
      weight: 3,
      dashArray: "7 7"
    }).addTo(state.map).bindTooltip(`B｜${state.mission.target.label}`);

    const targetIcon = L.marker([state.mission.target.lat, state.mission.target.lon], {
      pane: "missionPane",
      interactive: false,
      icon: L.divIcon({ className: "target-marker", html: '<div class="target-ring"></div>', iconSize: [44,44], iconAnchor: [22,22] })
    }).addTo(state.map);
    state.targetCircle._targetIcon = targetIcon;

    state.bottleMarker = L.marker([state.bottle.lat, state.bottle.lon], {
      pane: "missionPane",
      zIndexOffset: 800,
      icon: L.divIcon({ className: "bottle-marker", html: '<div class="bottle-pin"><span>🍾</span></div>', iconSize: [38,38], iconAnchor: [19,29] })
    }).addTo(state.map).bindTooltip("科學漂流瓶");

    state.pathLine = L.polyline(state.path, {
      pane: "missionPane",
      color: "#ffd166",
      weight: 4,
      opacity: 0.95,
      lineCap: "round"
    }).addTo(state.map);

    if (state.mission.typhoon) renderTyphoonTrack();
    if (state.mission.animal) renderAnimalMarker();

    if (!keepView) {
      const points = [
        [state.mission.start.lat, state.mission.start.lon],
        [state.mission.target.lat, state.mission.target.lon]
      ];
      if (state.mission.typhoon) points.push(...state.mission.typhoon.track);
      state.map.fitBounds(L.latLngBounds(points).pad(0.24), { animate: false });
    }

    updateTyphoonVisibility();
  }

  function renderTyphoonTrack() {
    state.typhoonLine = L.polyline(state.mission.typhoon.track, {
      pane: "missionPane",
      color: "#a12d63",
      weight: 3,
      opacity: 0.8,
      dashArray: "5 8"
    }).addTo(state.map).bindTooltip(`${state.mission.typhoon.name}｜教學模擬路徑`);

    const first = state.mission.typhoon.track[0];
    state.typhoonMarker = L.marker(first, {
      pane: "missionPane",
      icon: L.divIcon({ className: "animal-marker", html: '<div class="animal-pin">🌀</div>', iconSize: [34,34], iconAnchor: [17,17] })
    }).addTo(state.map).bindTooltip(state.mission.typhoon.name, { className: "typhoon-label" });
  }

  function renderAnimalMarker() {
    const midpoint = {
      lat: state.mission.start.lat * 0.55 + state.mission.target.lat * 0.45,
      lon: state.mission.start.lon * 0.55 + state.mission.target.lon * 0.45
    };
    state.animalMarker = L.marker([midpoint.lat, midpoint.lon], {
      pane: "missionPane",
      icon: L.divIcon({
        className: "animal-marker",
        html: `<div class="animal-pin">${escapeHtml(state.mission.animal.icon)}</div>`,
        iconSize: [38,38],
        iconAnchor: [19,19]
      })
    }).addTo(state.map).bindTooltip(`${state.mission.animal.label}活動區`);
  }

  function removeMapLayer(key) {
    const layer = state[key];
    if (!layer) return;
    if (key === "targetCircle" && layer._targetIcon) state.map.removeLayer(layer._targetIcon);
    state.map.removeLayer(layer);
    state[key] = null;
  }

  function startSimulation() {
    if (state.running) return;
    if (state.mission.requireDepth && getDepth() < state.mission.requireDepth) {
      showScienceTip("還不能投放", `這一關必須先把深度調整到 ${state.mission.requireDepth} 公尺或更深。`, 5000);
      return;
    }

    state.running = true;
    state.paused = false;
    elements.startBtn.disabled = true;
    elements.pauseBtn.disabled = false;
    elements.missionSelect.disabled = true;
    elements.monthSelect.disabled = true;
    if (state.mission.animal) elements.animalHint.textContent = "現在可使用一次";

    const preview = calculateForces();
    addObservationOnce("launch", `投放時洋流約 ${preview.currentSpeed.toFixed(2)} m/s，主要方向為${directionName(preview.current.u, preview.current.v)}。`);
    showScienceTip("漂流開始", "觀察黃色軌跡與洋流箭頭。你仍可調整深度、海錨與小帆。", 4500);
    restartTimer();
  }

  function togglePause() {
    if (!state.running) return;
    state.paused = !state.paused;
    elements.pauseBtn.textContent = state.paused ? "繼續" : "暫停";
    if (state.paused) stopTimer(false);
    else restartTimer();
  }

  function restartTimer() {
    stopTimer(false);
    const speed = Number(elements.speedRange.value);
    state.timer = window.setInterval(simulationStep, TICK_MS / speed);
  }

  function stopTimer(resetPause = true) {
    if (state.timer) window.clearInterval(state.timer);
    state.timer = null;
    if (resetPause) state.paused = false;
  }

  function simulationStep() {
    if (!state.running || state.paused) return;

    const forces = calculateForces();
    const speed = Math.hypot(forces.total.u, forces.total.v);
    const dtSeconds = STEP_HOURS * 3600 * GAME_DISTANCE_SCALE;
    const latRadians = state.bottle.lat * Math.PI / 180;
    const cosLat = Math.max(0.25, Math.cos(latRadians));

    state.bottle.lat += (forces.total.v * dtSeconds) / 111320;
    state.bottle.lon += (forces.total.u * dtSeconds) / (111320 * cosLat);
    state.elapsedHours += STEP_HOURS;

    const depth = getDepth();
    state.battery = Math.max(0, state.battery - (0.018 * STEP_HOURS) - (depth / 50) * 0.014 * STEP_HOURS);
    if (state.battery <= 0 && depth > 0) {
      elements.depthRange.value = "0";
      elements.depthOutput.value = "0 m";
      state.lastDepth = 0;
      addObservationOnce("battery-empty", "探測器電量耗盡，浮力系統自動回到海面。", true);
    }

    state.path.push([state.bottle.lat, state.bottle.lon]);
    state.bottleMarker.setLatLng([state.bottle.lat, state.bottle.lon]);
    state.pathLine.setLatLngs(state.path);
    updateTyphoonMarker();
    updateBattery();

    const distanceKm = haversineKm(state.bottle, state.mission.target);
    state.minDistanceKm = Math.min(state.minDistanceKm, distanceKm);
    updateStats({ speed });
    generateScienceObservations(forces, distanceKm);

    if (forces.typhoonDanger) {
      finishMission(false, "typhoon");
      return;
    }
    if (distanceKm <= state.mission.target.radiusKm) {
      finishMission(true, "target");
      return;
    }
    if (state.elapsedHours / 24 >= state.mission.maxDays) {
      finishMission(Boolean(state.mission.freeMode), "time");
      return;
    }
    if (state.bottle.lat < 10 || state.bottle.lat > 42 || state.bottle.lon < 108 || state.bottle.lon > 150) {
      finishMission(false, "out-of-area");
    }
  }

  function calculateForces() {
    const depth = getDepth();
    const month = getMonth();
    const current = state.provider.getVector(state.bottle.lat, state.bottle.lon, depth, month);
    const wind = getSeasonalWind(state.bottle.lat, state.bottle.lon, month);
    const surfaceExposure = Math.max(0, 1 - depth / 35);
    const sailFactor = (Number(elements.sailRange.value) / 100) * 0.2 * surfaceExposure;

    let u = current.u + wind.u * sailFactor;
    let v = current.v + wind.v * sailFactor;
    let typhoon = { u: 0, v: 0, danger: false, distanceKm: Infinity };

    if (state.mission.typhoon) {
      typhoon = getTyphoonEffect();
      u += typhoon.u * surfaceExposure;
      v += typhoon.v * surfaceExposure;
    }

    if (state.mission.animal && state.animalUsed && state.elapsedHours < state.animalActiveUntil) {
      const toward = unitVectorToward(state.bottle, state.mission.target);
      u += toward.u * state.mission.animal.strength;
      v += toward.v * state.mission.animal.strength;
    }

    const anchorFactor = state.anchor ? 0.48 : 1;
    u *= anchorFactor;
    v *= anchorFactor;

    const noiseSeed = Math.sin(state.elapsedHours * 0.83 + state.bottle.lat * 2.1 + state.bottle.lon * 0.7);
    u += noiseSeed * 0.012;
    v += Math.cos(noiseSeed * 4.2 + state.elapsedHours) * 0.01;

    return {
      current,
      currentSpeed: Math.hypot(current.u, current.v),
      wind,
      total: { u, v },
      typhoon,
      typhoonDanger: typhoon.danger
    };
  }

  function getSeasonalWind(lat, lon, month) {
    const winterStrength = Math.max(0, Math.cos(((month - 1) / 12) * Math.PI * 2));
    const summerStrength = Math.max(0, Math.cos(((month - 7) / 12) * Math.PI * 2));
    const transition = 1 - Math.max(winterStrength, summerStrength);
    return {
      u: -1.6 * winterStrength + 1.05 * summerStrength + 0.2 * transition * Math.sin(lon / 5),
      v: -1.25 * winterStrength + 0.8 * summerStrength + 0.12 * Math.sin(lat / 3)
    };
  }

  function getTyphoonEffect() {
    const typhoon = state.mission.typhoon;
    const day = state.elapsedHours / 24;
    if (day < typhoon.startDay || day > typhoon.endDay) return { u: 0, v: 0, danger: false, distanceKm: Infinity };

    const progress = (day - typhoon.startDay) / Math.max(0.01, typhoon.endDay - typhoon.startDay);
    const scaled = progress * (typhoon.track.length - 1);
    const index = Math.min(typhoon.track.length - 2, Math.floor(scaled));
    const t = scaled - index;
    const a = typhoon.track[index];
    const b = typhoon.track[index + 1];
    const center = { lat: a[0] + (b[0] - a[0]) * t, lon: a[1] + (b[1] - a[1]) * t };
    const distanceKm = haversineKm(state.bottle, center);
    if (distanceKm > typhoon.influenceRadiusKm) return { u: 0, v: 0, danger: false, distanceKm, center };

    const latScale = Math.cos(center.lat * Math.PI / 180);
    const dx = (state.bottle.lon - center.lon) * latScale;
    const dy = state.bottle.lat - center.lat;
    const r = Math.max(0.08, Math.hypot(dx, dy));
    const influence = Math.pow(1 - distanceKm / typhoon.influenceRadiusKm, 1.35);
    const strength = 1.15 * influence + 0.08;

    return {
      u: (-dy / r) * strength + (dx / r) * 0.08 * influence,
      v: (dx / r) * strength + (dy / r) * 0.08 * influence,
      danger: distanceKm < typhoon.dangerRadiusKm,
      distanceKm,
      center
    };
  }

  function updateTyphoonMarker() {
    if (!state.typhoonMarker || !state.mission.typhoon) return;
    const effect = getTyphoonEffect();
    if (effect.center) state.typhoonMarker.setLatLng([effect.center.lat, effect.center.lon]);
  }

  function activateAnimal() {
    if (!state.running || !state.mission.animal || state.animalUsed) return;
    state.animalUsed = true;
    state.animalActiveUntil = state.elapsedHours + state.mission.animal.durationDays * 24;
    elements.animalBtn.setAttribute("aria-pressed", "true");
    elements.animalBtn.disabled = true;
    elements.animalHint.textContent = `協助 ${state.mission.animal.durationDays} 天`;
    addObservationOnce("animal", `${state.mission.animal.label}啟動：短時間增加往目標方向的移動分量。`, true);
    showScienceTip("生態夥伴", "這是遊戲化的象徵表現。真實海洋中不可觸摸、攀附或追逐野生動物。", 6000);
  }

  function handleDepthChange() {
    const nextDepth = getDepth();
    elements.depthOutput.value = `${nextDepth} m`;
    state.currentLayer?.refresh();

    if (!state.running) {
      state.lastDepth = nextDepth;
      updateCurrentPreview();
      return;
    }

    if (nextDepth === state.lastDepth) return;
    const limit = state.mission.depthChangeLimit;
    if (limit && state.depthChanges >= limit) {
      elements.depthRange.value = String(DEPTH_LEVELS.indexOf(state.lastDepth));
      elements.depthOutput.value = `${state.lastDepth} m`;
      showScienceTip("無法調整", `本關最多只能調整深度 ${limit} 次。`, 4200);
      return;
    }

    const cost = 7 + Math.abs(nextDepth - state.lastDepth) * 0.15;
    if (state.battery < cost) {
      elements.depthRange.value = String(DEPTH_LEVELS.indexOf(state.lastDepth));
      elements.depthOutput.value = `${state.lastDepth} m`;
      showScienceTip("電量不足", "剩餘電量不足以完成這次浮力調整。", 4200);
      return;
    }

    state.battery -= cost;
    state.depthChanges += 1;
    addObservationOnce(`depth-${state.depthChanges}`, `第 ${state.depthChanges} 次調整深度：從 ${state.lastDepth} m 改為 ${nextDepth} m。`, true);
    state.lastDepth = nextDepth;
    updateBattery();
  }

  function updateCurrentPreview() {
    if (!state.provider || !state.mission) return;
    const vector = state.provider.getVector(state.mission.start.lat, state.mission.start.lon, getDepth(), getMonth());
    elements.bottleSpeed.textContent = `${Math.hypot(vector.u, vector.v).toFixed(2)} m/s`;
  }

  function updateStats({ speed }) {
    const day = state.elapsedHours / 24;
    const distance = haversineKm(state.bottle, state.mission.target);
    elements.missionDay.textContent = day === 0 ? "第 0 天" : `第 ${day.toFixed(day % 1 ? 1 : 0)} 天`;
    elements.distanceToGoal.textContent = `${Math.round(distance)} km`;
    elements.bottleSpeed.textContent = speed > 0 ? `${speed.toFixed(2)} m/s` : "— m/s";
  }

  function updateBattery() {
    const value = Math.max(0, Math.min(100, state.battery));
    elements.batteryBar.style.width = `${value}%`;
    elements.batteryText.textContent = `${Math.round(value)}%`;
    if (value < 25) elements.batteryBar.style.background = "linear-gradient(90deg, #ec5f67, #f7a55c)";
    else elements.batteryBar.style.background = "linear-gradient(90deg, #29b988, #8ad66d)";
  }

  function generateScienceObservations(forces, distanceKm) {
    const day = state.elapsedHours / 24;
    if (day >= 2) {
      addObservationOnce("day2", `目前主要往${directionName(forces.total.u, forces.total.v)}移動，距離目標約 ${Math.round(distanceKm)} km。`);
    }
    if (forces.currentSpeed > 0.8) {
      addObservationOnce("fast-current", "漂流瓶進入流速較快的洋流帶，路線在短時間內明顯拉長。", true);
    }
    if (forces.typhoon.distanceKm < state.mission.typhoon?.influenceRadiusKm) {
      addObservationOnce("typhoon-zone", `漂流瓶進入颱風外圍影響區，距中心約 ${Math.round(forces.typhoon.distanceKm)} km。`, true);
    }
    if (getDepth() >= 30) {
      addObservationOnce("deep", "下降到 30 公尺以下後，風力影響減弱，洋流成為主要移動力量。", true);
    }
    if (distanceKm < state.mission.target.radiusKm * 2) {
      addObservationOnce("near-target", "已接近目標區。此時控制速度，可能比繼續加速更重要。", true);
    }
  }

  function addObservationOnce(key, text, allowBeyondThree = false) {
    if (state.observations.some((item) => item.key === key)) return;
    if (!allowBeyondThree && state.observations.length >= 3) return;
    state.observations.push({ key, text });
    renderObservations();
  }

  function renderObservations() {
    if (!state.observations.length) {
      elements.observationList.innerHTML = "<li>開始漂流後，系統會記錄重要現象。</li>";
      elements.observationCount.textContent = "0 / 3";
      return;
    }
    elements.observationList.innerHTML = state.observations.slice(-5).map((item) => `<li>${escapeHtml(item.text)}</li>`).join("");
    elements.observationCount.textContent = `${Math.min(state.observations.length, 3)} / 3`;
  }

  function finishMission(success, reason) {
    stopTimer();
    state.running = false;
    elements.pauseBtn.disabled = true;
    elements.startBtn.disabled = true;
    elements.missionSelect.disabled = false;
    elements.monthSelect.disabled = false;

    const days = state.elapsedHours / 24;
    const nearest = Math.round(state.minDistanceKm === Infinity ? haversineKm(state.bottle, state.mission.target) : state.minDistanceKm);
    const timeScore = Math.max(0, 30 * (1 - days / state.mission.maxDays));
    const distanceScore = Math.max(0, 30 * (1 - nearest / 800));
    const batteryScore = state.battery * 0.15;
    const scienceScore = Math.min(25, state.observations.length * 6);
    const score = Math.round((success ? 30 : 5) + timeScore + distanceScore + batteryScore + scienceScore);

    elements.resultIcon.textContent = success ? "🏁" : reason === "typhoon" ? "🌀" : "🧭";
    elements.resultTitle.textContent = success ? "任務完成！" : "這次沒有抵達";
    elements.resultSummary.textContent = success
      ? state.mission.successText
      : reason === "typhoon"
        ? "漂流瓶進入颱風危險核心。真實情況下，應優先避開強風暴區域。"
        : state.mission.failText;
    elements.resultScore.textContent = String(Math.min(100, score));
    elements.resultDays.textContent = days.toFixed(1);
    elements.resultDistance.textContent = `${nearest} km`;
    elements.resultExplanation.textContent = buildResultExplanation(success, reason);
    elements.nextMissionBtn.hidden = !success || state.mission.freeMode;
    openDialog(elements.resultDialog);
  }

  function buildResultExplanation(success, reason) {
    const month = getMonth();
    const depth = getDepth();
    const parts = [`你選擇 ${month} 月、${depth} 公尺深度，小帆 ${elements.sailRange.value}%。`];
    if (state.anchor) parts.push("任務結束時海錨仍放下，因此速度受到抑制。");
    if (state.animalUsed) parts.push("你使用了動物夥伴的短期導航協助。");
    if (reason === "typhoon") parts.push("颱風中心附近不是安全的借力區，外圍與核心必須分開判讀。");
    else if (success) parts.push("洋流、風力與操作後的合成方向，讓路線進入目標半徑。");
    else parts.push("軌跡未進入目標半徑，可從偏離最明顯的位置重新調整月份、深度或帆面積。");
    return parts.join("");
  }

  function showScienceTip(title, text, duration = 5000) {
    elements.scienceTipTitle.textContent = title;
    elements.scienceTipText.textContent = text;
    elements.scienceTip.hidden = false;
    window.clearTimeout(showScienceTip.timer);
    showScienceTip.timer = window.setTimeout(() => { elements.scienceTip.hidden = true; }, duration);
  }

  function updateLayerVisibility() {
    state.currentLayer?.setVisibility({
      particles: elements.showParticles.checked,
      arrows: elements.showArrows.checked
    });
  }

  function updateTyphoonVisibility() {
    const visible = elements.showTyphoon.checked;
    if (state.typhoonLine) {
      if (visible && !state.map.hasLayer(state.typhoonLine)) state.typhoonLine.addTo(state.map);
      if (!visible && state.map.hasLayer(state.typhoonLine)) state.map.removeLayer(state.typhoonLine);
    }
    if (state.typhoonMarker) {
      if (visible && !state.map.hasLayer(state.typhoonMarker)) state.typhoonMarker.addTo(state.map);
      if (!visible && state.map.hasLayer(state.typhoonMarker)) state.map.removeLayer(state.typhoonMarker);
    }
  }

  function getDepth() {
    return DEPTH_LEVELS[Number(elements.depthRange.value)] || 0;
  }

  function getMonth() {
    return Number(elements.monthSelect.value) || 7;
  }

  function unitVectorToward(from, to) {
    const cosLat = Math.cos(from.lat * Math.PI / 180);
    const dx = (to.lon - from.lon) * cosLat;
    const dy = to.lat - from.lat;
    const length = Math.max(0.001, Math.hypot(dx, dy));
    return { u: dx / length, v: dy / length };
  }

  function haversineKm(a, b) {
    const radius = 6371;
    const lat1 = a.lat * Math.PI / 180;
    const lat2 = b.lat * Math.PI / 180;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLon = (b.lon - a.lon) * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function directionName(u, v) {
    const angle = (Math.atan2(u, v) * 180 / Math.PI + 360) % 360;
    const names = ["北方", "東北方", "東方", "東南方", "南方", "西南方", "西方", "西北方"];
    return names[Math.round(angle / 45) % 8];
  }

  function openDialog(dialog) {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
