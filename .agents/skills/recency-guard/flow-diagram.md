# Recency Guard

Recency Guard is a read-only response-validation workflow. The orchestrator may draft or inspect an answer, identify high-risk current or decision-shaping claims, and dispatch only the `recency-checker` and `claim-verifier` subagents for focused read-only verification. It may apply only subagent-flagged wording edits within the repair limits; it may not mutate external systems, post, purchase, deploy, change policy, or perform high-impact actions.

```mermaid
flowchart TD
  START(["Start: USER_REQUEST received"]) --> INPUTS["Collect inputs: USER_REQUEST, optional DRAFT_RESPONSE, optional TODAYS_DATE, optional RECENCY_RISK_HINT"]
  INPUTS --> DATE{"TODAYS_DATE present?"}
  DATE -->|yes| DRAFT_CHECK{"DRAFT_RESPONSE present?"}
  DATE -->|no| SET_DATE["Use runtime current date and label freshness basis"]
  SET_DATE --> DRAFT_CHECK

  DRAFT_CHECK -->|yes| INSPECT["Inspect supplied draft answer"]
  DRAFT_CHECK -->|no| DRAFT["Draft concise answer from USER_REQUEST"]
  INSPECT --> BOUNDARY["State read-only role, authority, trust model, and freshness scope"]
  DRAFT --> BOUNDARY

  BOUNDARY --> MUTATION{"External mutation or high-impact action requested?"}
  MUTATION -->|yes| OUT_OF_SCOPE(["Out-of-scope route: separate approved workflow"])
  MUTATION -->|no| RISK["Identify high-risk current claims and unsupported time-sensitive wording"]

  RISK --> RECENCY_DISPATCH["Dispatch recency-checker with focused read-only verification request"]
  RECENCY_DISPATCH --> RECENCY_STATUS{"recency-checker status?"}
  RECENCY_STATUS -->|PASS| CLAIM_DISPATCH["Dispatch claim-verifier with revised draft; subagent selects up to 3 decision-shaping claims"]
  RECENCY_STATUS -->|FAIL| RECENCY_FIX["Apply only recency-checker flagged edits"]
  RECENCY_STATUS -->|TOOLS_MISSING| RECENCY_LIMIT["Keep supportable claims and qualify freshness/tool limits"]
  RECENCY_STATUS -->|ERROR| RECENCY_ERROR{"ERROR retry used?"}
  RECENCY_FIX --> RECENCY_RERUNS{"Targeted recency reruns used fewer than 2?"}
  RECENCY_RERUNS -->|yes| RECENCY_DISPATCH
  RECENCY_RERUNS -->|no| MATERIAL_FINAL
  RECENCY_ERROR -->|no| RECENCY_RETRY["Retry recency-checker once with same focused request"]
  RECENCY_ERROR -->|yes| MATERIAL_FINAL
  RECENCY_RETRY --> RECENCY_DISPATCH
  RECENCY_LIMIT --> CLAIM_DISPATCH

  CLAIM_DISPATCH --> CLAIM_STATUS{"claim-verifier status?"}
  CLAIM_STATUS -->|PASS| EVIDENCE["Integrate evidence: source conflicts, recency/claim overlap, confidence-to-wording"]
  CLAIM_STATUS -->|FAIL| CLAIM_FIX["Apply only claim-verifier flagged edits"]
  CLAIM_STATUS -->|TOOLS_MISSING| CLAIM_LIMIT["Qualify claims by evidence limits and freshness scope"]
  CLAIM_STATUS -->|ERROR| CLAIM_ERROR{"ERROR retry used?"}
  CLAIM_FIX --> CLAIM_RERUNS{"Targeted claim reruns used fewer than 2?"}
  CLAIM_RERUNS -->|yes| CLAIM_DISPATCH
  CLAIM_RERUNS -->|no| MATERIAL_FINAL
  CLAIM_ERROR -->|no| CLAIM_RETRY["Retry claim-verifier once with same revised draft"]
  CLAIM_ERROR -->|yes| MATERIAL_FINAL
  CLAIM_RETRY --> CLAIM_DISPATCH
  CLAIM_LIMIT --> EVIDENCE

  EVIDENCE --> CONFIDENCE{"Material uncertainty remains after integration?"}
  CONFIDENCE -->|yes| MATERIAL_FINAL
  CONFIDENCE -->|no| COMPLETE{"Completeness, date, scope, and confidence wording present?"}
  COMPLETE -->|yes| FINAL_REVALIDATE{"Final wording adds a new time-sensitive or decision-shaping claim?"}
  COMPLETE -->|no| COMPLETE_FIX["Add missing qualifiers, scope, or unresolved uncertainty"]
  COMPLETE_FIX --> FINAL_REVALIDATE

  FINAL_REVALIDATE -->|no| LIMITS{"Evidence, tool, or freshness limit remains?"}
  FINAL_REVALIDATE -->|yes| REVERIFY{"Relevant subagent rerun available?"}
  REVERIFY -->|recency or both| RECENCY_DISPATCH
  REVERIFY -->|claim only| CLAIM_DISPATCH
  REVERIFY -->|no cap| MATERIAL_FINAL

  LIMITS -->|yes| LIMITED_FINAL(["Limited final answer: direct answer with date, scope, and evidence/tool limits"])
  LIMITS -->|no| READY_FINAL(["Ready final answer: direct user-visible answer"])
  MATERIAL_FINAL(["Material uncertainty final: conservative answer with unresolved uncertainty"])

  class DATE,DRAFT_CHECK,MUTATION,RECENCY_STATUS,RECENCY_RERUNS,RECENCY_ERROR,CLAIM_STATUS,CLAIM_RERUNS,CLAIM_ERROR,CONFIDENCE,COMPLETE,FINAL_REVALIDATE,REVERIFY,LIMITS decision;
  class RISK,RECENCY_DISPATCH,CLAIM_DISPATCH,EVIDENCE check;
  class BOUNDARY,RECENCY_FIX,RECENCY_LIMIT,CLAIM_FIX,CLAIM_LIMIT,COMPLETE_FIX guard;
  class SET_DATE,INSPECT,DRAFT,RECENCY_RETRY,CLAIM_RETRY output;
  class READY_FINAL success;
  class LIMITED_FINAL refine;
  class MATERIAL_FINAL,OUT_OF_SCOPE stop;

  classDef guard fill:#fff3cd,stroke:#856404,color:#000;
  classDef check fill:#e7f1ff,stroke:#0b5ed7,color:#000;
  classDef decision fill:#f8f9fa,stroke:#495057,color:#000;
  classDef output fill:#e8f5e9,stroke:#2e7d32,color:#000;
  classDef success fill:#e8f5e9,stroke:#2e7d32,color:#000;
  classDef refine fill:#fff3cd,stroke:#856404,color:#000;
  classDef stop fill:#fdecea,stroke:#b02a37,color:#000;
```

Readiness rule: Produce the user-visible final answer, not a verification report, unless the user asks for verification details. Final output must include date and scope qualifiers, unresolved material uncertainty, or conservative wording when evidence or tools are limited.

Repair limit: Each subagent gets one initial review plus at most two targeted FAIL reruns. An ERROR retry is separate and allowed once per subagent; a second ERROR or exhausted rerun capacity yields a material uncertainty final.

Mutation boundary: External mutations and high-impact actions stay outside Recency Guard and route to a separate approved workflow.
