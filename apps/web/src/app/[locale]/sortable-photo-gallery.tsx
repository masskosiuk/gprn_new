"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  useState,
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
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { GripVertical } from "lucide-react";
import type { GalleryMove } from "../../lib/gallery-order";

type Item = { id: string; title: string; src: string; disabled: boolean };

function SortableTile({
  item,
  child,
  disabled,
  label,
}: {
  item: Item;
  child: ReactElement<HTMLAttributes<HTMLElement>>;
  disabled: boolean;
  label: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    isDragging,
    isOver,
  } = useSortable({ id: item.id, disabled: disabled || item.disabled });
  return cloneElement(child, {
    ref: setNodeRef,
    className: `${child.props.className ?? ""} photo-tile-sortable${isDragging ? " is-dragging" : ""}${isOver && !isDragging ? " is-drop-target" : ""}`,
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
            <GripVertical size={18} aria-hidden="true" />
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
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const tiles = Children.toArray(children);
  async function finish({ active, over }: DragEndEvent) {
    setActive(null);
    if (saving || !over || active.id === over.id) return;
    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === over.id);
    if (from < 0 || to < 0 || items[from]!.disabled || items[to]!.disabled)
      return;
    setSaving(true);
    setError(false);
    setStatus(ru ? "Сохранение порядка…" : "Saving order…");
    try {
      await onMove({
        photoId: String(active.id),
        targetId: String(over.id),
        placement: from < to ? "after" : "before",
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
        collisionDetection={closestCenter}
        onDragStart={({ active }) => {
          const item = items.find((item) => item.id === active.id);
          if (item) {
            setStatus("");
            setActive({
              item,
              width: active.rect.current.initial?.width ?? 240,
            });
          }
        }}
        onDragCancel={() => setActive(null)}
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
          <div className="photo-masonry">
            {tiles.map((child, index) =>
              isValidElement<HTMLAttributes<HTMLElement>>(child) &&
              items[index] ? (
                <SortableTile
                  key={items[index]!.id}
                  item={items[index]!}
                  child={child}
                  disabled={saving}
                  label={ru ? "Переместить работу" : "Move work"}
                />
              ) : (
                child
              ),
            )}
          </div>
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
