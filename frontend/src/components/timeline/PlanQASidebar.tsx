import { Bot, Loader2, Send, Sparkles, X } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";

import {
  applyPlanEditorPatch,
  askPlanEditor,
  type EditorAgentResponse,
  type PlanPatch,
  type PlanQAChatMessage,
  type PlanQASuggestedAction,
  type PlanQAUsedContext,
} from "@/lib/api";
import type { Project } from "@/lib/projects";
import { cn } from "@/lib/utils";

export interface PlanQAMessage extends PlanQAChatMessage {
  id: string;
  used_context?: PlanQAUsedContext;
  suggested_actions?: PlanQASuggestedAction[];
  confidence?: "high" | "medium" | "low";
  response_type?: EditorAgentResponse["response_type"];
  proposed_patch?: PlanPatch | null;
  validation_result?: EditorAgentResponse["validation_result"];
}

interface PlanQASidebarProps {
  planId: string;
  selectedNodeId: string | null;
  messages: PlanQAMessage[];
  onMessagesChange: (messages: PlanQAMessage[]) => void;
  onClose: () => void;
  onAction: (action: PlanQASuggestedAction) => void;
  onProjectChange: (project: Project) => void;
  onLearningSaved: () => void;
}

function messageId(role: PlanQAMessage["role"]): string {
  return `${role}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function contextLabel(context: PlanQAUsedContext): string {
  const pieces = [
    context.node_ids.length > 0 ? `${context.node_ids.length} task${context.node_ids.length === 1 ? "" : "s"}` : null,
    context.citation_ids.length > 0 ? `${context.citation_ids.length} citation${context.citation_ids.length === 1 ? "" : "s"}` : null,
    context.lesson_ids.length > 0 ? `${context.lesson_ids.length} lesson${context.lesson_ids.length === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  return pieces.length > 0 ? `Used ${pieces.join(", ")}` : "Used plan context";
}

export function PlanQASidebar({
  planId,
  selectedNodeId,
  messages,
  onMessagesChange,
  onClose,
  onAction,
  onProjectChange,
  onLearningSaved,
}: PlanQASidebarProps) {
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = draft.trim();
    if (!question || loading) return;

    const history = messages.map<PlanQAChatMessage>(({ role, content }) => ({
      role,
      content,
    }));
    const userMessage: PlanQAMessage = {
      id: messageId("user"),
      role: "user",
      content: question,
    };
    const nextMessages = [...messages, userMessage];
    onMessagesChange(nextMessages);
    setDraft("");
    setLoading(true);

    try {
      const response = await askPlanEditor(planId, {
        message: question,
        selected_node_id: selectedNodeId,
        chat_history: history,
        mode: "auto",
      });
      onMessagesChange([
        ...nextMessages,
        {
          id: messageId("assistant"),
          role: "assistant",
          content: response.natural_language_response,
          used_context: response.answer?.used_context,
          suggested_actions: response.suggested_actions,
          confidence: response.intent.confidence,
          response_type: response.response_type,
          proposed_patch: response.proposed_patch,
          validation_result: response.validation_result,
        },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      onMessagesChange([
        ...nextMessages,
        {
          id: messageId("assistant"),
          role: "assistant",
          content: `I could not answer that from the current plan context. ${message}`,
          confidence: "low",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmPatch(message: PlanQAMessage) {
    if (!message.proposed_patch || loading) return;
    setLoading(true);
    try {
      const response = await applyPlanEditorPatch(planId, message.proposed_patch);
      if (response.project) onProjectChange(response.project);
      if (response.generated_lesson_cards.length > 0) onLearningSaved();
      onMessagesChange([
        ...messages,
        {
          id: messageId("assistant"),
          role: "assistant",
          content: response.natural_language_response,
          confidence: response.intent.confidence,
          response_type: response.response_type,
          validation_result: response.validation_result,
        },
      ]);
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown error";
      onMessagesChange([
        ...messages,
        {
          id: messageId("assistant"),
          role: "assistant",
          content: `I could not apply that patch. ${error}`,
          confidence: "low",
          response_type: "error",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleCancelPatch() {
    onMessagesChange([
      ...messages,
      {
        id: messageId("assistant"),
        role: "assistant",
        content: "Cancelled. I did not change the plan.",
        confidence: "high",
      },
    ]);
  }

  return (
    <aside
      aria-label="Ask LabPilot"
      className={cn(
        "fixed inset-0 z-40 flex flex-col border-l border-[color:var(--border-default)] bg-bg-surface shadow-lg",
        "animate-slide-in-right lg:static lg:z-auto lg:h-full lg:w-[390px] lg:shrink-0",
      )}
    >
      <header className="flex items-start gap-3 border-b border-[color:var(--border-default)] px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-[color:var(--accent-subtle)] text-accent">
          <Bot size={18} strokeWidth={1.6} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
            Plan assistant
          </p>
          <h2 className="mt-0.5 text-[17px] font-medium tracking-[-0.01em] text-text-primary">
            Ask or edit
          </h2>
          <p className="mt-1 text-[12px] leading-[1.45] text-text-secondary">
            Answers questions and proposes safe calendar edits
            {selectedNodeId ? `, focused on ${selectedNodeId}` : ""}.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Plan Q&A"
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-text-tertiary",
            "transition-colors duration-[var(--duration-fast)] hover:bg-bg-hover hover:text-text-primary",
          )}
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      </header>

      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <div className="rounded-md border border-[color:var(--border-default)] bg-bg-primary p-4">
            <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
              <Sparkles size={14} strokeWidth={1.5} />
              Try asking
            </div>
            <ul className="mt-3 flex flex-col gap-2 text-[13px] leading-[1.5] text-text-secondary">
              <li>Why is this task scheduled here?</li>
              <li>Move sample preparation to Friday.</li>
              <li>Make this task take 5 days.</li>
              <li>Add fluorescence microscope to imaging.</li>
              <li>What tasks happen in week 2?</li>
            </ul>
          </div>
        ) : (
          <ol className="flex flex-col gap-3">
            {messages.map((message) => (
              <li
                key={message.id}
                className={cn(
                  "flex",
                  message.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <article
                  className={cn(
                    "max-w-[92%] rounded-md px-3 py-2.5 text-[13px] leading-[1.55]",
                    message.role === "user"
                      ? "bg-bg-userMessage text-text-primary"
                      : "border border-[color:var(--border-default)] bg-bg-primary text-text-secondary",
                  )}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {message.used_context ? (
                    <p className="mt-2 text-[11px] text-text-tertiary">
                      {contextLabel(message.used_context)}
                      {message.confidence ? ` · ${message.confidence} confidence` : ""}
                    </p>
                  ) : null}
                  {message.suggested_actions && message.suggested_actions.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {message.suggested_actions.map((action) => (
                        <button
                          key={`${action.type}:${action.target_id ?? action.label}`}
                          type="button"
                          onClick={() => onAction(action)}
                          className={cn(
                            "rounded-full border border-[color:var(--border-default)] px-2 py-1",
                            "text-[11px] font-medium text-text-secondary transition-colors",
                            "hover:border-[color:var(--accent)] hover:bg-[color:var(--accent-subtle)] hover:text-accent",
                          )}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {message.proposed_patch ? (
                    <div className="mt-3 rounded-sm border border-[color:var(--border-default)] bg-bg-surface p-2">
                      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                        Proposed patch
                      </p>
                      <p className="mt-1 text-[12px] text-text-primary">
                        {message.proposed_patch.summary}
                      </p>
                      <ul className="mt-2 flex flex-col gap-1 text-[11.5px] text-text-secondary">
                        {message.proposed_patch.operations.map((operation) => (
                          <li key={operation.operation_id}>
                            {operation.operation_type.replace(/_/g, " ")} · {operation.target_id}
                          </li>
                        ))}
                      </ul>
                      {message.validation_result ? (
                        <p className="mt-2 text-[11px] text-text-tertiary">
                          Blast radius: {message.validation_result.estimated_blast_radius}
                          {message.validation_result.will_recalculate_schedule
                            ? " · schedule recalculates"
                            : ""}
                          {message.validation_result.will_recalculate_stats
                            ? " · stats update"
                            : ""}
                        </p>
                      ) : null}
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          disabled={loading || message.validation_result?.is_valid === false}
                          onClick={() => {
                            void handleConfirmPatch(message);
                          }}
                          className={cn(
                            "rounded-sm bg-accent px-2.5 py-1 text-[11px] font-medium text-white",
                            "transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-45",
                          )}
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={handleCancelPatch}
                          className={cn(
                            "rounded-sm border border-[color:var(--border-default)] px-2.5 py-1",
                            "text-[11px] font-medium text-text-secondary transition-colors hover:bg-bg-hover",
                          )}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              </li>
            ))}
          </ol>
        )}

        {loading ? (
          <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-[color:var(--border-default)] bg-bg-primary px-3 py-2 text-[12px] text-text-secondary">
            <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />
          LabPilot is checking the plan...
          </div>
        ) : null}
      </div>

      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        className="border-t border-[color:var(--border-default)] p-4"
      >
        <label className="sr-only" htmlFor="plan-qa-input">
          Ask or edit this experiment plan
        </label>
        <div className="flex items-end gap-2 rounded-md border border-[color:var(--border-default)] bg-bg-primary p-2 focus-within:border-[color:var(--accent)]">
          <textarea
            id="plan-qa-input"
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            placeholder="Ask a question or request a targeted edit..."
            rows={2}
            className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-1 py-1 text-[13px] leading-[1.5] text-text-primary outline-none placeholder:text-text-tertiary"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button
            type="submit"
            disabled={loading || draft.trim().length === 0}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-accent text-white",
              "transition-colors duration-[var(--duration-fast)] hover:bg-accent-hover",
              "disabled:cursor-not-allowed disabled:opacity-45",
            )}
            aria-label="Submit question"
          >
            <Send size={14} strokeWidth={1.75} />
          </button>
        </div>
      </form>
    </aside>
  );
}
