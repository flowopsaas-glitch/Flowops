import React, { useState } from "react";

type BulkItem = {
  id: number;
  fileName: string;
  status: string;
};

export default function WaybillBulkInbox() {
  const [items, setItems] = useState<BulkItem[]>([]);

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;

    const list: BulkItem[] = [];

    for (let i = 0; i < files.length; i++) {
      list.push({
        id: Date.now() + i,
        fileName: files[i].name,
        status: "Queued",
      });
    }

    setItems((prev) => [...prev, ...list]);
  }

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>
        Waybill Bulk Inbox
      </h1>

      <p style={{ marginTop: 6, color: "#475569" }}>
        Upload scanned waybills and process them automatically.
      </p>

      <div style={{ marginTop: 20 }}>
        <input type="file" multiple onChange={handleUpload} />
      </div>

      <div style={{ marginTop: 20 }}>
        {items.length === 0 && (
          <p style={{ color: "#64748b" }}>
            No files uploaded yet.
          </p>
        )}

        {items.map((item) => (
          <div
            key={item.id}
            style={{
              padding: 10,
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              marginBottom: 8,
            }}
          >
            <strong>{item.fileName}</strong> — {item.status}
          </div>
        ))}
      </div>
    </div>
  );
}

