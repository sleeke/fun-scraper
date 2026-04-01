# Bug Tracker

This document tracks open bugs in the project. Bugs are listed here until tests are created to verify the fix, at which point they should be removed.

## Bugs needing additional information

Please ignore bugs in this section until the remaining information has been filled out:


## Prepared bugs

### Manual event submission

There are some issues with the manual event submission:
1. Submitting a URL which contains clear date and location information (e.g. https://thisisblueprint.com/events/foundation-v13-5-disclosure-pne-forum-2026-04-18) doesn't result in those details being extracted and populated in the event.
2. Submitting a PDF doesn't seem to create an event at all. An error is displayed: "No events could be identified in this document. Try using the form to enter event details manually."

## Active Bugs

> Fixed bugs are tracked in [FIXED_BUGS.md](FIXED_BUGS.md).

(none)

---

## Bug Report Template

When adding a new bug, use this template:

```markdown
### N. Bug Title

**Status**: Open  
**Severity**: Low/Medium/High/Critical  
**Date Reported**: YYYY-MM-DD

**Reproduction Steps**:
1. Step 1
2. Step 2
3. Step 3

**Expected Behavior**: What should happen

**Actual Behavior**: What actually happens

**Details**: Additional context or investigation notes

**Affected Files**:
- File 1
- File 2
```

---

## Severity Levels

- **Critical**: App crashes or data loss
- **High**: Feature doesn't work at all
- **Medium**: Feature works but with incorrect behavior
- **Low**: Minor issue, cosmetic or rarely encountered
