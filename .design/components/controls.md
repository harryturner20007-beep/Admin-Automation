# Controls: button, input, status label, plate label

## Button
- Primary: bg #0F6173, text #FFFFFF, hover #0B4C5B, radius 8px, min-height 44px, padding 0 16px, 14px/500.
- Secondary: bg #FFFFFF, 1px #DCE3EA border, text #17212B, hover bg #F5F7FA.
- Ghost: transparent, text #596779, hover bg #F5F7FA.
- Disabled: 50% opacity, not-allowed cursor. Busy: label "Saving…", disabled, `aria-busy`.
- Focus: 2px #0F6173 ring, 2px offset. One primary per row or section.

## Input / select / textarea
White, 1px #DCE3EA border, radius 8px, min-height 44px, 0 12px padding, 14px. Focus: border #0F6173 + 2px ring at 15%. Error: red border, message below in #B42318.

## Status label
Text on a tinted background, radius 6px, 12px/500, padding 2px 8px.
success (#166534/#ECFDF3): Booked, Job completed · attention (#92400E/#FFFBEB): Booking requested, Reply waiting, Needs time, No reply, Outcome needed · danger (#B42318/#FEF3F2): Opted out · neutral (#596779/#F5F7FA): Open, Declined, Expired.

## Plate label
Neutral registration label: bg #F5F7FA, 1px #DCE3EA border, radius 4px, 12px/600 uppercase, +0.04em tracking, padding 2px 6px. "No reg" in #596779 when missing. Always first in the Customer & vehicle cell.
