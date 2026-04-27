import * as THREE from "https://esm.sh/three@0.164.1";
import { OrbitControls } from "https://esm.sh/three@0.164.1/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "https://esm.sh/three@0.164.1/examples/jsm/geometries/RoundedBoxGeometry.js";
import { FontLoader } from "https://esm.sh/three@0.164.1/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "https://esm.sh/three@0.164.1/examples/jsm/geometries/TextGeometry.js";

const FACE_NAMES = {
  front: "Avant",
  back: "Arriere",
  right: "Droite",
  left: "Gauche",
  top: "Dessus",
  bottom: "Dessous",
};

const FACE_ORDER = ["front", "back", "right", "left", "top", "bottom"];
const FONT_URLS = {
  Arial: "https://threejs.org/examples/fonts/helvetiker_bold.typeface.json",
  Impact: "https://threejs.org/examples/fonts/helvetiker_bold.typeface.json",
  Verdana: "https://threejs.org/examples/fonts/optimer_bold.typeface.json",
  Georgia: "https://threejs.org/examples/fonts/gentilis_bold.typeface.json",
  "Courier New": "https://threejs.org/examples/fonts/helvetiker_regular.typeface.json",
  "Trebuchet MS": "https://threejs.org/examples/fonts/optimer_regular.typeface.json",
  "Times New Roman": "https://threejs.org/examples/fonts/gentilis_regular.typeface.json",
};

const FACE_TRANSFORMS = {
  front: { normal: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0] },
  back: { normal: [0, 0, -1], right: [-1, 0, 0], up: [0, 1, 0] },
  right: { normal: [1, 0, 0], right: [0, 0, -1], up: [0, 1, 0] },
  left: { normal: [-1, 0, 0], right: [0, 0, 1], up: [0, 1, 0] },
  top: { normal: [0, 1, 0], right: [1, 0, 0], up: [0, 0, -1] },
  bottom: { normal: [0, -1, 0], right: [1, 0, 0], up: [0, 0, 1] },
};

const state = {
  activeFace: "front",
  cubeSize: 39,
  textDepth: 1.6,
  textScale: 79,
  fontFamily: "Arial",
  line1Y: 40,
  line2Y: 72,
  cornerRadius: 2,
  cubeColor: "#e8eef2",
  textColor: "#1b6f9b",
  faces: Object.fromEntries(FACE_ORDER.map((face) => [face, ""])),
};

function roundedCornerRadius() {
  return clamp(state.cornerRadius, 1, state.cubeSize / 2 - 0.6);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function textFont(size) {
  return `800 ${size}px ${JSON.stringify(state.fontFamily)}, Arial, sans-serif`;
}

const sceneHost = document.getElementById("scene");
const faceText = document.getElementById("face-text");
const faceButtons = Array.from(document.querySelectorAll(".face-button"));
const activeFaceLabel = document.getElementById("active-face-label");
const faceStatus = document.getElementById("face-status");
const printSize = document.getElementById("print-size");
const fontFamily = document.getElementById("font-family");
const cubeSize = document.getElementById("cube-size");
const textDepth = document.getElementById("text-depth");
const textSize = document.getElementById("text-size");
const line1Y = document.getElementById("line-1-y");
const line2Y = document.getElementById("line-2-y");
const cornerRadius = document.getElementById("corner-radius");
const sizeValue = document.getElementById("size-value");
const depthValue = document.getElementById("depth-value");
const textSizeValue = document.getElementById("text-size-value");
const line1Value = document.getElementById("line-1-value");
const line2Value = document.getElementById("line-2-value");
const cornerValue = document.getElementById("corner-value");
const cubeColor = document.getElementById("cube-color");
const textColor = document.getElementById("text-color");
const saveState = document.getElementById("save-state");

let cubeMesh;
let engravingGroup;
let needsSave = false;
let activeFont = null;
let activeFontFamily = "";
let fontRequest = null;
let lastDownloadUrl = null;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
sceneHost.appendChild(renderer.domElement);
sceneHost.classList.add("ready");
document.getElementById("scene-fallback")?.setAttribute("hidden", "");

const scene = new THREE.Scene();
scene.background = new THREE.Color("#eef3f6");

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
camera.position.set(82, 66, 92);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 45;
controls.maxDistance = 230;

scene.add(new THREE.HemisphereLight("#ffffff", "#7d8d96", 1.8));
const keyLight = new THREE.DirectionalLight("#ffffff", 2.4);
keyLight.position.set(60, 80, 40);
scene.add(keyLight);

const grid = new THREE.GridHelper(140, 14, "#aab9c2", "#d3dee4");
grid.position.y = -34;
scene.add(grid);

function makeFaceTexture(face) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = state.cubeColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(19, 34, 43, 0.12)";
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);

  const text = state.faces[face].trim();
  if (text) {
    ctx.drawImage(
      createFaceTextLayer(512, 512, text, 420, 512, Math.round(512 * state.textScale / 100 * 0.32), state.textColor),
      0,
      0,
    );
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function normalizeFaceText(text) {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .slice(0, 2)
    .map((line) => line.replace(/\s+/g, " ").trimStart())
    .join("\n");
}

function drawPartitionedFaceText(ctx, text, x, y, maxWidth, maxHeight, baseFontSize) {
  const cleanText = normalizeFaceText(text).toUpperCase();
  ctx.font = textFont(baseFontSize);
  const lines = createTwoCenteredLines(ctx, cleanText, maxWidth).slice(0, 2);
  const halfHeight = maxHeight / 2;
  const top = y - maxHeight / 2;
  const lineCenters = [
    top + (maxHeight * state.line1Y) / 100,
    top + (maxHeight * state.line2Y) / 100,
  ];

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  lines.forEach((line, index) => {
    if (!line) {
      return;
    }

    let fontSize = Math.min(baseFontSize, Math.floor(halfHeight * 0.54));
    while (fontSize >= 6) {
      ctx.font = textFont(fontSize);
      const width = ctx.measureText(line).width;
      if (width <= maxWidth) {
        break;
      }
      fontSize -= 1;
    }
    drawLineCenteredInZone(ctx, line, x, lineCenters[index], maxWidth, halfHeight, fontSize);
  });
}

function drawLineCenteredInZone(ctx, line, centerX, centerY, maxWidth, zoneHeight, fontSize) {
  const draft = document.createElement("canvas");
  draft.width = Math.ceil(maxWidth + 24);
  draft.height = Math.ceil(zoneHeight);
  const draftCtx = draft.getContext("2d");
  draftCtx.fillStyle = ctx.fillStyle;
  draftCtx.textAlign = "center";
  draftCtx.textBaseline = "middle";
  draftCtx.font = textFont(fontSize);
  draftCtx.fillText(line, draft.width / 2, draft.height / 2);

  const bounds = findAlphaBounds(draftCtx.getImageData(0, 0, draft.width, draft.height).data, draft.width, draft.height);
  if (!bounds) {
    return;
  }

  const lineCenterX = (bounds.minX + bounds.maxX + 1) / 2;
  const lineCenterY = (bounds.minY + bounds.maxY + 1) / 2;
  ctx.drawImage(draft, Math.round(centerX - lineCenterX), Math.round(centerY - lineCenterY));
}

function findAlphaBounds(data, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] <= 80) {
        continue;
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < 0) {
    return null;
  }
  return { minX, minY, maxX, maxY };
}

function createFaceTextLayer(width, height, text, maxWidth, maxHeight, baseFontSize, color) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color;
  drawPartitionedFaceText(ctx, text, width / 2, height / 2, maxWidth, maxHeight, baseFontSize);
  return canvas;
}

function createTwoCenteredLines(ctx, text, maxWidth) {
  const explicitLines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (explicitLines.length === 2) {
    return explicitLines;
  }

  const source = explicitLines[0] || text.replace(/\s+/g, " ").trim();
  if (!source) {
    return [];
  }

  const words = source.split(/\s+/);
  if (words.length === 1 || ctx.measureText(source).width <= maxWidth) {
    return [source];
  }

  let bestLines = [source, ""];
  let bestScore = Number.POSITIVE_INFINITY;
  for (let index = 1; index < words.length; index += 1) {
    const first = words.slice(0, index).join(" ");
    const second = words.slice(index).join(" ");
    const firstWidth = ctx.measureText(first).width;
    const secondWidth = ctx.measureText(second).width;
    const overflow = Math.max(firstWidth - maxWidth, 0) + Math.max(secondWidth - maxWidth, 0);
    const balance = Math.abs(firstWidth - secondWidth);
    const score = overflow * 10 + balance;
    if (score < bestScore) {
      bestScore = score;
      bestLines = [first, second];
    }
  }
  return bestLines;
}

function buildPreview() {
  if (cubeMesh) {
    disposeObject(cubeMesh);
    scene.remove(cubeMesh);
  }
  if (engravingGroup) {
    disposeObject(engravingGroup);
    scene.remove(engravingGroup);
  }

  const geometry = createRoundedCubeGeometry();
  const material = new THREE.MeshStandardMaterial({
    color: state.cubeColor,
    roughness: 0.66,
    metalness: 0,
  });
  cubeMesh = new THREE.Mesh(geometry, material);
  scene.add(cubeMesh);

  engravingGroup = new THREE.Group();
  for (const face of FACE_ORDER) {
    addEngravingPreview(face, engravingGroup);
  }
  scene.add(engravingGroup);
}

function createRoundedCubeGeometry() {
  const geometry = new RoundedBoxGeometry(
    state.cubeSize,
    state.cubeSize,
    state.cubeSize,
    6,
    roundedCornerRadius(),
  );
  geometry.computeVertexNormals();
  return geometry;
}

function ensureActiveFont() {
  if (activeFont && activeFontFamily === state.fontFamily) {
    return true;
  }

  if (!fontRequest || activeFontFamily !== state.fontFamily) {
    const family = state.fontFamily;
    activeFontFamily = family;
    saveState.textContent = "Chargement de la police...";
    fontRequest = new Promise((resolve, reject) => {
      new FontLoader().load(FONT_URLS[family] || FONT_URLS.Arial, resolve, undefined, reject);
    })
      .then((font) => {
        if (activeFontFamily === family) {
          activeFont = font;
          buildPreview();
        }
      })
      .catch(() => {
        if (activeFontFamily === family) {
          activeFont = null;
          saveState.textContent = "Impossible de charger la police";
        }
      });
  }

  return false;
}

function addEngravingPreview(face, group) {
  const text = state.faces[face].trim();
  if (!text) {
    return;
  }

  if (!ensureActiveFont()) {
    return;
  }

  const material = new THREE.MeshStandardMaterial({
    color: state.textColor,
    roughness: 0.82,
    metalness: 0,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const merged = createEngravingGeometry(face, text, state.textDepth);
  const mesh = new THREE.Mesh(merged, material);
  group.add(mesh);
}

function sampleTextPixels(text, resolution) {
  const canvas = createFaceTextLayer(
    resolution,
    resolution,
    text,
    resolution * 0.78,
    resolution,
    Math.round(resolution * state.textScale / 100 * 0.32),
    "#fff",
  );
  const ctx = canvas.getContext("2d");

  const data = ctx.getImageData(0, 0, resolution, resolution).data;
  const pixels = [];
  for (let y = 0; y < resolution; y += 1) {
    for (let x = 0; x < resolution; x += 1) {
      if (data[(y * resolution + x) * 4 + 3] > 80) {
        pixels.push({ x, y });
      }
    }
  }
  return pixels;
}

function createEngravingGeometry(face, text, depth) {
  const vertices = [];
  const half = state.cubeSize / 2;
  const transform = FACE_TRANSFORMS[face];
  const normal = new THREE.Vector3(...transform.normal);
  const right = new THREE.Vector3(...transform.right);
  const up = new THREE.Vector3(...transform.up);
  const inward = normal.clone().multiplyScalar(-1);
  const baseCenter = normal.clone().multiplyScalar(half + 0.015);
  const maxWidth = state.cubeSize * 0.78;
  const maxLineHeight = state.cubeSize * 0.34;
  const baseSize = state.cubeSize * (state.textScale / 100) * 0.28;
  const ctx = document.createElement("canvas").getContext("2d");
  ctx.font = textFont(baseSize);
  const lines = createTwoCenteredLines(ctx, normalizeFaceText(text).toUpperCase(), maxWidth).slice(0, 2);
  const top = state.cubeSize / 2;
  const lineCenters = [
    top - (state.cubeSize * state.line1Y) / 100,
    top - (state.cubeSize * state.line2Y) / 100,
  ];

  for (const [index, line] of lines.entries()) {
    if (!line) {
      continue;
    }
    const lineGeometry = createSmoothLineGeometry(line, maxWidth, maxLineHeight, baseSize, depth);
    lineGeometry.computeBoundingBox();
    const box = lineGeometry.boundingBox;
    const centerX = (box.min.x + box.max.x) / 2;
    const centerY = (box.min.y + box.max.y) / 2;
    lineGeometry.translate(-centerX, lineCenters[index] - centerY, 0);
    const matrix = new THREE.Matrix4().makeBasis(right, up, inward);
    matrix.setPosition(baseCenter);
    lineGeometry.applyMatrix4(matrix);
    appendGeometryVertices(vertices, lineGeometry);
    lineGeometry.dispose();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createSmoothLineGeometry(line, maxWidth, maxHeight, baseSize, depth) {
  let size = baseSize;
  let geometry = null;

  while (size >= 1.2) {
    if (geometry) {
      geometry.dispose();
    }
    geometry = new TextGeometry(line, {
      font: activeFont,
      size,
      depth,
      curveSegments: 14,
      bevelEnabled: false,
    });
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (box.max.x - box.min.x <= maxWidth && box.max.y - box.min.y <= maxHeight) {
      return geometry;
    }
    size -= 0.4;
  }

  return geometry;
}

function appendGeometryVertices(vertices, geometry) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const positions = source.getAttribute("position").array;
  for (let i = 0; i < positions.length; i += 1) {
    vertices.push(positions[i]);
  }
  if (source !== geometry) {
    source.dispose();
  }
}

function addEngravedCell(vertices, center, right, up, normal, width, height, depth) {
  const r = right.clone().multiplyScalar(width / 2);
  const u = up.clone().multiplyScalar(height / 2);
  const n0 = normal.clone().multiplyScalar(0.018);
  const n1 = normal.clone().multiplyScalar(-depth);

  const p = [
    center.clone().sub(r).sub(u).add(n0),
    center.clone().add(r).sub(u).add(n0),
    center.clone().add(r).add(u).add(n0),
    center.clone().sub(r).add(u).add(n0),
    center.clone().sub(r).sub(u).add(n1),
    center.clone().add(r).sub(u).add(n1),
    center.clone().add(r).add(u).add(n1),
    center.clone().sub(r).add(u).add(n1),
  ];

  addQuad(vertices, p[1], p[0], p[3], p[2]);
  addQuad(vertices, p[4], p[5], p[6], p[7]);
  addQuad(vertices, p[0], p[4], p[7], p[3]);
  addQuad(vertices, p[5], p[1], p[2], p[6]);
  addQuad(vertices, p[3], p[7], p[6], p[2]);
  addQuad(vertices, p[0], p[1], p[5], p[4]);
}

function addQuad(vertices, a, b, c, d) {
  pushTriangle(vertices, a, b, c);
  pushTriangle(vertices, a, c, d);
}

function pushTriangle(vertices, a, b, c) {
  vertices.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) {
      child.geometry.dispose();
    }
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (material.map) {
          material.map.dispose();
        }
        material.dispose();
      });
    }
  });
}

function resize() {
  const { width, height } = sceneHost.getBoundingClientRect();
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function setActiveFace(face) {
  state.activeFace = face;
  faceText.value = state.faces[face];
  activeFaceLabel.textContent = FACE_NAMES[face];
  faceStatus.textContent = `Face ${FACE_NAMES[face].toLowerCase()} selectionnee`;
  faceButtons.forEach((button) => button.classList.toggle("active", button.dataset.face === face));
}

function markDirty() {
  needsSave = true;
  saveState.textContent = "Modifications non sauvegardees";
}

function updateUi() {
  sizeValue.textContent = `${state.cubeSize} mm`;
  depthValue.textContent = `${state.textDepth.toFixed(1)} mm`;
  textSizeValue.textContent = `${state.textScale}%`;
  line1Value.textContent = `${state.line1Y}%`;
  line2Value.textContent = `${state.line2Y}%`;
  cornerValue.textContent = `${roundedCornerRadius().toFixed(1)} mm`;
  printSize.textContent = `Cube ${state.cubeSize} mm, coins ${roundedCornerRadius().toFixed(1)} mm, gravure ${state.textDepth.toFixed(1)} mm`;
  cubeSize.value = state.cubeSize;
  textDepth.value = state.textDepth;
  textSize.value = state.textScale;
  line1Y.value = state.line1Y;
  line2Y.value = state.line2Y;
  cornerRadius.max = String(Math.max(1, Math.floor(state.cubeSize / 2 - 1)));
  cornerRadius.value = roundedCornerRadius();
  fontFamily.value = state.fontFamily;
  cubeColor.value = state.cubeColor;
  textColor.value = state.textColor;
}

function resetView() {
  camera.position.set(82, 66, 92);
  controls.target.set(0, 0, 0);
  controls.update();
}

async function exportProject() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  await saveBlob(blob, {
    filename: "cube-personnalise.json",
    message: "Projet sauvegarde en JSON",
    description: "Projet Cube 3D",
    accept: { "application/json": [".json"] },
  });
  needsSave = false;
}

function loadProject(file) {
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const data = JSON.parse(reader.result);
      state.cubeSize = Number(data.cubeSize) || 50;
      state.textDepth = Number(data.textDepth) || 1.2;
      state.textScale = Number(data.textScale) || 64;
      state.fontFamily = data.fontFamily || "Arial";
      state.line1Y = clamp(Number(data.line1Y) || 25, 8, 48);
      state.line2Y = clamp(Number(data.line2Y) || 86, 52, 94);
      state.cornerRadius = clamp(Number(data.cornerRadius) || 9, 1, state.cubeSize / 2 - 0.6);
      state.cubeColor = data.cubeColor || "#e8eef2";
      state.textColor = data.textColor || "#1b6f9b";
      state.faces = Object.fromEntries(
        FACE_ORDER.map((face) => [face, normalizeFaceText((data.faces || {})[face] || "")]),
      );
      setActiveFace(data.activeFace && FACE_NAMES[data.activeFace] ? data.activeFace : "front");
      updateUi();
      buildPreview();
      needsSave = false;
      saveState.textContent = "Projet charge";
    } catch {
      saveState.textContent = "Le fichier JSON est invalide";
    }
  });
  reader.readAsText(file);
}

async function exportStl() {
  try {
    saveState.textContent = "Generation du STL...";

    if (!ensureActiveFont()) {
      await fontRequest;
    }

    const triangles = [];
    addRoundedCubeTriangles(triangles);

    for (const face of FACE_ORDER) {
      const text = state.faces[face].trim();
      if (!text) {
        continue;
      }
      const geometry = createEngravingGeometry(face, text, state.textDepth);
      const positions = geometry.getAttribute("position").array;
      for (let i = 0; i < positions.length; i += 9) {
        triangles.push([
          new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]),
          new THREE.Vector3(positions[i + 3], positions[i + 4], positions[i + 5]),
          new THREE.Vector3(positions[i + 6], positions[i + 7], positions[i + 8]),
        ]);
      }
      geometry.dispose();
    }

    const stl = trianglesToBinaryStl(triangles);
    const blob = new Blob([stl], { type: "model/stl" });
    await saveBlob(blob, {
      filename: "cube-personnalise.stl",
      message: `STL pret (${triangles.length} triangles, ${formatBytes(blob.size)})`,
      description: "Modele STL",
      accept: { "model/stl": [".stl"], "application/sla": [".stl"] },
    });
  } catch (error) {
    console.error(error);
    saveState.textContent = `Erreur export STL: ${error.message || "generation impossible"}`;
  }
}

function addRoundedCubeTriangles(triangles) {
  const geometry = createRoundedCubeGeometry();
  addGeometryTriangles(triangles, geometry);
  geometry.dispose();
}

function addGeometryTriangles(triangles, geometry) {
  const positions = geometry.getAttribute("position").array;
  const index = geometry.index ? geometry.index.array : null;

  if (index) {
    for (let i = 0; i < index.length; i += 3) {
      triangles.push([
        readVertex(positions, index[i]),
        readVertex(positions, index[i + 1]),
        readVertex(positions, index[i + 2]),
      ]);
    }
    return;
  }

  for (let i = 0; i < positions.length; i += 9) {
    triangles.push([
      new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]),
      new THREE.Vector3(positions[i + 3], positions[i + 4], positions[i + 5]),
      new THREE.Vector3(positions[i + 6], positions[i + 7], positions[i + 8]),
    ]);
  }
}

function readVertex(positions, vertexIndex) {
  const offset = vertexIndex * 3;
  return new THREE.Vector3(positions[offset], positions[offset + 1], positions[offset + 2]);
}

function trianglesToStl(triangles) {
  const lines = ["solid cube_personnalise"];
  for (const triangle of triangles) {
    const normal = new THREE.Vector3()
      .subVectors(triangle[1], triangle[0])
      .cross(new THREE.Vector3().subVectors(triangle[2], triangle[0]))
      .normalize();
    lines.push(`  facet normal ${normal.x} ${normal.y} ${normal.z}`);
    lines.push("    outer loop");
    triangle.forEach((point) => lines.push(`      vertex ${point.x} ${point.y} ${point.z}`));
    lines.push("    endloop");
    lines.push("  endfacet");
  }
  lines.push("endsolid cube_personnalise");
  return lines.join("\n");
}

async function saveBlob(blob, options) {
  if (!blob.size) {
    saveState.textContent = "Erreur: fichier vide";
    return;
  }

  if (window.showSaveFilePicker && window.location.protocol !== "file:") {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: options.filename,
        types: [
          {
            description: options.description,
            accept: options.accept,
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write({ type: "write", data: blob });
      await writable.close();
      saveState.textContent = `${options.message} - ${handle.name}`;
      return;
    } catch (error) {
      if (error && error.name === "AbortError") {
        saveState.textContent = "Sauvegarde annulee";
        return;
      }
      console.warn("File picker indisponible, utilisation du telechargement.", error);
    }
  }

  await downloadBlob(blob, options.filename, options.message);
}

function trianglesToBinaryStl(triangles) {
  const bytes = new ArrayBuffer(84 + triangles.length * 50);
  const view = new DataView(bytes);
  const header = "cube_personnalise";

  for (let i = 0; i < header.length; i += 1) {
    view.setUint8(i, header.charCodeAt(i));
  }

  view.setUint32(80, triangles.length, true);
  let offset = 84;

  for (const triangle of triangles) {
    const normal = new THREE.Vector3()
      .subVectors(triangle[1], triangle[0])
      .cross(new THREE.Vector3().subVectors(triangle[2], triangle[0]))
      .normalize();
    const values = [
      normal.x,
      normal.y,
      normal.z,
      triangle[0].x,
      triangle[0].y,
      triangle[0].z,
      triangle[1].x,
      triangle[1].y,
      triangle[1].z,
      triangle[2].x,
      triangle[2].y,
      triangle[2].z,
    ];

    for (const value of values) {
      view.setFloat32(offset, Number.isFinite(value) ? value : 0, true);
      offset += 4;
    }

    view.setUint16(offset, 0, true);
    offset += 2;
  }

  return bytes;
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} o`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} Ko`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

async function downloadBlob(blob, filename, message) {
  if (lastDownloadUrl) {
    URL.revokeObjectURL(lastDownloadUrl);
  }

  const url = window.location.protocol === "file:" ? await blobToDataUrl(blob) : URL.createObjectURL(blob);
  lastDownloadUrl = url.startsWith("blob:") ? url : null;
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => anchor.remove(), 1000);

  const fallback = document.createElement("a");
  fallback.href = url;
  fallback.download = filename;
  fallback.textContent = `Telecharger ${filename}`;
  saveState.replaceChildren(`${message} - `, fallback);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
}

faceButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveFace(button.dataset.face));
});

faceText.addEventListener("input", () => {
  const normalized = normalizeFaceText(faceText.value);
  if (faceText.value !== normalized) {
    faceText.value = normalized;
  }
  state.faces[state.activeFace] = normalized;
  markDirty();
  buildPreview();
});

cubeSize.addEventListener("input", () => {
  state.cubeSize = Number(cubeSize.value);
  state.cornerRadius = roundedCornerRadius();
  updateUi();
  markDirty();
  buildPreview();
});

textDepth.addEventListener("input", () => {
  state.textDepth = Number(textDepth.value);
  updateUi();
  markDirty();
  buildPreview();
});

textSize.addEventListener("input", () => {
  state.textScale = Number(textSize.value);
  updateUi();
  markDirty();
  buildPreview();
});

fontFamily.addEventListener("change", () => {
  state.fontFamily = fontFamily.value;
  updateUi();
  markDirty();
  buildPreview();
});

line1Y.addEventListener("input", () => {
  state.line1Y = Number(line1Y.value);
  updateUi();
  markDirty();
  buildPreview();
});

line2Y.addEventListener("input", () => {
  state.line2Y = Number(line2Y.value);
  updateUi();
  markDirty();
  buildPreview();
});

cornerRadius.addEventListener("input", () => {
  state.cornerRadius = Number(cornerRadius.value);
  updateUi();
  markDirty();
  buildPreview();
});

cubeColor.addEventListener("input", () => {
  state.cubeColor = cubeColor.value;
  markDirty();
  buildPreview();
});

textColor.addEventListener("input", () => {
  state.textColor = textColor.value;
  markDirty();
  buildPreview();
});

document.getElementById("reset-view").addEventListener("click", resetView);
document.getElementById("save-project").addEventListener("click", exportProject);
document.getElementById("export-stl").addEventListener("click", exportStl);
document.getElementById("load-project").addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) {
    loadProject(file);
  }
});

window.addEventListener("resize", resize);
window.addEventListener("beforeunload", (event) => {
  if (!needsSave) {
    return;
  }
  event.preventDefault();
  event.returnValue = "";
});

setActiveFace("front");
updateUi();
saveState.textContent = "Projet pret";
resize();
buildPreview();
animate();
