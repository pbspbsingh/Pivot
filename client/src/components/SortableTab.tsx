import type React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconGripVertical } from '@tabler/icons-react';

interface SortableTabProps {
  id: string;
  children: React.ReactNode;
}

export function SortableTab({ id, children }: SortableTabProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        display: 'flex',
        alignItems: 'center',
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        cursor: isDragging ? 'grabbing' : undefined,
      }}
    >
      <div
        {...attributes}
        {...listeners}
        style={{ display: 'flex', alignItems: 'center', padding: '0 2px', cursor: 'grab', color: 'var(--mantine-color-dark-3)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <IconGripVertical size={12} />
      </div>
      {children}
    </div>
  );
}
