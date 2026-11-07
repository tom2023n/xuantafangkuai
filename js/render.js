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
  PITCH,
  TOTAL_ROWS,
  VISIBLE_ROWS,
} from "./config.js";
import { SHAPES, cellsOf, mulberry32 } from "./logic.js";
import { RoundedBoxGeometry } from "./rounded-box.js";

const COLORS = [0x000000, 0xd7e4f2, 0xf3e4c6, 0xd7e3d6, 0xeadfca, 0xe4d8ee, 0xd5dbe8, 0xf3ead8];
const FOV = 28;

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
  return 0.94 + n * 0.1;
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
  const canvas = document.createElement("canvas");
  canvas.width = COLS * 48;
  canvas.height = VISIBLE_ROWS * 48;
  const g = canvas.getContext("2d");
  g.fillStyle = "#14161c";
  g.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < VISIBLE_ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      g.fillStyle = (x + y) % 2 === 0 ? "#1a1d25" : "#171a21";
      g.fillRect(x * 48 + 2, y * 48 + 2, 44, 44);
      g.strokeStyle = "rgba(255,255,255,0.035)";
      g.strokeRect(x * 48 + 2.5, y * 48 + 2.5, 43, 43);
    }
  }
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
  renderer.setClearColor(0x101217, 1);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const scene = new Scene();
  scene.background = new Color(0x101217);

  const camera = new PerspectiveCamera(FOV, 1, 0.1, 200);

  const maps = makeMaps();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  maps.color.anisotropy = maxAniso;

  const stone = {
    map: maps.color,
    bumpMap: maps.bump,
    bumpScale: 0.08,
    roughness: 0.32,
    metalness: 0.14,
  };
  const landedMat = new MeshStandardMaterial({
    ...stone,
    roughness: 0.2,
    metalness: 0.22,
    color: 0xffffff,
    emissive: 0x242018,
    emissiveIntensity: 0.3,
  });
  const activeMat = new MeshStandardMaterial({
    ...stone,
    roughness: 0.16,
    metalness: 0.24,
    emissive: 0x7a7262,
    emissiveIntensity: 0.55,
  });
  const ghostMat = new MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.28,
    roughness: 0.4,
    metalness: 0.05,
    emissive: 0xc5d0dc,
    emissiveIntensity: 0.55,
    depthWrite: false,
  });

  const geo = new RoundedBoxGeometry(BOX_W, BOX_H, BOX_D, 2, BEVEL);
  const landed = new InstancedMesh(geo, landedMat, TOTAL_ROWS * COLS);
  const active = new InstancedMesh(geo, activeMat, 8);
  const ghost = new InstancedMesh(geo, ghostMat, 8);
  const previews = new InstancedMesh(geo, activeMat, 20);
  for (const mesh of [landed, active, ghost, previews]) mesh.frustumCulled = false;
  landed.castShadow = true;
  landed.receiveShadow = true;
  active.castShadow = true;
  ghost.renderOrder = 2;
  scene.add(landed, active, ghost, previews);

  const hemi = new HemisphereLight(0xe7eef8, 0x2a241c, 0.7);
  scene.add(hemi);
  scene.add(new AmbientLight(0x6a7382, 0.35));
  const key = new DirectionalLight(0xfff8ee, 3.1);
  key.position.set(-7, 18, 14);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.035;
  key.shadow.camera.near = 2;
  key.shadow.camera.far = 50;
  key.shadow.camera.left = -14;
  key.shadow.camera.right = 14;
  key.shadow.camera.top = 16;
  key.shadow.camera.bottom = -16;
  key.target.position.set(0, 0, 0);
  scene.add(key, key.target);
  const fill = new DirectionalLight(0xb7c6de, 0.55);
  fill.position.set(10, 6, 8);
  scene.add(fill);
  const rim = new DirectionalLight(0xffffff, 0.35);
  rim.position.set(0, 4, -8);
  scene.add(rim);

  const wellW = COLS * PITCH + 0.35;
  const wellH = VISIBLE_ROWS * PITCH + 0.35;
  const well = new Mesh(
    new PlaneGeometry(wellW, wellH),
    new MeshStandardMaterial({ map: makeWellTexture(), roughness: 0.95, metalness: 0.02 })
  );
  well.position.set(0, 0, -0.62);
  well.receiveShadow = true;
  scene.add(well);

  const frameMat = new MeshStandardMaterial({
    color: 0x3a3d46,
    roughness: 0.55,
    metalness: 0.2,
    map: maps.color,
  });
  const sideGeo = new RoundedBoxGeometry(0.42, wellH + 0.2, 0.9, 1, 0.06);
  const left = new Mesh(sideGeo, frameMat);
  const right = new Mesh(sideGeo, frameMat);
  left.position.set(-COLS / 2 - 0.22, 0, 0);
  right.position.set(COLS / 2 + 0.22, 0, 0);
  left.castShadow = right.castShadow = true;
  left.receiveShadow = right.receiveShadow = true;
  scene.add(left, right);
  const floor = new Mesh(new RoundedBoxGeometry(wellW + 0.9, 0.42, 1.05, 1, 0.06), frameMat);
  floor.position.set(0, -VISIBLE_ROWS / 2 - 0.22, 0.05);
  floor.receiveShadow = true;
  floor.castShadow = true;
  scene.add(floor);

  const topY = boardY(HIDDEN_ROWS);
  let shakeAmp = 0;

  function frameCamera(ox = 0, oy = 0) {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    camera.aspect = Math.max(0.01, w / Math.max(1, h));
    const span = VISIBLE_ROWS * PITCH + 8.4;
    const dist = span / 2 / Math.tan((FOV * Math.PI) / 360);
    camera.position.set(0.7 + ox, 8.2 + oy, dist);
    camera.lookAt(0, -1.5, 0);
    camera.updateProjectionMatrix();
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    frameCamera();
  }

  function layoutPreviews(queue, held) {
    const items = [];
    if (held) items.push(held);
    for (let i = 0; i < Math.min(3, queue.length); i++) items.push(queue[i]);
    const scale = 0.42;
    const gap = 2.15;
    const origin = -((items.length - 1) * gap) / 2;
    let n = 0;
    for (let i = 0; i < items.length; i++) {
      const shape = SHAPES[items[i]][0];
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
      const ox = origin + i * gap;
      for (const [x, y] of shape) {
        place(
          previews,
          n,
          ox + (x - cx) * scale,
          topY + 2.15 - (y - cy) * scale,
          0.35,
          scale,
          scale,
          scale * 0.8
        );
        const type = 1 + (i % 7);
        paint(previews, n, COLORS[type], items[i] === held && i === 0 && held ? 1.05 : 1);
        n++;
      }
    }
    commit(previews, n);
  }

  function drawCells(mesh, cells, opts) {
    let n = 0;
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const s = opts.scale || 1;
      place(mesh, n, boardX(cell.c), boardY(cell.r) + (opts.dy || 0), opts.z || 0, s, s, s);
      paint(mesh, n, opts.color || COLORS[opts.type] || 0xe6e0d4, opts.mul || 1);
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
    draw(game, dt, now) {
      shakeAmp *= Math.exp(-dt / 90);
      frameCamera((Math.random() - 0.5) * shakeAmp, (Math.random() - 0.5) * shakeAmp * 0.35);

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
          paint(landed, n, COLORS[type] || COLORS[1], mul);
          n++;
        }
      }
      commit(landed, n);

      if (game.piece && game.status !== "clearing") {
        const typeIndex = { I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7 }[game.piece.id] || 1;
        if (game.status === "playing") {
          const grow = game.ghostRow();
          if (grow !== game.piece.row) {
            drawCells(ghost, cellsOf({ ...game.piece, row: grow }), {
              z: 0.02,
              scale: 0.96,
              type: typeIndex,
              mul: 0.9,
            });
          } else commit(ghost, 0);
        } else commit(ghost, 0);
        const bob = game.status === "home" ? Math.sin(now * 0.0022) * 0.08 : 0;
        const pulse = game.status === "playing" ? 1.03 + Math.sin(now * 0.006) * 0.015 : 1.02;
        drawCells(active, cellsOf(game.piece), {
          z: 0.22,
          scale: pulse,
          type: typeIndex,
          mul: 1.12,
          dy: bob,
        });
      } else {
        commit(active, 0);
        commit(ghost, 0);
      }

      layoutPreviews(game.queue || [], game.held);
      renderer.render(scene, camera);
    },
  };
}
