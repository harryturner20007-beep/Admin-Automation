# Detail panel

- Width 420px. ≥ 1200px: in-flow beside the list (sticky, full height, own scroll, flat with left border). 768–1199px: modal `<dialog>` drawer from the right with backdrop and float shadow. < 768px: full-screen sheet with a sticky bottom action bar; content has bottom padding so the bar never covers fields.
- Sticky header: plate label, customer name, a labelled "Close" button.
- Content order: 1 amount + status · 2 work description + quote line items (or "No line items recorded") · 3 contact details + contact actions · 4 message composer · 5 activity history · 6 outcome + next reminder.
- Message composer: three options (Friendly reminder, Any questions?, Ready to book?) fill an editable textarea from the quote. Actions are labelled by what really happens: "Open Messages app" (sms: link, external), "Copy message" (clipboard), "Call customer" (tel: link). Opening an external app records a contact attempt; the quote then shows "Outcome needed" until an outcome is saved. Opted-out numbers get no contact actions.
- Enters with a 200ms ease-out GSAP slide; no animation under reduced motion.
