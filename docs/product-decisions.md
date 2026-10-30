# Confirmed implementation direction — 2026-10-30

These later user instructions supplement the original requirements baseline.

- Deliver an installable desktop application for Windows and macOS, not a browser-only website.
- Use and benchmark a native C++ solver for efficiency.
- Allow raises and later-street betting/raising. The flop-only check-down laboratory is a regression fixture, not the final training scope.
- Training pauses at player decisions on every applicable street. The player chooses bet and raise sizes.
- Offer multiple precomputed legal choices, including suboptimal sizes, so size selection is part of the exercise. Do not expose only recommended sizes or invent EVs for unsolved actions.
- Animate action history and street transitions to make prior action understandable. Keep opponent cards and answers hidden until the hand ends, with replay afterward.
- Review relevant public GTO Wizard bet-sizing research. References and methodological distinctions are recorded in sizing-research.md.

Desktop packaging and complete multi-street training must pass tests before this work is called finished.
