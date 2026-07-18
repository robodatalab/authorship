# writer

A VS Code plugin to aid the process of writing novels.

## Current process — keep all of it

- Write in markdown
- Store edits in GitHub
- Make edits and compare to previous versions using diffs

VS Code already offers all of this. None of it gets replaced.

## What's missing

### 1. Story flow graph

Visualize the story flow as a graph. Currently generated as an SVG by Claude Code, which is
very clunky. Want to be able to visualize the graph properly — zoom in and out on certain
plots, etc.

### 2. Fact database

Keep the facts in a database:

- Character names
- Where they live
- Key locations and their descriptions
- Key events

### 3. Virtual reviewer

Check the manuscript against a set of rules:

- Are certain characters not showing up and disappearing?
- Are we not perspective hopping too much?
- Are we not mixing the timeline?
- Are we not introducing events out of nowhere?
- Grammar review (sort of like a linter)

These are large features. They may deserve multiple plugins — something like GitKraken, a
suite of tools for writers.

## Building and testing

1. Build it for myself first and test it extensively while writing. I write a lot of stories —
   some long (>50k words), some short (~5k words).
2. The entire thing thoroughly tested.
3. Experiment with running local language models (max 32 GB RAM on a Mac), multiplexed and
   finetuned to perform very specific tasks.
4. Expose the plugin immediately for myself — install it and keep updating it in VS Code on my
   laptop.
