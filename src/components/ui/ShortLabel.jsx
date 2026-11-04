/**
 * A label that shows a shorter text on phones, so two fields side by side keep their boxes level.
 * Screen readers always hear the full text.
 */
export default function ShortLabel({ full, short }) {
  return (
    <>
      <span className="max-sm:sr-only">{full}</span>
      <span aria-hidden className="sm:hidden">
        {short}
      </span>
    </>
  );
}
