/**
 * The `compositions` content type — Studio's own storage.
 *
 * Every field here is required by the Studio editor or its runtime. Dropping,
 * renaming, or changing the cardinality of any one of them fails SILENTLY:
 * the CMA accepts writes and quietly discards the key, and the breakage only
 * surfaces later as a blank canvas or "Template Did Not Load".
 *
 * The three shapes that matter most:
 *   • `linked_schemas`  MUST be a group with multiple:true (an array). A single
 *     group or a reference field makes the editor drop every section's scope.
 *   • `linked_sections` MUST be a reference. The editor loads templates with
 *     `?include[]=linked_sections`, which only works on reference fields.
 *   • `url_metadata`    MUST exist with BOTH sub-fields, or every template
 *     composition silently falls back to legacy URL semantics.
 */
const text = (uid, display_name, opts = {}) => ({
  data_type: 'text',
  display_name,
  uid,
  field_metadata: {
    _default: true,
    version: 3,
    ...(opts.multiline ? { multiline: true } : {}),
  },
  format: '',
  error_messages: { format: '' },
  mandatory: opts.mandatory ?? false,
  multiple: opts.multiple ?? false,
  unique: opts.unique ?? false,
  non_localizable: false,
});

/** `{ key, value }` row store. One sub-group per binding type the picker offers. */
const staticValueBucket = (uid, valueField) => ({
  data_type: 'group',
  display_name: uid,
  uid,
  multiple: true,
  mandatory: false,
  unique: false,
  non_localizable: false,
  field_metadata: {},
  schema: [text('key', 'key'), valueField],
});

const STATIC_VALUE_TYPES = [
  'text',
  'html_rte',
  'array',
  'object',
  'number',
  'href',
  'textarea',
  'any',
  'json_rte',
  'datestring',
  'imageurl',
];

export function compositionsContentType(uid) {
  const base = [
    text('title', 'Title', { mandatory: true, unique: true }),
    text('url', 'URL'),
    text('composable_uid', 'Composable UID', { mandatory: true, unique: true }),
    {
      data_type: 'file',
      display_name: 'UI Preview',
      uid: 'ui_preview',
      field_metadata: { description: '', rich_text_type: 'standard' },
      mandatory: false,
      multiple: false,
      unique: false,
      non_localizable: false,
    },
    text('connected_content_type', 'Connected Content Type'),
    text('ui', 'UI', { multiline: true }),
    text('data_sources', 'Data Sources', { multiline: true }),
    {
      data_type: 'group',
      display_name: 'Static Value',
      uid: 'static_value',
      multiple: false,
      mandatory: false,
      unique: false,
      non_localizable: false,
      field_metadata: {},
      schema: [
        ...STATIC_VALUE_TYPES.map((t) =>
          staticValueBucket(t, text('value', 'value', { multiline: true })),
        ),
        staticValueBucket('boolean', {
          data_type: 'boolean',
          display_name: 'value',
          uid: 'value',
          field_metadata: { description: '', default_value: '' },
          mandatory: false,
          multiple: false,
          unique: false,
          non_localizable: false,
        }),
        // Exposed choice props write an array (["center"]). A single-value
        // choice bucket rejects the write with "should be a single value".
        staticValueBucket('choice', text('value', 'value', { multiline: true, multiple: true })),
      ],
    },
    text('schema_version', 'Schema Version'),
    text('place_composition_as', 'Place Composition As'),
    {
      data_type: 'group',
      display_name: 'Linked Schemas',
      uid: 'linked_schemas',
      multiple: true, // ← array. A single group crashes the editor's section-context build.
      mandatory: false,
      unique: false,
      non_localizable: false,
      field_metadata: {},
      schema: [
        // Never name this `uid` — the CMA reserves that inside groups and 422s.
        text('content_type_uid', 'Content Type UID'),
        text('selected_field', 'Selected Field'),
        text('display_name', 'Display Name'),
        // "single" makes the SDK unwrap a single-item scope from array[1] to the
        // item itself, so bindings read `name` rather than `0.name`. Omit the field from the CT and the CMA drops the value
        // on write without a word, leaving every such binding unresolved.
        text('cardinality', 'Cardinality'),
      ],
    },
    {
      data_type: 'group',
      display_name: 'URL Metadata',
      uid: 'url_metadata',
      multiple: false,
      mandatory: false,
      unique: false,
      non_localizable: false,
      field_metadata: {},
      schema: [text('url_source', 'URL Source'), text('url_queries', 'URL Queries')],
    },
  ];

  // Self-references cannot exist at create time — the CT is not there yet to be
  // referenced. These go on a second PUT.
  const selfReferences = [
    {
      data_type: 'reference',
      display_name: 'Linked Sections',
      uid: 'linked_sections',
      reference_to: [uid],
      field_metadata: { ref_multiple: true, ref_multiple_content_types: false },
      mandatory: false,
      multiple: false,
      unique: false,
      non_localizable: false,
    },
    {
      data_type: 'reference',
      display_name: 'Symbols',
      uid: 'symbols',
      reference_to: [uid],
      field_metadata: { ref_multiple: false, ref_multiple_content_types: false },
      mandatory: false,
      multiple: false,
      unique: false,
      non_localizable: false,
    },
  ];

  const options = { is_page: false, singleton: false, title: 'title', sub_title: [] };
  return {
    firstPass: {
      uid,
      title: 'Compositions',
      description: 'Studio compositions.',
      options,
      schema: base,
    },
    full: {
      uid,
      title: 'Compositions',
      description: 'Studio compositions.',
      options,
      schema: [...base, ...selfReferences],
    },
  };
}
