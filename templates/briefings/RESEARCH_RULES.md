# Research Rules

Use this file for project-level rules that must apply to every execution in the run.

## Default Boundaries

```text
research_only=true
internal_only=true
approved_for_scoring=false
production_signal=false
```

## Always Forbidden Unless Explicitly Authorized

- production signals
- real-money actions
- trading advice
- BUY/WATCH/AVOID style output
- official top lists
- scoring changes
- expected value computation
- label, return, market, event, or outcome joins
- git stage, commit, push, merge, or destructive reset

## Public Output Redaction

Public reports must not contain:

- raw identifiers
- private paths
- secrets or tokens
- stock codes
- stock names
- URLs that reveal private inputs
- data that can reverse-map a private case

## If Unsure

Stop and report the blocker.

Do not silently widen scope.
