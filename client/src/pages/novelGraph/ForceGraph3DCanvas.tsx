import { useEffect, useMemo, useRef } from "react";
import ForceGraph3D from "3d-force-graph";
import { forceCollide, forceX, forceY, forceZ } from "d3-force-3d";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { NovelGraphDirectedEdge, NovelGraphPairEdge } from "@ai-novel/shared/types/novelGraph";
import type { GraphCanvasData, GraphCanvasLink, GraphCanvasNode } from "./forceGraphAdapter";

type FocusRequest = {
  nodeId: string;
  nonce: number;
};

interface ForceGraph3DCanvasProps {
  graphData: GraphCanvasData;
  focusRequest?: FocusRequest | null;
  onNodeClick: (nodeId: string) => void;
  onLinkClick: (edgeId: string, kind: "pair-edge" | "directed-edge") => void;
  onStageClick: () => void;
}

type LinkObject = THREE.Group & {
  userData: {
    mainLine: Line2;
    edgeId: string;
    edgeKind: "pair-edge" | "directed-edge";
    baseOpacity: number;
    baseWidth: number;
  };
};

const labelTextureCache = new Map<string, THREE.CanvasTexture>();
const nodeDiscTextureCache = new Map<string, THREE.CanvasTexture>();
const glowTextureCache = new Map<string, THREE.CanvasTexture>();
const LINK_SIDE_FALLBACK = new THREE.Vector3(1, 0, 0);

function nodeDiscSize(node: GraphCanvasNode): number {
  return node.source === "precise"
    ? Math.max(21, node.val * 5.9)
    : Math.max(17, node.val * 5.25);
}

function isPreciseNode(node: GraphCanvasNode): boolean {
  return node.source === "precise";
}

function disableRaycast(object: THREE.Object3D) {
  object.raycast = () => undefined;
}

function restrictSpriteRaycastToCircle(sprite: THREE.Sprite, radius = 0.48) {
  const baseRaycast = sprite.raycast.bind(sprite);

  sprite.raycast = (raycaster, intersects) => {
    const previousLength = intersects.length;
    baseRaycast(raycaster, intersects);

    for (let index = intersects.length - 1; index >= previousLength; index -= 1) {
      const uv = intersects[index]?.uv;
      if (!uv) {
        continue;
      }

      const dx = uv.x - 0.5;
      const dy = uv.y - 0.5;
      if (Math.sqrt(dx * dx + dy * dy) > radius) {
        intersects.splice(index, 1);
      }
    }
  };
}

function makeBaseTextureCanvas(size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  return { canvas, context };
}

function finalizeTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function createGlowTexture(color: string): THREE.CanvasTexture {
  const cached = glowTextureCache.get(color);
  if (cached) {
    return cached;
  }

  const { canvas, context } = makeBaseTextureCanvas(512);
  const gradient = context.createRadialGradient(256, 256, 24, 256, 256, 220);
  gradient.addColorStop(0, "rgba(255,255,255,0.3)");
  gradient.addColorStop(0.18, `${color}88`);
  gradient.addColorStop(0.45, `${color}2e`);
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 512);

  const texture = finalizeTexture(canvas);
  glowTextureCache.set(color, texture);
  return texture;
}

function createPlainNodeTexture(color: string): THREE.CanvasTexture {
  const cached = nodeDiscTextureCache.get(color);
  if (cached) {
    return cached;
  }

  const { canvas, context } = makeBaseTextureCanvas(768);
  const center = 384;
  const outerRadius = 300;
  const innerRadius = 250;

  context.clearRect(0, 0, 768, 768);

  context.beginPath();
  context.arc(center, center, outerRadius, 0, Math.PI * 2);
  const outer = context.createRadialGradient(center - 84, center - 92, 20, center, center, outerRadius);
  outer.addColorStop(0, "#ffffff");
  outer.addColorStop(0.3, "#f8fafc");
  outer.addColorStop(1, color);
  context.fillStyle = outer;
  context.fill();

  context.beginPath();
  context.arc(center, center, innerRadius, 0, Math.PI * 2);
  const inner = context.createRadialGradient(center - 76, center - 88, 24, center, center, innerRadius);
  inner.addColorStop(0, "#ffffff");
  inner.addColorStop(0.78, "#f8fafc");
  inner.addColorStop(1, "#e2e8f0");
  context.fillStyle = inner;
  context.fill();

  context.beginPath();
  context.arc(center, center, innerRadius + 8, 0, Math.PI * 2);
  context.lineWidth = 8;
  context.strokeStyle = "rgba(255,255,255,0.7)";
  context.stroke();

  const gloss = context.createLinearGradient(198, 118, 330, 340);
  gloss.addColorStop(0, "rgba(255,255,255,0.35)");
  gloss.addColorStop(0.45, "rgba(255,255,255,0.12)");
  gloss.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gloss;
  context.beginPath();
  context.ellipse(302, 270, 122, 88, -0.58, 0, Math.PI * 2);
  context.fill();

  const texture = finalizeTexture(canvas);
  nodeDiscTextureCache.set(color, texture);
  return texture;
}

function makeLabelTexture(text: string, accent: string): THREE.CanvasTexture {
  const cacheKey = `${text}::${accent}`;
  const cached = labelTextureCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;
  const fontSize = 42;
  const paddingX = 24;
  const paddingY = 14;

  context.font = `700 ${fontSize}px "Microsoft YaHei", "Noto Sans SC", sans-serif`;
  const metrics = context.measureText(text);
  canvas.width = Math.ceil(metrics.width + paddingX * 2);
  canvas.height = fontSize + paddingY * 2;

  context.font = `700 ${fontSize}px "Microsoft YaHei", "Noto Sans SC", sans-serif`;
  context.fillStyle = "rgba(2, 6, 23, 0.72)";
  context.strokeStyle = "rgba(255, 255, 255, 0.16)";
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect(1, 1, canvas.width - 2, canvas.height - 2, 18);
  context.fill();
  context.stroke();
  context.fillStyle = accent;
  context.fillText(text, paddingX, fontSize + paddingY - 6);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  labelTextureCache.set(cacheKey, texture);
  return texture;
}

function makeNodeObject(node: GraphCanvasNode): THREE.Object3D {
  const group = new THREE.Group();
  const size = nodeDiscSize(node);
  const precise = isPreciseNode(node);

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createGlowTexture(node.color),
      transparent: true,
      depthWrite: false,
      opacity: precise
        ? node.tier === "core"
          ? 0.2
          : 0.13
        : node.tier === "core"
          ? 0.16
          : 0.1,
      blending: THREE.AdditiveBlending,
    }),
  );
  glow.scale.set(size * (precise ? 1.62 : 1.48), size * (precise ? 1.62 : 1.48), 1);
  glow.position.set(0, 0, -1);
  disableRaycast(glow);
  group.add(glow);

  const disc = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createPlainNodeTexture(node.color),
      transparent: true,
      depthWrite: true,
      depthTest: true,
      alphaTest: 0.22,
    }),
  );
  disc.scale.set(size, size, 1);
  disc.renderOrder = 3;
  disc.userData.nodeId = node.id;
  restrictSpriteRaycastToCircle(disc, 0.46);
  group.add(disc);

  const labelTexture = makeLabelTexture(node.name, node.color);
  const labelCanvas = labelTexture.image;
  const label = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: labelTexture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    }),
  );
  label.renderOrder = 5;
  label.scale.set(
    labelCanvas.width / (precise ? 6.25 : 6.85),
    labelCanvas.height / (precise ? 6.25 : 6.85),
    1,
  );
  label.position.set(0, -size * (precise ? 0.92 : 0.78), 0);
  disableRaycast(label);
  group.add(label);

  return group;
}

function linkDisplayWidth(link: GraphCanvasLink): number {
  return link.kind === "directed"
    ? Math.max(1.8, link.width * 0.72)
    : Math.max(1.35, link.width * 0.58);
}

function linkGradientColors(link: GraphCanvasLink): number[] {
  if (link.kind === "pair") {
    const color = new THREE.Color("#bae6fd");
    return [color.r * 0.68, color.g * 0.68, color.b * 0.68, color.r, color.g, color.b];
  }

  const start = new THREE.Color("#7c2d12");
  const end = new THREE.Color("#fed7aa");
  return [start.r, start.g, start.b, end.r, end.g, end.b];
}

function createLinkObject(link: GraphCanvasLink): LinkObject {
  const group = new THREE.Group() as LinkObject;
  group.userData.edgeId = link.id;
  group.userData.edgeKind = link.kind === "pair" ? "pair-edge" : "directed-edge";
  group.userData.baseOpacity = link.kind === "directed" ? 0.74 : 0.34;
  group.userData.baseWidth = linkDisplayWidth(link);

  const mainGeometry = new LineGeometry();
  mainGeometry.setPositions([0, 0, 0, 0, 0, 0]);
  mainGeometry.setColors(linkGradientColors(link));

  const mainMaterial = new LineMaterial({
    transparent: true,
    opacity: group.userData.baseOpacity,
    linewidth: group.userData.baseWidth,
    vertexColors: true,
    worldUnits: false,
    depthWrite: false,
  });

  const mainLine = new Line2(mainGeometry, mainMaterial);
  mainLine.renderOrder = 1;
  mainLine.userData.edgeId = link.id;
  mainLine.userData.edgeKind = group.userData.edgeKind;
  group.add(mainLine);
  group.userData.mainLine = mainLine;

  return group;
}

function updateLine2(line: Line2, start: THREE.Vector3, end: THREE.Vector3) {
  const geometry = line.geometry as LineGeometry;
  geometry.setPositions([start.x, start.y, start.z, end.x, end.y, end.z]);
  geometry.computeBoundingSphere();

  const material = line.material as LineMaterial;
  material.resolution.set(window.innerWidth, window.innerHeight);
}

function trimLinkToNodeDiscs(
  group: LinkObject,
  coords: { start: { x: number; y: number; z: number }; end: { x: number; y: number; z: number } },
  link: GraphCanvasLink,
): boolean {
  const sourceNode = link.source as unknown as GraphCanvasNode;
  const targetNode = link.target as unknown as GraphCanvasNode;
  const startRadius = nodeDiscSize(sourceNode) * 0.43;
  const endRadius = nodeDiscSize(targetNode) * 0.43;

  const dx = coords.end.x - coords.start.x;
  const dy = coords.end.y - coords.start.y;
  const dz = coords.end.z - coords.start.z;
  const lineLength = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (!Number.isFinite(lineLength) || lineLength <= startRadius + endRadius + 1) {
    return false;
  }

  const startT = startRadius / lineLength;
  const endT = 1 - endRadius / lineLength;
  const trimmedStart = new THREE.Vector3(
    coords.start.x + dx * startT,
    coords.start.y + dy * startT,
    coords.start.z + dz * startT,
  );
  const trimmedEnd = new THREE.Vector3(
    coords.start.x + dx * endT,
    coords.start.y + dy * endT,
    coords.start.z + dz * endT,
  );

  if (link.lane !== 0) {
    const side = new THREE.Vector3(-dy, dx, 0);
    if (side.lengthSq() < 0.001) {
      side.copy(LINK_SIDE_FALLBACK);
    }
    side.normalize().multiplyScalar(link.lane * Math.max(7, linkDisplayWidth(link) * 4.2));
    trimmedStart.add(side);
    trimmedEnd.add(side);
  }

  const direction = new THREE.Vector3().subVectors(trimmedEnd, trimmedStart);
  if (direction.length() <= 0.001) {
    return false;
  }

  updateLine2(group.userData.mainLine, trimmedStart, trimmedEnd);
  return true;
}

function setLinkObjectHighlighted(object: LinkObject, highlighted: boolean) {
  const material = object.userData.mainLine.material as LineMaterial;
  material.linewidth = object.userData.baseWidth * (highlighted ? 1.85 : 1);
  material.opacity = Math.min(0.96, object.userData.baseOpacity * (highlighted ? 1.75 : 1));
  material.needsUpdate = true;
  object.userData.mainLine.renderOrder = highlighted ? 6 : 1;
}

function setGraphCursor(container: HTMLDivElement, cursor: string) {
  container.style.cursor = cursor;
  const canvas = container.querySelector("canvas");
  if (canvas) {
    canvas.style.cursor = cursor;
  }
}

function linkHoverLabel(link: GraphCanvasLink): string {
  if (link.kind === "pair") {
    const raw = link.raw as NovelGraphPairEdge;
    const summary = raw.summary?.trim() ? raw.summary.trim() : "暂无摘要";
    const title = link.label || raw.type || "对等关系";
    return `<div style="max-width:320px;padding:6px 8px;line-height:1.45"><strong>${title}</strong><div style="opacity:.82;margin-top:4px">${summary}</div></div>`;
  }

  const raw = link.raw as NovelGraphDirectedEdge;
  const summary = raw.summary?.trim() ? raw.summary.trim() : "暂无摘要";
  const title = link.label || raw.display_relation || "单向关系";
  return `<div style="max-width:320px;padding:6px 8px;line-height:1.45"><strong>${title}</strong><div style="opacity:.82;margin-top:4px">${summary}</div></div>`;
}

export default function ForceGraph3DCanvas({
  graphData,
  focusRequest = null,
  onNodeClick,
  onLinkClick,
  onStageClick,
}: ForceGraph3DCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<any>(null);
  const onNodeClickRef = useRef(onNodeClick);
  const onLinkClickRef = useRef(onLinkClick);
  const onStageClickRef = useRef(onStageClick);
  const graphPayload = useMemo(() => graphData, [graphData]);

  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
    onLinkClickRef.current = onLinkClick;
    onStageClickRef.current = onStageClick;
  }, [onLinkClick, onNodeClick, onStageClick]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const graph = new ForceGraph3D(container, {
      controlType: "orbit",
    }) as any;
    graphRef.current = graph;
    let isPointerDown = false;
    let activePointerButton = -1;
    let highlightedLinkObject: LinkObject | null = null;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const controls = graph.controls?.();

    if (controls) {
      controls.enablePan = true;
      controls.enableZoom = true;
      controls.enableRotate = true;
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.rotateSpeed = 0.88;
      controls.zoomSpeed = 0.95;
      controls.panSpeed = 0.92;
      controls.screenSpacePanning = true;
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.ROTATE,
      };
      controls.touches = {
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN,
      };
      controls.update?.();
    }

    const updateCursorFromPointer = (event: PointerEvent) => {
      const canvas = container.querySelector("canvas");
      const scene = graph.scene?.();
      const camera = graph.camera?.();
      if (!canvas || !scene || !camera) {
        setGraphCursor(container, isPointerDown && activePointerButton !== 1 ? "grabbing" : "default");
        return;
      }

      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      raycaster.params.Line2 = { threshold: 5 };

      const intersections = raycaster.intersectObjects(scene.children, true);
      if (intersections.some((intersection) => Boolean(intersection.object.userData.nodeId))) {
        setGraphCursor(container, "pointer");
        return;
      }

      if (intersections.some((intersection) => Boolean(intersection.object.userData.edgeId))) {
        setGraphCursor(container, "help");
        return;
      }

      setGraphCursor(container, isPointerDown && activePointerButton !== 1 ? "grabbing" : "default");
    };

    const updateCursorAfterGraph = (event: PointerEvent) => {
      updateCursorFromPointer(event);
      window.requestAnimationFrame(() => updateCursorFromPointer(event));
    };

    graph
      .backgroundColor("rgba(0,0,0,0)")
      .graphData(graphPayload)
      .nodeThreeObject((node: GraphCanvasNode) => makeNodeObject(node))
      .nodeLabel(() => "")
      .linkLabel((link: GraphCanvasLink) => linkHoverLabel(link))
      .linkThreeObject((link: GraphCanvasLink) => createLinkObject(link))
      .linkColor((link: GraphCanvasLink) => link.color)
      .linkWidth((link: GraphCanvasLink) => link.width)
      .linkOpacity(0.42)
      .linkHoverPrecision(10)
      .linkPositionUpdate((object: LinkObject, coords: any, link: GraphCanvasLink) =>
        trimLinkToNodeDiscs(object, coords, link),
      )
      .linkDirectionalArrowLength(0)
      .linkDirectionalArrowRelPos(1)
      .linkDirectionalParticles(0)
      .enableNodeDrag(true)
      .enableNavigationControls(true)
      .showNavInfo(false)
      .onNodeClick((node: GraphCanvasNode) => onNodeClickRef.current(node.id))
      .onLinkClick((link: GraphCanvasLink) =>
        onLinkClickRef.current(link.id, link.kind === "pair" ? "pair-edge" : "directed-edge"),
      )
      .onLinkHover((link: GraphCanvasLink | null) => {
        if (highlightedLinkObject) {
          setLinkObjectHighlighted(highlightedLinkObject, false);
          highlightedLinkObject = null;
        }

        const scene = graph.scene?.();
        if (!link || !scene) {
          return;
        }

        scene.traverse((object: THREE.Object3D) => {
          if (highlightedLinkObject) {
            return;
          }

          const candidate = object as Partial<LinkObject>;
          if (candidate.userData?.edgeId === link.id && candidate.userData.mainLine) {
            highlightedLinkObject = candidate as LinkObject;
            setLinkObjectHighlighted(highlightedLinkObject, true);
          }
        });
      })
      .onBackgroundClick(() => onStageClickRef.current());

    const handlePointerDown = (event: PointerEvent) => {
      isPointerDown = true;
      activePointerButton = event.button;
      updateCursorAfterGraph(event);
    };
    const handlePointerUp = (event: PointerEvent) => {
      isPointerDown = false;
      activePointerButton = -1;
      updateCursorAfterGraph(event);
    };
    const handlePointerMove = (event: PointerEvent) => {
      updateCursorAfterGraph(event);
    };
    const handlePointerLeave = () => {
      isPointerDown = false;
      activePointerButton = -1;
      setGraphCursor(container, "default");
    };
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    container.addEventListener("pointerdown", handlePointerDown, true);
    container.addEventListener("pointermove", handlePointerMove, true);
    container.addEventListener("pointerleave", handlePointerLeave);
    container.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    setGraphCursor(container, "default");

    const preciseGraph = graphData.source === "precise";
    graph.d3Force(
      "collide",
      forceCollide<GraphCanvasNode>((node) =>
        Math.max(
          preciseGraph ? 16 : 12,
          node.val * (preciseGraph ? 3.05 : 2.85) +
            (node.degree === 0 ? (preciseGraph ? 8 : 14) : 4),
        ),
      )
        .strength(preciseGraph ? 0.92 : 0.95)
        .iterations(preciseGraph ? 4 : 3),
    );
    graph.d3Force(
      "x",
      forceX<GraphCanvasNode>((node) => node.targetX).strength((node) =>
        preciseGraph ? (node.degree === 0 ? 0.22 : 0.2) : node.degree === 0 ? 0.24 : 0.17,
      ),
    );
    graph.d3Force(
      "y",
      forceY<GraphCanvasNode>((node) => node.targetY).strength((node) =>
        preciseGraph ? (node.degree === 0 ? 0.22 : 0.2) : node.degree === 0 ? 0.24 : 0.17,
      ),
    );
    graph.d3Force(
      "z",
      forceZ<GraphCanvasNode>((node) => node.targetZ).strength((node) =>
        preciseGraph ? (node.degree === 0 ? 0.15 : 0.18) : node.degree === 0 ? 0.16 : 0.15,
      ),
    );
    graph.d3Force("charge")?.strength?.((node: GraphCanvasNode) =>
      preciseGraph
        ? -(52 + node.val * node.val * 1.75 + (node.degree === 0 ? 22 : 12))
        : -(58 + node.val * node.val * 1.95 + (node.degree === 0 ? 38 : 16)),
    );
    graph.d3Force("link")?.distance?.((link: GraphCanvasLink) => link.distance);
    graph.d3Force("link")?.strength?.((link: GraphCanvasLink) =>
      preciseGraph
        ? link.kind === "directed"
          ? 0.36
          : 0.54
        : link.kind === "directed"
          ? 0.28
          : 0.44,
    );
    graph.d3VelocityDecay?.(preciseGraph ? 0.32 : 0.3);
    graph.d3AlphaDecay?.(preciseGraph ? 0.04 : 0.035);
    graph.cameraPosition({ x: 0, y: 0, z: preciseGraph ? 500 : 515 }, undefined, 800);

    const handleResize = () => {
      const rect = container.getBoundingClientRect();
      graph.width(rect.width).height(rect.height);
    };
    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      container.removeEventListener("pointerdown", handlePointerDown, true);
      container.removeEventListener("pointermove", handlePointerMove, true);
      container.removeEventListener("pointerleave", handlePointerLeave);
      container.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("resize", handleResize);
      graph._destructor?.();
      graphRef.current = null;
    };
  }, [graphPayload]);

  useEffect(() => {
    if (!focusRequest || !graphRef.current) {
      return;
    }

    const node = graphData.nodes.find((item) => item.id === focusRequest.nodeId);
    if (!node) {
      return;
    }

    const x = node.x ?? node.targetX;
    const y = node.y ?? node.targetY;
    const z = node.z ?? node.targetZ;
    graphRef.current.cameraPosition(
      {
        x: x + 20,
        y: y + 26,
        z: z + (node.source === "precise" ? 190 : 198),
      },
      { x, y, z },
      900,
    );
  }, [focusRequest, graphData.nodes]);

  return <div ref={containerRef} className="h-full w-full" />;
}
