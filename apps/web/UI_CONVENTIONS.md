# UI Conventions

## Navigation: Click on Container

All list pages use a **click-on-container** pattern for navigating to detail/edit views:

- **Cards** (Assistants, Campaigns, Calls): The entire card is clickable. Clicking anywhere on it navigates to the detail page. Action buttons (delete, start, pause, etc.) use `e.stopPropagation()` to prevent navigation.
- **Table rows** (Contacts): The entire row is clickable. Clicking it opens the edit modal. The checkbox column and action column use `stopPropagation` to avoid triggering the row click.

### Implementation

- Cards: Add `cursor-pointer hover:shadow-md transition-shadow` and an `onClick` handler to the card `<div>`.
- Table rows: Add `cursor-pointer` and an `onClick` handler to the `<tr>`.
- Interactive children (buttons, checkboxes, links): Wrap in a container with `onClick={(e) => e.stopPropagation()}` so they don't trigger the parent navigation.

### Do NOT

- Use a clickable name/title as the only way to navigate (inconsistent with card-click pattern).
- Rely on a separate "Edit" icon button for navigation — the container click handles that.
- The only icons in the actions column should be destructive actions (delete) that need to be visually separated from navigation.
