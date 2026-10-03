# Record links

The administration UI uses `/items/:collection/:id` for a saved record and
`/items/:collection` for its list. IDs are URL-encoded, including text keys.

- Clicking a table row adds the record URL to browser history and opens the
  existing side editor. The mounted table keeps its selection and scroll.
- Closing returns to the list with its query, filters, sort and page intact.
  Back closes the editor; Forward reopens it.
- A direct link or reload opens the same editor. Closing a direct link replaces
  its URL with the collection list instead of leaving the application.
- The **Ссылка** button copies the canonical record URL without table filters.
  Related record dialogs also expose this button; they keep their existing
  dialog stack and do not replace the parent record URL.
- Search results use the canonical URL. Old `?item=...` links redirect to it.
- Login and session renewal preserve the requested destination. The link grants
  no permissions: Core still authorizes every record read and update.
- Missing or forbidden records show an error in the editor. Successful edits
  refresh the table after returning to the list, avoiding a route remount during
  the dialog's closing animation.

New, unsaved records do not have a record URL.
