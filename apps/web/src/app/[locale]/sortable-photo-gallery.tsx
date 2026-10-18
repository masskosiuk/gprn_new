"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  useState,
  useRef,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { GripVertical } from "lucide-react";
import type { GalleryMove } from "../../lib/gallery-order";
import { galleryDropPoint, type DropEdge } from "../../lib/gallery-drop";
import { PhotoMasonry } from "./photo-masonry";

type Item = { id: string; title: string; src: string; disabled: boolean };
type DropTarget = { id: string; placement: "before" | "after"; edge: DropEdge };

function SortableTile({
  item,
  child,
  disabled,
  label,
  drop,
}: {
  item: Item;
  child: ReactElement<HTMLAttributes<HTMLElement>>;
  disabled: boolean;
  label: string;
  drop: DropTarget | null;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } =
    useSortable({ id: item.id, disabled: disabled || item.disabled });
  return cloneElement(child, {
    ref: setNodeRef,
    className: `${child.props.className ?? ""} photo-tile-sortable${isDragging ? " is-dragging" : ""}${drop?.id === item.id && !isDragging ? " is-drop-target" : ""}`,
    "data-drop-edge": drop?.id === item.id ? drop.edge : undefined,
    children: (
      <>
        {child.props.children}
        {!item.disabled && (
          <button
            {...attributes}
            {...listeners}
            ref={setActivatorNodeRef}
            className="photo-drag-handle"
            aria-label={`${label}: ${item.title}`}
            title={label}
            type="button"
            aria-disabled={disabled}
          >
            <GripVertical size={10} aria-hidden="true" />
          </button>
        )}
      </>
    ),
  } as HTMLAttributes<HTMLElement>);
}

export function SortablePhotoGallery({
  items,
  children,
  locale,
  onMove,
}: {
  items: readonly Item[];
  children: ReactNode;
  locale: string;
  onMove: (move: GalleryMove) => Promise<void>;
}) {
  const id = useId();
  const ru = locale === "ru" || locale === "uk";
  const [active, setActive] = useState<{ item: Item; width: number } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [keyboardDrag, setKeyboardDrag] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const dropRef = useRef<DropTarget | null>(null);
  const detect: CollisionDetection = (args) => {
    if (!args.pointerCoordinates) {
      const collisions = closestCenter(args);
      const target = collisions[0];
      if (!target || target.id === args.active.id) {
        dropRef.current = null;
        return target ? [target] : [];
      }
      const from = items.findIndex((item) => item.id === args.active.id);
      const to = items.findIndex((item) => item.id === target?.id);
      dropRef.current = target
        ? {
            id: String(target.id),
            placement: from < to ? "after" : "before",
            edge: from < to ? "bottom" : "top",
          }
        : null;
      return target ? [target] : [];
    }
    let best: { target: DropTarget; distance: number } | null = null;
    for (const container of args.droppableContainers) {
      if (container.id === args.active.id || container.disabled) continue;
      const rect = args.droppableRects.get(container.id);
      if (!rect) continue;
      const point = galleryDropPoint(args.pointerCoordinates, rect);
      if (!best || point.distance < best.distance)
        best = {
          target: {
            id: String(container.id),
            placement: point.placement,
            edge: point.edge,
          },
          distance: point.distance,
        };
    }
    dropRef.current = best?.target ?? null;
    return best ? [{ id: best.target.id }] : [];
  };
  function showDrop() {
    const next = dropRef.current;
    setDrop((current) =>
      current?.id === next?.id && current?.edge === next?.edge ? current : next,
    );
  }
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const tiles = Children.toArray(children);
  async function finish({ active, over }: DragEndEvent) {
    setActive(null);
    const target = drop;
    const targetId = target?.id ?? over?.id;
    setDrop(null);
    dropRef.current = null;
    if (saving || !targetId || active.id === targetId) return;
    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0 || items[from]!.disabled || items[to]!.disabled)
      return;
    setSaving(true);
    setError(false);
    setStatus(ru ? "Сохранение порядка…" : "Saving order…");
    try {
      await onMove({
        photoId: String(active.id),
        targetId: String(targetId),
        placement:
          target?.id === targetId
            ? target.placement
            : from < to
              ? "after"
              : "before",
      });
      setStatus(ru ? "Порядок сохранён" : "Order saved");
    } catch {
      setError(true);
      setStatus(
        ru
          ? "Не удалось сохранить порядок. Перестановка отменена, попробуйте ещё раз."
          : "Could not save the order. The move was reverted; please try again.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="sortable-photo-gallery" aria-busy={saving}>
      <DndContext
        id={id}
        sensors={sensors}
        autoScroll={!keyboardDrag}
        collisionDetection={detect}
        onDragMove={showDrop}
        onDragOver={showDrop}
        onDragStart={({ active, activatorEvent }) => {
          setKeyboardDrag(activatorEvent.type === "keydown");
          const item = items.find((item) => item.id === active.id);
          if (item) {
            setStatus("");
            setActive({
              item,
              width: active.rect.current.initial?.width ?? 240,
            });
          }
        }}
        onDragCancel={() => {
          setActive(null);
          setDrop(null);
          dropRef.current = null;
        }}
        onDragEnd={(event) => void finish(event)}
        accessibility={{
          screenReaderInstructions: {
            draggable: ru
              ? "Нажмите пробел, чтобы взять работу. Перемещайте стрелками, снова нажмите пробел, чтобы сохранить. Escape отменяет перенос."
              : "Press Space to pick up a work. Move with the arrow keys and press Space again to save. Escape cancels.",
          },
        }}
      >
        <SortableContext
          items={items.map((item) => item.id)}
          strategy={rectSortingStrategy}
        >
          <PhotoMasonry>
            {tiles.map((child, index) =>
              isValidElement<HTMLAttributes<HTMLElement>>(child) &&
              items[index] ? (
                <SortableTile
                  key={items[index]!.id}
                  item={items[index]!}
                  child={child}
                  disabled={saving}
                  label={ru ? "Переместить работу" : "Move work"}
                  drop={drop}
                />
              ) : (
                child
              ),
            )}
          </PhotoMasonry>
        </SortableContext>
        {typeof document !== "undefined" &&
          createPortal(
            <DragOverlay dropAnimation={null}>
              {active ? (
                <div
                  className="photo-drag-preview"
                  style={{ width: active.width }}
                >
                  <img src={active.item.src} alt={active.item.title} />
                </div>
              ) : null}
            </DragOverlay>,
            document.body,
          )}
      </DndContext>
      <p
        className={`gallery-order-status${error ? " is-error" : ""}`}
        role="status"
        aria-live="polite"
      >
        {status}
      </p>
    </div>
  );
}
