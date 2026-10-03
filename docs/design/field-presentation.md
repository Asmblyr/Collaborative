# Field presentation and record forms

Implemented first stage, 2026-09-29.

`PUT /collections/:name/fields/:field/presentation` replaces a field's presentation;
`{}` resets it. Only superusers may change it. Metadata is returned with that field
by `/collections`, after its existing field permission filtering.

| Setting | Contract |
| --- | --- |
| label | 0–120 characters; empty uses technical name |
| description | 0–1000 characters; plain text help |
| placeholder | 0–255 characters; input/textarea hint |
| interface | auto; input for text/email/integer/decimal; textarea/markdown/richtext/url/select for text; multiselect for JSON |
| options | select/multiselect: 1–100 unique `{value, label}` choices, each up to 120 characters |
| width | full or half; narrow forms collapse to one column |
| order | integer −10000…10000; ties keep existing field order |
| group | 0–120 characters; equal names group fields in the form |
| constraints | text/email minLength/maxLength; integer min/max; see follow-up contract |

Groups appear in the order of their first field after sorting. Read-only fields
retain a separate section from editable fields; each section applies its layout.
Inverse relations remain in the Relations tab and use label/help/order there.
No HTML/CSS, scripts, hidden-field permission flags or arbitrary interfaces accepted.
Choice lists were added on 2026-09-30; record editors and table cells use their
labels, while API writes validate their stored values. Removing an option keeps
old row values as archived choices. Configured defaults must still be valid.
Translations and custom editor plugins are later stages.

Persistence: additive `presentation jsonb NOT NULL DEFAULT '{}'` on
`asmblyr_field_metadata` and `asmblyr_relation_aliases`. Keeping alias settings on
the alias row reuses its existing deletion/cascade lifecycle. Physical field
metadata is removed by existing field deletion. Upserts change only presentation,
preserving required/default/search/semantic type. User rows and DB constraints are
unchanged. Rollback refuses populated presentation settings.

Field creation and its presentation/search updates are separate requests; on partial
failure the dialog retains the created field identity and retries updates, avoiding
a second CREATE. Technical field name and type remain immutable. File/image and
gallery editors now attach files from the separate library. See [extended fields
and record editing](five-features.md) and [content validation and shared views](shared-views-and-content-editors.md).
