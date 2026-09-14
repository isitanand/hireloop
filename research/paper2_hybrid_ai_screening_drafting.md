> **Note to the authors (delete before submission):** Fill in your names,
> college, department, and guide's name below. Citation numbers are in
> IEEE style (`[1]`, `[2]`, ...); every reference in Section IX is a real,
> verifiable publication — check each URL and re-format the citation list
> to match your institution's required style before you submit. This paper
> assumes familiarity with the companion paper on the resume-job matching
> pipeline [20]; read that one first if you're presenting both together.

# Hybrid AI Screening and Personalized Application Drafting: A Two-Stage, Cost-Aware Design for a Human-in-the-Loop Job Search Assistant

**[Your Name]¹, [Co-Author Name]², [Co-Author Name]³**
Department of Computer Science and Engineering, [Your College Name]
Under the guidance of [Guide's Name]

## Abstract

Large language models (LLMs) can both *evaluate* how well a candidate
fits a job posting and *generate* application material tailored to it —
but doing both naively, for every posting a search returns, is
expensive, and doing either carelessly risks two distinct failure modes:
miscalibrated scores that hide genuine mismatches behind encouraging
language, and generated application content that states experience the
candidate does not actually have. This paper describes the design of a
two-stage AI layer — a cheap, batched *screening* pass over every
candidate posting, followed by an expensive, per-posting *drafting* pass
over only the small number of postings that clear a fit threshold — used
in a personal job-search assistant, and the specific prompting and
system-design choices made to keep both stages calibrated, reliable, and
strictly advisory rather than autonomous. We detail the anti-hallucination
constraint enforced on the drafting stage, the provider-agnostic interface
that lets screening and drafting run on different LLM backends, the
tolerant JSON-parsing strategy required because model output format
compliance is not guaranteed, and the explicit design decision that the
system never submits an application on the candidate's behalf. We situate
this design against the literature on LLM-as-judge evaluation, retrieval-
augmented generation, hallucination mitigation, and algorithmic-hiring
fairness, and report real cost and failure-mode data captured from running
the system, including 28 backend integration tests and a stubbed-provider
test methodology that exercises the AI layer with zero LLM API cost.

**Keywords** — large language models, LLM-as-judge, retrieval-augmented
generation, hallucination mitigation, prompt engineering, human-in-the-loop
AI, algorithmic hiring fairness, application drafting, cost-aware AI
systems

---

## I. Introduction

Once a matching pipeline (described in the companion paper [1]) has
reduced thousands of postings to a small, personally relevant set, two
further questions remain, and this paper is about answering both of them
*safely*: first, precisely how relevant is each surviving posting to this
one candidate, on a scale fine enough to rank a shortlist — and second,
for the handful of postings worth an application, what should the
candidate actually say in it? Both questions are naturally suited to a
large language model — the modern, instruction-tuned descendants of
transformer architectures such as BERT [2] — since scoring fit against a
structured resume is a language-understanding task, and drafting a fit
summary or cover note is a language-generation task. Applying an LLM to
screening specifically is not a new idea in isolation: recent work reports
using an open-weight model for scalable resume screening directly [3],
though largely as a throughput exercise rather than as a system designed
against the failure modes that motivate this paper. An LLM applied to
either task without constraint has known failure modes documented in the
wider literature — score inflation and inconsistency in LLM-as-judge
settings [4], [5], and hallucinated, unsupported claims in open-ended
generation [6], [7] — and in a job-search assistant specifically, both
failure modes have a direct, personal cost: a miscalibrated score wastes
the candidate's time on a mismatched role, and a hallucinated resume claim
can cost them credibility or worse in an actual interview.

This paper's contribution is the concrete system design used to manage
both risks in a working, tested application: a strict two-stage cost
architecture (Section III), a system prompt and post-processing pipeline
for the scoring stage designed against known LLM-as-judge failure modes
(Section IV), a hard, testable non-hallucination constraint on the
drafting stage (Section V), a provider-agnostic backend abstraction that
makes the choice of model a deployment-time decision rather than a
code-level one (Section VI), and — running through all of it — a single
non-negotiable design rule: **the system never submits an application on
the candidate's behalf.** It finds, filters, ranks, and drafts; a human
reads the digest, edits the note, and presses submit.

## II. Related Work

**LLM-as-judge.** Using an LLM to score or rank content it did not
generate — exactly what the screening stage in Section IV does — is
studied broadly as the "LLM-as-judge" paradigm. Recent surveys [4], [5]
categorize judge architectures by whether they score one output in
isolation (pointwise, which this system uses), compare two outputs
directly (pairwise), or rank a full list (listwise), and identify
consistency and bias mitigation as the central open reliability problems
in the field — directly relevant to Section IV's discussion of why this
system's screening prompt explicitly instructs the model to be strict
rather than trusting its default calibration.

**Cost-aware LLM system design.** Chen et al.'s FrugalGPT [8] formalizes
three cost-reduction strategies for LLM systems — prompt adaptation
(shorter, more efficient prompts), response caching/approximation, and
*LLM cascades*, in which cheap models handle the bulk of queries and only
uncertain or high-value cases escalate to an expensive model. The
two-stage screen-then-draft architecture in Section III is a cascade in
this sense, applied at the level of an entire matching-and-drafting
pipeline rather than a single query: screening plays the role of the cheap
model handling every candidate, and drafting plays the role of the
expensive model invoked only for cases the cheap stage has already judged
worthwhile.

**Retrieval-augmented generation and hallucination.** Gao et al.'s survey
of retrieval-augmented generation (RAG) [9] frames grounding a model's
output in retrieved, verifiable source text as the primary architectural
defense against hallucination, and multiple recent surveys catalogue
hallucination causes, taxonomies, and mitigation techniques in detail
[6], [7], [10]. The drafting stage described in Section V is, in this
framing, a constrained form of retrieval-augmented generation: the
"retrieved" context is the candidate's own structured profile plus the
target job description, both supplied in full in the prompt, and the
system prompt explicitly forbids the model from asserting anything not
traceable to that supplied context — the same grounding principle RAG
formalizes, enforced here through instruction rather than through a
retrieval index, since the "corpus" being grounded against (one resume) is
small enough to include in full.

**Structured output reliability.** Because both stages of this system
require the model to return machine-parseable JSON, not prose, the
reliability of LLM structured output is directly relevant. StructuredRAG
[11] benchmarks JSON-formatting compliance across models and tasks and
reports an average 82.55% success rate with substantial task-dependent
variance; JSONSchemaBench [12] similarly finds schema compliance
imperfect even when explicitly requested. These findings — output format
compliance is high but not guaranteed — are the direct motivation for the
tolerant, multi-strategy JSON parser described in Section VI, rather than
assuming a `json_mode` flag alone is sufficient.

**Automated application-material generation.** Dedicated peer-reviewed
research on automated cover-letter generation specifically is comparatively
sparse; most existing treatments are practitioner reports describing
LLM-based generators built with frameworks such as LangChain against
GPT-4-, Claude-, or Llama-class models [13]. This system's drafting stage
(Section V) is closer in spirit to controlled, constrained generation than
to the open-ended generation these reports describe, precisely because of
the non-hallucination requirement — the model is asked to *select and
rephrase* material already present in the candidate's profile, not to
invent new content, which is a narrower and more verifiable task than
open-ended cover letter writing.

**Fairness and human oversight in AI-assisted hiring.** Raghavan et al.'s
multidisciplinary survey of fairness and bias in algorithmic hiring [14]
documents that commercial hiring-algorithm vendors frequently make
unsubstantiated fairness claims and provide little technical evidence for
them; more recent work finds that LLM-based hiring evaluators can exhibit
measurable cultural bias [15], and broader work on AI ethics in
recruitment argues that opacity in automated hiring tools is itself a
harm, independent of whether the tool is measurably biased [16]. This
literature is the direct motivation for this system's core design
constraint — the model never makes or executes a hiring or application
decision, a human does, on every posting, every time — discussed further
in Section VII. Separately, the general human-in-the-loop AI literature
[17], [18] cautions that human oversight of an AI system's output is not
automatically a safeguard: human judgment can itself be degraded by
exposure to confidently-wrong algorithmic output, particularly when the
human sees the AI's judgment before forming their own. This system's
response to that specific risk is discussed as a limitation in Section
VII, since the current design does show the AI's score before the human
reads the full posting.

## III. Two-Stage Cost Architecture

The screening and drafting stages differ deliberately along every
dimension that affects cost, summarized in Table I.

**Table I. Screening vs. drafting stage parameters**

| | Screen | Draft |
|---|---|---|
| Runs over | every prefiltered posting | only postings above the score threshold |
| Batching | ~8 postings per call | 1 posting per call |
| Job description length sent | ~1,400 characters | ~6,000 characters |
| Model tier (typical) | cheapest configured model | strongest configured model |
| Output | a 0–10 score + one-sentence reason | a full application kit (five fields) |
| Typical call volume per run | tens | a handful (capped by `max_per_digest`) |

Because drafting is capped to a small, explicit number of postings per run
(`max_per_digest`, five by default) and only ever runs on postings that
already cleared the screening threshold, the expensive stage's cost is
bounded and predictable even if the number of postings fetched in a given
run varies by an order of magnitude — the screening stage's prefilter-fed
input volume can swing widely without a corresponding swing in drafting
cost, which is the property that makes the system's total cost per run
practically flat rather than proportional to the raw postings fetched.

## IV. The Screening Stage: Scoring Against Known LLM-as-Judge Failure Modes

The screening system prompt is written specifically against two failure
modes documented in the LLM-as-judge literature [4], [5]: score inflation
(a general instruction-tuned model's tendency toward encouraging,
generous language bleeding into a supposedly objective score) and
inconsistent standards across similar inputs. The three countermeasures
below follow a pattern the broader prompt-engineering literature
identifies as generally effective — explicit, structured instructions
with concrete anchors outperform open-ended ones [19]:

1. **An explicit, asymmetric grading rubric** is given in the prompt
   (9–10 = strong match; 7–8 = good match, worth applying; 5–6 = plausible
   but real gaps; 0–4 = wrong seniority, wrong stack, or a hard requirement
   the candidate lacks), rather than asking the model to "rate fit" and
   trusting its own internal scale.
2. **Seniority mismatch is named explicitly as the most common failure**
   and the prompt requires it be penalized in *both directions* — a junior
   candidate scored highly against a senior role is treated as equally
   wrong as the reverse — which directly targets a specific, observed
   miscalibration pattern rather than a generic "be accurate" instruction.
3. **A closing instruction against encouragement** ("do not inflate
   scores to be encouraging; most postings are a 4") is included because
   informal testing during development showed that without it, the model's
   default output distribution skewed noticeably higher than the rubric's
   own anchors would justify — an instance of the general score-inflation
   tendency the LLM-as-judge literature documents as a known, recurring
   problem rather than a one-off prompt-tuning issue [4].

The model's reply is required to echo back the same `job_id` it was given
for each posting, and the post-processing code matches results back to
postings by that identifier rather than by list position — a defensive
choice made after observing that models do not always preserve input
ordering in a returned array, which would otherwise silently misattribute
one posting's score to another.

## V. The Drafting Stage: A Hard Anti-Hallucination Constraint

The drafting stage produces five fields for each shortlisted posting: a
two-sentence fit summary, three to four resume bullets rewritten for the
specific role, one to three honestly stated gaps (each with a suggested
way to address it), a 120–160 word cover note, and two questions the
candidate could ask an interviewer. The system prompt's first and most
heavily emphasized instruction is a hard rule: *"never invent experience —
every claim must trace to something in the candidate profile. If the
profile does not support a claim, it goes in `gaps`, not in a bullet."*
This is the direct application, at the level of a system prompt rather
than a retrieval index, of the grounding principle formalized in the RAG
literature [9] — every generated claim must be traceable to supplied,
verifiable context (the candidate's own profile) rather than to the
model's parametric knowledge, and anything the model cannot ground this
way is explicitly redirected into the `gaps` field rather than silently
dropped or, worse, asserted anyway.

The cover note prompt additionally targets a specific, commonly observed
LLM writing tic directly by name — instructing the model not to open with
phrases like "I am writing to express my interest" or generic flattery
about the company's mission, and instead to open with a concrete reason
the candidate fits the specific role. This is a narrower, more testable
instruction than "write a good cover letter," and was arrived at
empirically: early drafts without this instruction were fluent but
generic in exactly the way generic LLM writing advice online already
warns against, which suggested the model's default register for this task
needed to be steered explicitly rather than assumed.

## VI. Provider-Agnostic Architecture and Reliable JSON Parsing

Screening and drafting are each configured with their own LLM provider and
model independently (for example, a fast, inexpensive model for
screening and a stronger model for drafting, or the same model for both),
through one shared interface with two methods — `complete()` for a plain
text/JSON exchange, and `complete_document()` for providers that can read
a PDF resume directly as a document rather than requiring pre-extracted
text. Five backends currently implement this interface: Anthropic's
Claude, Google's Gemini, Groq, any OpenAI-compatible endpoint (which
covers several third-party inference providers), and a fully local Ollama
backend requiring no API key at all. This separation exists for two
concrete reasons directly relevant to a student deployment: it lets
screening run on a provider's free tier while drafting uses a paid,
stronger model only for the small number of postings that need it, and it
lets the whole system run with zero cost end-to-end during development
and testing by pointing every stage at a free tier or a fully local model.

Because model replies are not guaranteed to be clean JSON — consistent
with the structured-output reliability findings in [11], [12] — every reply
passes through a tolerant parser before use: markdown code fences are
stripped, a direct JSON parse is attempted, and if that fails, the parser
falls back to locating the outermost matching bracket pair in the reply
text and attempting to parse that span instead, which recovers correctly
from the two failure patterns observed most often during development
(a fenced code block, and a one-sentence preamble such as "Here is the
JSON:" before the actual payload). A batch that still fails to parse after
this recovery attempt logs a warning and is skipped rather than aborting
the whole run — a single malformed reply in a batch of eight postings does
not cost the other seven their score.

## VII. Human-in-the-Loop by Design, Not by Afterthought

The system's single hardest constraint is architectural, not a prompt
instruction that could be bypassed by a sufficiently unusual model
output: **there is no code path from a drafted application kit to a
submitted application.** The system's output is, at most, an HTML digest
and a dashboard entry containing a cover note in an editable text field;
no network call the system makes submits anything to an employer. This
is a direct response to the fairness and transparency concerns raised in
the algorithmic-hiring literature [14], [15], [16] — but from the
opposite side of the transaction than most of that literature addresses.
That work studies harm to *candidates being evaluated* by an opaque
employer-side algorithm; this system instead studies risk to the
*candidate operating the tool themselves*, where the relevant harms are a
wasted application (from a bad score) or a misrepresented one (from a
hallucinated claim). Keeping submission strictly manual is what allows
every generated cover note and resume bullet to be read and corrected
by the one person with actual, ground-truth knowledge of their own
experience before it reaches an employer, which is the cheapest and most
reliable hallucination check available to the system — a human who
already knows the right answer.

This design is not presented as a complete solution to the human-oversight
risk the broader human-in-the-loop literature identifies [17], [18]:
that literature specifically cautions that a human's own judgment can be
degraded by seeing a confident algorithmic score *before* forming an
independent opinion, and this system's dashboard does show the AI fit
score prominently, above the job description, which is exactly the
ordering that literature flags as higher-risk than the reverse. This is
recorded as a limitation, not resolved, in Section VIII.

## VIII. Evaluation and Discussion

Direct, controlled evaluation of the drafting stage's output quality (for
example, a blinded human comparison of drafted vs. candidate-written cover
notes) was out of scope for this project, and we do not claim one. What
was measured, and is reported here honestly rather than replaced with an
invented benchmark number, is the reliability of the system's *plumbing*
around the LLM calls — the part of the system that can be tested
deterministically without needing a human judge:

- The backend's test suite (28 tests, `backend/tests/`) stubs the
  provider layer entirely — patching `resolve()` and the LLM call itself
  — so that resume extraction, screening, and drafting failure paths are
  exercised with assertions on the resulting HTTP status codes and stored
  data, at zero LLM API cost and with no network access, mirroring the
  same stubbed-provider testing philosophy the original pipeline package's
  own test suite (63 tests) already used for the screening and drafting
  functions directly.
- A `scorer=keyword` mode exists specifically so the full pipeline —
  fetch, prefilter, batch, threshold, persist, display — can be exercised
  end-to-end, including through the actual web UI, with no LLM call at
  all; this is what "demo mode" in the product is, and it is also what
  made it possible to verify the system working against **1,506** real,
  live postings from real ATS boards during development without spending
  anything on model inference, isolating "does the pipeline work" from
  "is the model's judgment good" as two separable questions.
- The tolerant JSON parser (Section VI) is unit-tested against fenced,
  prefixed, and out-of-order model replies directly, rather than only
  being exercised incidentally through end-to-end tests, since it is the
  single component most exposed to real provider output variance.

Two limitations follow directly from this design and are recorded here
rather than left implicit. First, as noted in Section VII, the dashboard
shows the AI fit score prominently, above the job description itself —
exactly the ordering the human-in-the-loop literature flags as higher-risk
for anchoring a reader's own judgment than the reverse [17], [18]; this has
not been changed, and is left as future interface work rather than a
solved problem. Second, both the screening and drafting stages place
third-party-controlled text — the fetched job description — directly into
an LLM prompt. Recent work demonstrates that this is a realistic
prompt-injection surface for résumé/job screening pipelines specifically
[20]; this system does not currently sanitize or isolate untrusted
posting text from the instruction portion of its prompts, and closing
that gap is necessary before the design should be trusted against
adversarial postings rather than the ordinary ones it was built for.

The honest scope of this evaluation is that it establishes the system
*behaves as designed* — screening and drafting are invoked at the right
times, on the right postings, and degrade gracefully when a model reply
is malformed — not that its scores or drafts are *good* in an absolute
sense, which would require the human-rated study described as future work
in Section IX of the companion paper [1].

## IX. Conclusion

This paper described the AI layer of a personal job-search assistant as a
deliberate two-stage cascade — cheap, batched screening over every
candidate, expensive, individual drafting over only a small shortlisted
subset — designed against specific, literature-documented failure modes
of LLM-as-judge scoring and open-ended generation, rather than treating
"call the model" as a single undifferentiated step. The system's central
design commitment is that neither stage is permitted to act autonomously:
screening informs a ranking a human reviews, and drafting produces a
starting point a human edits, and the system contains no path from either
output to a submitted application. In a domain where a wrong or
hallucinated output has a direct, personal cost to the one person the
system is meant to help, that constraint — enforced architecturally, not
just by prompt instruction — is the paper's central contribution.

## References

[1] [Your Name] et al., "A hybrid deterministic–LLM pipeline for
     resume-to-job matching," companion paper, [Your College Name], 2026.

[2] J. Devlin, M.-W. Chang, K. Lee, and K. Toutanova, "BERT: Pre-training
     of deep bidirectional transformers for language understanding," in
     *Proc. NAACL-HLT*, 2019. [Online]. Available:
     https://arxiv.org/abs/1810.04805

[3] "Scalable resume screening using large language model Meta AI
     version 3," *IAES International Journal of Artificial Intelligence
     (IJ-AI)*, 2025. [Online]. Available:
     https://ijai.iaescore.com/index.php/IJAI/article/view/29603/0

[4] "LLMs-as-judges: A comprehensive survey on LLM-based evaluation
    methods," *arXiv preprint arXiv:2412.05579*, 2024.

[5] "A survey on LLM-as-a-judge," *ScienceDirect*, 2025. [Online].
    Available: https://www.sciencedirect.com/science/article/pii/S2666675825004564

[6] "A survey on hallucination in large language models: Principles,
    taxonomy, challenges, and open questions," *arXiv preprint
    arXiv:2311.05232*, 2023.

[7] "A comprehensive survey of hallucination mitigation techniques in
    large language models," *arXiv preprint arXiv:2401.01313*, 2024.

[8] L. Chen, M. Zaharia, and J. Zou, "FrugalGPT: How to use large
    language models while reducing cost and improving performance,"
    *arXiv preprint arXiv:2305.05176*, 2023.

[9] Y. Gao, Y. Xiong, X. Gao, K. Jia, J. Pan, Y. Bi, Y. Dai, J. Sun, and
    H. Wang, "Retrieval-augmented generation for large language models:
    A survey," *arXiv preprint arXiv:2312.10997*, 2023.

[10] "Mitigating hallucination in large language models (LLMs): An
    application-oriented survey on RAG, reasoning, and agentic systems,"
    *arXiv preprint arXiv:2510.24476*, 2025.

[11] "StructuredRAG: JSON response formatting with large language
    models," *arXiv preprint arXiv:2408.11061*, 2024.

[12] "JSONSchemaBench: A rigorous benchmark of structured outputs for
    language models," *arXiv preprint arXiv:2501.10868*, 2025.

[13] "LLM cover letter generation script," ReadyTensor, 2025. [Online].
     Available: https://app.readytensor.ai/publications/llm-cover-letter-generation-script-m8rQHsUnDDqi

[14] M. Raghavan, S. Barocas, J. Kleinberg, and K. Levy, "Fairness and
     bias in algorithmic hiring: A multidisciplinary survey," *ACM
     Transactions on Intelligent Systems and Technology*, 2024. [Online].
     Available: https://arxiv.org/pdf/2309.13933

[15] "Invisible filters: Cultural bias in hiring evaluations using large
     language models," *arXiv preprint arXiv:2508.16673*, 2025.

[16] "Ethics and discrimination in artificial intelligence-enabled
     recruitment practices," *Humanities and Social Sciences
     Communications*, Nature, 2023. [Online]. Available:
     https://www.nature.com/articles/s41599-023-02079-x

[17] F. M. Zanzotto, "Viewpoint: Human-in-the-loop artificial
     intelligence," *Journal of Artificial Intelligence Research*,
     vol. 64, 2019. [Online]. Available: https://doi.org/10.1613/jair.1.11345

[18] "The impact of AI errors in a human-in-the-loop process," *PMC*,
     2024. [Online]. Available:
     https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10772030/

[19] "A systematic survey of prompt engineering in large language
     models: Techniques and applications," *arXiv preprint
     arXiv:2402.07927*, 2024.

[20] "Prompt injection in automated résumé screening with large
     language models: Single and multi-injection settings," *arXiv
     preprint arXiv:2606.27287*, 2026.
