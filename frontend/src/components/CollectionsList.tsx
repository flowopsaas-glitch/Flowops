// src/components/CollectionsList.tsx
interface Props {
  collections: { id: string | number; name: string; status: string }[];
}

export default function CollectionsList({ collections }: Props) {
  return (
    <div>
      <h3>Collections</h3>
      <ul>
        {collections.map(col => (
          <li key={col.id}>{col.name} ({col.status})</li>
        ))}
      </ul>
    </div>
  );
}