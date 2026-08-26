"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { PersonAvatar } from "@/components/people/PersonAvatar";
import type { FamilyTreePersonCover } from "@/components/family-tree/types";
import {
  computeFamilyTreeLayout,
  TREE_LAYOUT,
  treeNodeInitials,
  type GhostParentSlot,
} from "@/lib/family-tree/layout";
import { isFamilyTreeRelationType } from "@/lib/family-tree/relations";
import type { SerializedFamilyTreeGraph } from "@/lib/family-tree/serialize";
import { cn } from "@/lib/utils";

type Props = {
  tree: SerializedFamilyTreeGraph;
  coverByPersonId: Map<string, FamilyTreePersonCover>;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onAddParentSlot: (childId: string) => void;
  /** Hide edit ghosts / selection chrome — pan/zoom only. */
  viewOnly?: boolean;
  className?: string;
};

const MIN_ZOOM = 0.45;
const MAX_ZOOM = 2.2;

/**
 * Zoomable / pannable family tree with soft branch curves and circular nodes.
 */
export function FamilyTreeCanvas({
  tree,
  coverByPersonId,
  selectedNodeId,
  onSelectNode,
  onAddParentSlot,
  viewOnly = false,
  className,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.9);
  const [pan, setPan] = useState({ x: 24, y: 16 });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const layout = useMemo(() => {
    const edges = tree.relationships
      .filter((r) => isFamilyTreeRelationType(r.type))
      .map((r) => ({
        fromNodeId: r.fromNodeId,
        toNodeId: r.toNodeId,
        type: r.type,
      }));
    return computeFamilyTreeLayout(
      tree.nodes.map((n) => ({
        id: n.id,
        generation: n.generation,
        label: n.label,
      })),
      edges,
    );
  }, [tree]);

  const nodeById = useMemo(
    () => new Map(tree.nodes.map((n) => [n.id, n])),
    [tree.nodes],
  );

  const fitToView = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    if (vw < 40 || vh < 40) return;
    const sx = (vw - 32) / layout.width;
    const sy = (vh - 32) / layout.height;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(sx, sy, 1)));
    setScale(next);
    setPan({
      x: (vw - layout.width * next) / 2,
      y: Math.max(12, (vh - layout.height * next) / 2),
    });
  }, [layout.height, layout.width]);

  useEffect(() => {
    fitToView();
  }, [fitToView]);

  function clampZoom(z: number) {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
  }

  function onWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    const delta = event.deltaY > 0 ? 0.9 : 1.1;
    const next = clampZoom(scale * delta);
    const ratio = next / scale;
    setPan({
      x: mx - (mx - pan.x) * ratio,
      y: my - (my - pan.y) * ratio,
    });
    setScale(next);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-tree-node], [data-tree-ghost], button")) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPanning(true);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    setPan({ x: drag.originX + dx, y: drag.originY + dy });
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsPanning(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  }

  return (
    <div
      className={cn(
        "family-tree-viewport-shell",
        viewOnly && "family-tree-viewport-shell--view",
        className,
      )}
    >
      <div className="family-tree-toolbar" role="toolbar" aria-label="Tree view">
        <button
          type="button"
          className="family-tree-tool-btn"
          onClick={() => setScale((z) => clampZoom(z * 1.15))}
          aria-label="Zoom in"
        >
          <Plus className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className="family-tree-tool-btn"
          onClick={() => setScale((z) => clampZoom(z / 1.15))}
          aria-label="Zoom out"
        >
          <Minus className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className="family-tree-tool-btn"
          onClick={fitToView}
          aria-label="Fit tree"
        >
          <RotateCcw className="size-4" aria-hidden />
        </button>
        <span className="family-tree-toolbar-hint">
          {viewOnly
            ? "Drag to pan · scroll to zoom"
            : "Drag to pan · scroll to zoom · tap a person to edit"}
        </span>
      </div>

      <div
        ref={viewportRef}
        className={cn(
          "family-tree-viewport",
          isPanning && "family-tree-viewport--panning",
        )}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="family-tree-world"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          }}
        >
          <svg
            className="family-tree-branches"
            width={layout.width}
            height={layout.height}
            aria-hidden
          >
            {layout.edges.map((edge) => (
              <g key={edge.id}>
                <path
                  d={edge.path}
                  className={cn(
                    "family-tree-branch",
                    edge.type === "partner_of" && "family-tree-branch--partner",
                    edge.emphasis === "relation" &&
                      "family-tree-branch--relation",
                  )}
                  style={
                    edge.type === "parent_of"
                      ? {
                          stroke: "#a67c52",
                          strokeOpacity: 0.85,
                          strokeWidth: 3.5,
                        }
                      : undefined
                  }
                  fill="none"
                />
                {edge.label &&
                edge.labelX != null &&
                edge.labelY != null ? (
                  <g
                    className="family-tree-edge-label"
                    transform={`translate(${edge.labelX}, ${edge.labelY})`}
                  >
                    <rect
                      x={-edge.label.length * 3.2 - 6}
                      y={-8}
                      width={edge.label.length * 6.4 + 12}
                      height={16}
                      rx={8}
                    />
                    <text textAnchor="middle" dominantBaseline="central">
                      {edge.label}
                    </text>
                  </g>
                ) : null}
              </g>
            ))}
          </svg>

          {!viewOnly
            ? layout.ghosts.map((ghost) => (
                <GhostSlot
                  key={ghost.id}
                  ghost={ghost}
                  onClick={() => onAddParentSlot(ghost.childId)}
                />
              ))
            : null}

          {layout.nodes.map((pos) => {
            const node = nodeById.get(pos.id);
            if (!node) return null;
            const cover = node.personId
              ? coverByPersonId.get(node.personId)
              : null;
            const displayName = node.person?.displayName ?? node.label;
            return (
              <button
                key={node.id}
                type="button"
                data-tree-node={node.id}
                className={cn(
                  "family-tree-person-node",
                  !viewOnly &&
                    selectedNodeId === node.id &&
                    "family-tree-person-node--selected",
                  node.isPlaceholder && "family-tree-person-node--placeholder",
                  viewOnly && "family-tree-person-node--view",
                )}
                style={{
                  left: pos.x,
                  top: pos.y,
                  width: TREE_LAYOUT.nodeWidth,
                }}
                onClick={() => {
                  if (viewOnly) return;
                  onSelectNode(node.id);
                }}
                aria-label={displayName}
                aria-expanded={
                  viewOnly ? undefined : selectedNodeId === node.id
                }
                tabIndex={viewOnly ? -1 : 0}
              >
                <span className="family-tree-person-avatar">
                  {cover?.previewUrl ? (
                    <PersonAvatar
                      previewUrl={cover.previewUrl}
                      boundingBox={cover.boundingBox}
                      framing={cover.framing}
                      alt=""
                      className="size-full"
                    />
                  ) : (
                    <span className="family-tree-person-initials" aria-hidden>
                      {treeNodeInitials(displayName)}
                    </span>
                  )}
                </span>
                <span className="family-tree-person-name">{displayName}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function GhostSlot({
  ghost,
  onClick,
}: {
  ghost: GhostParentSlot;
  onClick: () => void;
}) {
  const labelId = useId();
  return (
    <button
      type="button"
      data-tree-ghost={ghost.id}
      className="family-tree-ghost-slot"
      style={{ left: ghost.x, top: ghost.y }}
      onClick={onClick}
      aria-labelledby={labelId}
    >
      <span className="family-tree-ghost-ring" aria-hidden>
        +
      </span>
      <span id={labelId} className="family-tree-ghost-label">
        Add parent
      </span>
    </button>
  );
}
