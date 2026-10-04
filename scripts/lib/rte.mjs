/**
 * Minimal builders for Contentstack's JSON RTE document shape.
 *
 * A json_rte field stores a document tree, not a string. Writing a plain string
 * into one is accepted and then renders as nothing.
 */
let n = 0;
const uid = () => `rte${(n++).toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const txt = (text, marks = {}) => ({ text, ...marks });
export const bold = (text) => txt(text, { bold: true });
export const link = (text, href) => ({
  type: 'a',
  uid: uid(),
  attrs: { url: href, target: '_self' },
  children: [txt(text)],
});

export const p = (...children) => ({
  type: 'p',
  uid: uid(),
  attrs: {},
  children: children.map((c) => (typeof c === 'string' ? txt(c) : c)),
});

export const ul = (...items) => ({
  type: 'ul',
  uid: uid(),
  attrs: {},
  children: items.map((i) => ({
    type: 'li',
    uid: uid(),
    attrs: {},
    children: [typeof i === 'string' ? p(i) : i],
  })),
});

export const h = (level, text) => ({
  type: `h${level}`,
  uid: uid(),
  attrs: {},
  children: [txt(text)],
});

export const doc = (...children) => ({
  type: 'doc',
  uid: uid(),
  attrs: {},
  children,
});
