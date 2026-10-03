# HYMN secondary colour system

The primary identity remains black/white with neutral reading surfaces and primary actions.
The shared layer in `app/styles/brand-colour.css` adds iris for editorial emphasis,
navigation and focus, and teal for decorative music/distribution details.
Keep success, error, warning and money roles separate from these decorative colours.

Light iris `#6144ad` and teal `#176f6b` have 6.74:1 and 5.62:1 contrast on
`#faf8f4`. Dark iris `#b9adff` and teal `#81d5cc` have 9.83:1 and 11.55:1
contrast on `#090b10`. These are base-pair calculations, not certification of
every composited background. Use solid text instead of gradient-filled text.
Tinted panels use low-opacity washes; primary buttons remain monochrome.
Focus outlines, labels and existing active indicators must accompany colour.
No extra motion is introduced. Existing reduced-motion carousel support remains.

Coverage: shared surface cards, outline-button hover, fields, header navigation,
home store destinations, distribution hero, beat-store hero, final release review.
Store assets retain native colours in light mode; dark-mode logos retain their
legible reversed treatment. Existing artwork and semantic badges remain intact.

References:
- https://codelabs.developers.google.com/customizing-material-color
- https://www.w3.org/WAI/tips/designing/
- https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html

Verification: CSS parsing, base colour contrast calculations, TypeScript.
Full browser snapshots across every route have not been taken.
