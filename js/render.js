import {
  ACESFilmicToneMapping,
  AmbientLight,
  CanvasTexture,
  Color,
  DirectionalLight,
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
  SRGBColorSpace,
  Scene,
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
  PIECE_HEX,
  PITCH,
  TOTAL_ROWS,
  VISIBLE_ROWS,
} from "./config.js";
import { cellsOf, mulberry32 } from "./logic.js";
import { RoundedBoxGeometry } from "./rounded-box.js";

// Narrow field of view, camera far away. The lens is shifted instead of
// tilting the camera, so the board stays a true rectangle while the cubes
// still show their top and side faces.
const FOV = 8;
const LENS_X = 0.16;
const LENS_Y = 0.32;
const BOARD_PAD_X = 1.42;
const BOARD_PAD_Y = 1.55;

const dummy = new Object3D();
const tmpColor = new Color();

function boardY(row) {
  return ((VISIBLE_ROWS - 1) / 2 - (row - HIDDEN_ROWS)) * PITCH;
}

function boardX(col) {
  return (col - (COLS - 1) / 2) * PITCH;
}

function shadeOf(col, row) {
  const n = ((col * 13 + row * 7) % 17) / 17;
  return 0.97 + n * 0.06;
}

function paint(mesh, index, hex, mul) {
  tmpColor.setHex(hex);
  if (mul !== 1) tmpColor.multiplyScalar(mul);
  mesh.setColorAt(index, tmpColor);
}

function place(mesh, index, x, y, z, sx, sy, sz) {
  dummy.position.set(x, y, z);
  dummy.rotation.set(0, 0, 0);
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
  const g = 32;
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
      const u = (x / size) * 5;
      const v = (y / size) * 5;
      const n = Math.min(1, Math.max(0, at(u, v) * 0.65 + at(u * 2.2, v * 2.2) * 0.35));
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.floor(n * 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function makeMaps() {
  const random = mulberry32(9);
  const bumpCanvas = valueNoise(random, 128);
  const colorCanvas = document.createElement("canvas");
  colorCanvas.width = 128;
  colorCanvas.height = 128;
  const ctx = colorCanvas.getContext("2d");
  ctx.drawImage(bumpCanvas, 0, 0);
  const img = ctx.getImageData(0, 0, 128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = img.data[i] / 255;
    img.data[i] = 226 + n * 24;
    img.data[i + 1] = 222 + n * 20;
    img.data[i + 2] = 214 + n * 18;
  }
  ctx.putImageData(img, 0, 0);
  const color = new CanvasTexture(colorCanvas);
  color.colorSpace = SRGBColorSpace;
  color.wrapS = color.wrapT = RepeatWrapping;
  const bump = new CanvasTexture(bumpCanvas);
  bump.colorSpace = NoColorSpace;
  bump.wrapS = bump.wrapT = RepeatWrapping;
  return { color, bump };
}

function makeWellTexture() {
  const cell = 64;
  const canvas = document.createElement("canvas");
  canvas.width = COLS * cell;
  canvas.height = VISIBLE_ROWS * cell;
  const g = canvas.getContext("2d");
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.strokeStyle = "rgba(214, 224, 255, 0.09)";
  g.lineWidth = 1;
  g.beginPath();
  for (let x = 0; x <= COLS; x++) {
    const px = x * cell + 0.5;
    g.moveTo(px, 0);
    g.lineTo(px, canvas.height);
  }
  for (let y = 0; y <= VISIBLE_ROWS; y++) {
    const py = y * cell + 0.5;
    g.moveTo(0, py);
    g.lineTo(canvas.width, py);
  }
  g.stroke();
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createView(canvas) {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    premultipliedAlpha: false,
    powerPreference: "high-performance",
    failIfMajorPerformanceCaveat: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const scene = new Scene();
  scene.background = null;

  const camera = new PerspectiveCamera(FOV, 1, 0.1, 200);

  const maps = makeMaps();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  maps.color.anisotropy = maxAniso;

  const gloss = {
    bumpMap: maps.bump,
    bumpScale: 0.035,
    roughness: 0.28,
    metalness: 0.06,
    color: 0xffffff,
  };
  const landedMat = new MeshStandardMaterial(gloss);
  const activeMat = new MeshStandardMaterial({ ...gloss, roughness: 0.2, metalness: 0.1 });

  const geo = new RoundedBoxGeometry(BOX_W, BOX_H, BOX_D, 2, BEVEL);
  const landed = new InstancedMesh(geo, landedMat, TOTAL_ROWS * COLS);
  const active = new InstancedMesh(geo, activeMat, 8);
  for (const mesh of [landed, active]) mesh.frustumCulled = false;
  landed.castShadow = true;
  landed.receiveShadow = true;
  active.castShadow = true;
  scene.add(landed, active);

  const hemi = new HemisphereLight(0xd5def0, 0x1a1420, 0.32);
  scene.add(hemi);
  scene.add(new AmbientLight(0x3a4254, 0.12));
  const key = new DirectionalLight(0xfff4e4, 2.85);
  key.position.set(-8, 22, 12);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.00035;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 2.5;
  key.shadow.camera.near = 2;
  key.shadow.camera.far = 60;
  key.shadow.camera.left = -16;
  key.shadow.camera.right = 16;
  key.shadow.camera.top = 18;
  key.shadow.camera.bottom = -18;
  key.target.position.set(0, -1, 0);
  scene.add(key, key.target);
  const fill = new DirectionalLight(0x8ea4c8, 0.28);
  fill.position.set(12, 4, 10);
  scene.add(fill);
  const topLight = new DirectionalLight(0xfff8ee, 0.85);
  topLight.position.set(0, 16, 6);
  scene.add(topLight);
  const rim = new DirectionalLight(0xc9d4ff, 0.4);
  rim.position.set(2, 2, -12);
  scene.add(rim);

  const wellW = COLS * PITCH + 0.08;
  const wellH = VISIBLE_ROWS * PITCH + 0.08;
  const catcher = new Mesh(
    new PlaneGeometry(wellW, wellH),
    new MeshStandardMaterial({ color: 0x12182c, roughness: 1, metalness: 0 })
  );
  catcher.position.set(0, 0, -0.62);
  catcher.receiveShadow = true;
  scene.add(catcher);

  const glow = new Mesh(
    new PlaneGeometry(wellW + 0.08, wellH + 0.08),
    new MeshBasicMaterial({ color: 0x9aa6ff, transparent: true, opacity: 0.14, depthWrite: false })
  );
  glow.position.set(0, 0, -0.7);
  scene.add(glow);

  const well = new Mesh(
    new PlaneGeometry(wellW, wellH),
    new MeshBasicMaterial({
      map: makeWellTexture(),
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    })
  );
  well.position.set(0, 0, -0.52);
  well.renderOrder = 1;
  scene.add(well);

  const blobTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grd.addColorStop(0, "rgba(0,0,0,0.7)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    return tex;
  })();
  const dropShadow = new InstancedMesh(
    new PlaneGeometry(1.25, 1.25),
    new MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.55 })
  );
  dropShadow.frustumCulled = false;
  dropShadow.renderOrder = 2;
  scene.add(dropShadow);

  const rimMat = new MeshStandardMaterial({
    color: 0xd5dcf2,
    roughness: 0.32,
    metalness: 0.2,
    emissive: 0x6e7ad4,
    emissiveIntensity: 0.16,
    transparent: true,
    opacity: 0.78,
  });
  const rimT = 0.05;
  const halfW = (COLS * PITCH) / 2;
  const halfH = (VISIBLE_ROWS * PITCH) / 2;
  const rimDepth = 0.1;
  const addRim = (w, h, x, y) => {
    const mesh = new Mesh(new RoundedBoxGeometry(w, h, rimDepth, 2, 0.018), rimMat);
    mesh.position.set(x, y, -0.2);
    scene.add(mesh);
  };
  addRim(rimT, wellH + rimT, -halfW - rimT * 0.15, 0);
  addRim(rimT, wellH + rimT, halfW + rimT * 0.15, 0);
  addRim(wellW + rimT * 2, rimT, 0, halfH + rimT * 0.1);
  addRim(wellW + rimT * 2, rimT, 0, -halfH - rimT * 0.1);

  let shakeAmp = 0;
  let camX = 0;
  let camY = 0;
  let camZ = 40;
  renderer.autoClear = false;

  function frameCamera(insets = { top: 0, bottom: 0 }, ox = 0, oy = 0) {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    const top = insets.top || 0;
    const bottom = insets.bottom || 0;
    const viewH = Math.max(1, h - top - bottom);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, w, h);
    renderer.clear(true, true, true);
    renderer.setScissorTest(true);
    renderer.setViewport(0, bottom, w, viewH);
    renderer.setScissor(0, bottom, w, viewH);

    const aspect = Math.max(0.01, w / viewH);
    const boardW = COLS * PITCH + BOARD_PAD_X;
    const boardH = VISIBLE_ROWS * PITCH + BOARD_PAD_Y;
    const halfTan = Math.tan((FOV * Math.PI) / 360);
    const dist = Math.max(boardH / 2 / halfTan, boardW / 2 / (halfTan * aspect)) * 1.03;
    const visH = 2 * dist * halfTan;
    const visW = visH * aspect;
    const sx = LENS_X * dist;
    const sy = LENS_Y * dist;
    camX = sx;
    camY = sy;
    camZ = dist;

    camera.fov = FOV;
    camera.near = Math.max(1, dist - 24);
    camera.far = dist + 36;
    camera.position.set(sx, sy, dist);
    camera.rotation.set(0, 0, 0);
    camera.updateMatrixWorld(true);
    camera.setViewOffset(visW, visH, ox - sx, sy - oy, visW, visH);
  }

  function shadowOnBoard(x, y, z) {
    const t = (-0.58 - camZ) / (z - camZ);
    return {
      x: camX + t * (x - camX),
      y: camY + t * (y - camY),
    };
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    frameCamera();
  }

  function drawCells(mesh, cells, opts) {
    let n = 0;
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const s = opts.scale || 1;
      place(mesh, n, boardX(cell.c), boardY(cell.r) + (opts.dy || 0), opts.z || 0, s, s, s);
      paint(mesh, n, opts.color || PIECE_HEX[opts.type] || PIECE_HEX[1], opts.mul || 1);
      n++;
    }
    commit(mesh, n);
  }

  return {
    resize,
    shake(amount) {
      shakeAmp = Math.max(shakeAmp, amount);
    },
    celebrate() {},
    draw(game, dt, now, insets) {
      shakeAmp *= Math.exp(-dt / 90);
      frameCamera(insets, (Math.random() - 0.5) * shakeAmp, (Math.random() - 0.5) * shakeAmp * 0.35);

      const clearing = game.status === "clearing" && game.pendingRows ? new Set(game.pendingRows) : null;
      const clearT = clearing ? Math.min(1, game.clearElapsed / CLEAR_MS) : 0;
      const fallT = Math.min(1, game.fallElapsed / FALL_MS);
      const fallEase = 1 - (1 - fallT) ** 3;
      let n = 0;
      for (let r = 0; r < TOTAL_ROWS; r++) {
        const extraY = (1 - fallEase) * (game.fallRows[r] || 0) * PITCH;
        const isClear = clearing && clearing.has(r);
        for (let c = 0; c < COLS; c++) {
          const type = game.board[r][c];
          if (!type) continue;
          let scale = 1;
          let z = 0;
          let mul = shadeOf(c, r);
          if (isClear) {
            scale = Math.max(0.08, 1 - clearT * clearT);
            z = clearT * 0.35;
            mul *= 1.45 - clearT * 0.5;
          } else if (game.popAge < 140) {
            for (let p = 0; p < game.popCells.length; p++) {
              if (game.popCells[p].c === c && game.popCells[p].r === r) {
                scale = 1 + 0.1 * (1 - game.popAge / 140);
                break;
              }
            }
          }
          place(landed, n, boardX(c), boardY(r) + extraY, z, scale, scale, scale);
          paint(landed, n, PIECE_HEX[type] || PIECE_HEX[1], mul);
          n++;
        }
      }
      commit(landed, n);

      if (game.piece && game.status !== "clearing") {
        const typeIndex = { I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7 }[game.piece.id] || 1;
        const bob = game.status === "home" ? Math.sin(now * 0.0022) * 0.08 : 0;
        const cells = cellsOf(game.piece);
        let s = 0;
        if (game.status === "playing") {
          for (let i = 0; i < cells.length; i++) {
            const hit = shadowOnBoard(boardX(cells[i].c), boardY(cells[i].r) + bob, 0.36);
            place(dropShadow, s, hit.x, hit.y, -0.58, 1, 1, 1);
            s++;
          }
        }
        commit(dropShadow, s);
        drawCells(active, cells, {
          z: 0.36,
          scale: 1,
          type: typeIndex,
          mul: 1,
          dy: bob,
        });
      } else {
        commit(active, 0);
        commit(dropShadow, 0);
      }

      renderer.render(scene, camera);
    },
  };
}
