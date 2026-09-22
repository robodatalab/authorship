# RFC: Plot identification

A plot is a perspective on the story — who loves whom, who hates whom, why one person cares
for another. We want to find the plots a story weaves and say which paragraphs belong to
which.

The unit is the paragraph. Each one belongs to zero or more plots. Zero is a real answer: a
description of the scenery a scene takes place in belongs to no plot, and is filler.

## 1. Input

Only `markdown` cells are read. Parts and chapters are metadata: they mark where the author
broke the story, which may justify a discontinuity on either side of them.

A paragraph is a run of non-blank lines with a blank line, or the edge of its cell, on either
side. It is addressed the way the editor already addresses prose — cell id and character
offsets within the cell — so the result lands on the page as `ParagraphInStoryPlots`.

## 2. What a plot is

A plot is described by the markers a paragraph can hit:

- **characters** — who takes part in it
- **origin** — how it began ("Bob has a crush on Alice")
- **goal** — where it is heading ("Bob gets a date with Alice")
- **key events** — what has happened along it ("Bob approached Alice", "Bob asked Alice out
  for coffee")

The first three come from discovery. Key events are not written up front: they accumulate as
paragraphs are classified into the plot, so each pass understands the plot better than the
last.

## 3. Models

Two stages, two models.

**Discovery** — summarising chapters, proposing plots, extracting key events — is prompting
Gemini. It is open-ended generation, where a frontier model is at its best.

**Classification** runs on a local model from the start: Qwen3-8B, zero-shot, which the server
already serves. Gemini is ruled out here for three reasons:

- The pass level (§5) needs real probabilities. Gemini exposes log-probabilities on some models
  only, and a score it is asked to state bunches at 0.7, 0.8, 0.9 — a threshold on that is a
  guess.
- The same story and the same paragraph must give the same answer. Gemini at temperature 0 is
  not guaranteed to; a forward pass is.
- Every question needs the whole story. Locally the story is read once and its KV cache is
  kept as a prefix, so each question is a few hundred tokens of suffix.

A 33k-word story is about 45k tokens, past Qwen3-8B's native 32k window, so it runs with YaRN
extended to 128k.

This is also the model we will fine-tune. The zero-shot classifier already has the final
interface — story, plot and paragraph in, one probability out — so fine-tuning (LoRA, on
labels from Gemini or from the author's corrections in the editor) changes the weights and
nothing else.

## 4. The classifier

**In:** the entire story, the paragraph in question, and one plot's markers.

**Out:** P(yes) — the probability that the paragraph belongs to the plot — read from the
next-token logits of "yes" and "no".

Each plot is asked about separately, so a paragraph can pass for several plots or for none.

When a paragraph is scored, the key events that were extracted from that same paragraph are
left out of the plot. Otherwise an event would carry its own paragraph back in on the next
pass, and the paragraph would confirm itself.

## 5. The pass level

Each plot gets its own pass level, taken from the distribution of its scores over the whole
story:

1. Take the log-odds of every paragraph's score, log(p / (1 − p)). This spreads out the ends
   of the scale, where the scores crowd.
2. A real plot is bimodal — a large mass near "no" and a smaller mass near "yes". Fit a
   two-component mixture (or use Otsu) and put the pass level in the valley between them.
3. Require P(yes) ≥ 0.5 as well, so a plot whose scores are all low cannot split into "very
   low" and "slightly less low" and claim paragraphs.

The separation between the two masses is the plot's health. A wide valley with a real "yes"
mass is a well-defined plot; a single mass means it was found nowhere.

A percentile cut was considered and rejected: the 80th percentile gives every plot the top
20% of the story whether the plot exists or not. It erases the difference between a good plot
and a bad one, which is exactly what §6 drops plots on, and it forces filler into plots.

## 6. One pass

1. Lock the story and every plot.
2. Score every paragraph against every plot.
3. Cut each plot at its pass level.
4. Drop the plots with no hits or with the weakest separation — they are not well defined.
5. Merge plots that claim mostly the same paragraphs, starting with a Jaccard overlap above
   0.7, uniting their characters and key events. Discovering chapter by chapter proposes the
   main plot many times over; the classifier's own results decide what is a duplicate, not
   Gemini comparing summaries.
6. Only now extract key events from each surviving plot's paragraphs, and add them to it.

Nothing about a plot changes during a pass. No paragraph is known to have passed until every
paragraph has been scored (§5), and a plot that changed halfway through would make a
paragraph's result depend on the order the paragraphs were read in.

## 7. Discovery

**First**, go through the story chapter by chapter and have Gemini summarise the main theme of
each as a plot — characters, origin, goal.

**Then**, after each pass, look at the paragraphs no plot claimed. Gemini sees the whole
story, with the paragraphs already in plots marked as such rather than removed — a plot may
span both kinds — and proposes plots that account for the unmarked ones. The new plots join
the next pass, and every paragraph is scored against them, not only the unclaimed ones.

## 8. Stopping

After pass k, count the reassignments rₖ: the paragraph–plot pairs that entered or left.

Stop when the last three rₖ are low — to begin with, about 2% of the story's paragraphs — and
barely differ from one another, or after 10 passes. Steady, low churn counts as settled: a
few borderline paragraphs changing sides every pass is a steady state, not a reason to go on.

## 9. Progress

A run is many passes, each of them long, so the author has to be able to see where it is. The
Plots panel shows the status of every pass and how far the current one has got.

## 10. Open

How to tell that every paragraph still outside a plot is filler, and not a plot we have yet
to discover.

## 11. Where it runs

The extension starts `/analyze/plots` with the document and the author's Gemini key and model,
and polls `/analyze/plots/status`, which answers with the plots and the paragraphs in them as
they are found. The job is `StoryPlotsJob` in `server/story_analysis/plots.py`; until this
algorithm is in, it returns fake plots.
