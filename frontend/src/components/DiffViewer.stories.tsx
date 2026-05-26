import type { Story } from "@ladle/react";
import { DiffViewer } from "./DiffViewer";

// ── Stories ──────────────────────────────────────────────────────────────────

const OLD_CONTENT = `import React from "react";

function App() {
  const [count, setCount] = useState(0);
  return (
    <div className="app">
      <h1>Hello World</h1>
      <p>Count: {count}</p>
    </div>
  );
}`;

const NEW_CONTENT = `import React, { useState, useEffect } from "react";

function App() {
  const [count, setCount] = useState(0);
  const [name, setName] = useState("");

  useEffect(() => {
    document.title = \`Count: \${count}\`;
  }, [count]);

  return (
    <div className="app">
      <h1>Hello World v2</h1>
      <p>Count: {count}</p>
      <input value={name} onChange={(e) => setName(e.target.value)} />
    </div>
  );
}`;

export const Default: Story = () => (
  <div style={{ maxWidth: 600 }}>
    <DiffViewer
      oldContent={OLD_CONTENT}
      newContent={NEW_CONTENT}
      fileName="src/App.tsx"
    />
  </div>
);

export const WithoutFileName: Story = () => (
  <div style={{ maxWidth: 600 }}>
    <DiffViewer
      oldContent={OLD_CONTENT}
      newContent={NEW_CONTENT}
    />
  </div>
);

export const LargeDiff: Story = () => (
  <div style={{ maxWidth: 600 }}>
    <DiffViewer
      oldContent={Array.from({ length: 50 }, (_, i) => `// Line ${i + 1}\nconst x${i} = ${i};`).join("\n")}
      newContent={Array.from({ length: 55 }, (_, i) => `// Line ${i + 1}\nconst x${i} = ${i * 2};`).join("\n")}
      fileName="src/large-file.ts"
    />
  </div>
);

export const EmptyDiff: Story = () => (
  <div style={{ maxWidth: 600 }}>
    <DiffViewer
      oldContent=""
      newContent=""
      fileName="src/empty.ts"
    />
  </div>
);

export const AddOnly: Story = () => (
  <div style={{ maxWidth: 600 }}>
    <DiffViewer
      oldContent=""
      newContent={`// New file\nimport React from "react";\n\nexport function NewComponent() {\n  return <div>New!</div>;\n}`}
      fileName="src/NewComponent.tsx"
    />
  </div>
);

export const RemoveOnly: Story = () => (
  <div style={{ maxWidth: 600 }}>
    <DiffViewer
      oldContent={`// Old file\nimport React from "react";\n\nexport function OldComponent() {\n  return <div>Old!</div>;\n}`}
      newContent=""
      fileName="src/OldComponent.tsx"
    />
  </div>
);
