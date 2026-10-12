// Bans physical (left/right) CSS so the layout stays direction-agnostic (RTL/LTR).
// Use logical equivalents: margin-inline-start, padding-inline-end, inset-inline-start, text-align: start, ...
export default {
  customSyntax: 'postcss-scss',
  rules: {
    'property-disallowed-list': [
      [
        '/^(margin|padding)-(left|right)$/',
        '/^border-(left|right)(-.+)?$/',
        '/^border-(top|bottom)-(left|right)-radius$/',
        '/^(left|right)$/',
        '/^scroll-(margin|padding)-(left|right)$/',
        'float',
        'clear',
      ],
      { message: 'Use logical properties (inline-start/inline-end) instead of physical left/right.' },
    ],
    'declaration-property-value-disallowed-list': [
      {
        'text-align': ['/^(left|right)$/'],
        'float': ['/.*/'],
        'clear': ['/^(left|right)$/'],
        'resize': ['/^(horizontal)$/'],
      },
      { message: 'Use logical values (start/end) instead of physical left/right.' },
    ],
  },
};
