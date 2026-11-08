export interface paths {
    "/api/v1/appeals": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Appeals */
        get: operations["listAppeals"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/appeals/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Appeal */
        get: operations["getAppeal"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/appeals/{id}/decision": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Decide Appeal */
        post: operations["decideAppeal"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/appeals/{id}/second-opinions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Second Opinions */
        get: operations["listSecondOpinions"];
        put?: never;
        /** Create Second Opinion */
        post: operations["createSecondOpinion"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/checklist-versions/{version_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Version */
        get: operations["getChecklistVersion"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/checklists": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Checklists */
        get: operations["listChecklists"];
        put?: never;
        /** Create Checklist */
        post: operations["createChecklist"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/checklists/{id}/versions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Versions */
        get: operations["listChecklistVersions"];
        put?: never;
        /** Create Version */
        post: operations["createChecklistVersion"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/conversations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Conversations */
        get: operations["listConversations"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/conversations/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Conversation */
        get: operations["getConversation"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/conversations/{id}/audio": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Audio */
        get: operations["getConversationAudio"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/criterion-suggestions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Criterion Suggestions */
        get: operations["listCriterionSuggestions"];
        put?: never;
        /** Suggest Criterion */
        post: operations["suggestCriterion"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/evaluation-batches": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create Batch */
        post: operations["createEvaluationBatch"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/evaluation-batches/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Batch */
        get: operations["getEvaluationBatch"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/evaluation-batches/{id}/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Export Batch */
        get: operations["exportBatch"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/evaluations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Evaluations */
        get: operations["listEvaluations"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/evaluations/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Evaluation */
        get: operations["getEvaluation"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/evaluations/{id}/appeals": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create Appeal */
        post: operations["createAppeal"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/evaluations/{id}/assistant-runs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Assistant Runs */
        get: operations["listAssistantRuns"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/evaluations/{id}/coaching": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create Coaching */
        post: operations["createCoaching"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/evaluations/{id}/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Export Evaluation */
        get: operations["exportEvaluation"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/evaluations/{id}/questions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Conversation Questions */
        get: operations["listConversationQuestions"];
        put?: never;
        /** Ask Conversation */
        post: operations["askConversation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/evaluator-profiles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Profiles */
        get: operations["listEvaluatorProfiles"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Health */
        get: operations["getHealth"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/imports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create Import */
        post: operations["createImport"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/jobs/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Job */
        get: operations["getJob"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/jobs/{id}/retry": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Retry Job */
        post: operations["retryJob"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/knowledge-sources": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Sources */
        get: operations["listKnowledgeSources"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** APIError */
        APIError: {
            code: components["schemas"]["ErrorCode"];
            /** Correlation Id */
            correlation_id: string;
            /** Details */
            details?: components["schemas"]["ErrorDetail"][];
            /** Message */
            message: string;
            /** Retryable */
            retryable: boolean;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
        };
        /** Appeal */
        Appeal: {
            /** Comment */
            comment: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Criterion Id */
            criterion_id: string;
            /** Effective Revision */
            effective_revision: number;
            /** Evaluation Id */
            evaluation_id: string;
            /** Id */
            id: string;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /**
             * State
             * @enum {string}
             */
            state: "open" | "resolved";
        };
        /** AssistantRun */
        AssistantRun: {
            /** Calls */
            calls?: components["schemas"]["CallRecord"][];
            coaching?: components["schemas"]["CoachingResult"] | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Criterion Id */
            criterion_id: string;
            error?: components["schemas"]["APIError"] | null;
            /** Evaluation Id */
            evaluation_id: string;
            /** Evaluation Revision */
            evaluation_revision: number;
            /** Finished At */
            finished_at?: string | null;
            /** Id */
            id: string;
            /**
             * Kind
             * @constant
             */
            kind: "coaching";
            /**
             * Mode
             * @enum {string}
             */
            mode: "production" | "test";
            /** Profile Id */
            profile_id: string;
            /** Profile Version */
            profile_version: string;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /**
             * Scope
             * @enum {string}
             */
            scope: "automatic" | "effective";
            /**
             * State
             * @enum {string}
             */
            state: "running" | "succeeded" | "failed";
        };
        /** AudioMapping */
        AudioMapping: {
            /** End Seconds */
            end_seconds?: string | null;
            /** Message Id */
            message_id: string;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Start Seconds */
            start_seconds: string;
        };
        /** AudioMetadata */
        AudioMetadata: {
            /** Access Path */
            access_path?: string | null;
            /**
             * Alignment Status
             * @enum {string}
             */
            alignment_status: "verified" | "unverified" | "unavailable";
            /**
             * Availability
             * @enum {string}
             */
            availability: "available" | "unavailable" | "unknown";
            /** Content Hash */
            content_hash?: string | null;
            /** Mapping */
            mapping?: components["schemas"]["AudioMapping"][] | null;
            /** Media Type */
            media_type?: string | null;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
        };
        /** BatchProgress */
        BatchProgress: {
            /** Cancelled */
            cancelled: number;
            /** Failed */
            failed: number;
            /** Queued */
            queued: number;
            /** Retry Wait */
            retry_wait: number;
            /** Running */
            running: number;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Succeeded */
            succeeded: number;
            /** Total */
            total: number;
        };
        /** CallRecord */
        CallRecord: {
            actual?: components["schemas"]["ProviderSelection"] | null;
            /** Attempt Id */
            attempt_id: string;
            /** Call Id */
            call_id: string;
            /** Cost */
            cost?: string | null;
            /**
             * Currency
             * @default USD
             * @constant
             */
            currency: "USD";
            /** Finish Reason */
            finish_reason?: ("stop" | "length" | "refusal" | "error" | "unknown") | null;
            /** Finished At */
            finished_at?: string | null;
            /**
             * Outcome
             * @enum {string}
             */
            outcome: "started" | "succeeded" | "failed" | "timeout" | "cancelled" | "unknown";
            /** Price Version */
            price_version?: string | null;
            /**
             * Purpose
             * @enum {string}
             */
            purpose: "primary" | "review" | "repair" | "fallback";
            requested: components["schemas"]["ProviderSelection"];
            safe_error?: components["schemas"]["APIError"] | null;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /**
             * Started At
             * Format: date-time
             */
            started_at: string;
            usage?: components["schemas"]["TokenUsage"] | null;
        };
        /** ChannelInstructions */
        ChannelInstructions: {
            /**
             * Agent Chat
             * @default
             */
            agent_chat: string;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /**
             * Voice Call
             * @default
             */
            voice_call: string;
            /**
             * Voice Policy Version
             * @default text-observable-v1
             */
            voice_policy_version: string;
        };
        /** ChecklistDraft */
        ChecklistDraft: {
            /** Criteria */
            criteria: components["schemas"]["Criterion"][];
            rounding?: components["schemas"]["RoundingPolicy"];
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Sections */
            sections?: components["schemas"]["Section"][];
            /** Title */
            title: string;
        };
        /** ChecklistSummary */
        ChecklistSummary: {
            /** Checklist Id */
            checklist_id: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Latest Version Id */
            latest_version_id: string;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Title */
            title: string;
        };
        /** ChecklistVersion */
        ChecklistVersion: {
            /** Checklist Id */
            checklist_id: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Criteria */
            criteria: components["schemas"]["Criterion"][];
            rounding?: components["schemas"]["RoundingPolicy"];
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Scoring Config Hash */
            scoring_config_hash: string;
            /** Sections */
            sections?: components["schemas"]["Section"][];
            /** Semantic Hash */
            semantic_hash: string;
            /** Title */
            title: string;
            /** Version Id */
            version_id: string;
        };
        /** Choice */
        Choice: {
            /** Anchor */
            anchor: string;
            /** Id */
            id: string;
            /** Label */
            label: string;
            /** Raw Value */
            raw_value: boolean | number | string;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Score Fraction */
            score_fraction: string | null;
        };
        /** CoachingRequest */
        CoachingRequest: {
            /** Criterion Id */
            criterion_id: string;
            /** Expected Revision */
            expected_revision: number;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /**
             * Scope
             * @default effective
             * @enum {string}
             */
            scope: "automatic" | "effective";
        };
        /** CoachingResult */
        CoachingResult: {
            /**
             * Language
             * @enum {string}
             */
            language: "RU" | "KZ" | "EN";
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Suggestions */
            suggestions: components["schemas"]["OperatorSuggestion"][];
        };
        /** Conversation */
        Conversation: {
            audio: components["schemas"]["AudioMetadata"];
            /**
             * Channel
             * @enum {string}
             */
            channel: "agent_chat" | "voice_call";
            /** Content Hash */
            content_hash: string;
            /** External Id */
            external_id: string;
            /** Id */
            id: string;
            /**
             * Language
             * @enum {string}
             */
            language: "RU" | "KZ" | "EN";
            /** Messages */
            messages: components["schemas"]["Message"][];
            /** Occurred At */
            occurred_at?: string | null;
            /** Revision */
            revision: number;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Warnings */
            warnings?: string[];
        };
        /** ConversationAnswer */
        ConversationAnswer: {
            /** Message Ids */
            message_ids: string[];
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /**
             * Status
             * @enum {string}
             */
            status: "answered" | "off_topic" | "insufficient_context";
            /** Text */
            text: string;
        };
        /**
         * ConversationFlagSummary
         * @description One selected flag; details use latest_evaluation_id and result.criterion_id.
         */
        ConversationFlagSummary: {
            /** Checklist Version Id */
            checklist_version_id: string;
            /** Latest Job Id */
            latest_job_id: string | null;
            result: components["schemas"]["FlagResult"];
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /**
             * Scope
             * @enum {string}
             */
            scope: "automatic" | "effective";
            /**
             * Status
             * @enum {string}
             */
            status: "detected" | "not_detected" | "unknown";
        };
        /** ConversationQuestionRequest */
        ConversationQuestionRequest: {
            /** Expected Revision */
            expected_revision: number;
            /** Question */
            question: string;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /**
             * Scope
             * @default effective
             * @enum {string}
             */
            scope: "automatic" | "effective";
        };
        /** ConversationQuestionRun */
        ConversationQuestionRun: {
            answer?: components["schemas"]["ConversationAnswer"] | null;
            /** Calls */
            calls?: components["schemas"]["CallRecord"][];
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            error?: components["schemas"]["APIError"] | null;
            /** Evaluation Id */
            evaluation_id: string;
            /** Evaluation Revision */
            evaluation_revision: number;
            /** Finished At */
            finished_at?: string | null;
            /** Id */
            id: string;
            /**
             * Mode
             * @enum {string}
             */
            mode: "production" | "test";
            /** Profile Id */
            profile_id: string;
            /** Profile Version */
            profile_version: string;
            /** Question */
            question: string;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /**
             * Scope
             * @enum {string}
             */
            scope: "automatic" | "effective";
            /**
             * State
             * @enum {string}
             */
            state: "running" | "succeeded" | "failed";
        };
        /** ConversationSummary */
        ConversationSummary: {
            /** Checklist Version Id */
            checklist_version_id?: string | null;
            conversation: components["schemas"]["Conversation"];
            /** Detected Flag */
            detected_flag?: boolean | null;
            /**
             * Evaluation Status
             * @enum {string}
             */
            evaluation_status: "unevaluated" | "complete" | "partial" | "failed" | "pending";
            flag_summary?: components["schemas"]["ConversationFlagSummary"] | null;
            /** Latest Evaluation Id */
            latest_evaluation_id?: string | null;
            /**
             * Open Appeals
             * @default 0
             */
            open_appeals: number;
            /** Profile Id */
            profile_id?: string | null;
            /**
             * Result Scope
             * @default automatic
             * @enum {string}
             */
            result_scope: "automatic" | "effective";
            /** Review Reasons */
            review_reasons?: ("incomplete" | "conflict" | "open_appeal" | "evaluation_failed")[];
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Total Score */
            total_score?: string | null;
        };
        /** CreateAppeal */
        CreateAppeal: {
            /** Comment */
            comment: string;
            /** Criterion Id */
            criterion_id: string;
            /** Expected Revision */
            expected_revision: number;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
        };
        /** CreateBatch */
        CreateBatch: {
            /** Checklist Version Id */
            checklist_version_id: string;
            /** Conversation Ids */
            conversation_ids: string[];
            /**
             * Mode
             * @enum {string}
             */
            mode: "fresh" | "reuse_if_compatible";
            /** Profile Id */
            profile_id: string;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
        };
        /** CreateChecklistVersion */
        CreateChecklistVersion: {
            config: components["schemas"]["ChecklistDraft"];
            /** Expected Latest Version Id */
            expected_latest_version_id: string;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
        };
        /** Criterion */
        Criterion: {
            /** Allow Na */
            allow_na: boolean;
            channel_instructions: components["schemas"]["ChannelInstructions"];
            /** Choices */
            choices: components["schemas"]["Choice"][];
            /** Definition */
            definition: string;
            evidence_policy: components["schemas"]["EvidencePolicy"];
            /** Flag When Choice Ids */
            flag_when_choice_ids?: string[];
            /** Id */
            id: string;
            /** Na Condition */
            na_condition: string | null;
            /** Requires Reference */
            requires_reference: boolean;
            /**
             * Response Type
             * @enum {string}
             */
            response_type: "binary" | "scale" | "flag";
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Section Id */
            section_id?: string | null;
            /** Title */
            title: string;
            /** Weight */
            weight: string;
        };
        /** CriterionBlueprint */
        CriterionBlueprint: {
            /** Allow Na */
            allow_na: boolean;
            /** Choices */
            choices: components["schemas"]["Choice"][];
            /** Definition */
            definition: string;
            /** Explanation */
            explanation: string;
            /** Flag When Choice Ids */
            flag_when_choice_ids?: string[];
            /** Na Condition */
            na_condition: string | null;
            /**
             * Response Type
             * @enum {string}
             */
            response_type: "binary" | "scale" | "flag";
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Title */
            title: string;
        };
        /** CriterionProposal */
        CriterionProposal: {
            /** Answer Choice Id */
            answer_choice_id: string | null;
            /**
             * Applicability
             * @enum {string}
             */
            applicability: "applicable" | "not_applicable" | "undetermined";
            /** Criterion Id */
            criterion_id: string;
            /** Evidence */
            evidence: components["schemas"]["Evidence"][];
            /** Limitations */
            limitations?: string[];
            /**
             * Origin
             * @default ai
             * @enum {string}
             */
            origin: "ai" | "human" | "test";
            /** Rationale */
            rationale: string;
            /** Reason Codes */
            reason_codes: components["schemas"]["ReasonCode"][];
            /** Review Reasons */
            review_reasons?: string[];
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
        };
        /** CriterionSuggestionRun */
        CriterionSuggestionRun: {
            /** Calls */
            calls?: components["schemas"]["CallRecord"][];
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            error?: components["schemas"]["APIError"] | null;
            /** Finished At */
            finished_at?: string | null;
            /** Id */
            id: string;
            /**
             * Mode
             * @enum {string}
             */
            mode: "production" | "test";
            /** Profile Id */
            profile_id: string;
            /** Profile Version */
            profile_version: string;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /**
             * State
             * @enum {string}
             */
            state: "running" | "succeeded" | "failed";
            suggestion?: components["schemas"]["CriterionBlueprint"] | null;
            /** Title */
            title: string;
        };
        /** Decision */
        Decision: {
            /** Appeal Id */
            appeal_id: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Criterion Id */
            criterion_id: string;
            /**
             * Decision
             * @enum {string}
             */
            decision: "confirmed" | "changed";
            /** Evaluation Id */
            evaluation_id: string;
            /** Expected Revision */
            expected_revision: number;
            /** Id */
            id: string;
            /** Reason */
            reason: string;
            /** Reason Codes */
            reason_codes: components["schemas"]["ReasonCode"][];
            replacement?: components["schemas"]["CriterionProposal"] | null;
            /** Revision */
            revision: number;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
        };
        /** DecisionRequest */
        DecisionRequest: {
            /**
             * Decision
             * @enum {string}
             */
            decision: "confirmed" | "changed";
            /** Expected Revision */
            expected_revision: number;
            /** Reason */
            reason: string;
            replacement?: components["schemas"]["CriterionProposal"] | null;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
        };
        /**
         * ErrorCode
         * @enum {string}
         */
        ErrorCode: "validation_error" | "not_found" | "revision_conflict" | "idempotency_conflict" | "open_appeal_exists" | "invalid_state" | "payload_too_large" | "configuration_error" | "provider_error" | "budget_exceeded" | "timeout" | "cancelled" | "lease_lost" | "persistence_error" | "audio_unavailable" | "not_implemented" | "internal_error";
        /** ErrorDetail */
        ErrorDetail: {
            /** Field */
            field?: string | null;
            /** Index */
            index?: number | null;
            /**
             * Reason
             * @enum {string}
             */
            reason: "invalid" | "missing" | "duplicate" | "conflicting_duplicate" | "limit_exceeded" | "unsupported";
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
        };
        /** EvaluationArtifact */
        EvaluationArtifact: {
            /** Automatic Final */
            automatic_final: components["schemas"]["CriterionProposal"][];
            /** Calls */
            calls: components["schemas"]["CallRecord"][];
            error?: components["schemas"]["APIError"] | null;
            /**
             * Evaluator Mode
             * @enum {string}
             */
            evaluator_mode: "production" | "test";
            identity: components["schemas"]["EvaluationIdentity"];
            /** Initial */
            initial: components["schemas"]["CriterionProposal"][];
            /** Limitations */
            limitations?: string[];
            /** Reviews */
            reviews: components["schemas"]["ReviewRecord"][];
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Source Fragments */
            source_fragments?: components["schemas"]["SourceFragment"][];
            /**
             * Status
             * @enum {string}
             */
            status: "complete" | "partial" | "failed";
        };
        /** EvaluationBatch */
        EvaluationBatch: {
            /** Checklist Version Id */
            checklist_version_id: string;
            /** Corpus Snapshot Id */
            corpus_snapshot_id: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Id */
            id: string;
            /** Jobs */
            jobs: components["schemas"]["Job"][];
            /**
             * Mode
             * @enum {string}
             */
            mode: "fresh" | "reuse_if_compatible";
            /** Profile Id */
            profile_id: string;
            /** Profile Version */
            profile_version: string;
            progress: components["schemas"]["BatchProgress"];
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
        };
        /** EvaluationIdentity */
        EvaluationIdentity: {
            /** Audio Content Hash */
            audio_content_hash?: string | null;
            /** Checklist Semantic Hash */
            checklist_semantic_hash: string;
            /** Conversation Content Hash */
            conversation_content_hash: string;
            /** Corpus Snapshot Hash */
            corpus_snapshot_hash: string;
            /** Profile Hash */
            profile_hash: string;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
        };
        /**
         * EvaluationRun
         * @description Current job ledger, separate from the immutable evaluation artifact.
         */
        EvaluationRun: {
            /** Calls */
            calls: components["schemas"]["CallRecord"][];
            /** Cost */
            cost: string | null;
            /** Cost Complete */
            cost_complete: boolean;
            /**
             * Currency
             * @default USD
             * @constant
             */
            currency: "USD";
            job: components["schemas"]["Job"];
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
        };
        /** EvaluationView */
        EvaluationView: {
            artifact: components["schemas"]["EvaluationArtifact"];
            automatic_score: components["schemas"]["ScoreSummary"];
            /** Checklist Version Id */
            checklist_version_id: string;
            /** Conversation Id */
            conversation_id: string;
            /** Conversation Revision */
            conversation_revision: number;
            /** Corpus Snapshot Id */
            corpus_snapshot_id: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Effective Proposals */
            effective_proposals: components["schemas"]["CriterionProposal"][];
            effective_score: components["schemas"]["ScoreSummary"];
            /** Human Decisions */
            human_decisions: components["schemas"]["Decision"][];
            /** Id */
            id: string;
            /** Profile Id */
            profile_id: string;
            /** Profile Version */
            profile_version: string;
            reuse: components["schemas"]["ReuseProvenance"];
            /** Revision */
            revision: number;
            run?: components["schemas"]["EvaluationRun"] | null;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Source Fragments */
            source_fragments: components["schemas"]["SourceFragment"][];
        };
        /** EvaluatorProfile */
        EvaluatorProfile: {
            /** Corpus Snapshot Id */
            corpus_snapshot_id: string;
            /** Fallbacks */
            fallbacks?: components["schemas"]["ProviderSelection"][];
            generation: components["schemas"]["GenerationSettings"];
            /** Id */
            id: string;
            /**
             * Mode
             * @enum {string}
             */
            mode: "production" | "test";
            /**
             * Output Schema Version
             * @default 1.0
             * @constant
             */
            output_schema_version: "1.0";
            /** Preprocessing Version */
            preprocessing_version: string;
            primary: components["schemas"]["ProviderSelection"];
            /** Prompt Version */
            prompt_version: string;
            retries: components["schemas"]["RetryPolicy"];
            reviewer?: components["schemas"]["ProviderSelection"] | null;
            reviewer_policy: components["schemas"]["ReviewerPolicy"];
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Version */
            version: string;
        };
        /** Evidence */
        Evidence: {
            /** End Message Id */
            end_message_id?: string | null;
            /** Explanation */
            explanation: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "message" | "range" | "source";
            /** Message Ids */
            message_ids?: string[];
            /**
             * Relation
             * @enum {string}
             */
            relation: "support" | "counter" | "context";
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Source Chunk Id */
            source_chunk_id?: string | null;
            /** Start Message Id */
            start_message_id?: string | null;
        };
        /** EvidencePolicy */
        EvidencePolicy: {
            /**
             * Allow Source
             * @default true
             */
            allow_source: boolean;
            /**
             * Missing Action Requires Range
             * @default true
             */
            missing_action_requires_range: boolean;
            /**
             * Require Evidence
             * @default true
             */
            require_evidence: boolean;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
        };
        /** ExecutionBudget */
        ExecutionBudget: {
            /** Attempt Id */
            attempt_id: string;
            /** Consumed Calls */
            consumed_calls: number;
            /** Consumed Cost */
            consumed_cost?: string | null;
            /** Consumed Tokens */
            consumed_tokens?: number | null;
            /**
             * Currency
             * @default USD
             * @constant
             */
            currency: "USD";
            /**
             * Deadline At
             * Format: date-time
             */
            deadline_at: string;
            /** Logical Job Id */
            logical_job_id: string;
            /** Max Cost */
            max_cost?: string | null;
            /** Max Provider Calls */
            max_provider_calls: number;
            /** Max Total Tokens */
            max_total_tokens?: number | null;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /**
             * Usage Complete
             * @default false
             */
            usage_complete: boolean;
        };
        /** FlagResult */
        FlagResult: {
            /** Answer Choice Id */
            answer_choice_id: string | null;
            /** Criterion Id */
            criterion_id: string;
            /** Detected */
            detected: boolean | null;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
        };
        /** GenerationSettings */
        GenerationSettings: {
            /**
             * Max Output Tokens
             * @default 4096
             */
            max_output_tokens: number;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Seed */
            seed?: number | null;
            /**
             * Temperature
             * @default 0
             */
            temperature: string;
        };
        /** Health */
        Health: {
            /**
             * Business Ready
             * @default false
             */
            business_ready: boolean;
            /**
             * Evaluator Mode
             * @default production
             * @enum {string}
             */
            evaluator_mode: "production" | "test";
            /**
             * Phase
             * @default foundation
             * @enum {string}
             */
            phase: "foundation" | "application";
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /**
             * Status
             * @default ok
             * @constant
             */
            status: "ok";
        };
        /** ImportMessage */
        ImportMessage: {
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /**
             * Speaker
             * @enum {string}
             */
            speaker: "client" | "operator" | "bot" | "system";
            /** Text */
            text: string;
            /** Timestamp Original */
            timestamp_original: string;
        };
        /** ImportRecord */
        ImportRecord: {
            /**
             * Channel
             * @enum {string}
             */
            channel: "agent_chat" | "voice_call";
            /** External Id */
            external_id: string;
            /**
             * Language
             * @enum {string}
             */
            language: "RU" | "KZ" | "EN";
            /** Messages */
            messages: components["schemas"]["ImportMessage"][];
            /** Occurred At */
            occurred_at?: string | null;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
        };
        /** ImportResult */
        ImportResult: {
            /**
             * Atomic
             * @default true
             * @constant
             */
            atomic: true;
            /** Deduplicated Count */
            deduplicated_count: number;
            /** Items */
            items: components["schemas"]["ImportedRevision"][];
            /** Received Count */
            received_count: number;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
        };
        /** ImportedRevision */
        ImportedRevision: {
            /** Conversation Id */
            conversation_id: string;
            /**
             * Disposition
             * @enum {string}
             */
            disposition: "created" | "new_revision" | "unchanged";
            /** Revision */
            revision: number;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Source Indices */
            source_indices: number[];
        };
        /** JSONImport */
        JSONImport: {
            /** Records */
            records: components["schemas"]["ImportRecord"][];
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            source: "json";
        };
        /** Job */
        Job: {
            /** Attempt Id */
            attempt_id: string | null;
            /** Attempts */
            attempts: components["schemas"]["JobAttempt"][];
            /** Batch Id */
            batch_id: string | null;
            budget: components["schemas"]["ExecutionBudget"] | null;
            /** Conversation Id */
            conversation_id: string;
            /** Conversation Revision */
            conversation_revision: number;
            error: components["schemas"]["APIError"] | null;
            /** Evaluation Id */
            evaluation_id: string | null;
            /** Id */
            id: string;
            /** Lease Expires At */
            lease_expires_at: string | null;
            /** Lease Id */
            lease_id: string | null;
            /** Max Attempts */
            max_attempts: number;
            /** Next Attempt At */
            next_attempt_at: string | null;
            progress: components["schemas"]["JobProgress"];
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /**
             * State
             * @enum {string}
             */
            state: "queued" | "running" | "succeeded" | "retry_wait" | "failed" | "cancelled";
        };
        /** JobAttempt */
        JobAttempt: {
            /** Attempt Id */
            attempt_id: string;
            error: components["schemas"]["APIError"] | null;
            /** Finished At */
            finished_at: string | null;
            /** Number */
            number: number;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /**
             * Started At
             * Format: date-time
             */
            started_at: string;
            /**
             * State
             * @enum {string}
             */
            state: "running" | "succeeded" | "failed" | "expired" | "cancelled";
        };
        /** JobProgress */
        JobProgress: {
            /** Completed Calls */
            completed_calls: number;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /**
             * Stage
             * @enum {string}
             */
            stage: "queued" | "evaluating" | "reviewing" | "persisting" | "done";
        };
        /** KnowledgeSources */
        KnowledgeSources: {
            /** Items */
            items: components["schemas"]["SourceVersion"][];
            /** Limit */
            limit: number;
            /** Offset */
            offset: number;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Total */
            total: number;
        };
        /** Message */
        Message: {
            /** Id */
            id: string;
            /** Ordinal */
            ordinal: number;
            /** Parsed Time */
            parsed_time?: string | null;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Source Index */
            source_index: number;
            /**
             * Speaker
             * @enum {string}
             */
            speaker: "client" | "operator" | "bot" | "system";
            /** Text */
            text: string;
            /** Timestamp Original */
            timestamp_original: string;
        };
        /** OperatorSuggestion */
        OperatorSuggestion: {
            /** Explanation */
            explanation: string;
            /** Message Id */
            message_id: string;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Text */
            text: string;
        };
        /** OrganizerImport */
        OrganizerImport: {
            /** Group Id */
            group_id: string;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            source: "organizer_api";
        };
        /** Page[Appeal] */
        Page_Appeal_: {
            /** Items */
            items: components["schemas"]["Appeal"][];
            /** Limit */
            limit: number;
            /** Offset */
            offset: number;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Total */
            total: number;
        };
        /** Page[AssistantRun] */
        Page_AssistantRun_: {
            /** Items */
            items: components["schemas"]["AssistantRun"][];
            /** Limit */
            limit: number;
            /** Offset */
            offset: number;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Total */
            total: number;
        };
        /** Page[ChecklistSummary] */
        Page_ChecklistSummary_: {
            /** Items */
            items: components["schemas"]["ChecklistSummary"][];
            /** Limit */
            limit: number;
            /** Offset */
            offset: number;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Total */
            total: number;
        };
        /** Page[ConversationQuestionRun] */
        Page_ConversationQuestionRun_: {
            /** Items */
            items: components["schemas"]["ConversationQuestionRun"][];
            /** Limit */
            limit: number;
            /** Offset */
            offset: number;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Total */
            total: number;
        };
        /** Page[ConversationSummary] */
        Page_ConversationSummary_: {
            /** Items */
            items: components["schemas"]["ConversationSummary"][];
            /** Limit */
            limit: number;
            /** Offset */
            offset: number;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Total */
            total: number;
        };
        /** Page[CriterionSuggestionRun] */
        Page_CriterionSuggestionRun_: {
            /** Items */
            items: components["schemas"]["CriterionSuggestionRun"][];
            /** Limit */
            limit: number;
            /** Offset */
            offset: number;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Total */
            total: number;
        };
        /** Page[EvaluationView] */
        Page_EvaluationView_: {
            /** Items */
            items: components["schemas"]["EvaluationView"][];
            /** Limit */
            limit: number;
            /** Offset */
            offset: number;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Total */
            total: number;
        };
        /** Page[ProfileSummary] */
        Page_ProfileSummary_: {
            /** Items */
            items: components["schemas"]["ProfileSummary"][];
            /** Limit */
            limit: number;
            /** Offset */
            offset: number;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Total */
            total: number;
        };
        /** Page[SecondOpinion] */
        Page_SecondOpinion_: {
            /** Items */
            items: components["schemas"]["SecondOpinion"][];
            /** Limit */
            limit: number;
            /** Offset */
            offset: number;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Total */
            total: number;
        };
        /** ProfileSummary */
        ProfileSummary: {
            configuration_error?: components["schemas"]["APIError"] | null;
            /** Configured */
            configured: boolean;
            /**
             * Preferred
             * @default false
             */
            preferred: boolean;
            profile: components["schemas"]["EvaluatorProfile"];
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
        };
        /** ProviderSelection */
        ProviderSelection: {
            /** Configuration Ref */
            configuration_ref: string;
            /** Model */
            model: string;
            /**
             * Provider
             * @enum {string}
             */
            provider: "gemini" | "deepseek" | "openrouter" | "xerosharc" | "test";
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
        };
        /**
         * ReasonCode
         * @enum {string}
         */
        ReasonCode: "criteria_met" | "criteria_partially_met" | "criteria_not_met" | "not_applicable" | "missing_expected_action" | "insufficient_evidence" | "conflicting_evidence" | "factual_verification_limited" | "violation_detected" | "no_violation_detected" | "other" | "human_confirmed" | "human_changed";
        /** RetryPolicy */
        RetryPolicy: {
            /**
             * Call Timeout Seconds
             * @default 60
             */
            call_timeout_seconds: number;
            /**
             * Currency
             * @default USD
             * @constant
             */
            currency: "USD";
            /**
             * Job Deadline Seconds
             * @default 300
             */
            job_deadline_seconds: number;
            /** Max Cost */
            max_cost?: string | null;
            /**
             * Max Format Repairs
             * @default 1
             */
            max_format_repairs: number;
            /**
             * Max Job Attempts
             * @default 3
             */
            max_job_attempts: number;
            /**
             * Max Provider Calls
             * @default 8
             */
            max_provider_calls: number;
            /**
             * Max Total Tokens
             * @default 65536
             */
            max_total_tokens: number | null;
            /**
             * Max Transport Retries
             * @default 1
             */
            max_transport_retries: number;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
        };
        /** ReuseProvenance */
        ReuseProvenance: {
            /**
             * Mode
             * @enum {string}
             */
            mode: "fresh" | "reuse_if_compatible";
            /** Reuse Key */
            reuse_key: string;
            /** Reused From Evaluation Id */
            reused_from_evaluation_id: string | null;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
        };
        /** ReviewRecord */
        ReviewRecord: {
            /** Call Ids */
            call_ids: string[];
            /** Criterion Id */
            criterion_id: string;
            /** Limitations */
            limitations?: string[];
            /**
             * Outcome
             * @enum {string}
             */
            outcome: "agreed" | "conflicted" | "skipped" | "failed";
            proposal: components["schemas"]["CriterionProposal"] | null;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
        };
        /** ReviewerPolicy */
        ReviewerPolicy: {
            /**
             * Blind
             * @default true
             * @constant
             */
            blind: true;
            /**
             * Enabled
             * @default false
             */
            enabled: boolean;
            /**
             * Max Criteria
             * @default 2
             */
            max_criteria: number;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /**
             * Version
             * @default keep_valid_initial_v1
             * @constant
             */
            version: "keep_valid_initial_v1";
        };
        /** RoundingPolicy */
        RoundingPolicy: {
            /**
             * Decimal Places
             * @default 2
             * @constant
             */
            decimal_places: 2;
            /**
             * Intermediate Rounding
             * @default false
             * @constant
             */
            intermediate_rounding: false;
            /**
             * Mode
             * @default ROUND_HALF_UP
             * @constant
             */
            mode: "ROUND_HALF_UP";
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
        };
        /** SafeCriterionResult */
        SafeCriterionResult: {
            /** Answer Choice Id */
            answer_choice_id: string | null;
            /**
             * Applicability
             * @enum {string}
             */
            applicability: "applicable" | "not_applicable" | "undetermined";
            /** Applicable Weight */
            applicable_weight: string;
            /** Criterion Id */
            criterion_id: string;
            /** Earned Weight */
            earned_weight: string | null;
            /** Evidence */
            evidence: components["schemas"]["SafeEvidenceRef"][];
            /** Flag Detected */
            flag_detected?: boolean | null;
            /** Normalized Contribution */
            normalized_contribution: string | null;
            /**
             * Origin
             * @enum {string}
             */
            origin: "ai" | "human" | "test";
            /** Reason Codes */
            reason_codes: components["schemas"]["ReasonCode"][];
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Score Fraction */
            score_fraction: string | null;
        };
        /** SafeDecision */
        SafeDecision: {
            /** Appeal Id */
            appeal_id: string;
            /** Criterion Id */
            criterion_id: string;
            /**
             * Decision
             * @enum {string}
             */
            decision: "confirmed" | "changed";
            /** Id */
            id: string;
            /** Reason Codes */
            reason_codes: components["schemas"]["ReasonCode"][];
            /** Revision */
            revision: number;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
        };
        /** SafeEvidenceRef */
        SafeEvidenceRef: {
            /** End Message Id */
            end_message_id?: string | null;
            /**
             * Kind
             * @enum {string}
             */
            kind: "message" | "range" | "source";
            /** Message Ids */
            message_ids?: string[];
            /**
             * Relation
             * @enum {string}
             */
            relation: "support" | "counter" | "context";
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Source Chunk Id */
            source_chunk_id?: string | null;
            /** Start Message Id */
            start_message_id?: string | null;
        };
        /** SafeExport */
        SafeExport: {
            /** Batch Id */
            batch_id: string | null;
            /**
             * Generated At
             * Format: date-time
             */
            generated_at: string;
            /** Items */
            items: components["schemas"]["SafeExportItem"][];
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /**
             * Scope
             * @enum {string}
             */
            scope: "automatic" | "effective";
        };
        /** SafeExportItem */
        SafeExportItem: {
            /** Checklist Version Id */
            checklist_version_id: string;
            /** Conversation Id */
            conversation_id: string;
            /** Conversation Revision */
            conversation_revision: number;
            /** Corpus Snapshot Id */
            corpus_snapshot_id: string;
            /** Cost */
            cost?: string | null;
            /**
             * Cost Complete
             * @default false
             */
            cost_complete: boolean;
            /** Criteria */
            criteria: components["schemas"]["SafeCriterionResult"][];
            /**
             * Currency
             * @default USD
             * @constant
             */
            currency: "USD";
            /** Decisions */
            decisions: components["schemas"]["SafeDecision"][];
            error_code: components["schemas"]["ErrorCode"] | null;
            /** Evaluation Id */
            evaluation_id: string | null;
            /** Evaluation Revision */
            evaluation_revision?: number | null;
            /** Evaluation Status */
            evaluation_status: ("complete" | "partial" | "failed") | null;
            /** Job Id */
            job_id: string;
            /**
             * Job State
             * @enum {string}
             */
            job_state: "queued" | "running" | "succeeded" | "retry_wait" | "failed" | "cancelled";
            /** Limitation Codes */
            limitation_codes: ("test_evaluator" | "incomplete" | "review_unfinished" | "factual_verification_limited" | "audio_unavailable" | "cost_unknown" | "other")[];
            /** Profile Id */
            profile_id: string;
            /** Profile Version */
            profile_version: string;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Score Status */
            score_status: ("complete" | "no_applicable_weight" | "incomplete_evaluation") | null;
            /** Total Score */
            total_score: string | null;
        };
        /** ScoreContribution */
        ScoreContribution: {
            /** Answer Choice Id */
            answer_choice_id: string | null;
            /**
             * Applicability
             * @enum {string}
             */
            applicability: "applicable" | "not_applicable" | "undetermined";
            /** Applicable Weight */
            applicable_weight: string;
            /** Criterion Id */
            criterion_id: string;
            /** Earned Weight */
            earned_weight: string | null;
            /** Normalized Contribution */
            normalized_contribution: string | null;
            /** Original Weight */
            original_weight: string;
            /** Raw Value */
            raw_value: boolean | number | string | null;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Score Fraction */
            score_fraction: string | null;
        };
        /** ScoreSummary */
        ScoreSummary: {
            /** Contributions */
            contributions: components["schemas"]["ScoreContribution"][];
            /** Flags */
            flags: components["schemas"]["FlagResult"][];
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Section Results */
            section_results: components["schemas"]["SectionResult"][];
            /**
             * Status
             * @enum {string}
             */
            status: "complete" | "no_applicable_weight" | "incomplete_evaluation";
            /** Total Score */
            total_score: string | null;
        };
        /** SecondOpinion */
        SecondOpinion: {
            /** Appeal Id */
            appeal_id: string;
            /** Calls */
            calls?: components["schemas"]["CallRecord"][];
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Criterion Id */
            criterion_id: string;
            error?: components["schemas"]["APIError"] | null;
            /** Evaluation Id */
            evaluation_id: string;
            /** Finished At */
            finished_at?: string | null;
            /** Id */
            id: string;
            /**
             * Mode
             * @enum {string}
             */
            mode: "production" | "test";
            /** Profile Id */
            profile_id: string;
            /** Profile Version */
            profile_version: string;
            proposal?: components["schemas"]["CriterionProposal"] | null;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Source Fragments */
            source_fragments?: components["schemas"]["SourceFragment"][];
            /**
             * State
             * @enum {string}
             */
            state: "running" | "succeeded" | "failed";
        };
        /** Section */
        Section: {
            /** Id */
            id: string;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Title */
            title: string;
        };
        /** SectionResult */
        SectionResult: {
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Section Applicable Weight */
            section_applicable_weight: string;
            /** Section Earned Weight */
            section_earned_weight: string;
            /** Section Id */
            section_id: string;
            /** Section Percent */
            section_percent: string | null;
        };
        /** SourceChunk */
        SourceChunk: {
            /** Chunk Id */
            chunk_id: string;
            /** Content Hash */
            content_hash: string;
            /** Locator */
            locator: string;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Source Id */
            source_id: string;
            /** Source Version */
            source_version: string;
            /** Text */
            text: string;
        };
        /** SourceFragment */
        SourceFragment: {
            chunk: components["schemas"]["SourceChunk"];
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            source: components["schemas"]["SourceVersion"];
        };
        /** SourceVersion */
        SourceVersion: {
            /** Content Hash */
            content_hash: string;
            /** Effective From */
            effective_from?: string | null;
            /** Effective Until */
            effective_until?: string | null;
            /** Legal Entity */
            legal_entity?: string | null;
            /** Locator */
            locator?: string | null;
            /** Product */
            product?: string | null;
            /**
             * Provenance
             * @enum {string}
             */
            provenance: "organizer" | "official_public" | "synthetic";
            /** Published At */
            published_at?: string | null;
            /**
             * Retrieved At
             * Format: date-time
             */
            retrieved_at: string;
            /** Safe Url */
            safe_url: string | null;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Source Id */
            source_id: string;
            /** Title */
            title: string;
            /** Version */
            version: string;
        };
        /** SuggestCriterionRequest */
        SuggestCriterionRequest: {
            /** Description */
            description: string;
            /** Profile Id */
            profile_id: string;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Title */
            title: string;
        };
        /** TokenUsage */
        TokenUsage: {
            /** Cached Tokens */
            cached_tokens?: number | null;
            /** Input Tokens */
            input_tokens?: number | null;
            /** Output Tokens */
            output_tokens?: number | null;
            /** Reasoning Tokens */
            reasoning_tokens?: number | null;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
        };
        /** VersionList */
        VersionList: {
            /** Items */
            items: components["schemas"]["ChecklistVersion"][];
            /** Limit */
            limit: number;
            /** Offset */
            offset: number;
            /**
             * Schema Version
             * @default 1.0
             * @constant
             */
            schema_version: "1.0";
            /** Total */
            total: number;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    listAppeals: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                state?: ("open" | "resolved") | null;
                evaluation_id?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Page_Appeal_"];
                };
            };
            /** @description Invalid operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Version/state conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Payload limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Invalid request (no input values echoed) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Internal failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Foundation placeholder */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Unavailable or configuration error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Timeout */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
        };
    };
    getAppeal: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Appeal"];
                };
            };
            /** @description Invalid operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Version/state conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Payload limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Invalid request (no input values echoed) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Internal failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Foundation placeholder */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Unavailable or configuration error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Timeout */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
        };
    };
    decideAppeal: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DecisionRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Decision"];
                };
            };
            /** @description Invalid operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Version/state conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Payload limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Invalid request (no input values echoed) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Internal failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Foundation placeholder */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Unavailable or configuration error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Timeout */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
        };
    };
    listSecondOpinions: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Page_SecondOpinion_"];
                };
            };
            /** @description Invalid operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Version/state conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Payload limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Invalid request (no input values echoed) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Internal failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Foundation placeholder */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Unavailable or configuration error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Timeout */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
        };
    };
    createSecondOpinion: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SecondOpinion"];
                };
            };
            /** @description Invalid operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Version/state conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Payload limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Invalid request (no input values echoed) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Internal failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Foundation placeholder */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Unavailable or configuration error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Timeout */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
        };
    };
    getChecklistVersion: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                version_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChecklistVersion"];
                };
            };
            /** @description Invalid operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Version/state conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Payload limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Invalid request (no input values echoed) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Internal failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Foundation placeholder */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Unavailable or configuration error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Timeout */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
        };
    };
    listChecklists: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Page_ChecklistSummary_"];
                };
            };
            /** @description Invalid operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Version/state conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Payload limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Invalid request (no input values echoed) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Internal failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Foundation placeholder */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Unavailable or configuration error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Timeout */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
        };
    };
    createChecklist: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ChecklistDraft"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChecklistVersion"];
                };
            };
            /** @description Invalid operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Version/state conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Payload limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Invalid request (no input values echoed) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Internal failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Foundation placeholder */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Unavailable or configuration error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Timeout */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
        };
    };
    listChecklistVersions: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VersionList"];
                };
            };
            /** @description Invalid operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Version/state conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Payload limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Invalid request (no input values echoed) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Internal failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Foundation placeholder */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Unavailable or configuration error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Timeout */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
        };
    };
    createChecklistVersion: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateChecklistVersion"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChecklistVersion"];
                };
            };
            /** @description Invalid operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Version/state conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Payload limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Invalid request (no input values echoed) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Internal failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Foundation placeholder */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Unavailable or configuration error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Timeout */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
        };
    };
    listConversations: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                language?: ("RU" | "KZ" | "EN") | null;
                channel?: ("agent_chat" | "voice_call") | null;
                status?: ("unevaluated" | "pending" | "complete" | "partial" | "failed") | null;
                checklist_version_id?: string | null;
                flag_criterion_id?: string | null;
                flag_status?: ("detected" | "not_detected" | "unknown") | null;
                flag_scope?: "automatic" | "effective";
                q?: string | null;
                work_queue?: ("flagged" | "needs_review" | "open_appeals") | null;
                sort?: "newest" | "score_asc" | "score_desc";
                max_score?: number | null;
                result_scope?: "automatic" | "effective";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Page_ConversationSummary_"];
                };
            };
            /** @description Invalid operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Version/state conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Payload limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Invalid request (no input values echoed) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Internal failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Foundation placeholder */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Unavailable or configuration error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Timeout */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
        };
    };
    getConversation: {
        parameters: {
            query?: {
                revision?: number | null;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Conversation"];
                };
            };
            /** @description Invalid operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Version/state conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Payload limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Invalid request (no input values echoed) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Internal failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Foundation placeholder */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Unavailable or configuration error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Timeout */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
        };
    };
    getConversationAudio: {
        parameters: {
            query?: {
                revision?: number | null;
            };
            header?: {
                Range?: string | null;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "audio/mpeg": string;
                };
            };
            /** @description Verified byte range */
            206: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "audio/mpeg": string;
                };
            };
            /** @description Invalid operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Version/state conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Payload limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Invalid byte range */
            416: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Invalid request (no input values echoed) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Internal failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Foundation placeholder */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Unavailable or configuration error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Timeout */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
        };
    };
    listCriterionSuggestions: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Page_CriterionSuggestionRun_"];
                };
            };
            /** @description Invalid operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Version/state conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Payload limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Invalid request (no input values echoed) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Internal failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Foundation placeholder */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Unavailable or configuration error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Timeout */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
        };
    };
    suggestCriterion: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SuggestCriterionRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CriterionSuggestionRun"];
                };
            };
            /** @description Invalid operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Version/state conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Payload limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Invalid request (no input values echoed) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Internal failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Foundation placeholder */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Unavailable or configuration error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Timeout */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
        };
    };
    createEvaluationBatch: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateBatch"];
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EvaluationBatch"];
                };
            };
            /** @description Invalid operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Version/state conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Payload limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Invalid request (no input values echoed) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Internal failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Foundation placeholder */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Unavailable or configuration error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Timeout */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
        };
    };
    getEvaluationBatch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EvaluationBatch"];
                };
            };
            /** @description Invalid operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Version/state conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Payload limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Invalid request (no input values echoed) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Internal failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Foundation placeholder */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Unavailable or configuration error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Timeout */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
        };
    };
    exportBatch: {
        parameters: {
            query?: {
                scope?: "automatic" | "effective";
                format?: "json" | "csv";
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Safe v1 JSON DTO or documented CSV projection */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SafeExport"];
                    "text/csv": string;
                };
            };
            /** @description Invalid operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Version/state conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Payload limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Invalid request (no input values echoed) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Internal failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Foundation placeholder */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Unavailable or configuration error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Timeout */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
        };
    };
    listEvaluations: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                conversation_id?: string | null;
                batch_id?: string | null;
                status?: ("complete" | "partial" | "failed") | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Page_EvaluationView_"];
                };
            };
            /** @description Invalid operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Version/state conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Payload limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Invalid request (no input values echoed) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Internal failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Foundation placeholder */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Unavailable or configuration error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Timeout */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
        };
    };
    getEvaluation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EvaluationView"];
                };
            };
            /** @description Invalid operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Version/state conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Payload limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Invalid request (no input values echoed) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Internal failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Foundation placeholder */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Unavailable or configuration error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Timeout */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
        };
    };
    createAppeal: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateAppeal"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Appeal"];
                };
            };
            /** @description Invalid operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Version/state conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Payload limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Invalid request (no input values echoed) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Internal failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Foundation placeholder */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Unavailable or configuration error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Timeout */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
        };
    };
    listAssistantRuns: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Page_AssistantRun_"];
                };
            };
            /** @description Invalid operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Version/state conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Payload limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Invalid request (no input values echoed) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Internal failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Foundation placeholder */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Unavailable or configuration error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Timeout */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
        };
    };
    createCoaching: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CoachingRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AssistantRun"];
                };
            };
            /** @description Invalid operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Version/state conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Payload limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Invalid request (no input values echoed) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Internal failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Foundation placeholder */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Unavailable or configuration error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Timeout */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
        };
    };
    exportEvaluation: {
        parameters: {
            query?: {
                scope?: "automatic" | "effective";
                format?: "json" | "csv";
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Safe v1 JSON DTO or documented CSV projection */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SafeExport"];
                    "text/csv": string;
                };
            };
            /** @description Invalid operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Version/state conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Payload limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Invalid request (no input values echoed) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Internal failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Foundation placeholder */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Unavailable or configuration error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Timeout */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
        };
    };
    listConversationQuestions: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Page_ConversationQuestionRun_"];
                };
            };
            /** @description Invalid operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Version/state conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Payload limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Invalid request (no input values echoed) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Internal failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Foundation placeholder */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Unavailable or configuration error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Timeout */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
        };
    };
    askConversation: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ConversationQuestionRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConversationQuestionRun"];
                };
            };
            /** @description Invalid operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Version/state conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Payload limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Invalid request (no input values echoed) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Internal failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Foundation placeholder */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Unavailable or configuration error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Timeout */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
        };
    };
    listEvaluatorProfiles: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Page_ProfileSummary_"];
                };
            };
            /** @description Invalid operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Version/state conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Payload limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Invalid request (no input values echoed) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Internal failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Foundation placeholder */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Unavailable or configuration error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Timeout */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
        };
    };
    getHealth: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Health"];
                };
            };
            /** @description Invalid operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Version/state conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Payload limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Invalid request (no input values echoed) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Internal failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Foundation placeholder */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Unavailable or configuration error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Timeout */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
        };
    };
    createImport: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OrganizerImport"] | components["schemas"]["JSONImport"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ImportResult"];
                };
            };
            /** @description Invalid operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Version/state conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Payload limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Invalid request (no input values echoed) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Internal failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Foundation placeholder */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Unavailable or configuration error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Timeout */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
        };
    };
    getJob: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Job"];
                };
            };
            /** @description Invalid operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Version/state conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Payload limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Invalid request (no input values echoed) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Internal failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Foundation placeholder */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Unavailable or configuration error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Timeout */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
        };
    };
    retryJob: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Job"];
                };
            };
            /** @description Invalid operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Version/state conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Payload limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Invalid request (no input values echoed) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Internal failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Foundation placeholder */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Unavailable or configuration error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Timeout */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
        };
    };
    listKnowledgeSources: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                corpus_snapshot_id?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["KnowledgeSources"];
                };
            };
            /** @description Invalid operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Version/state conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Payload limit exceeded */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Invalid request (no input values echoed) */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Internal failure */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Foundation placeholder */
            501: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Unavailable or configuration error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
            /** @description Timeout */
            504: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["APIError"];
                };
            };
        };
    };
}
