"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  GripVertical,
  Pencil,
  Check,
  X,
  Trash2,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  deleteFormQuestion,
  reorderFormQuestions,
  upsertFormQuestion,
} from "@/app/actions/hr-candidate-forms";
import type {
  CandidateFormQuestion,
  FormResponseType,
} from "@/lib/queries/hr-candidate-forms-types";

/**
 * Question editor for one candidate form. Drag to reorder, rename
 * inline, pick Y/N or Text per row, Active toggle, delete. Same shape
 * as the dispatcher interview-questions admin from Pass D — the two
 * could be unified into one shared component later if more forms get
 * added.
 */
export function FormQuestionsAdmin({
  formId,
  questions,
}: {
  formId: string;
  questions: CandidateFormQuestion[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [order, setOrder] = useState<CandidateFormQuestion[]>(questions);

  const lastRef = useRef(questions);
  if (lastRef.current !== questions) {
    lastRef.current = questions;
    if (
      questions.length !== order.length ||
      questions.some(
        (q, i) => q.id !== order[i]?.id || q.prompt !== order[i]?.prompt,
      )
    ) {
      setOrder(questions);
    }
  }

  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  function commitOrder(next: CandidateFormQuestion[]) {
    setOrder(next);
    startTransition(async () => {
      const res = await reorderFormQuestions({
        ordered_ids: next.map((q) => q.id),
      });
      if (!res.ok) {
        toast.error(res.error);
        router.refresh();
        return;
      }
      router.refresh();
    });
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    const fromIdx = order.findIndex((q) => q.id === dragId);
    const toIdx = order.findIndex((q) => q.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const next = order.slice();
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setDragId(null);
    setDragOverId(null);
    commitOrder(next);
  }

  return (
    <div className="space-y-3">
      <AddQuestionRow
        formId={formId}
        nextSortOrder={
          (order.reduce((m, q) => Math.max(m, q.sort_order), 0) || 0) + 10
        }
        onAdded={() => router.refresh()}
      />
      <div className="rounded-md border divide-y bg-card">
        {order.map((q) => (
          <QuestionRow
            key={q.id}
            question={q}
            isDragging={dragId === q.id}
            isDragOver={dragOverId === q.id && dragId !== q.id}
            onDragStart={() => setDragId(q.id)}
            onDragEnter={() => {
              if (dragId && dragId !== q.id) setDragOverId(q.id);
            }}
            onDragEnd={() => {
              setDragId(null);
              setDragOverId(null);
            }}
            onDrop={() => handleDrop(q.id)}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Questions appear in order on the public form. Yes/No questions
        render as a tri-state chip (Yes / No / —); text questions as a
        textarea. Toggle <strong>active</strong> off to retire a question
        without losing past answers.
      </p>
    </div>
  );
}

interface RowProps {
  question: CandidateFormQuestion;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}

function QuestionRow({
  question,
  isDragging,
  isDragOver,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
}: RowProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState(question.prompt);

  const lastRef = useRef(question);
  if (lastRef.current !== question) {
    lastRef.current = question;
    if (!editing) setPrompt(question.prompt);
  }

  function patch(
    fields: Partial<
      Pick<CandidateFormQuestion, "prompt" | "response_type" | "active">
    >,
  ) {
    startTransition(async () => {
      const res = await upsertFormQuestion({
        id: question.id,
        form_id: question.form_id,
        prompt: fields.prompt ?? question.prompt,
        response_type:
          (fields.response_type ?? question.response_type) as FormResponseType,
        sort_order: question.sort_order,
        active: fields.active ?? question.active,
        required: question.required,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  function savePrompt() {
    const trimmed = prompt.trim();
    if (!trimmed) {
      toast.error("Prompt cannot be empty.");
      return;
    }
    if (trimmed === question.prompt) {
      setEditing(false);
      return;
    }
    patch({ prompt: trimmed });
    setEditing(false);
  }

  function handleDelete() {
    if (
      !confirm(
        `Delete "${question.prompt}"? Historical answers to this question will be removed.`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteFormQuestion({ question_id: question.id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Deleted.");
      router.refresh();
    });
  }

  return (
    <div
      draggable={!editing}
      onDragStart={(e) => {
        if (editing) return;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", question.id);
        onDragStart();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDragEnter={onDragEnter}
      onDragEnd={onDragEnd}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      className={cn(
        "flex items-center gap-2 px-3 py-2 transition-colors",
        isDragging && "opacity-40",
        isDragOver && "bg-muted/60",
      )}
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        className={cn(
          "h-7 w-6 inline-flex items-center justify-center text-muted-foreground/70 hover:text-foreground",
          editing
            ? "cursor-not-allowed opacity-30"
            : "cursor-grab active:cursor-grabbing",
        )}
        tabIndex={-1}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <select
        value={question.response_type}
        onChange={(e) =>
          patch({ response_type: e.currentTarget.value as FormResponseType })
        }
        disabled={pending || editing}
        className="h-7 rounded-md border bg-background text-[11px] uppercase tracking-wider px-1.5 disabled:opacity-50"
        title="Response type"
      >
        <option value="yn">Y/N</option>
        <option value="text">Text</option>
      </select>

      <div className="flex-1 min-w-0">
        {editing ? (
          <Input
            value={prompt}
            onChange={(e) => setPrompt(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                savePrompt();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setPrompt(question.prompt);
                setEditing(false);
              }
            }}
            autoFocus
            disabled={pending}
            className="h-8"
          />
        ) : (
          <span className="text-sm">{question.prompt}</span>
        )}
      </div>

      <button
        type="button"
        onClick={() => patch({ active: !question.active })}
        disabled={pending || editing}
        aria-pressed={question.active}
        className={cn(
          "inline-flex items-center h-6 px-2 rounded-full text-[10px] font-medium uppercase tracking-wider transition-colors disabled:opacity-50",
          question.active
            ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300"
            : "bg-muted text-muted-foreground hover:bg-muted/70",
        )}
      >
        {question.active ? "active" : "inactive"}
      </button>

      <div className="inline-flex gap-0.5">
        {editing ? (
          <>
            <button
              type="button"
              onClick={savePrompt}
              disabled={pending}
              aria-label="Save"
              className="inline-flex items-center justify-center h-7 w-7 rounded-md text-emerald-700 hover:text-emerald-800 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-900/40 transition-colors disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setPrompt(question.prompt);
                setEditing(false);
              }}
              disabled={pending}
              aria-label="Cancel"
              className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={pending}
            aria-label="Edit"
            className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending || editing}
          aria-label="Delete"
          className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted transition-colors disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function AddQuestionRow({
  formId,
  nextSortOrder,
  onAdded,
}: {
  formId: string;
  nextSortOrder: number;
  onAdded: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [type, setType] = useState<FormResponseType>("text");
  const [pending, startTransition] = useTransition();

  function submit() {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const res = await upsertFormQuestion({
        form_id: formId,
        prompt: trimmed,
        response_type: type,
        sort_order: nextSortOrder,
        active: true,
        required: false,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Added "${trimmed}".`);
      setPrompt("");
      onAdded();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={type}
        onChange={(e) => setType(e.currentTarget.value as FormResponseType)}
        disabled={pending}
        className="h-9 rounded-md border bg-background text-[11px] uppercase tracking-wider px-2"
      >
        <option value="yn">Y/N</option>
        <option value="text">Text</option>
      </select>
      <Input
        placeholder="Add a question…"
        value={prompt}
        onChange={(e) => setPrompt(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        disabled={pending}
        className="h-9 flex-1"
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending || !prompt.trim()}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
      >
        <Plus className="h-4 w-4" />
        Add
      </button>
    </div>
  );
}
