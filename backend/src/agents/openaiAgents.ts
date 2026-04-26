import { z, type ZodType } from "zod";

import { callStructuredModel, type ModelTier } from "../lib/openaiClient.js";
import type {
  ExperimentPlan,
  HypothesisExtraction,
  LessonDraft,
  NoveltyAnalysis,
  PlanPatchDraft,
} from "../schemas/agentSchemas.js";
import {
  ExperimentPlanSchema,
  HypothesisExtractionSchema,
  LessonSchema,
  NoveltyAnalysisSchema,
  PlanPatchSchema,
  QASchema,
} from "../schemas/agentSchemas.js";
import type { FinalExperimentPlan } from "../lib/projectTypes.js";
import {
  CREATOR_AGENT_PROMPT,
  EDITOR_PROMPT,
  HYPOTHESIS_EXTRACTION_PROMPT,
  LESSON_PROMPT,
  NOVELTY_ANALYSIS_PROMPT,
  QA_PROMPT,
} from "./prompts.js";

export interface AgentRunResult<T> {
  data: T;
  mode: "openai" | "fallback";
  model?: string;
  warnings: string[];
}

export async function runAgentWithFallback<T>(args: {
  agentName: string;
  modelTier: ModelTier;
  schema: ZodType<T>;
  instructions: string;
  input: unknown;
  fallbackFn: () => T;
  maxTokens?: number;
}): Promise<AgentRunResult<T>> {
  const result = await callStructuredModel({
    taskName: args.agentName,
    instructions: args.instructions,
    input: args.input,
    schema: args.schema,
    modelTier: args.modelTier,
    maxTokens: args.maxTokens,
    temperature: 0.15,
  });

  if (result.ok) {
    return {
      data: result.data,
      mode: "openai",
      model: result.model,
      warnings: result.warnings,
    };
  }

  return {
    data: args.fallbackFn(),
    mode: "fallback",
    warnings: Array.from(new Set([...result.warnings, result.message])),
  };
}

export async function extractHypothesisWithOpenAI(args: {
  hypothesis: string;
  fallbackFn: () => HypothesisExtraction;
}): Promise<AgentRunResult<HypothesisExtraction>> {
  return runAgentWithFallback({
    agentName: "hypothesis_extraction",
    modelTier: "small",
    schema: HypothesisExtractionSchema,
    instructions: HYPOTHESIS_EXTRACTION_PROMPT,
    input: { hypothesis: args.hypothesis },
    fallbackFn: args.fallbackFn,
    maxTokens: 1600,
  });
}

export async function analyzeNoveltyWithOpenAI(args: {
  hypothesis: string;
  extraction: HypothesisExtraction;
  sources: unknown[];
  fallbackFn: () => NoveltyAnalysis;
}): Promise<AgentRunResult<NoveltyAnalysis>> {
  return runAgentWithFallback({
    agentName: "novelty_analysis",
    modelTier: "medium",
    schema: NoveltyAnalysisSchema,
    instructions: NOVELTY_ANALYSIS_PROMPT,
    input: args,
    fallbackFn: args.fallbackFn,
    maxTokens: 2200,
  });
}

export async function generatePlanWithOpenAI(args: {
  hypothesis: string;
  extraction: HypothesisExtraction;
  sources: unknown[];
  novelty: NoveltyAnalysis;
  labContext?: unknown;
  prePlan?: unknown;
  chunks?: unknown[];
  lessons?: unknown[];
  benchmarkInsights?: unknown;
  previousPlan?: FinalExperimentPlan | null;
  fallbackFn: () => ExperimentPlan;
}): Promise<AgentRunResult<ExperimentPlan>> {
  return runAgentWithFallback({
    agentName: "creator_experiment_plan",
    modelTier: "high",
    schema: ExperimentPlanSchema,
    instructions: CREATOR_AGENT_PROMPT,
    input: {
      hypothesis: args.hypothesis,
      extraction: args.extraction,
      sources: args.sources,
      novelty: args.novelty,
      labContext: args.labContext ?? null,
      prePlan: args.prePlan ?? null,
      chunks: args.chunks ?? [],
      lessons: args.lessons ?? [],
      benchmarkInsights: args.benchmarkInsights ?? [],
      previousPlan: args.previousPlan ?? null,
    },
    fallbackFn: args.fallbackFn,
    maxTokens: 7000,
  });
}

export async function answerQAWithOpenAI(args: {
  question: string;
  plan: FinalExperimentPlan;
  context: unknown;
  fallbackFn: () => z.infer<typeof QASchema>;
}) {
  return runAgentWithFallback({
    agentName: "plan_qa",
    modelTier: "medium",
    schema: QASchema,
    instructions: QA_PROMPT,
    input: {
      question: args.question,
      plan: args.plan,
      context: args.context,
    },
    fallbackFn: args.fallbackFn,
    maxTokens: 2200,
  });
}

export async function buildEditorPatchWithOpenAI(args: {
  instruction: string;
  plan: FinalExperimentPlan;
  context?: unknown;
  fallbackFn: () => PlanPatchDraft;
}): Promise<AgentRunResult<PlanPatchDraft>> {
  return runAgentWithFallback({
    agentName: "plan_editor_patch",
    modelTier: "medium",
    schema: PlanPatchSchema,
    instructions: EDITOR_PROMPT,
    input: {
      instruction: args.instruction,
      plan: args.plan,
      context: args.context ?? null,
    },
    fallbackFn: args.fallbackFn,
    maxTokens: 2400,
  });
}

export async function generateLessonWithOpenAI(args: {
  feedback: string;
  context?: unknown;
  fallbackFn: () => LessonDraft;
}): Promise<AgentRunResult<LessonDraft>> {
  return runAgentWithFallback({
    agentName: "lesson_generation",
    modelTier: "small",
    schema: LessonSchema,
    instructions: LESSON_PROMPT,
    input: {
      feedback: args.feedback,
      context: args.context ?? null,
    },
    fallbackFn: args.fallbackFn,
    maxTokens: 1600,
  });
}
