# RFC: Story graph builder

We want to build a story graph given a story, in markdown format. 

A story can be anbalyzed from several perspectives:
- scenes strung together. Scenes generally string in a single trajectory
- multiple plots, where each plot is a series of events strung together. those plots for multiple rooutes. Each scene may be a confluence of multiple prlots
- paths the characters are on - the decisions they make, the characters they meet etc creates a graph

A graph builder is expected to take some "perspective" and output a relevant graph.

## Abstractions

We'll leverage an LLM fine-tuned to perform a certain task, to perform a decomposition.
There are many avenues of implementing the breakdown algorithm, and each will depend on the specific perspective.

So - `StoryPerspective` is the abstraction that defines how we want to break the story down.

```python
class StoryPerspective(abc.ABC):

    @abc.abstractmethod
    def process(self, story_markdown: str) -> StoryGraph:
        pass
```

We will implement different StoryPerspective, and each might be represented by a different graph layer in side the .yaml file.


## Builder mechanism

We introduce a `/build` endpoint that kicks off the graph building mechanism.
The endpoint hardcodes a list of perspectives that produce different graphs.

That list is then condensed into a single yaml, each graph becoming a single layer.

## Implementations

```python
class ScenePerspective(StoryPerspective):
    def process(self, story_markdown: str) -> StoryGraph:
        """Breaks down a story into a string of scenes.

        Each scene has a short title that describes in no more than 4 words what the scene is about, 
        and identifies its start and finish.

        The main difficulty is granularity - this will be a subject of active research, so for the time being
        we are trying to focus on an event within our story that has the following features:
        - has a clear beginning and ending (represented by a start and end lines)
        - is focused around a specific topic or interaction
        - removing it effectively breaks the flow of the story - so if we deleted it, the story would be divided into two different stories

        What a scene is NOT:
        - it's not a standalone dialogue, unless that dialogue really frames the entire sityation and ends it.
        - it's not a description of something
        """
        pass
```

More will be added later.
