/**
 * Backend-facing capability map for the technical demo narrative.
 *
 * Keep this as metadata, not product copy: it documents the pipeline pieces the
 * backend knows about and gives health/debug routes a stable way to expose them.
 */
export const TECHNICAL_CAPABILITIES = {
  pipeline: [
    {
      id: "hypothesis_decomposition",
      label: "Hypothesis Decomposition Agent",
      description:
        "Parses messy scientific input into structured variables plus intervention, control, biological system, endpoint, mechanism, and success threshold fields when inferable.",
      implementation: [
        "agents/openaiAgents.ts:extractHypothesisWithOpenAI",
        "schemas/agentSchemas.ts:HypothesisExtractionSchema",
      ],
    },
    {
      id: "retrieval_grounding",
      label: "Retrieval And Protocol Grounding Layer",
      description:
        "Normalizes scientific literature, protocol-style resources, supplier documentation, and standards into research sources for novelty QC and planning context.",
      implementation: [
        "services/researchProvider.ts",
        "services/openAlexResearchProvider.ts",
        "services/supplierSearchProvider.ts",
      ],
    },
    {
      id: "novelty_qc",
      label: "Semantic Novelty QC Agent",
      description:
        "Compares the hypothesis against normalized sources and returns a novelty verdict, closest matches, warnings, and recommended next step.",
      implementation: [
        "agents/openaiAgents.ts:analyzeNoveltyWithOpenAI",
        "schemas/agentSchemas.ts:NoveltyAnalysisSchema",
      ],
    },
    {
      id: "pre_planning",
      label: "Pre-Planning Agent",
      description:
        "Reconstructs prior workflow context into a dependency graph of experimental tasks and scientific or operational dependencies.",
      implementation: [
        "lib/prePlanMaker.ts:generatePrePlan",
        "lib/projectTypes.ts:PrePlan",
      ],
    },
    {
      id: "execution_core",
      label: "Execution Core",
      description:
        "Compiles planning context into a runnable calendar plan with timeline, budget, reagents, equipment, validation criteria, missing resources, and risk flags.",
      implementation: [
        "agents/openaiAgents.ts:generatePlanWithOpenAI",
        "agents/agentOrchestrator.ts:experimentPlanToFinalPlan",
        "lib/riskAnalyzerAgent.ts:analyzeProjectRisks",
      ],
    },
    {
      id: "feedback_conditioning",
      label: "Feedback-Conditioned Planning Loop",
      description:
        "Treats scientist critique, benchmark evaluations, and calendar edits as reusable textual optimization signals for future plans.",
      implementation: [
        "lib/benchmarkRepo.ts",
        "lib/feedbackLearningService.ts",
        "lib/learningRepo.ts",
      ],
    },
  ],
  retrieval_corpora: [
    "OpenAlex scientific literature",
    "protocols.io",
    "Bio-protocol",
    "Nature Protocols",
    "JoVE",
    "OpenWetWare",
    "Thermo Fisher",
    "Sigma-Aldrich",
    "Promega",
    "Qiagen",
    "IDT",
    "ATCC",
    "Addgene",
    "MIQE-style qPCR standards",
  ],
  model_roles: [
    {
      role: "decomposition",
      model_tier: "small",
      implementation: "hypothesis_extraction",
    },
    {
      role: "retrieval_reasoning",
      model_tier: "medium",
      implementation: "novelty_analysis over retrieved sources",
    },
    {
      role: "planning",
      model_tier: "high",
      implementation: "creator_experiment_plan",
    },
    {
      role: "critique_and_qa",
      model_tier: "medium",
      implementation: "plan_qa and plan_editor_patch",
    },
    {
      role: "memory_extraction",
      model_tier: "small",
      implementation: "lesson_generation from scientist feedback",
    },
  ],
  feedback_loop: {
    inspiration: "TextGrad-style textual optimization signal",
    signal_sources: [
      "benchmark written feedback",
      "benchmark category scores",
      "calendar edits",
      "QA/editor critique",
      "generated lesson cards",
    ],
    reusable_memory: [
      "benchmark_insights",
      "lesson_cards",
      "plan_change_events",
      "plan_versions",
    ],
  },
} as const;
