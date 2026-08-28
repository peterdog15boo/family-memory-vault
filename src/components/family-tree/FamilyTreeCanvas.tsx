"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { Baby, Heart, Minus, Plus, RotateCcw, UserPlus, Users } from "lucide-react";
import { PersonAvatar } from "@/components/people/PersonAvatar";
import type { FamilyTreePersonCover } from "@/components/family-tree/types";
import {
  computeFamilyTreeLayout,
  TREE_LAYOUT,
  treeNodeInitials,
} from "@/lib/family-tree/layout";
import { showsStepChildHint } from "@/lib/family-tree/genealogy-iq";
import { isFamilyTreeRelationType } from "@/lib/family-tree/relations";
import type { SerializedFamilyTreeGraph } from "@/lib/family-tree/serialize";
import { cn } from "@/lib/utils";

type Props = {
  tree: SerializedFamilyTreeGraph;
  coverByPersonId: Map<string, FamilyTreePersonCover>;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onAddParent: (childId: string) => void;
  onAddChild: (parentId: string) => void;
  onAddPartner: (nodeId: string) => void;
  onAddSibling: (nodeId: string) => void;
  /** Hide edit chrome — pan/zoom only. */
  viewOnly?: boolean;
  /**
   * Bump to force fit-to-view after a layout correction pass
   * (positions are recomputed from relationships; this recenters the camera).
   */
  layoutRevision?: number;
  className?: string;
};

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.4;

/**
 * Zoomable / pannable family tree with soft branch curves and circular nodes.
 */
export function FamilyTreeCanvas({
  tree,
  coverByPersonId,
  selectedNodeId,
  onSelectNode,
  onAddParent,
  onAddChild,
  onAddPartner,
  onAddSibling,
  viewOnly = false,
  layoutRevision = 0,
  className,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.9);
  const [pan, setPan] = useState({ x: 24, y: 16 });
  const scaleRef = useRef(scale);
  const panRef = useRef(pan);
  scaleRef.current = scale;
  panRef.current = pan;

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const pinchRef = useRef<{
    startDist: number;
    startScale: number;
    originPan: { x: number; y: number };
    midX: number;
    midY: number;
  } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const hasFittedRef = useRef(false);
  const prevNodeCountRef = useRef(0);

  const layout = useMemo(() => {
    // Same source as the person dialog: tree.relationships only.
    const edges = tree.relationships
      .filter((r) => isFamilyTreeRelationType(r.type))
      .map((r) => ({
        id: r.id,
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
  }, [tree.nodes, tree.relationships]);

  useEffect(() => {
    if (!layout.edgeVerification.ok) {
      console.warn("[family-tree.canvas] edge projection mismatch", {
        relationshipCount: layout.edgeVerification.relationshipCount,
        renderedEdgeCount: layout.edgeVerification.renderedEdgeCount,
        missing: layout.edgeVerification.relationshipsWithoutConnector,
      });
    }
  }, [layout.edgeVerification]);

  const nodeById = useMemo(
    () => new Map(tree.nodes.map((n) => [n.id, n])),
    [tree.nodes],
  );

  const stepChildIds = useMemo(() => {
    const edges = tree.relationships.map((r) => ({
      fromNodeId: r.fromNodeId,
      toNodeId: r.toNodeId,
      type: r.type,
    }));
    const ids = new Set<string>();
    for (const node of tree.nodes) {
      if (showsStepChildHint(edges, node.id)) ids.add(node.id);
    }
    return ids;
  }, [tree.nodes, tree.relationships]);

  /** Ex partners when that person also has a current partner (readable chrome). */
  const formerPartnerIds = useMemo(() => {
    const currentOf = new Map<string, Set<string>>();
    const formerOf = new Map<string, Set<string>>();
    for (const r of tree.relationships) {
      if (r.type !== "partner_of") continue;
      const status = r.partnerStatus === "former" ? "former" : "current";
      const bump = (map: Map<string, Set<string>>, a: string, b: string) => {
        const set = map.get(a) ?? new Set<string>();
        set.add(b);
        map.set(a, set);
      };
      if (status === "former") {
        bump(formerOf, r.fromNodeId, r.toNodeId);
        bump(formerOf, r.toNodeId, r.fromNodeId);
      } else {
        bump(currentOf, r.fromNodeId, r.toNodeId);
        bump(currentOf, r.toNodeId, r.fromNodeId);
      }
    }
    const ids = new Set<string>();
    for (const [personId, formers] of formerOf) {
      if ((currentOf.get(personId)?.size ?? 0) === 0) continue;
      for (const exId of formers) ids.add(exId);
    }
    return ids;
  }, [tree.relationships]);

  const selectedHasPartner = useMemo(() => {
    if (!selectedNodeId) return false;
    return tree.relationships.some(
      (r) =>
        r.type === "partner_of" &&
        (r.fromNodeId === selectedNodeId || r.toNodeId === selectedNodeId),
    );
  }, [selectedNodeId, tree.relationships]);

  const clampZoom = useCallback((z: number) => {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
  }, []);

  const applyZoomAt = useCallback(
    (nextScale: number, mx: number, my: number) => {
      const prev = scaleRef.current;
      const next = clampZoom(nextScale);
      if (next === prev) return;
      const ratio = next / prev;
      const p = panRef.current;
      setPan({
        x: mx - (mx - p.x) * ratio,
        y: my - (my - p.y) * ratio,
      });
      setScale(next);
    },
    [clampZoom],
  );

  const fitToView = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    if (vw < 40 || vh < 40) return;
    const sx = (vw - 40) / Math.max(layout.width, 1);
    const sy = (vh - 40) / Math.max(layout.height, 1);
    const next = clampZoom(Math.min(sx, sy, 1));
    setScale(next);
    setPan({
      x: (vw - layout.width * next) / 2,
      y: Math.max(12, (vh - layout.height * next) / 2),
    });
  }, [clampZoom, layout.height, layout.width]);

  // Fit once when the canvas first has content.
  useEffect(() => {
    if (layout.nodes.length === 0) {
      hasFittedRef.current = false;
      prevNodeCountRef.current = 0;
      return;
    }
    if (hasFittedRef.current) return;
    fitToView();
    hasFittedRef.current = true;
    prevNodeCountRef.current = layout.nodes.length;
  }, [fitToView, layout.nodes.length]);

  // When the tree grows, soft-recenter so new parents/children aren't off-screen.
  useEffect(() => {
    if (!hasFittedRef.current) return;
    if (layout.nodes.length > prevNodeCountRef.current) {
      fitToView();
    }
    prevNodeCountRef.current = layout.nodes.length;
  }, [fitToView, layout.nodes.length]);

  // Layout correction / explicit "Fix tree layout" — re-fit camera to reflow.
  const prevLayoutRevisionRef = useRef(layoutRevision);
  useEffect(() => {
    if (layoutRevision === prevLayoutRevisionRef.current) return;
    prevLayoutRevisionRef.current = layoutRevision;
    if (layout.nodes.length === 0) return;
    fitToView();
  }, [fitToView, layout.nodes.length, layoutRevision]);

  useEffect(() => {
    setAddMenuOpen(false);
  }, [selectedNodeId]);

  // Pinch-zoom (mobile).
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    function touchDist(a: Touch, b: Touch) {
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }

    function onTouchStart(event: TouchEvent) {
      const viewport = viewportRef.current;
      if (!viewport) return;
      if (event.touches.length !== 2) {
        pinchRef.current = null;
        return;
      }
      const a = event.touches[0]!;
      const b = event.touches[1]!;
      const rect = viewport.getBoundingClientRect();
      pinchRef.current = {
        startDist: Math.max(1, touchDist(a, b)),
        startScale: scaleRef.current,
        originPan: { ...panRef.current },
        midX: (a.clientX + b.clientX) / 2 - rect.left,
        midY: (a.clientY + b.clientY) / 2 - rect.top,
      };
    }

    function onTouchMove(event: TouchEvent) {
      const pinch = pinchRef.current;
      if (!pinch || event.touches.length !== 2) return;
      event.preventDefault();
      const a = event.touches[0]!;
      const b = event.touches[1]!;
      const dist = Math.max(1, touchDist(a, b));
      const next = pinch.startScale * (dist / pinch.startDist);
      applyZoomAt(next, pinch.midX, pinch.midY);
    }

    function onTouchEnd() {
      if (!pinchRef.current) return;
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [applyZoomAt]);

  function zoomBy(factor: number) {
    const el = viewportRef.current;
    const mx = el ? el.clientWidth / 2 : 0;
    const my = el ? el.clientHeight / 2 : 0;
    applyZoomAt(scaleRef.current * factor, mx, my);
  }

  function onWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    const delta = event.deltaY > 0 ? 0.9 : 1.1;
    applyZoomAt(scaleRef.current * delta, mx, my);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if (pinchRef.current) return;
    const target = event.target as HTMLElement;
    if (
      target.closest(
        "[data-tree-node], [data-tree-add], [data-tree-toolbar], button",
      )
    ) {
      return;
    }
    setAddMenuOpen(false);
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

  const selectedPos = selectedNodeId
    ? layout.nodes.find((n) => n.id === selectedNodeId)
    : undefined;

  const zoomPct = Math.round(scale * 100);

  return (
    <div
      className={cn(
        "family-tree-viewport-shell",
        viewOnly && "family-tree-viewport-shell--view",
        className,
      )}
    >
      <div
        className="family-tree-toolbar"
        data-tree-toolbar
        role="toolbar"
        aria-label="Tree zoom"
      >
        <button
          type="button"
          className="family-tree-tool-btn"
          onClick={() => zoomBy(1.15)}
          aria-label="Zoom in"
        >
          <Plus className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className="family-tree-tool-btn"
          onClick={() => zoomBy(1 / 1.15)}
          aria-label="Zoom out"
        >
          <Minus className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className="family-tree-tool-btn"
          onClick={fitToView}
          aria-label="Reset zoom"
          title="Reset zoom"
        >
          <RotateCcw className="size-4" aria-hidden />
        </button>
        <span className="family-tree-toolbar-pct" aria-live="polite">
          {zoomPct}%
        </span>
        <span className="family-tree-toolbar-hint">
          {viewOnly
            ? "Drag to pan · pinch or scroll to zoom"
            : "Drag to pan · pinch or scroll to zoom · tap a person"}
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
              <g key={edge.id} data-edge-type={edge.type} data-edge-id={edge.id}>
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
                          strokeOpacity: 0.9,
                          strokeWidth: 3.5,
                        }
                      : edge.type === "partner_of"
                        ? {
                            stroke: "#b07d9a",
                            strokeOpacity: 0.95,
                            strokeWidth: 3.25,
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
                  node.needsReview && "family-tree-person-node--needs-review",
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
                aria-label={
                  node.needsReview
                    ? `${displayName} (needs review)`
                    : displayName
                }
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
                {stepChildIds.has(node.id) ? (
                  <span className="family-tree-person-step" title="Step-family">
                    step
                  </span>
                ) : null}
                {formerPartnerIds.has(node.id) ? (
                  <span
                    className="family-tree-person-former"
                    title="Former spouse / partner"
                  >
                    former
                  </span>
                ) : null}
                {node.needsReview ? (
                  <span className="family-tree-person-review" title={node.reviewReason ?? "Needs review"}>
                    Needs review
                  </span>
                ) : null}
              </button>
            );
          })}

          {!viewOnly && selectedPos && selectedNodeId ? (
            <div
              className="family-tree-node-add"
              data-tree-add
              style={{
                left: selectedPos.x + TREE_LAYOUT.nodeWidth / 2,
                top: selectedPos.y + TREE_LAYOUT.nodeHeight - 6,
              }}
            >
              <button
                type="button"
                className="family-tree-node-add-btn"
                aria-expanded={addMenuOpen}
                aria-haspopup="menu"
                onClick={(e) => {
                  e.stopPropagation();
                  setAddMenuOpen((open) => !open);
                }}
              >
                <Plus className="size-3.5" aria-hidden />
                Add
              </button>
              {addMenuOpen ? (
                <div className="family-tree-node-add-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAddMenuOpen(false);
                      onAddParent(selectedNodeId);
                    }}
                  >
                    <UserPlus className="size-3.5" aria-hidden />
                    Parent
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAddMenuOpen(false);
                      onAddChild(selectedNodeId);
                    }}
                  >
                    <Baby className="size-3.5" aria-hidden />
                    Child
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAddMenuOpen(false);
                      onAddPartner(selectedNodeId);
                    }}
                  >
                    <Heart className="size-3.5" aria-hidden />
                    {selectedHasPartner
                      ? "Add another partner"
                      : "Spouse / partner"}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAddMenuOpen(false);
                      onAddSibling(selectedNodeId);
                    }}
                  >
                    <Users className="size-3.5" aria-hidden />
                    Sibling
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
