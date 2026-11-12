# Shell, empty states and outcome recording

## Sidebar shell
- ≥ 1200px: fixed 208px white sidebar with border. Garage name at the top, labelled icon links (Quotes, Replies, Results), Follow-up settings and Pause all sending at the bottom. Active item: bg #EAF4F6, text #0F6173.
- 768–1199px: 64px icon rail; labels as `aria-label` and `title`.
- < 768px: the app's existing top navigation.
- Demo controls (clock, mock SMS, reset) stay in a slim strip above the workspace.

## Empty states
- No quotes yet: "Add quote".
- No search/filter matches: "Clear filters".
- No follow-ups currently due (a filter whose queue is empty): "View all quotes", a 160px Three.js vehicle (loaded on demand, drag to rotate, static fallback without WebGL) and one Animate.css `fadeIn` on the text.

## Outcome recording
Outcomes: Accepted (books the quote), Needs time, No reply, Declined. Needs time and No reply reveal reminders: Tomorrow, In 3 days, Choose date, with the actual date shown. Saving: inline confirmation with Undo and Next quote; the row flashes; the panel stays open even if the quote leaves the current filter. A future reminder holds automatic follow-ups until that date.
