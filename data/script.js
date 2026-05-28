/*
  DriveSafe — ESP32 MPU6050 web server
 */

let scene, camera, renderer, vehicle;

var CAR_SCALE = 1.75;
var MOTOR_SCALE = 1.55;
var BIKE_SCALE = 1.45;

var SHOCK_THRESHOLD = 12;
var SHOCK_COUNTDOWN_START = 15;
var SHOCK_COOLDOWN_MS = 5000;
var ROLL_ALERT_DEG = 60;
var PITCH_ALERT_DEG = 90;
var ROLLOVER_ALERT_DEG = 60;
var INCIDENT_PREBUFFER_MS = 5000;
var INCIDENT_POSTBUFFER_MS = 3000;
var SENSOR_HISTORY_RETENTION_MS = 120000;

var shockCountdownTimer = null;
var shockCooldownTimer = null;
var shockCountdownLeft = SHOCK_COUNTDOWN_START;
var shockModalActive = false;
var shockInCooldown = false;
var currentVehicleType = "car";
var pendingShockReason = "";
var currentAlertReason = "";
var emergencyActive = false;
var replayTimer = null;
var incidentStartMs = 0;
var incidentEndMs = 0;
var sensorHistory = [];
var latestSensorFrame = {
  t: 0,
  accX: 0,
  accY: 0,
  accZ: 0,
  gyroX: 0,
  gyroY: 0,
  gyroZ: 0,
  rollDeg: 0,
  pitchDeg: 0
};

function parentWidth(elem) {
  return elem.parentElement.clientWidth;
}

function parentHeight(elem) {
  return elem.parentElement.clientHeight;
}

function applyScale(group, scale) {
  group.scale.set(scale, scale, scale);
  return group;
}

function createCar() {
  var v = new THREE.Group();
  var bodyMat = new THREE.MeshBasicMaterial({ color: 0x0077b6 });
  var cabinMat = new THREE.MeshBasicMaterial({ color: 0x023e8a });
  var accentMat = new THREE.MeshBasicMaterial({ color: 0x03045e });
  var windowMat = new THREE.MeshBasicMaterial({ color: 0x90e0ef });
  var wheelMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });

  var body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.55, 4.2), bodyMat);
  body.position.y = 0.55;
  v.add(body);

  var cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), cabinMat);
  cabin.position.set(0, 1.05, -0.2);
  v.add(cabin);

  var windshield = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.45, 0.08), windowMat);
  windshield.position.set(0, 1.05, 1.05);
  v.add(windshield);

  var rearWindow = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 0.08), windowMat);
  rearWindow.position.set(0, 1.02, -1.25);
  v.add(rearWindow);

  var hood = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 1.1), accentMat);
  hood.position.set(0, 0.88, 1.35);
  v.add(hood);

  var frontBumper = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.18, 0.25), accentMat);
  frontBumper.position.set(0, 0.32, 2.2);
  v.add(frontBumper);

  var rearBumper = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.18, 0.25), accentMat);
  rearBumper.position.set(0, 0.32, -2.2);
  v.add(rearBumper);

  function addWheel(x, z) {
    var wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.38, 0.28, 18),
      wheelMat
    );
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.38, z);
    v.add(wheel);
  }

  addWheel(-1.05, 1.35);
  addWheel(1.05, 1.35);
  addWheel(-1.05, -1.35);
  addWheel(1.05, -1.35);

  var headlightMat = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });
  var headlightL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.15, 0.1), headlightMat);
  headlightL.position.set(-0.75, 0.45, 2.15);
  v.add(headlightL);
  var headlightR = headlightL.clone();
  headlightR.position.x = 0.75;
  v.add(headlightR);

  return applyScale(v, CAR_SCALE);
}

function createMotorcycle() {
  var v = new THREE.Group();
  var bodyMat = new THREE.MeshBasicMaterial({ color: 0x023e8a });
  var accentMat = new THREE.MeshBasicMaterial({ color: 0x03045e });
  var wheelMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
  var chromeMat = new THREE.MeshBasicMaterial({ color: 0xb8c4ce });

  var body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.75, 2.4), bodyMat);
  body.position.set(0, 0.72, 0);
  v.add(body);

  var tank = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.35, 0.9), accentMat);
  tank.position.set(0, 1.05, 0.35);
  v.add(tank);

  var seat = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.2, 0.85), accentMat);
  seat.position.set(0, 1.02, -0.55);
  v.add(seat);

  var handlebar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 0.1), chromeMat);
  handlebar.position.set(0, 1.15, 1.05);
  v.add(handlebar);

  var fork = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), chromeMat);
  fork.position.set(0, 0.55, 1.15);
  v.add(fork);

  function addWheel(x, z, r) {
    var wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, 0.22, 16),
      wheelMat
    );
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, r + 0.05, z);
    v.add(wheel);
  }

  addWheel(0, 1.15, 0.42);
  addWheel(0, -1.05, 0.42);

  var exhaust = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.7), chromeMat);
  exhaust.position.set(0.35, 0.35, -0.9);
  v.add(exhaust);

  return applyScale(v, MOTOR_SCALE);
}

function createBicycle() {
  var v = new THREE.Group();
  var frameMat = new THREE.MeshBasicMaterial({ color: 0xe63946 });
  var darkMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
  var seatMat = new THREE.MeshBasicMaterial({ color: 0x333333 });

  function addWheel(x, z) {
    var wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 0.08, 16),
      darkMat
    );
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.42, z);
    v.add(wheel);
  }

  addWheel(0, 1.1);
  addWheel(0, -1.1);

  var downTube = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.5), frameMat);
  downTube.position.set(0, 0.85, 0.15);
  downTube.rotation.x = -0.55;
  v.add(downTube);

  var topTube = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.2), frameMat);
  topTube.position.set(0, 1.15, -0.15);
  topTube.rotation.x = 0.35;
  v.add(topTube);

  var seatPost = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.08), frameMat);
  seatPost.position.set(0, 1.05, -0.55);
  v.add(seatPost);

  var seat = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 0.15), seatMat);
  seat.position.set(0, 1.32, -0.55);
  v.add(seat);

  var handlebar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.08), darkMat);
  handlebar.position.set(0, 1.25, 0.75);
  v.add(handlebar);

  var fork = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.06), frameMat);
  fork.position.set(0, 0.65, 0.85);
  v.add(fork);

  return applyScale(v, BIKE_SCALE);
}

function buildVehicle(type) {
  if (type === "bike") return createBicycle();
  if (type === "motor") return createMotorcycle();
  return createCar();
}

function switchVehicle(type) {
  if (!scene || type === currentVehicleType) return;

  var rotX = vehicle.rotation.x;
  var rotY = vehicle.rotation.y;
  var rotZ = vehicle.rotation.z;

  scene.remove(vehicle);
  vehicle = buildVehicle(type);
  vehicle.rotation.x = rotX;
  vehicle.rotation.y = rotY;
  vehicle.rotation.z = rotZ;
  vehicle.position.y = 0.12;
  scene.add(vehicle);
  currentVehicleType = type;

  document.getElementById("btnBike").classList.toggle("active", type === "bike");
  document.getElementById("btnMotor").classList.toggle("active", type === "motor");
  document.getElementById("btnCar").classList.toggle("active", type === "car");

  renderer.render(scene, camera);
}

function createRoad() {
  var road = new THREE.Group();
  var asphaltMat = new THREE.MeshBasicMaterial({ color: 0xc8ccd0 });
  var shoulderMat = new THREE.MeshBasicMaterial({ color: 0xb0b8a8 });
  var lineMat = new THREE.MeshBasicMaterial({ color: 0xf5f5f5 });
  var yellowMat = new THREE.MeshBasicMaterial({ color: 0xf4c430 });
  var curbMat = new THREE.MeshBasicMaterial({ color: 0x6b7280 });

  var roadW = 8;
  var roadL = 28;

  var leftShoulder = new THREE.Mesh(
    new THREE.BoxGeometry(3.5, 0.1, roadL),
    shoulderMat
  );
  leftShoulder.position.set(-(roadW / 2 + 1.75), 0.05, 0);
  road.add(leftShoulder);

  var rightShoulder = leftShoulder.clone();
  rightShoulder.position.x = roadW / 2 + 1.75;
  road.add(rightShoulder);

  var asphalt = new THREE.Mesh(
    new THREE.BoxGeometry(roadW, 0.12, roadL),
    asphaltMat
  );
  asphalt.position.y = 0.08;
  road.add(asphalt);

  function addCurb(x) {
    var curb = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, roadL), curbMat);
    curb.position.set(x, 0.09, 0);
    road.add(curb);
  }
  addCurb(-roadW / 2);
  addCurb(roadW / 2);

  for (var z = -12; z <= 12; z += 1.4) {
    var dash = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.85), yellowMat);
    dash.position.set(0, 0.15, z);
    road.add(dash);
  }

  function addEdgeLine(x) {
    var edge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, roadL), lineMat);
    edge.position.set(x, 0.15, 0);
    road.add(edge);
  }
  addEdgeLine(-roadW / 2 + 0.35);
  addEdgeLine(roadW / 2 - 0.35);

  var laneOffset = roadW / 4;
  for (var lz = -12; lz <= 12; lz += 1.1) {
    var leftDash = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.55), lineMat);
    leftDash.position.set(-laneOffset, 0.15, lz);
    road.add(leftDash);
    var rightDash = leftDash.clone();
    rightDash.position.x = laneOffset;
    road.add(rightDash);
  }

  var poleMat = new THREE.MeshBasicMaterial({ color: 0x5a5f66 });
  var armMat = new THREE.MeshBasicMaterial({ color: 0x4a4f55 });
  var lampMat = new THREE.MeshBasicMaterial({ color: 0xfff6d6 });

  function addStreetLight(x, z) {
    var pole = new THREE.Mesh(new THREE.BoxGeometry(0.18, 4.2, 0.18), poleMat);
    pole.position.set(x, 2.1, z);
    road.add(pole);
    var arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.12), armMat);
    arm.position.set(x + (x < 0 ? 0.45 : -0.45), 3.9, z);
    road.add(arm);
    var lamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 0.35), lampMat);
    lamp.position.set(x + (x < 0 ? 0.85 : -0.85), 3.85, z);
    road.add(lamp);
    var base = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.35), poleMat);
    base.position.set(x, 0.12, z);
    road.add(base);
  }

  var lightX = roadW / 2 + 2.2;
  addStreetLight(-lightX, -10);
  addStreetLight(-lightX, -4);
  addStreetLight(-lightX, 4);
  addStreetLight(-lightX, 10);
  addStreetLight(lightX, -10);
  addStreetLight(lightX, -4);
  addStreetLight(lightX, 4);
  addStreetLight(lightX, 10);

  return road;
}

function init3D() {
  var container = document.getElementById("3Dcube");

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xc8d8e8);

  camera = new THREE.PerspectiveCamera(
    75,
    parentWidth(container) / parentHeight(container),
    0.1,
    1000
  );
  camera.position.set(0, 4.2, 12);
  camera.lookAt(0, 1.0 * CAR_SCALE, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(parentWidth(container), parentHeight(container));
  container.appendChild(renderer.domElement);

  scene.add(createRoad());
  vehicle = createCar();
  vehicle.position.y = 0.12;
  scene.add(vehicle);

  renderer.render(scene, camera);
}

function onWindowResize() {
  var container = document.getElementById("3Dcube");
  camera.aspect = parentWidth(container) / parentHeight(container);
  camera.updateProjectionMatrix();
  renderer.setSize(parentWidth(container), parentHeight(container));
}

function getLookAtY() {
  if (currentVehicleType === "bike") return 1.0 * BIKE_SCALE;
  if (currentVehicleType === "motor") return 1.0 * MOTOR_SCALE;
  return 1.0 * CAR_SCALE;
}

function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

function formatReasonText(reason) {
  if (reason === "roll") return "Orientasi kendaraan Roll Angle terdeteksi!";
  if (reason === "pitch") return "Orientasi kendaraan Pitch Angle terdeteksi!";
  if (reason === "rollover") return "Orientasi kendaraan Overturn/Rollover terdeteksi!";
  return "Perubahan percepatan drastis kendaraan terdeteksi!";
}

function detectOrientationReason(rollDeg, pitchDeg) {
  var absRoll = Math.abs(rollDeg);
  var absPitch = Math.abs(pitchDeg);
  if (absPitch >= PITCH_ALERT_DEG) return "pitch";
  if (absRoll >= ROLLOVER_ALERT_DEG && absPitch >= ROLLOVER_ALERT_DEG) return "rollover";
  if (absRoll >= ROLL_ALERT_DEG) return "roll";
  return "";
}

function pushSensorHistoryFrame() {
  var now = Date.now();
  latestSensorFrame.t = now;
  sensorHistory.push({
    t: now,
    accX: latestSensorFrame.accX,
    accY: latestSensorFrame.accY,
    accZ: latestSensorFrame.accZ,
    gyroX: latestSensorFrame.gyroX,
    gyroY: latestSensorFrame.gyroY,
    gyroZ: latestSensorFrame.gyroZ,
    rollDeg: latestSensorFrame.rollDeg,
    pitchDeg: latestSensorFrame.pitchDeg
  });
  var cutoff = now - SENSOR_HISTORY_RETENTION_MS;
  while (sensorHistory.length && sensorHistory[0].t < cutoff) {
    sensorHistory.shift();
  }
}

function updateShockCountdownDisplay() {
  document.getElementById("shockCountdown").textContent = shockCountdownLeft;
}

function updateShockMessage(reason) {
  document.getElementById("shockMessage").textContent = formatReasonText(reason);
}

function hideShockModal() {
  var modal = document.getElementById("shockModal");
  modal.classList.add("hidden");
  shockModalActive = false;
  if (shockCountdownTimer) {
    clearInterval(shockCountdownTimer);
    shockCountdownTimer = null;
  }
}

function startShockCooldown() {
  shockInCooldown = true;
  if (shockCooldownTimer) clearTimeout(shockCooldownTimer);
  shockCooldownTimer = setTimeout(function () {
    shockInCooldown = false;
    shockCooldownTimer = null;
  }, SHOCK_COOLDOWN_MS);
}

function showEmergencyMode() {
  emergencyActive = true;
  var overlay = document.getElementById("emergencyOverlay");
  var causeText = document.getElementById("emergencyCause");
  var replayStatus = document.getElementById("replayStatus");
  causeText.textContent = formatReasonText(currentAlertReason || pendingShockReason);
  replayStatus.classList.add("hidden");
  replayStatus.textContent = "";
  overlay.classList.remove("hidden");
}

function stopReplayIfRunning() {
  if (replayTimer) {
    clearTimeout(replayTimer);
    replayTimer = null;
  }
}

function showReplayOverlay() {
  document.getElementById("replayOverlay").classList.remove("hidden");
}

function hideReplayOverlay() {
  document.getElementById("replayOverlay").classList.add("hidden");
}

function setReplayOverlayStatus(text) {
  document.getElementById("replayOverlayStatus").textContent = text;
}

function setReplayProgress(percent) {
  document.getElementById("replayProgressBar").style.width = percent + "%";
}

function setReplayTimestampLabel(secondsFromIncident) {
  var sign = secondsFromIncident >= 0 ? "+" : "";
  document.getElementById("replayTimestamp").textContent =
    "t = " + sign + secondsFromIncident.toFixed(2) + "s";
}

function setReplayRecBadgeActive(isActive) {
  document.getElementById("replayRecBadge").classList.toggle("hidden", !isActive);
}

function updateReplayOverlayMetrics(frame) {
  document.getElementById("replayAccSummary").textContent =
    Number(frame.accX).toFixed(2) +
    ", " +
    Number(frame.accY).toFixed(2) +
    ", " +
    Number(frame.accZ).toFixed(2);
  document.getElementById("replayRollDeg").textContent = Number(frame.rollDeg).toFixed(1);
  document.getElementById("replayPitchDeg").textContent = Number(frame.pitchDeg).toFixed(1);
}

function resetEmergencyMode() {
  stopReplayIfRunning();
  document.getElementById("emergencyOverlay").classList.add("hidden");
  hideReplayOverlay();
  setReplayRecBadgeActive(false);
  setReplayProgress(0);
  setReplayTimestampLabel(-INCIDENT_PREBUFFER_MS / 1000);
  var replayStatus = document.getElementById("replayStatus");
  replayStatus.classList.add("hidden");
  replayStatus.textContent = "";
  emergencyActive = false;
  currentAlertReason = "";
  pendingShockReason = "";
  incidentStartMs = 0;
  incidentEndMs = 0;
}

function onShockCountdownEnd() {
  hideShockModal();
  currentAlertReason = pendingShockReason;
  pendingShockReason = "";
  showEmergencyMode();
  startShockCooldown();
}

function startShockCountdown(reason) {
  if (shockModalActive || shockInCooldown) return;
  pendingShockReason = reason || "shock";
  incidentStartMs = Date.now();
  incidentEndMs = incidentStartMs + INCIDENT_POSTBUFFER_MS;
  shockModalActive = true;
  shockCountdownLeft = SHOCK_COUNTDOWN_START;
  updateShockCountdownDisplay();
  updateShockMessage(pendingShockReason);
  document.getElementById("shockModal").classList.remove("hidden");

  if (shockCountdownTimer) clearInterval(shockCountdownTimer);

  shockCountdownTimer = setInterval(function () {
    shockCountdownLeft -= 1;
    updateShockCountdownDisplay();
    if (shockCountdownLeft <= 0) {
      clearInterval(shockCountdownTimer);
      shockCountdownTimer = null;
      onShockCountdownEnd();
    }
  }, 1000);
}

function cancelShockCountdown() {
  hideShockModal();
  stopReplayIfRunning();
  pendingShockReason = "";
  incidentStartMs = 0;
  incidentEndMs = 0;
  startShockCooldown();
}

function triggerIncident(reason) {
  if (emergencyActive || shockModalActive || shockInCooldown) return;
  startShockCountdown(reason);
}

function checkShockTrigger(accX, accY) {
  var ax = Math.abs(parseFloat(accX));
  var ay = Math.abs(parseFloat(accY));
  if (ax > SHOCK_THRESHOLD && ay > SHOCK_THRESHOLD) {
    triggerIncident("shock");
  }
}

function checkOrientationTrigger(rollDeg, pitchDeg) {
  var reason = detectOrientationReason(rollDeg, pitchDeg);
  if (reason) triggerIncident(reason);
}

function showPlaceholderAction(message) {
  alert(message);
}

function applyReplayFrame(frame) {
  document.getElementById("accX").innerHTML = Number(frame.accX).toFixed(2);
  document.getElementById("accY").innerHTML = Number(frame.accY).toFixed(2);
  document.getElementById("accZ").innerHTML = Number(frame.accZ).toFixed(2);
  document.getElementById("gyroX").innerHTML = Number(frame.gyroX).toFixed(2);
  document.getElementById("gyroY").innerHTML = Number(frame.gyroY).toFixed(2);
  document.getElementById("gyroZ").innerHTML = Number(frame.gyroZ).toFixed(2);
  vehicle.rotation.x = frame.gyroY;
  vehicle.rotation.z = frame.gyroX;
  vehicle.rotation.y = frame.gyroZ;
  updateReplayOverlayMetrics(frame);
  renderer.render(scene, camera);
}

function closeReplayOverlay() {
  stopReplayIfRunning();
  hideReplayOverlay();
  setReplayRecBadgeActive(false);
  if (emergencyActive) {
    document.getElementById("emergencyOverlay").classList.remove("hidden");
  }
}

function startIncidentReplay() {
  if (!incidentStartMs || !incidentEndMs) {
    showPlaceholderAction("Replay belum tersedia karena data insiden belum lengkap.");
    return;
  }
  if (Date.now() < incidentEndMs) {
    showPlaceholderAction("Data 3 detik setelah insiden masih direkam. Coba beberapa detik lagi.");
    return;
  }
  var replayStatus = document.getElementById("replayStatus");
  replayStatus.classList.remove("hidden");

  var replayStart = incidentStartMs - INCIDENT_PREBUFFER_MS;
  var frames = sensorHistory.filter(function (item) {
    return item.t >= replayStart && item.t <= incidentEndMs;
  });

  if (!frames.length) {
    replayStatus.textContent = "Replay tidak tersedia: log insiden tidak ditemukan.";
    return;
  }

  stopReplayIfRunning();
  document.getElementById("emergencyOverlay").classList.add("hidden");
  showReplayOverlay();
  setReplayRecBadgeActive(true);
  setReplayProgress(0);

  var i = 0;
  var replayWindowMs = incidentEndMs - incidentStartMs + INCIDENT_PREBUFFER_MS;
  replayStatus.textContent = "Memutar ulang rekaman insiden...";
  setReplayOverlayStatus("Memutar ulang rekaman insiden...");
  var playNext = function () {
    if (i >= frames.length || !emergencyActive) {
      stopReplayIfRunning();
      replayStatus.textContent = "Replay selesai.";
      setReplayOverlayStatus("Replay selesai. Anda bisa tutup replay atau reset emergency.");
      setReplayRecBadgeActive(false);
      setReplayProgress(100);
      setReplayTimestampLabel(INCIDENT_POSTBUFFER_MS / 1000);
      return;
    }
    var frame = frames[i];
    applyReplayFrame(frame);
    replayStatus.textContent =
      "Replay " +
      (i + 1) +
      "/" +
      frames.length +
      " | acc(" +
      Number(frame.accX).toFixed(2) +
      ", " +
      Number(frame.accY).toFixed(2) +
      ", " +
      Number(frame.accZ).toFixed(2) +
      ") | roll=" +
      Number(frame.rollDeg).toFixed(1) +
      " deg | pitch=" +
      Number(frame.pitchDeg).toFixed(1) +
      " deg";
    setReplayOverlayStatus("Frame " + (i + 1) + "/" + frames.length);
    setReplayTimestampLabel((frame.t - incidentStartMs) / 1000);
    var elapsedMs = frame.t - (incidentStartMs - INCIDENT_PREBUFFER_MS);
    var progress = (elapsedMs / replayWindowMs) * 100;
    setReplayProgress(Math.max(0, Math.min(100, progress)));

    var nextDelay = 120;
    if (i < frames.length - 1) {
      var delta = frames[i + 1].t - frame.t;
      nextDelay = Math.max(30, Math.min(1000, delta));
    }
    i += 1;
    replayTimer = setTimeout(playNext, nextDelay);
  };
  playNext();
}

function initShockUI() {
  document.getElementById("shockCancel").addEventListener("click", cancelShockCountdown);
  document.getElementById("btnCallContact").addEventListener("click", function () {
    showPlaceholderAction("Fitur hubungi kontak tersimpan belum diimplementasikan.");
  });
  document.getElementById("btnMapHospital").addEventListener("click", function () {
    showPlaceholderAction("Fitur petakan rumah sakit terdekat belum diimplementasikan.");
  });
  document.getElementById("btnReplayIncident").addEventListener("click", startIncidentReplay);
  document.getElementById("btnResetEmergency").addEventListener("click", resetEmergencyMode);
  document.getElementById("btnCloseReplayOverlay").addEventListener("click", closeReplayOverlay);
}

window.addEventListener("resize", onWindowResize, false);

init3D();
initShockUI();

if (!!window.EventSource) {
  var source = new EventSource("/events");

  source.addEventListener("open", function () {
    console.log("Events Connected");
  });

  source.addEventListener("error", function (e) {
    if (e.target.readyState != EventSource.OPEN) {
      console.log("Events Disconnected");
    }
  });

  source.addEventListener("gyro_readings", function (e) {
    var obj = JSON.parse(e.data);
    var gyroX = parseFloat(obj.gyroX);
    var gyroY = parseFloat(obj.gyroY);
    var gyroZ = parseFloat(obj.gyroZ);
    var rollDeg = toDeg(gyroX);
    var pitchDeg = toDeg(gyroY);

    latestSensorFrame.gyroX = gyroX;
    latestSensorFrame.gyroY = gyroY;
    latestSensorFrame.gyroZ = gyroZ;
    latestSensorFrame.rollDeg = rollDeg;
    latestSensorFrame.pitchDeg = pitchDeg;

    if (!replayTimer) {
      document.getElementById("gyroX").innerHTML = obj.gyroX;
      document.getElementById("gyroY").innerHTML = obj.gyroY;
      document.getElementById("gyroZ").innerHTML = obj.gyroZ;
      vehicle.rotation.x = gyroY;
      vehicle.rotation.z = gyroX;
      vehicle.rotation.y = gyroZ;
      renderer.render(scene, camera);
    }
    pushSensorHistoryFrame();
    checkOrientationTrigger(rollDeg, pitchDeg);
  });

  source.addEventListener("temperature_reading", function (e) {
    document.getElementById("temp").innerHTML = e.data;
  });

  source.addEventListener("accelerometer_readings", function (e) {
    var obj = JSON.parse(e.data);
    latestSensorFrame.accX = parseFloat(obj.accX);
    latestSensorFrame.accY = parseFloat(obj.accY);
    latestSensorFrame.accZ = parseFloat(obj.accZ);
    if (!replayTimer) {
      document.getElementById("accX").innerHTML = obj.accX;
      document.getElementById("accY").innerHTML = obj.accY;
      document.getElementById("accZ").innerHTML = obj.accZ;
    }
    pushSensorHistoryFrame();
    checkShockTrigger(obj.accX, obj.accY);
  });
}

function resetPosition(element) {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", "/" + element.id, true);
  xhr.send();
}

window.switchVehicle = switchVehicle;
