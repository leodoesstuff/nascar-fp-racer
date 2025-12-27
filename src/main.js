import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import "./style.css";

// ---------- DOM ----------
const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("startBtn");
const speedEl = document.getElementById("speed");
const lapEl = document.getElementById("lap");
const lapTimeEl = document.getElementById("lapTime");
const bestEl = document.getElementById("best");

// ---------- Three setup ----------
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b0f14, 40, 900);

const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 3000);
camera.position.set(0, 2.2, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// ---------- Lights ----------
scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 0.9));

const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(120, 220, 80);
sun.castShadow = false;
scene.add(sun);

// ---------- Ground ----------
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(4000, 4000),
  new THREE.MeshStandardMaterial({ color: 0x0f1722, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.02;
scene.add(ground);

// ---------- Track (oval) ----------
const TRACK = {
  a: 120,          // semi-major axis
  b: 70,           // semi-minor axis
  width: 16,       // asphalt width
  laneHalf: 6.5,   // preferred lane radius from centerline
  bankMax: THREE.MathUtils.degToRad(18), // max banking angle
  yBase: 0.0
};

// helper: ellipse point
function ellipsePoint(t, a, b) {
  const x = a * Math.cos(t);
  const z = b * Math.sin(t);
  return new THREE.Vector3(x, 0, z);
}

// build track mesh by extruding a ring along the oval (simple ribbon)
function buildOvalTrack() {
  const segments = 900;
  const halfW = TRACK.width / 2;

  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  // create two rails: inner and outer
  const inner = [];
  const outer = [];
  const tangents = [];
  const banks = [];

  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;

    const p = ellipsePoint(t, TRACK.a, TRACK.b);
    const pNext = ellipsePoint(t + (Math.PI * 2) / segments, TRACK.a, TRACK.b);
    const tangent = pNext.clone().sub(p).normalize();

    // normal in XZ plane (to left of tangent)
    const left = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

    // banking based on curvature proxy: stronger near ends of short axis
    // (this is a stylistic approximation)
    const curveFactor = Math.pow(Math.abs(Math.sin(t)), 0.75); // peaks near turns
    const bank = TRACK.bankMax * curveFactor;

    const pInner = p.clone().add(left.clone().multiplyScalar(-halfW));
    const pOuter = p.clone().add(left.clone().multiplyScalar(halfW));

    // give a tiny elevation and banking tilt by adjusting Y slightly
    // (visual, not physical)
    pInner.y = TRACK.yBase + 0.03;
    pOuter.y = TRACK.yBase + 0.03;

    inner.push(pInner);
    outer.push(pOuter);
    tangents.push(tangent);
    banks.push(bank);
  }

  // build triangles strip
  for (let i = 0; i < segments; i++) {
    const i0 = i * 2;
    const i1 = i0 + 1;
    const i2 = i0 + 2;
    const i3 = i0 + 3;

    // vertices for this segment
    const pIn0 = inner[i];
    const pOut0 = outer[i];
    const pIn1 = inner[i + 1];
    const pOut1 = outer[i + 1];

    positions.push(pIn0.x, pIn0.y, pIn0.z);
    positions.push(pOut0.x, pOut0.y, pOut0.z);
    positions.push(pIn1.x, pIn1.y, pIn1.z);
    positions.push(pOut1.x, pOut1.y, pOut1.z);

    // approximate normals: up-ish
    for (let k = 0; k < 4; k++) normals.push(0, 1, 0);

    // UVs (wrap)
    const v0 = i / segments;
    const v1 = (i + 1) / segments;
    uvs.push(0, v0, 1, v0, 0, v1, 1, v1);

    // indices
    const base = i * 4;
    indices.push(base + 0, base + 1, base + 2);
    indices.push(base + 2, base + 1, base + 3);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  const mat = new THREE.MeshStandardMaterial({
    color: 0x2a2f36,
    roughness: 0.95,
    metalness: 0.02
  });

  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);

  // paint lane lines + start/finish
  const lineGroup = new THREE.Group();
  scene.add(lineGroup);

  function addOvalLine(offset, color, dash = false) {
    const pts = [];
    for (let i = 0; i <= 720; i++) {
      const t = (i / 720) * Math.PI * 2;
      const base = ellipsePoint(t, TRACK.a, TRACK.b);
      // move along normal to oval: approximate with gradient
      const next = ellipsePoint(t + 0.001, TRACK.a, TRACK.b);
      const tangent = next.sub(base).normalize();
      const left = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      const p = base.add(left.multiplyScalar(offset));
      p.y = TRACK.yBase + 0.06;
      pts.push(p);
    }

    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: dash ? 0.35 : 0.9 });
    const line = new THREE.Line(g, m);
    lineGroup.add(line);
  }

  addOvalLine(-TRACK.width / 2 + 1.2, 0xffffff);
  addOvalLine(TRACK.width / 2 - 1.2, 0xffffff);
  addOvalLine(0, 0xf2c94c, true);

  // start/finish marker
  const sf = new THREE.Mesh(
    new THREE.PlaneGeometry(TRACK.width, 3.0),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 })
  );
  sf.rotation.x = -Math.PI / 2;
  sf.position.set(TRACK.a, TRACK.yBase + 0.061, 0);
  scene.add(sf);

  // barriers (simple)
  const barrierMat = new THREE.MeshStandardMaterial({ color: 0x1d2430, roughness: 1 });
  const barrierGeo = new THREE.BoxGeometry(3, 1.2, 10);

  const barrierGroup = new THREE.Group();
  scene.add(barrierGroup);

  for (let i = 0; i < 180; i++) {
    const t = (i / 180) * Math.PI * 2;
    const p = ellipsePoint(t, TRACK.a + TRACK.width / 2 + 2.5, TRACK.b + TRACK.width / 2 + 2.5);
    const b = new THREE.Mesh(barrierGeo, barrierMat);
    b.position.set(p.x, 0.6, p.z);

    // face inward
    const p2 = ellipsePoint(t + 0.01, TRACK.a, TRACK.b);
    const dir = p2.sub(ellipsePoint(t, TRACK.a, TRACK.b));
    b.rotation.y = Math.atan2(dir.x, dir.z);
    barrierGroup.add(b);
  }

  return { mesh };
}

buildOvalTrack();

// ---------- Controls ----------
const controls = new PointerLockControls(camera, renderer.domElement);
scene.add(controls.getObject());

startBtn.addEventListener("click", () => controls.lock());
renderer.domElement.addEventListener("click", () => controls.lock());

controls.addEventListener("lock", () => overlay.classList.add("hidden"));
controls.addEventListener("unlock", () => overlay.classList.remove("hidden"));

// ---------- Car state (player) ----------
const car = {
  pos: new THREE.Vector3(TRACK.a, 0.5, 0),
  vel: new THREE.Vector3(0, 0, 0),
  yaw: Math.PI,              // facing -x at start line
  speed: 0,                  // scalar (m/s)
  steer: 0,
  onTrack: true
};

// camera mount: first-person inside car
const CAM = {
  height: 1.6,
  forward: 0.35
};

function resetCar() {
  car.pos.set(TRACK.a, 0.5, 0);
  car.vel.set(0, 0, 0);
  car.yaw = Math.PI;
  car.speed = 0;
  car.steer = 0;
  lapState.lastCross = false;
  lapState.lapTime = 0;
}
resetCar();

// ---------- Input ----------
const keys = new Set();
window.addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (e.code === "KeyR") resetCar();
});
window.addEventListener("keyup", (e) => keys.delete(e.code));

// ---------- Lap timing ----------
const lapState = {
  lap: 0,
  lapTime: 0,
  best: null,
  lastCross: false
};

function formatTime(t) {
  return t.toFixed(3);
}

// ---------- Track helpers (distance to oval centerline) ----------
function nearestTOnEllipse(x, z, a, b) {
  // Approximate t using atan2 on scaled coords
  // Good enough for oval gameplay.
  return Math.atan2(z / b, x / a);
}

function pointOnCenterline(t) {
  const p = ellipsePoint(t, TRACK.a, TRACK.b);
  p.y = TRACK.yBase + 0.03;
  return p;
}

function leftNormalAtT(t) {
  const p = ellipsePoint(t, TRACK.a, TRACK.b);
  const pNext = ellipsePoint(t + 0.0008, TRACK.a, TRACK.b);
  const tangent = pNext.sub(p).normalize();
  return new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
}

// ---------- Physics-ish parameters ----------
const P = {
  accel: 18.0,        // m/s^2
  brake: 26.0,
  drag: 0.65,
  rolling: 1.6,
  steerRate: 2.2,     // rad/s at low speed
  maxSteer: 0.75,     // radians
  grip: 0.95,         // lateral damping
  offTrackGrip: 0.5,
  offTrackDragMult: 2.8,
  boostMult: 1.25,
  maxSpeed: 105 / 2.237,  // 105 mph in m/s (tunable)
  maxSpeedBoost: 130 / 2.237
};

// ---------- Visual reference car (optional) ----------
const carMesh = new THREE.Mesh(
  new THREE.BoxGeometry(1.8, 0.8, 4.2),
  new THREE.MeshStandardMaterial({ color: 0xff3b3b, roughness: 0.7, metalness: 0.1 })
);
carMesh.position.copy(car.pos);
scene.add(carMesh);

// ---------- Update loop ----------
const clock = new THREE.Clock();

function update(dt) {
  if (!controls.isLocked) {
    renderer.render(scene, camera);
    return;
  }

  // determine throttle/brake/steer
  const throttle = keys.has("KeyW") ? 1 : 0;
  const reverse = keys.has("KeyS") ? 1 : 0;
  const braking = keys.has("Space") ? 1 : 0;
  const boost = keys.has("ShiftLeft") || keys.has("ShiftRight");

  const steerLeft = keys.has("KeyA") ? 1 : 0;
  const steerRight = keys.has("KeyD") ? 1 : 0;
  const steerInput = steerRight - steerLeft;

  // check on-track by radial offset from centerline
  const t = nearestTOnEllipse(car.pos.x, car.pos.z, TRACK.a, TRACK.b);
  const center = pointOnCenterline(t);
  const left = leftNormalAtT(t);

  // signed lateral offset
  const rel = car.pos.clone().sub(center);
  const lateral = rel.dot(left); // + means toward outer side
  const off = Math.abs(lateral);

  car.onTrack = off <= (TRACK.width / 2 + 1.2);

  // steering gets weaker at very low speed
  const speedAbs = Math.abs(car.speed);
  const steerStrength = THREE.MathUtils.clamp(speedAbs / 18, 0.25, 1.0);
  const targetSteer = steerInput * P.maxSteer * steerStrength;

  // smooth steer
  car.steer = THREE.MathUtils.damp(car.steer, targetSteer, 10, dt);

  // forward dir from yaw
  const forward = new THREE.Vector3(Math.sin(car.yaw), 0, Math.cos(car.yaw));

  // acceleration
  let a = 0;
  if (throttle) a += P.accel;
  if (reverse) a -= P.accel * 0.5;
  if (braking) a -= Math.sign(car.speed || 1) * P.brake;

  // drag + rolling resistance
  let drag = P.drag * car.speed * Math.abs(car.speed) + P.rolling * car.speed;
  if (!car.onTrack) drag *= P.offTrackDragMult;

  // integrate speed
  car.speed += (a - drag) * dt;

  // clamp max speed
  const maxV = boost ? P.maxSpeedBoost : P.maxSpeed;
  car.speed = THREE.MathUtils.clamp(car.speed, -maxV * 0.35, maxV);

  // yaw update based on steer + speed
  const turnRate = P.steerRate * (speedAbs / 22 + 0.12);
  car.yaw += car.steer * turnRate * dt * Math.sign(car.speed || 1);

  // compute desired velocity
  car.vel.copy(forward).multiplyScalar(car.speed);

  // lateral damping (fake grip)
  const grip = car.onTrack ? P.grip : P.offTrackGrip;
  car.vel.x *= 1 - (1 - grip) * dt * 3.5;
  car.vel.z *= 1 - (1 - grip) * dt * 3.5;

  // integrate position
  car.pos.addScaledVector(car.vel, dt);

  // keep near ground
  car.pos.y = 0.5;

  // simple push back if far off track (prevents escaping)
  const hardLimit = TRACK.width / 2 + 10;
  if (off > hardLimit) {
    // nudge toward centerline
    const back = left.clone().multiplyScalar(-Math.sign(lateral) * (off - hardLimit) * 0.25);
    car.pos.add(back);
    car.speed *= 0.88;
  }

  // update camera in-car
  const camPos = car.pos.clone()
    .add(new THREE.Vector3(0, CAM.height, 0))
    .add(forward.clone().multiplyScalar(CAM.forward));
  controls.getObject().position.copy(camPos);

  // lock camera yaw to car yaw, but allow mouse look for pitch only
  // PointerLockControls uses internal yaw object. We set its yaw to car yaw.
  controls.getObject().rotation.y = car.yaw;

  // update visible car mesh for reference (you can delete this mesh if you want)
  carMesh.position.copy(car.pos);
  carMesh.rotation.y = car.yaw;

  // lap timing: detect crossing near start/finish plane around x ≈ TRACK.a and z near 0
  lapState.lapTime += dt;

  const nearSF = Math.abs(car.pos.z) < 6.0 && car.pos.x > (TRACK.a - 2.5) && car.pos.x < (TRACK.a + 2.5);
  const movingCorrectWay = forward.x < -0.3; // roughly heading -x when crossing

  const cross = nearSF && movingCorrectWay;

  if (cross && !lapState.lastCross) {
    if (lapState.lap > 0) {
      // completed a lap
      const lapT = lapState.lapTime;
      if (lapT > 3.0) {
        lapState.best = lapState.best === null ? lapT : Math.min(lapState.best, lapT);
      }
    }
    lapState.lap += 1;
    lapState.lapTime = 0;
  }
  lapState.lastCross = cross;

  // HUD
  const mph = Math.max(0, car.speed) * 2.237;
  speedEl.textContent = mph.toFixed(0);
  lapEl.textContent = String(Math.max(0, lapState.lap));
  lapTimeEl.textContent = formatTime(lapState.lapTime);
  bestEl.textContent = lapState.best === null ? "--" : `${formatTime(lapState.best)}s`;
}

function animate() {
  const dt = Math.min(0.033, clock.getDelta());
  update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

// ---------- Resize ----------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
