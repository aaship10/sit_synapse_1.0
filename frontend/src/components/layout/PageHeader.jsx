/** Page title row: h1 + optional description on the left, actions on the right. */
export default function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1>{title}</h1>
        {description && <p className="mt-1 text-text-secondary">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}
