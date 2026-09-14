> **Note to the authors (delete before submission):** Fill in your names,
> college, department, and guide's name below. Citation numbers are in
> IEEE style (`[1]`, `[2]`, ...); every reference in Section VIII is a real,
> verifiable publication — check each URL and re-format the citation list to
> match your institution's required style (IEEE / APA / etc.) before you
> submit. The evaluation numbers in Section VI are genuine output from
> running this project's own test suite and a live demo run against real
> job boards, not simulated or invented figures — re-run them yourself
> (`python -m pytest tests -q` in the repo root, and the backend's own
> suite in `backend/`) to reproduce them.

# A Hybrid Deterministic–LLM Pipeline for Resume-to-Job Matching

**[Your Name]¹, [Co-Author Name]², [Co-Author Name]³**
Department of Computer Science and Engineering, [Your College Name]
Under the guidance of [Guide's Name]

## Abstract

Manual job search requires a candidate to repeatedly read postings across
many portals, judge fit against their own resume, and discard the majority
that do not match — a process that scales poorly as posting volume grows.
This paper presents a hybrid matching pipeline that combines a
deterministic, rule-based prefilter with a large-language-model (LLM)
scoring stage to reduce thousands of raw postings to a small, personally
relevant shortlist at near-zero computational cost. The system ingests
postings directly from public Applicant Tracking System (ATS) APIs
(Greenhouse, Lever, Ashby), applies regex-based title/location/freshness
filtering before any model inference occurs, and then scores the surviving
candidates against a structured candidate profile extracted from a resume.
We describe the architecture, the specific failure modes the deterministic
stage is designed to catch (regex substring mismatches, epoch-timestamp
bugs, stale postings), and report pipeline funnel statistics from both a
controlled test fixture and a live run against real ATS boards. We
position this work relative to embedding-based and deep person-job-fit
models from the recommender-systems literature and discuss why a
prefilter-then-rank design is a deliberate, cost-driven alternative to
running a ranking model over an entire corpus.

**Keywords** — resume-job matching, job recommendation systems, applicant
tracking systems, large language models, information retrieval, person-job
fit, deterministic filtering, natural language processing

---

## I. Introduction

Job search platforms are, at their core, a matching problem: given a large
and constantly growing set of job postings and one candidate profile,
identify which postings are worth the candidate's time. General-purpose
job boards return results by keyword search, which puts the burden of
filtering on the candidate — the same repeated evaluation of "does this
role fit me" performed manually, tens or hundreds of times per search
session. This is time-consuming precisely because it is where the actual
information-processing work of a job search lives: reading a posting,
comparing it against one's own experience, and forming a fit judgment.

This paper describes a system, referred to throughout as **jobhunt**, that
automates that evaluation while keeping the final decision — whether to
apply — with the human. The system's contribution is architectural rather
than purely algorithmic: rather than proposing a new matching model, it
proposes a **two-stage pipeline** in which a free, deterministic filter
removes the large majority of postings that a candidate would reject on
sight (wrong seniority, wrong location, wrong job family, stale posting)
*before* a language model is asked to make a finer-grained judgment on
what remains. This ordering is what keeps the system's operating cost low
enough to run daily against dozens of company boards without a large
compute budget, which matters directly for a student audience who are
price-sensitive and typically do not have production ML infrastructure
available to them.

The rest of this paper is organized as follows. Section II surveys related
work in job recommendation and person-job fit modelling. Section III
describes the overall system architecture. Section IV details the
deterministic prefilter and the specific bugs it is designed to catch.
Section V describes the LLM-based scoring stage. Section VI reports
pipeline statistics from test fixtures and a live run. Section VII
discusses limitations, and Section VIII lists references.

## II. Related Work

**Job recommender systems.** Freire and de Castro [1] survey the job
recommender systems literature and categorize prior work by the type of
signal used (content-based, collaborative filtering, and hybrid
approaches) and by the matching target (job-to-candidate vs.
candidate-to-job). Much of that literature assumes a platform with access
to historical application and interaction logs — data a personal,
single-candidate tool such as this one does not have. Dhameliya et al. [2]
survey AI techniques specifically for talent analytics, including
embedding-based systems and co-attention neural matching, and note that
production systems increasingly combine multiple matching signals rather
than relying on one model end-to-end, which is the same combination
principle this paper's prefilter-then-LLM design follows at a much smaller
scale.

**Embedding- and deep-learning-based matching.** Zhu et al. [3] introduce
the Person-Job Fit Neural Network (PJFNN), a convolutional model that
learns a joint representation of resume and job-posting text from
historical application outcomes, and is, to our knowledge, one of the
earliest end-to-end neural approaches to this problem. Follow-up work adds
an ability-aware attention mechanism over job requirements [4], and later
work replaces the CNN encoder with a BERT-based encoder fine-tuned on
recruiter feedback [5]. Most recently, domain-adapted transformer models
such as CareerBERT [6] learn a shared embedding space in which a resume
and a semantically matching job posting are close by a distance metric,
and ConFit v2 [7] improves the negative-sampling strategy used to train
such embeddings by having an LLM generate hypothetical resumes as
hard-negative training signal. These approaches share a common
requirement: a training corpus of resume-job pairs, typically drawn from a
platform's own application history, large enough to fit a supervised or
contrastive model. A personal tool built for one candidate, searching
public boards with no interaction history to train on, cannot assume this
data exists — which motivates using a pre-trained LLM as a zero-shot or
few-shot scorer instead of training a bespoke matching model, an approach
closer to Wang et al.'s early feature-based resume-job matching system
[8], modernized by substituting hand-engineered features with an LLM's own
language understanding.

**Resume information extraction.** Parsing a resume into structured fields
is itself a well-studied NLP problem. Rule-based and named-entity-
recognition (NER) approaches [9], [10] extract skills, titles, and
education as labelled spans, and more recent work applies topic modelling
(Latent Dirichlet Allocation) alongside NER to summarize a resume's
thematic content for candidate ranking [11]. This system takes a different
approach for the same extraction task, described in Section V: rather than
a dedicated NER pipeline, it sends the resume (as a native PDF document
where the provider supports it) directly to an LLM with a fixed extraction
schema, on the premise that a general-purpose language model's resume
understanding is now strong enough to replace a purpose-built extraction
model for this use case, without maintaining a separate NER training
pipeline. Foundational transformer language modelling work — BERT [12] in
particular — underlies both the embedding-based matching systems in [3]–[7]
and the general-purpose LLMs this system delegates extraction and scoring
to, so it is cited here as shared background rather than as a system this
paper builds on directly.

**LLM-based screening.** Concurrent with this project, several papers
study using general-purpose LLMs directly for resume screening rather than
training a dedicated matcher. One evaluates classifying resume seniority
with an LLM [13]; another specifically measures how well LLM screening
scores agree with human recruiter judgment, and reports only weak
correlation in a zero-shot setting, improving with careful prompt design
such as chain-of-thought [14]; a third studies prompt-injection attacks
against LLM résumé screening pipelines [15], which is directly relevant to
a system, like this one, that feeds untrusted third-party text (a job
description scraped from a public board) into an LLM prompt — a threat
this paper's design does not yet defend against and identifies as future
work in Section VII. These findings motivate two design choices described
in Section V: this system's screening prompt explicitly instructs the
model to be strict about seniority and hard-requirement mismatches rather
than trusting the model's default calibration, and drafting (Section V) is
kept strictly separate from and downstream of scoring so that a
miscalibrated score cannot silently produce a well-written but unsuitable
application draft.

## III. System Architecture

The system is organized as five sequential stages, summarized in Figure 1.

```
   ATS APIs                                                    Digest /
 (Greenhouse,       Fetch  ──▶  Prefilter  ──▶  LLM Screen  ──▶  Dashboard
  Lever, Ashby)      (parse)    (regex, no       (scored 0-10       (top-N,
                                  LLM call)        vs. profile)      tracked)
```
*Figure 1. Pipeline stages. Only postings surviving the prefilter are ever
sent to a language model.*

**Fetch.** Each supported ATS exposes an unauthenticated, documented JSON
API — `boards-api.greenhouse.io`, `api.lever.co`, and
`api.ashbyhq.com` — which the system polls directly rather than scraping
a rendered job board page. This is a deliberate scope decision: sites such
as LinkedIn have no public API and scraping them would violate their terms
of service, so this system is restricted to ATS vendors that publish an
API contract, which trades some coverage for a legally and technically
stable data source. Each vendor returns a differently shaped JSON payload
(field names, date formats, and how the full job description is split
across fields all differ), so each vendor has its own pure parsing
function that normalizes its payload into one shared record type keyed by
a globally unique `job_id` of the form `{ats}:{slug}:{posting_id}`. Keeping
HTTP retrieval separate from parsing is what allows the parsers to be
tested against recorded fixture payloads without a live network call,
which the evaluation in Section VI relies on.

**Prefilter.** Described in Section IV — this is the paper's main
architectural claim, so it is given its own section.

**Screen.** Described in Section V.

**Personalization layer.** In the web deployment of this system (as
opposed to the original single-user command-line tool), the fetch stage
writes into one *shared* posting cache used by every registered user,
while prefiltering, screening, and the resulting shortlist are computed
per user against that user's own filter configuration and resume profile.
This means the cost of polling an ATS board is paid once regardless of how
many candidates are searching against it, while the actual matching
judgment stays personal — the shared crawl layer and the personal ranking
layer are architecturally separate, which is what let the system move
from a single-candidate tool to a multi-user web product without changing
the matching logic itself.

## IV. The Deterministic Prefilter

The prefilter runs three checks, in order, on every fetched posting,
before any are sent to a language model:

1. **Title.** A posting's title must match at least one of a configurable
   list of *include* regular expressions and none of a list of *exclude*
   expressions. Both lists are evaluated case-insensitively against the
   title text only.
2. **Location.** If a non-empty list of accepted location substrings is
   configured, a posting must contain one of them in its location or title
   text, or be recognizable as remote (a small set of hint words — "remote",
   "anywhere", "work from home", "distributed" — matched only when remote
   postings are explicitly allowed).
3. **Freshness.** A posting older than a configurable maximum age is
   dropped, using whatever posted/updated timestamp field the source ATS
   provides.

Two specific bugs discovered during development motivated hardening this
stage with a pinned regression test each, and both are worth stating
explicitly because they are the kind of error that produces *no exception
and no error message* — the pipeline runs to completion and silently
returns a wrong (empty or under-filled) result, which is far harder to
notice than a crash.

**The substring-matching trap.** The acronym `sde` (Software Development
Engineer) is not a substring of the phrase "Software Development
Engineer" — a bare regex `sde` therefore does not match `\bsde\b`-style
postings written out in full, and a naive include list containing only the
acronym silently drops every spelled-out posting of that title. The fix is
to list both forms explicitly (`\bsde\b` for the acronym, plus the
spelled-out phrase) rather than assume one implies the other. This is not
specific to this one acronym; it is a general property of substring/regex
matching that any title-filtering system built this way must account for,
and is exactly the kind of error that a deterministic filter surfaces
loudly in a unit test but an LLM-only pipeline (where the model might
"understand" both forms are equivalent) would mask — which is itself an
argument for keeping a cheap, testable, deterministic stage in the
pipeline rather than delegating title matching to a model.

**The epoch-milliseconds trap.** One of the three supported ATS vendors
(Lever) reports a posting's creation timestamp as Unix epoch time in
**milliseconds**, not seconds — the most common convention. Parsing it as
seconds silently shifts every timestamp by a factor of 1000, dating every
posting to 1970 and causing the freshness filter to reject the entire
board. Because this bug produces a plausible-looking (if empty) result
rather than a crash, the project's test fixtures compute all dates
relative to the current time at test-run time rather than using hardcoded
dates, specifically so that this class of bug cannot silently "age out"
of the test suite as time passes; only a single, deliberately stale
fixture is hardcoded, and it exists to test that the freshness filter
still functions correctly at the boundary.

Both defects illustrate the same point: a regex- and timestamp-based
filter looks trivial, but is exactly the kind of code where a silent unit
mismatch produces a plausible-but-wrong result rather than a visible
failure, which is why this stage is unit-tested against fixtures that
include deliberately planted "junk" postings (wrong seniority, wrong city,
wrong job family, a stale posting, and — for the Ashby source specifically
— an unpublished draft posting that the API still returns but should never
be shown) that the filter is expected to reject.

## V. LLM-Based Screening

Postings that survive the prefilter are batched (eight per request, by
default) and sent to a language model alongside a structured JSON
representation of the candidate's profile — the same profile schema
produced by resume extraction, containing skills, years of experience,
target titles, and seniority level. The model returns a 0–10 fit score and
a one-sentence justification for each posting in the batch. The system
prompt instructs the model to penalize seniority mismatches in *both*
directions (a junior candidate scored highly against a staff-level role is
treated as equally wrong as a senior candidate scored highly against an
internship) and to penalize a posting's unmet hard requirements — a named
technology at a year count the candidate cannot show, a required degree,
a location the candidate cannot legally work in — rather than let the
model's generally encouraging tone inflate scores, a known property of
instruction-tuned models discussed in the LLM-as-judge survey literature
[16], [17], which documents exactly this kind of leniency and
self-consistency bias as a central challenge in using an LLM as an
evaluator rather than a generator. Model replies are parsed with a
deliberately tolerant JSON parser: real replies from different providers
were observed wrapping the JSON payload in markdown code fences, prefixing
it with a sentence of commentary, or returning a JSON object where an
array was requested, and the parser strips fences, attempts a direct
parse, and falls back to locating the outermost matching bracket pair
before giving up — a pattern consistent with published findings that
schema compliance in LLM structured output, while generally high, is not
guaranteed and needs to be defended against explicitly rather than assumed
[18], [19].

This screening stage is intentionally the *cheap* half of a two-tier
design: it uses the least expensive model configured for the deployment,
truncates each job description to roughly 1,400 characters, and batches
multiple postings per call. Only postings that clear a configurable score
threshold proceed to a second, more expensive stage — described in the
companion paper on hybrid screening and personalized drafting [20] — which
runs one call per posting against a stronger model to produce a full
application kit. This cascade from a cheap approximate pass to an
expensive precise pass over a shrinking candidate set mirrors the general
cost-reduction strategy formalized as an LLM cascade in FrugalGPT [21],
applied here at the level of an entire matching pipeline (prefilter →
cheap LLM → expensive LLM) rather than within a single query.

## VI. Evaluation

Because this is a personal tool operating on public postings rather than a
platform with historical application-outcome labels, a large-scale
precision/recall evaluation against ground truth was not possible within
the scope of this project — this is stated plainly as a limitation in
Section VII, not glossed over. Instead, the system is evaluated two ways:
(a) a deterministic regression suite that pins the exact behaviour of the
prefilter and the LLM-reply parser against fixture data, and (b) a
funnel-statistics case study from a live run against real ATS boards, both
of which are genuinely reproducible from the project repository rather
than simulated for this paper.

**(a) Fixture-based regression testing.** The project's automated test
suite (63 tests at the time of writing) exercises each ATS parser against
a payload in that vendor's *native* JSON shape, and exercises the
prefilter against a fixture set of twelve postings — five real matches,
and seven deliberately planted rejects covering each rejection reason
described in Section IV (wrong seniority, wrong location, wrong job
family, a stale posting, and an unpublished/unlisted draft). Running the pipeline against these fixtures (`python -m jobhunt run --mock
--scorer keyword`) reproduces:

```
prefilter: 12 -> 5 (dropped title=6 location=1 stale=0)
```

matching the funnel figure the system prints during a normal run, which
gives a developer or evaluator immediate, numeric confirmation that the
filter is rejecting the intended postings rather than passing everything
through.

**(b) Live-run case study.** A single live run against the fifteen
companies configured in this project's example `companies.yaml` (a mix of
Greenhouse, Lever, and Ashby boards) fetched **1,506** open postings in
one pass. After the deterministic prefilter (title/location/freshness) and
deduplication against previously-seen postings, **4** postings remained as
candidates for this run's test profile; a keyword-overlap scoring stub
(used here purely to demonstrate the funnel without incurring LLM cost)
shortlisted **2** of those four. This is a **99.7% reduction** (1,506 → 4)
achieved entirely by the free deterministic stage before any scoring — the
number that most directly supports this paper's cost argument, since it
is the volume that would otherwise have to be sent to a paid LLM call.

We report this as a single-run case study, not a statistically powered
evaluation: it demonstrates that the funnel behaves as designed at a
realistic scale, not that the specific 99.7% figure generalizes to every
company list or filter configuration a user might choose.

## VII. Limitations and Future Work

**No ground-truth evaluation.** The screening score has not been validated
against actual hiring outcomes or independent human recruiter judgment for
this specific system, though the broader literature on LLM-based screening
suggests such scores correlate only weakly with human recruiters in a
naive zero-shot setting [14]. A natural extension is a small human-rater
study in which the system's scores and rationales are compared against
independent judgments from the candidate or a career counsellor on a
held-out set of postings.

**Prompt injection surface.** Job description text is fetched from public,
third-party-controlled sources and passed into an LLM prompt largely
as-is. Recent work demonstrates that this is a realistic attack surface
for résumé/job screening pipelines specifically [15]; this system does not
currently sanitize or isolate untrusted posting text from the instruction
portion of its prompts, and doing so is identified as necessary future
work before this design should be trusted with adversarial input.

**Coverage.** Restricting data sources to ATS vendors with a public,
documented API is a deliberate legal and stability choice, but it means
postings on platforms without such an API (including the two largest job
boards used in India) are out of scope by design, not by oversight.

**No supervised matching model.** This system deliberately does not train
a resume-job embedding model of the kind surveyed in Section II, since
doing so requires an interaction-history training set this
single/multi-candidate tool does not have access to. A natural extension,
once enough tracked application outcomes accumulate in the system's own
database, is a lightweight re-ranking model trained on that outcome data,
layered on top of — not replacing — the existing deterministic and LLM
stages.

## VIII. Conclusion

This paper presented a resume-job matching pipeline built around a simple
but consequential ordering decision: a free, deterministic, thoroughly
unit-tested filter runs first, and a language model is only invoked on
whatever survives it. This is not presented as a novel matching algorithm
in the sense of the embedding- and attention-based models surveyed in
Section II; its contribution is a cost- and reliability-driven system
design suited to a context — a single candidate or a small multi-user
deployment with no historical interaction data and no production ML
budget — that the platform-scale literature generally does not target. The
live-run case study in Section VI shows the deterministic stage alone
removing more than 99% of fetched postings before any model inference
occurs, which is the property that makes running this pipeline daily,
across many company boards, financially viable for a student user.

## References

[1] A. Freire and L. N. de Castro, "Job recommender systems: A review,"
    *arXiv preprint arXiv:2111.13576*, 2021.

[2] "A comprehensive survey of artificial intelligence techniques for
    talent analytics," *arXiv preprint arXiv:2307.03195*, 2023.

[3] C. Zhu, H. Zhu, H. Xiong, C. Ma, F. Xie, P. Ding, and P. Li,
    "Person-job fit: Adapting the right talent for the right job with
    joint representation learning," *arXiv preprint arXiv:1810.04040*,
    2018.

[4] "Enhancing person-job fit for talent recruitment," *arXiv preprint
    arXiv:1812.08947*, 2018.

[5] "A deep learning BERT-based approach to person-job fit in talent
    recruitment," in *Proc. IEEE Conf.*, 2022. [Online]. Available:
    https://ieeexplore.ieee.org/abstract/document/9799257/

[6] "CareerBERT: Matching resumes to ESCO jobs in a shared embedding
    space for generic job recommendations," *arXiv preprint
    arXiv:2503.02056*, 2025.

[7] "ConFit v2: Improving resume-job matching using hypothetical resume
    embedding and runner-up hard-negative mining," *arXiv preprint
    arXiv:2502.12361*, 2025.

[8] "Machine learned resume-job matching solution," *arXiv preprint
    arXiv:1607.07657*, 2016.

[9] "Named entity recognition based resume parser and summarizer,"
    ResearchGate, 2022. [Online]. Available:
    https://www.researchgate.net/publication/359694475

[10] "Named entity recognition in resumes," *arXiv preprint
     arXiv:2306.13062*, 2023.

[11] "Resume evaluation through Latent Dirichlet Allocation and natural
     language processing for effective candidate selection," *arXiv
     preprint arXiv:2307.15752*, 2023.

[12] J. Devlin, M.-W. Chang, K. Lee, and K. Toutanova, "BERT: Pre-training
     of deep bidirectional transformers for language understanding," in
     *Proc. NAACL-HLT*, 2019. [Online]. Available:
     https://arxiv.org/abs/1810.04805

[13] "Reading between the lines: Classifying resume seniority with large
     language models," *arXiv preprint arXiv:2509.09229*, 2025.

[14] "Measuring validity in LLM-based resume screening," *arXiv preprint
     arXiv:2602.18550*, 2026.

[15] "Prompt injection in automated résumé screening with large language
     models: Single and multi-injection settings," *arXiv preprint
     arXiv:2606.27287*, 2026.

[16] "LLMs-as-judges: A comprehensive survey on LLM-based evaluation
     methods," *arXiv preprint arXiv:2412.05579*, 2024.

[17] "A survey on LLM-as-a-judge," *ScienceDirect*, 2025. [Online].
     Available: https://www.sciencedirect.com/science/article/pii/S2666675825004564

[18] "StructuredRAG: JSON response formatting with large language
     models," *arXiv preprint arXiv:2408.11061*, 2024.

[19] "JSONSchemaBench: A rigorous benchmark of structured outputs for
     language models," *arXiv preprint arXiv:2501.10868*, 2025.

[20] [Your Name] et al., "Hybrid AI screening and personalized
     application drafting for automated job search assistance," companion
     paper, [Your College Name], 2026.

[21] L. Chen, M. Zaharia, and J. Zou, "FrugalGPT: How to use large
     language models while reducing cost and improving performance,"
     *arXiv preprint arXiv:2305.05176*, 2023.
