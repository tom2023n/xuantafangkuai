import {
  ACESFilmicToneMapping,
  AmbientLight,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
} from "../vendor/three.module.js";
import {
  BOX_D,
  BOX_H,
  BOX_W,
  BEVEL,
  CLEAR_MS,
  COLS,
  FALL_MS,
  HIDDEN_ROWS,
  RADIUS,
  ROW_H,
  TOTAL_ROWS,
} from "./config.js";
import { SHAPES, cellsOf, mulberry32 } from "./logic.js";
import { RoundedBoxGeometry } from "./rounded-box.js";

const COLORS = [0x000000, 0xd7dbe2, 0xe4d8c6, 0xd7dfd8, 0xded6cb, 0xdbd6e0, 0xdbd6cb, 0xe7e0d3];
const FOV = 32;

const dummy = new Object3D();
const tmpColor = new Color();

function rowY(row) {
  const fromBottom = TOTAL_ROWS - 1 - row;
  return fromBottom * ROW_H + ROW_H / 2;
}

function wrapDelta(col, front) {
  let d = col - front;
  d = ((d % COLS) + COLS) % COLS;
  return d > COLS / 2 ? d - COLS : d;
}

function cellTransform(col, row, front, radiusOffset = 0) {
  const delta = wrapDelta(col, front);
  const ang = (delta / COLS) * Math.PI * 2;
  const rad = RADIUS + radiusOffset;
  return {
    x: Math.sin(ang) * rad,
    y: rowY(row),
    z: Math.cos(ang) * rad,
    ang,
  };
}

function shadeOf(col, row) {
  const n = ((col * 13 + row * 7) % 17) / 17;
  return 0.9 + n * 0.14;
}

function paint(mesh, index, hex, mul) {
  tmpColor.setHex(hex);
  if (mul !== 1) tmpColor.multiplyScalar(mul);
  mesh.setColorAt(index, tmpColor);
}

function place(mesh, index, x, y, z, ang, sx, sy, sz) {
  dummy.position.set(x, y, z);
  dummy.rotation.set(0, ang, 0);
  dummy.scale.set(sx, sy, sz);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function commit(mesh, count) {
  mesh.visible = count > 0;
  mesh.count = Math.max(count, 1);
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

function valueNoise(random, size) {
  const g = 48;
  const grid = new Float32Array(g * g);
  for (let i = 0; i < grid.length; i++) grid[i] = random();
  const at = (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = x - x0;
    const ty = y - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const i00 = grid[(y0 % g) * g + (x0 % g)];
    const i10 = grid[(y0 % g) * g + ((x0 + 1) % g)];
    const i01 = grid[((y0 + 1) % g) * g + (x0 % g)];
    const i11 = grid[((y0 + 1) % g) * g + ((x0 + 1) % g)];
    return i00 + (i10 - i00) * sx + (i01 - i00) * sy + (i00 - i10 - i01 + i11) * sx * sy;
  };
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * 6;
      const v = (y / size) * 6;
      let n = at(u, v) * 0.62 + at(u * 2.1, v * 2.1) * 0.28 + at(u * 4.3, v * 4.3) * 0.1;
      n = Math.min(1, Math.max(0, n));
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.floor(n * 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function makeMaps() {
  const random = mulberry32(11);
  const bumpCanvas = valueNoise(random, 256);
  const colorCanvas = document.createElement("canvas");
  colorCanvas.width = 256;
  colorCanvas.height = 256;
  const cctx = colorCanvas.getContext("2d");
  cctx.drawImage(bumpCanvas, 0, 0);
  const img = cctx.getImageData(0, 0, 256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = img.data[i] / 255;
    img.data[i] = 214 + n * 28;
    img.data[i + 1] = 210 + n * 24;
    img.data[i + 2] = 202 + n * 22;
  }
  cctx.putImageData(img, 0, 0);

  const color = new CanvasTexture(colorCanvas);
  color.colorSpace = SRGBColorSpace;
  color.wrapS = color.wrapT = RepeatWrapping;
  const bump = new CanvasTexture(bumpCanvas);
  bump.colorSpace = NoColorSpace;
  bump.wrapS = bump.wrapT = RepeatWrapping;
  const rough = new CanvasTexture(bumpCanvas);
  rough.colorSpace = NoColorSpace;
  rough.wrapS = rough.wrapT = RepeatWrapping;
  return { color, bump, rough };
}

function makeBricks() {
  const w = 1024;
  const h = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  g.fillStyle = "#12141a";
  g.fillRect(0, 0, w, h);
  const bw = 128;
  const bh = 52;
  const mortar = 8;
  const random = mulberry32(4);
  for (let row = -1; row < h / bh + 2; row++) {
    const offset = row % 2 ? bw / 2 : 0;
    for (let col = -1; col < w / bw + 2; col++) {
      const x = col * bw + offset;
      const y = row * bh;
      const v = 42 + Math.floor(random() * 22);
      g.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
      g.fillRect(x + mortar * 0.5, y + mortar * 0.5, bw - mortar, bh - mortar);
      g.fillStyle = `rgba(255,255,255,${0.04 + random() * 0.05})`;
      g.fillRect(x + mortar, y + mortar, bw - mortar * 2, 3);
      g.fillStyle = `rgba(0,0,0,${0.18 + random() * 0.12})`;
      g.fillRect(x + mortar, y + bh - mortar - 3, bw - mortar * 2, 3);
      for (let i = 0; i < 16; i++) {
        g.fillStyle = `rgba(0,0,0,${0.05 + random() * 0.14})`;
        g.fillRect(x + random() * (bw - mortar), y + random() * (bh - mortar), 2, 2);
      }
    }
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(5.5, 6.5);
  return tex;
}

function makeBlob() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  const grd = g.createRadialGradient(128, 128, 20, 128, 128, 128);
  grd.addColorStop(0, "rgba(0,0,0,0.55)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export function createView(canvas) {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
    failIfMajorPerformanceCaveat: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x12141a, 1);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.28;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const scene = new Scene();
  scene.background = new Color(0x12141a);
  scene.fog = new Fog(0x12141a, 18, 70);

  const camera = new PerspectiveCamera(FOV, 1, 0.1, 220);
  camera.position.set(0, 10, 28);
  camera.lookAt(0, 11, 0);

  const maps = makeMaps();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  maps.color.anisotropy = maxAniso;
  maps.bump.anisotropy = maxAniso;

  const stone = {
    map: maps.color,
    bumpMap: maps.bump,
    bumpScale: 0.16,
    roughness: 0.78,
    emissive: 0x2c2a26,
    emissiveIntensity: 0.18,
    metalness: 0.03,
    roughnessMap: maps.rough,
  };
  const landedMat = new MeshStandardMaterial({ ...stone, color: 0xffffff });
  const activeMat = new MeshStandardMaterial({
    ...stone,
    roughness: 0.58,
    metalness: 0.05,
    bumpScale: 0.08,
    emissive: 0x5c5648,
    emissiveIntensity: 0.28,
  });
  const ghostMat = new MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.5,
    roughness: 0.85,
    metalness: 0,
    emissive: 0xb7c3d2,
    emissiveIntensity: 0.7,
    depthWrite: false,
  });
  const chipMat = new MeshBasicMaterial({
    color: 0xf3eee6,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });

  const geo = new RoundedBoxGeometry(BOX_W, BOX_H, BOX_D, 2, BEVEL);
  const landed = new InstancedMesh(geo, landedMat, TOTAL_ROWS * COLS);
  const active = new InstancedMesh(geo, activeMat, 8);
  const ghost = new InstancedMesh(geo, ghostMat, 8);
  const chips = new InstancedMesh(geo, chipMat, 80);
  const base = new InstancedMesh(geo, landedMat, COLS * 2);
  for (const mesh of [landed, active, ghost, chips, base]) mesh.frustumCulled = false;
  landed.castShadow = true;
  landed.receiveShadow = true;
  active.castShadow = true;
  base.castShadow = true;
  base.receiveShadow = true;
  ghost.renderOrder = 2;
  chips.renderOrder = 3;
  scene.add(landed, active, ghost, chips, base);
  scene.add(camera);

  const hemi = new HemisphereLight(0xd5dde8, 0x3a322c, 0.85);
  scene.add(hemi);
  scene.add(new AmbientLight(0x5a616c, 0.42));
  const key = new DirectionalLight(0xfff6ea, 2.15);
  key.position.set(-6.5, 22, 11);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.045;
  key.shadow.camera.near = 2;
  key.shadow.camera.far = 60;
  key.shadow.camera.left = -10;
  key.shadow.camera.right = 10;
  key.shadow.camera.top = 16;
  key.shadow.camera.bottom = -16;
  key.target.position.set(0, 10, 0);
  scene.add(key, key.target);
  const fill = new DirectionalLight(0xa8b8d4, 0.7);
  fill.position.set(8, 8, 7);
  scene.add(fill);
  const rim = new DirectionalLight(0xe7eef8, 0.55);
  rim.position.set(0, 12, -10);
  scene.add(rim);

  const playBottom = rowY(TOTAL_ROWS - 1) - BOX_H / 2;
  const baseY1 = playBottom - 0.04 - BOX_H / 2;
  const baseY2 = baseY1 - ROW_H * 0.98;
  const plinthH = 0.78;
  const plinthTop = baseY2 - BOX_H / 2 - 0.03;
  const plinthCenter = plinthTop - plinthH / 2;
  const floorY = plinthCenter - plinthH / 2 + 0.01;

  const plinth = new Mesh(
    new CylinderGeometry(RADIUS + 0.92, RADIUS + 1.28, plinthH, 48),
    new MeshStandardMaterial({ color: 0xa39c92, roughness: 0.95, metalness: 0.02, map: maps.color, bumpMap: maps.bump, bumpScale: 0.08 })
  );
  plinth.position.y = plinthCenter;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  scene.add(plinth);

  const floor = new Mesh(
    new CircleGeometry(18, 48),
    new MeshStandardMaterial({ color: 0x1a1c22, roughness: 1, metalness: 0 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = floorY;
  floor.receiveShadow = true;
  scene.add(floor);

  const blob = new Mesh(
    new CircleGeometry(4.2, 32),
    new MeshBasicMaterial({ map: makeBlob(), transparent: true, depthWrite: false })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = floorY + 0.02;
  blob.renderOrder = 1;
  scene.add(blob);

  const brickTex = makeBricks();
  brickTex.wrapS = brickTex.wrapT = RepeatWrapping;
  brickTex.repeat.set(6.5, 9);
  brickTex.anisotropy = maxAniso;
  const wall = new Mesh(
    new PlaneGeometry(42, 64),
    new MeshBasicMaterial({ map: brickTex, toneMapped: false })
  );
  wall.position.set(0, 12, -6.2);
  scene.add(wall);

  const rings = [];
  for (let i = 0; i < 4; i++) {
    const mesh = new Mesh(
      new TorusGeometry(RADIUS + 0.02, 0.045, 8, 48),
      new MeshBasicMaterial({ color: 0xf7f2ea, transparent: true, opacity: 0, depthWrite: false })
    );
    mesh.rotation.x = Math.PI / 2;
    mesh.visible = false;
    mesh.renderOrder = 2;
    scene.add(mesh);
    rings.push({ mesh, age: 2, y: 0 });
  }

  const particles = [];
  const nextMesh = new InstancedMesh(geo, activeMat, 16);
  nextMesh.frustumCulled = false;
  nextMesh.castShadow = false;
  nextMesh.renderOrder = 4;
  camera.add(nextMesh);

  let camY = 10;
  let camZ = 30;
  let lookY = 11;
  let shakeAmp = 0;
  const look = new Vector3();

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = Math.max(0.01, w / Math.max(1, h));
    camera.updateProjectionMatrix();
  }

  function desired(game) {
    const wide = !game.piece || game.status === "home" || game.status === "over" || game.status === "paused";
    if (wide) {
      const top = rowY(HIDDEN_ROWS - 1) + 3.2;
      const bot = floorY - 0.4;
      const span = top - bot;
      const mid = (top + bot) / 2;
      const dist = span / 2 / Math.tan((FOV * Math.PI) / 360);
      return { y: mid - span * 0.05, z: dist * 1.04, look: mid + 0.6 };
    }
    const pr = game.piece.row;
    const gr = game.ghostRow();
    const spanRows = Math.max(18, Math.min(24, gr - pr + 8));
    const midRow = (pr + gr) / 2 + 1.5;
    const mid = rowY(midRow);
    const span = spanRows * ROW_H;
    const dist = Math.max(26, span / 2 / Math.tan((FOV * Math.PI) / 360));
    return { y: mid + span * 0.02, z: dist, look: mid };
  }

  function layoutNext(queue) {
    const dist = 7.2;
    const tanV = Math.tan((camera.fov * Math.PI) / 360);
    const halfW = dist * tanV * Math.max(0.42, camera.aspect);
    const halfH = dist * tanV;
    const shown = (queue || []).slice(0, 3);
    const slot = (halfW * 1.55) / Math.max(3, shown.length);
    const scale = Math.min(0.28, (slot * 0.62) / 4);
    const tilt = 0.62;
    let n = 0;
    for (let i = 0; i < shown.length; i++) {
      const shape = SHAPES[shown[i]][0];
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const [x, y] of shape) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const ox = (i - (shown.length - 1) / 2) * slot;
      const oy = halfH * 0.46;
      for (const [x, y] of shape) {
        const lx = (x - cx) * scale;
        const ly = -(y - cy) * scale;
        place(
          nextMesh,
          n,
          ox + lx,
          oy + ly * Math.cos(tilt),
          -dist + ly * Math.sin(tilt),
          0.55,
          scale,
          scale,
          scale * 0.78
        );
        paint(nextMesh, n, COLORS[((i + 2) % 7) + 1], 1.08);
        n++;
      }
    }
    commit(nextMesh, n);
  }

  function drawBlocks(mesh, cells, front, opts) {
    let n = 0;
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const pos = cellTransform(cell.col, cell.r, front, opts.radius || 0);
      const s = opts.scale || 1;
      place(mesh, n, pos.x, pos.y + (opts.bob || 0), pos.z, pos.ang, s, s, s);
      paint(mesh, n, opts.color || COLORS[opts.type] || 0xd9d4cb, opts.mul || 1);
      n++;
    }
    commit(mesh, n);
  }

  function updateParticles(dt) {
    const sec = dt / 1000;
    let n = 0;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= sec * 1.45;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.vy -= 8.5 * sec;
      p.x += p.vx * sec;
      p.y += p.vy * sec;
      p.z += p.vz * sec;
      const s = p.size * Math.max(0.15, p.life);
      place(chips, n, p.x, p.y, p.z, p.ang, s, s, s);
      n++;
      if (n >= 80) break;
    }
    commit(chips, n);
  }

  function updateRings(dt) {
    for (let i = 0; i < rings.length; i++) {
      const slot = rings[i];
      if (slot.age > 1) {
        slot.mesh.visible = false;
        continue;
      }
      slot.age += dt / 520;
      const e = Math.min(1, slot.age);
      slot.mesh.visible = true;
      slot.mesh.position.y = slot.y;
      slot.mesh.scale.setScalar(1 + e * 0.22);
      slot.mesh.material.opacity = 0.9 * (1 - e);
    }
  }

  function drawBase(front) {
    let n = 0;
    const ys = [baseY1, baseY2];
    for (let k = 0; k < ys.length; k++) {
      for (let c = 0; c < COLS; c++) {
        const delta = wrapDelta(c, front);
        const ang = (delta / COLS) * Math.PI * 2;
        const rad = RADIUS + 0.08;
        place(base, n, Math.sin(ang) * rad, ys[k], Math.cos(ang) * rad, ang, 1.06, 0.96, 1.12);
        paint(base, n, 0xc9c3b8, 0.82 + (k === 0 ? 0.06 : 0));
        n++;
      }
    }
    commit(base, n);
  }

  return {
    resize,
    shake(amount) {
      shakeAmp = Math.max(shakeAmp, amount);
    },
    celebrate(rows, front) {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        let slot = rings[0];
        for (let k = 0; k < rings.length; k++) {
          if (rings[k].age > 1) {
            slot = rings[k];
            break;
          }
        }
        slot.age = 0;
        slot.y = rowY(row);
        slot.mesh.visible = true;
        for (let k = 0; k < 8; k++) {
          const col = front + (Math.random() - 0.5) * 6;
          const pos = cellTransform(col, row, front, 0.2);
          const ang = Math.random() * Math.PI * 2;
          const speed = 0.8 + Math.random() * 1.8;
          particles.push({
            x: pos.x,
            y: pos.y,
            z: pos.z,
            vx: Math.sin(ang) * speed,
            vy: 1.2 + Math.random() * 2.2,
            vz: Math.cos(ang) * speed,
            life: 1,
            size: 0.12 + Math.random() * 0.12,
            ang,
          });
        }
      }
    },
    draw(game, frontVisual, dt, now) {
      const target = desired(game);
      const k = 1 - Math.exp(-dt / 220);
      camY += (target.y - camY) * k;
      camZ += (target.z - camZ) * k;
      lookY += (target.look - lookY) * k;
      shakeAmp *= Math.exp(-dt / 90);
      camera.position.set((Math.random() - 0.5) * shakeAmp, camY + (Math.random() - 0.5) * shakeAmp * 0.5, camZ);
      look.set(0, lookY, 0);
      camera.lookAt(look);
      scene.fog.near = camZ + 6;
      scene.fog.far = camZ + 48;

      const clearing = game.status === "clearing" && game.pendingRows ? new Set(game.pendingRows) : null;
      const clearT = clearing ? Math.min(1, game.clearElapsed / CLEAR_MS) : 0;
      const fallT = Math.min(1, game.fallElapsed / FALL_MS);
      const fallEase = 1 - (1 - fallT) ** 3;
      let n = 0;
      for (let r = 0; r < TOTAL_ROWS; r++) {
        const extraY = (1 - fallEase) * (game.fallRows[r] || 0) * ROW_H;
        const isClear = clearing && clearing.has(r);
        for (let c = 0; c < COLS; c++) {
          const type = game.board[r][c];
          if (!type) continue;
          let scale = 1;
          let rad = 0;
          let mul = shadeOf(c, r);
          if (isClear) {
            scale = Math.max(0.05, 1 - clearT * clearT);
            rad = clearT * 0.55;
            mul *= 1.35 - clearT * 0.4;
          } else if (game.popAge < 160) {
            for (let p = 0; p < game.popCells.length; p++) {
              if (game.popCells[p].c === c && game.popCells[p].r === r) {
                scale = 1 + 0.12 * (1 - game.popAge / 160);
                break;
              }
            }
          }
          const pos = cellTransform(c, r, frontVisual, rad);
          place(landed, n, pos.x, pos.y + extraY, pos.z, pos.ang, scale, scale, scale);
          paint(landed, n, COLORS[type] || COLORS[1], mul);
          n++;
        }
      }
      commit(landed, n);
      drawBase(frontVisual);

      if (game.piece && game.status !== "clearing") {
        const pieceFront = game.status === "home" ? frontVisual : game.front;
        const typeIndex = { I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7 }[game.piece.id] || 1;
        if (game.status === "playing") {
          const grow = game.ghostRow();
          if (grow !== game.piece.row) {
            drawBlocks(ghost, cellsOf({ ...game.piece, row: grow }), pieceFront, {
              radius: 0.03,
              scale: 0.94,
              type: typeIndex,
              mul: 0.85,
            });
          } else commit(ghost, 0);
        } else commit(ghost, 0);
        const bob = game.status === "home" ? Math.sin(now * 0.0022) * 0.1 : 0;
        const pulse = game.status === "playing" ? 1.04 + Math.sin(now * 0.005) * 0.018 : 1.04;
        drawBlocks(active, cellsOf(game.piece), pieceFront, {
          radius: 0.2,
          scale: pulse,
          type: typeIndex,
          mul: 1.08,
          bob,
        });
      } else {
        commit(active, 0);
        commit(ghost, 0);
      }

      layoutNext(game.queue || []);
      updateParticles(dt);
      updateRings(dt);
      renderer.render(scene, camera);
    },
  };
}
